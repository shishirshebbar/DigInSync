"""Road data boundaries and real PostGIS Phase 9 API coverage."""
import asyncio
import copy
import json

import httpx
import psycopg2
import pytest
from fastapi import FastAPI, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.api.router import api_router
from app.database import get_db
from app.services import proposal_service
from app.services.map_service import parse_bbox
from data.ingest import osm_local
from data.ingest.osm_roads import load_roads
from tests.test_phase8 import temporary_database, migrate, TASK, FOLLOWUP
from types import SimpleNamespace

BOUNDS = (77.63, 12.96, 77.65, 12.98)
PAYLOAD = {"elements": [{"type": "way", "id": 123, "tags": {"highway": "residential", "name": "Phase 9 road"},
                         "geometry": [{"lon": 77.64, "lat": 12.97}, {"lon": 77.641, "lat": 12.971}]}]}


@pytest.mark.parametrize("value", ["bad", "0,0,1,1", "nan,0,1,1", "77,13,76,12", "77,12,77.1,12"])
def test_map_bounds_reject_invalid_or_unbounded_queries(value):
    with pytest.raises(HTTPException):
        parse_bbox(value)


@pytest.mark.parametrize("value", ["77.4,12.96,77.42,12.98", "77.6,12.9,77.7,13", "bad"])
def test_import_bounds_stay_small_and_local(value):
    with pytest.raises(ValueError):
        osm_local.validate_bounds(value)


def test_road_parser_requires_complete_geometry_and_preserves_unknown_width():
    rows = osm_local.parse_roads(PAYLOAD, BOUNDS)
    assert rows[0][:4] == ("123", "Phase 9 road", "residential", None)
    for invalid in ({"elements": [], "remark": "timeout"}, {"elements": []}, {"elements": "invalid"}):
        with pytest.raises(ValueError):
            osm_local.parse_roads(invalid, BOUNDS)
    broken = copy.deepcopy(PAYLOAD)
    broken["elements"][0]["geometry"] = [{"lon": 77.64, "lat": 12.97}]
    with pytest.raises(ValueError):
        osm_local.parse_roads(broken, BOUNDS)
    broken["elements"][0]["geometry"] = [{"lon": float("nan"), "lat": 12.97}] * 2
    with pytest.raises(ValueError):
        osm_local.parse_roads(broken, BOUNDS)


def test_cached_import_validates_responses_and_reuses_successful_download(tmp_path, monkeypatch):
    class Response:
        status_code = 200
        def __enter__(self): return self
        def __exit__(self, *_): pass
        def raise_for_status(self): pass
        def iter_content(self, _): yield json.dumps(PAYLOAD).encode()
    calls = []
    def post(*args, **kwargs):
        calls.append(kwargs)
        return Response()
    monkeypatch.setattr(osm_local.requests, "post", post)
    document = osm_local.download(BOUNDS, tmp_path)
    assert document["bbox"] == list(BOUNDS) and document["retrieved_at"] and document["attribution"]
    assert osm_local.download(BOUNDS, tmp_path) == document
    assert len(calls) == 1 and calls[0]["timeout"] == (10, 45)
    Response.status_code = 429
    with pytest.raises(ValueError, match="rate limited"):
        osm_local.download(BOUNDS, tmp_path, refresh=True)
    assert osm_local.download(BOUNDS, tmp_path) == document
    Response.status_code = 200
    monkeypatch.setattr(Response, "iter_content", lambda *_: iter([b'{"remark":"timeout","elements":[]}']))
    with pytest.raises(ValueError, match="Incomplete"):
        osm_local.download(BOUNDS, tmp_path, refresh=True)
    assert osm_local.download(BOUNDS, tmp_path) == document


def test_roads_maps_catalog_and_workflow_totals(monkeypatch):
    monkeypatch.setattr(proposal_service, "get_settings", lambda: SimpleNamespace(
        environment="development", enable_demo_approvals=True, demo_reviewer_id="phase9-reviewer"))

    async def run(url):
        engine = create_async_engine(url.replace("postgresql://", "postgresql+asyncpg://", 1))
        app = FastAPI()
        app.include_router(api_router, prefix="/api")
        async def session():
            async with AsyncSession(engine, expire_on_commit=False) as db:
                yield db
        app.dependency_overrides[get_db] = session
        try:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, client=("127.0.0.1", 1234)), base_url="http://localhost") as client:
                empty = (await client.get("/api/impact/")).json()
                assert empty["projects_total"] == empty["workplans_generated"] == 0
                assert all(value == 0 for value in empty["spatial_coverage"].values())
                assert (await client.get("/api/roads?q=missing")).json()["total"] == 0
                assert (await client.get("/api/roads")).status_code == 422
                rows = osm_local.parse_roads(PAYLOAD, BOUNDS)
                load_roads(rows, url)
                load_roads(rows, url)
                roads = (await client.get("/api/roads?q=Phase%209&limit=1")).json()
                assert roads["total"] == 1 and roads["features"][0]["geometry"]["coordinates"][0] == [77.64, 12.97]
                segment = roads["features"][0]["id"]
                assert (await client.get("/api/roads?q=%25")).json()["total"] == 0
                assert (await client.get("/api/roads?bbox=77.63,12.96,77.65,12.98")).json()["total"] == 1
                assert (await client.get("/api/roads?limit=501&q=road")).status_code == 422
                assert (await client.get("/api/roads?bbox=0,0,2,2")).status_code == 422
                data = {"organization": "Water", "project_type": "water_pipeline", "description": "Test project",
                        "road_name": "Edited client name", "start_date": "2026-11-12", "end_date": "2026-11-18"}
                assert (await client.post("/api/projects/", json={**data, "road_segment_id": "missing"})).status_code == 422
                mapped = (await client.post("/api/projects/", json={**data, "road_segment_id": segment})).json()
                assert mapped["road_name"] == "Phase 9 road" and mapped["road_segment_id"] == segment
                neighbor = (await client.post("/api/projects/", json={**data, "road_segment_id": segment, "organization": "Telecom"})).json()
                unmapped = (await client.post("/api/projects/", json={**data, "road_name": "Phase 9 road"})).json()
                map_data = (await client.get(f'/api/projects/{mapped["id"]}/map')).json()
                assert {item["id"] for item in map_data["features"]} == {mapped["id"], neighbor["id"]}
                assert map_data["unmapped_ids"] == [] and map_data["location_basis"] == "geometry"
                by_name = (await client.get(f'/api/projects/{unmapped["id"]}/map')).json()
                assert by_name["unmapped_ids"] == [unmapped["id"]] and by_name["total"] == 3
                assert (await client.get('/api/projects/missing/map')).status_code == 404
                catalog = (await client.get("/api/projects/catalog?limit=1&offset=1")).json()
                assert catalog["total"] == 3 and len(catalog["items"]) == 1
                assert (await client.get("/api/projects/catalog?q=%25")).json()["total"] == 0
                conflict = (await client.post('/api/conflicts/analyze', json={"project_id": mapped["id"]})).json()
                assert {item["project_b_id"] for item in conflict["conflicts"]} == {neighbor["id"]}
                predictions = await asyncio.gather(*[client.post('/api/risk/predict', json={"project_id": mapped["id"]}) for _ in range(2)])
                assert all(item.status_code == 200 for item in predictions)
                async with engine.connect() as db:
                    assert await db.scalar(text("SELECT COUNT(*) FROM risk_predictions WHERE project_id=:id"), {"id": mapped["id"]}) == 1
                async with engine.begin() as db:
                    await db.execute(text("INSERT INTO conflicts (id, project_a_id, project_b_id, severity) VALUES ('reverse', :a, :b, 'HIGH')"), {"a": neighbor["id"], "b": mapped["id"]})
                plan = (await client.post('/api/coordination-plans', json={"project_id": mapped["id"], "option_key": "review_sequencing",
                    "tasks": [TASK, FOLLOWUP, {**TASK, "id": "third"}]})).json()
                approved = await client.post(f'/api/coordination-plans/{plan["id"]}/approve', json={"expected_revision": 1})
                assert approved.status_code == 200, approved.text
                async with engine.begin() as db:
                    await db.execute(text("""INSERT INTO coordination_plans (id, project_id, option_name, description, tradeoffs, status)
                        SELECT 'draft-' || n, :id, 'Review', 'Description', '', 'DRAFT' FROM generate_series(1, 105) n"""), {"id": mapped["id"]})
                metrics = (await client.get('/api/impact/')).json()
                assert metrics["spatial_coverage"]["road_segments"] == 1
                assert metrics["spatial_coverage"]["roads_with_feature_rows"] == 0
                assert metrics["projects_total"] == 3 and metrics["mapped_projects"] == 2 and metrics["unmapped_projects"] == 1
                assert metrics["workplans_generated"] == 1 and metrics["task_count"] == 3
                assert metrics["proposal_status_counts"] == {"APPROVED": 1, "DRAFT": 105}
                assert metrics["conflicts_detected"] == metrics["high_severity_conflicts"] == 1
                assert (await client.get('/api/impact/')).json() == metrics
                original = (await client.get('/api/projects/' + mapped["id"])).json()
                assert original["start_date"] == data["start_date"] and original["end_date"] == data["end_date"]
                async with engine.begin() as db:
                    await db.execute(text("UPDATE projects SET road_name=NULL WHERE id=:id"), {"id": unmapped["id"]})
                assert (await client.get('/api/projects/catalog')).status_code == 200
                legacy_map = (await client.get(f'/api/projects/{unmapped["id"]}/map')).json()
                assert legacy_map["features"][0]["properties"]["road_name"] == "Unknown road"
        finally:
            await engine.dispose()

    with temporary_database() as url:
        migrate(url)
        asyncio.run(run(url))
