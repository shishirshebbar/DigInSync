import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import FastAPI
from google.api_core import exceptions as google_errors
from pydantic import ValidationError

from app.api.router import api_router
from app.llm.provider import ExtractionError, GeminiProvider, get_llm_provider
from app.schemas.project import ProjectCreate


def provider_with_response(text):
    provider = object.__new__(GeminiProvider)
    provider._model = SimpleNamespace(generate_content_async=AsyncMock(
        return_value=SimpleNamespace(text=text)
    ))
    return provider


def test_provider_extracts_valid_json_and_preserves_input():
    provider = provider_with_response(json.dumps({
        "project_type": "water_pipeline", "road_name": "80 Feet Road",
        "start_date": "2026-11-12", "end_date": "2026-11-18",
        "length_m": 150, "lane_closure": 1, "organization": None,
        "description": "changed by model",
    }))
    result = asyncio.run(provider.extract_project("Original description"))
    assert result.description == "Original description"
    assert result.project_type == "water_pipeline"
    assert result.start_date.isoformat() == "2026-11-12"
    assert provider._model.generate_content_async.await_args.kwargs["request_options"]["timeout"] == 30


def test_missing_values_are_not_fabricated():
    result = asyncio.run(provider_with_response("{}").extract_project("Fix a road sometime"))
    assert result.road_name is None
    assert result.start_date is None
    assert result.lane_closure is None


@pytest.mark.parametrize("text", [
    "not-json", "[]", '{"lane_closure": 3}',
    '{"start_date": "2026-11-20", "end_date": "2026-11-12"}',
    '{"project_type":"unknown"}', '{"length_m":-1}',
])
def test_invalid_model_response_is_explicit(text):
    with pytest.raises(ExtractionError) as exc:
        asyncio.run(provider_with_response(text).extract_project("Road work"))
    assert exc.value.status_code == 502


@pytest.mark.parametrize(("error", "status"), [
    (google_errors.ResourceExhausted("limit"), 503),
    (google_errors.ServiceUnavailable("unavailable"), 503),
    (google_errors.DeadlineExceeded("timeout"), 504),
])
def test_provider_failures_are_reported_without_raw_details(error, status):
    provider = provider_with_response("{}")
    provider._model.generate_content_async.side_effect = error
    with pytest.raises(ExtractionError) as exc:
        asyncio.run(provider.extract_project("Road work"))
    assert exc.value.status_code == status
    assert str(error) not in exc.value.user_message


def test_missing_key_fails_before_network(monkeypatch):
    monkeypatch.setattr("app.config.get_settings", lambda: SimpleNamespace(
        llm_provider="gemini", llm_api_key="", gemini_model="example"
    ))
    with pytest.raises(ExtractionError) as exc:
        get_llm_provider()
    assert exc.value.status_code == 503


@pytest.mark.parametrize("change", [
    {"organization": "  "}, {"road_name": " "}, {"lane_closure": 2},
    {"length_m": -1}, {"end_date": "2026-11-01"},
])
def test_project_creation_rejects_invalid_confirmation(change):
    data = {
        "organization": "BBMP", "project_type": "road_repair", "description": "Repair",
        "road_name": "Road", "start_date": "2026-11-12", "end_date": "2026-11-18",
        "lane_closure": 0,
    }
    with pytest.raises(ValidationError):
        ProjectCreate(**{**data, **change})


def test_api_extract_contract_and_invalid_requests(monkeypatch):
    app = FastAPI()
    app.include_router(api_router, prefix="/api")
    provider = provider_with_response('{"road_name":"Example Road"}')
    monkeypatch.setattr("app.services.project_service.get_llm_provider", lambda: provider)

    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/projects/extract", json={"description": " Road project "})
            assert response.status_code == 200
            assert response.json()["road_name"] == "Example Road"
            assert response.json()["start_date"] is None
            assert response.json()["description"] == "Road project"
            for body in ({}, {"description": " "}, {"description": "x" * 4001}, {"description": 123}):
                assert (await client.post("/api/projects/extract", json=body)).status_code == 422
            provider._model.generate_content_async.side_effect = google_errors.ResourceExhausted("limit")
            response = await client.post("/api/projects/extract", json={"description": "Road work"})
            assert response.status_code == 503
            assert "manually" in response.json()["detail"]

    asyncio.run(run())
