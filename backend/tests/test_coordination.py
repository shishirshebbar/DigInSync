import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import FastAPI, HTTPException
from google.ai import generativelanguage as glm
from google.api_core import exceptions as google_errors
from google.generativeai.types import content_types

from app.api.router import api_router
from app.database import get_db
from app.llm.provider import ExtractionError, GeminiProvider
from app.schemas.conflict import ConflictAnalyzeResponse, ConflictDetail
from app.schemas.risk import RiskPredictResponse


CONTEXT = {
    "candidate_count": 1, "overlapping_count": 1, "high_severity_count": 1,
    "max_overlap_days": 4, "location_basis": "road_name",
    "baseline_risk_score": 50.0, "baseline_risk_level": "MEDIUM",
}


def provider_with_calls(first, second):
    provider = object.__new__(GeminiProvider)
    provider._model = SimpleNamespace(generate_content_async=AsyncMock(side_effect=[first, second]))
    return provider


def tool_response(name="get_coordination_context", args=None):
    content = glm.Content(role="model", parts=[glm.Part(function_call=glm.FunctionCall(
        name=name, args=args or {}
    ))])
    return SimpleNamespace(candidates=[SimpleNamespace(content=content)])


def test_gemini_tool_call_sends_only_summary_and_validates_response():
    provider = provider_with_calls(tool_response(), SimpleNamespace(
        text=json.dumps({"explanation": "Review sequencing with the teams."})
    ))
    result = asyncio.run(provider.explain_coordination(CONTEXT))
    assert result == "Review sequencing with the teams."
    calls = provider._model.generate_content_async.await_args_list
    assert len(calls) == 2
    content_types.FunctionLibrary(calls[0].kwargs["tools"])
    content_types.to_tool_config(calls[0].kwargs["tool_config"])
    sent = calls[1].args[0][2].parts[0].function_response.response
    assert dict(sent["result"]) == CONTEXT
    assert "road_name" not in str(sent)


@pytest.mark.parametrize("first,second", [
    (tool_response("unknown"), SimpleNamespace(text='{"explanation":"ok"}')),
    (tool_response(args={"project_id": "unexpected"}), SimpleNamespace(text='{"explanation":"ok"}')),
    (tool_response(), SimpleNamespace(text="not json")),
    (tool_response(), SimpleNamespace(text='{"explanation":"  "}')),
    (SimpleNamespace(candidates=[]), SimpleNamespace(text="{}")),
])
def test_invalid_tool_call_or_output_is_rejected(first, second):
    with pytest.raises(ExtractionError):
        asyncio.run(provider_with_calls(first, second).explain_coordination(CONTEXT))


def test_provider_failure_is_sanitized():
    provider = provider_with_calls(google_errors.PermissionDenied("private provider details"), None)
    with pytest.raises(ExtractionError) as exc:
        asyncio.run(provider.explain_coordination(CONTEXT))
    assert "private provider details" not in str(exc.value)


def test_coordinate_endpoint_options_and_fallback(monkeypatch):
    conflict = ConflictDetail(
        project_a_id="a", project_b_id="b", project_a_name="private",
        project_b_name="private", spatial_overlap=True, temporal_overlap=True,
        overlap_days=4, impact_overlap=True, conflict_score=70, severity="HIGH",
    )
    conflict_result = ConflictAnalyzeResponse(
        project_id="a", conflict_count=1, conflicts=[conflict], has_high_severity=True,
        location_basis="road_name", warnings=["Location unverified."],
    )
    risk_result = RiskPredictResponse(
        project_id="a", risk_score=50, risk_level="MEDIUM", model_version="test",
        experimental=True, road_segment_matched=False, historical_features_available=False,
        warnings=["Experimental baseline."],
    )
    analyze = AsyncMock(return_value=conflict_result)
    predict = AsyncMock(return_value=risk_result)
    monkeypatch.setattr("app.services.coordinate_service.conflict_service.analyze", analyze)
    monkeypatch.setattr("app.services.coordinate_service.risk_service.predict", predict)
    explain = AsyncMock(return_value="Review the overlap with the teams.")
    monkeypatch.setattr("app.services.coordinate_service.get_llm_provider", lambda: SimpleNamespace(
        explain_coordination=explain
    ))
    app = FastAPI()
    app.include_router(api_router, prefix="/api")
    app.dependency_overrides[get_db] = lambda: None

    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/coordinate/", json={"project_id": "a"})
            assert response.status_code == 200
            data = response.json()
            assert len(data["options"]) == 3
            assert data["recommended_option"] == "Review sequencing"
            assert data["llm_used"] is False
            assert all(o["risk_score"] is None and o["estimated_duration"] is None for o in data["options"])
            assert "Location unverified." in data["warnings"]
            explain.assert_not_awaited()

            response = await client.post("/api/coordinate/", json={"project_id": "a", "use_ai": True})
            assert response.json()["llm_used"] is True
            assert explain.await_args.args[0] == CONTEXT

            explain.side_effect = ExtractionError("Provider unavailable.", 503)
            response = await client.post("/api/coordinate/", json={"project_id": "a", "use_ai": True})
            assert response.status_code == 200
            assert response.json()["llm_used"] is False
            assert any("deterministic" in w for w in response.json()["warnings"])
            assert (await client.post("/api/coordinate/", json={"project_id": "a", "conflict_ids": ["b"]})).status_code == 422

            analyze.return_value = conflict_result.model_copy(update={
                "conflict_count": 0, "conflicts": [], "has_high_severity": False
            })
            response = await client.post("/api/coordinate/", json={"project_id": "a"})
            assert response.json()["recommended_option"] == "Retain schedule with coordination"
            assert "0 candidate" in response.json()["explanation"]

            analyze.side_effect = HTTPException(status_code=404, detail="Project not found")
            assert (await client.post("/api/coordinate/", json={"project_id": "missing"})).status_code == 404

    asyncio.run(run())
