"""Database integration test. Set RUN_DB_INTEGRATION=1 to run."""
import asyncio
import os
import uuid

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.api.router import api_router
from app.database import get_db
from app.env import load_project_env
from app.schemas.project import ProjectExtract
from data.ingest.bbmp_data import ROOT


@pytest.mark.skipif(os.environ.get("RUN_DB_INTEGRATION") != "1", reason="requires PostgreSQL")
def test_project_conflict_and_risk_flow(monkeypatch):
    async def run():
        load_project_env(ROOT / ".env.local")
        db_url = os.environ["DATABASE_SYNC_URL"].replace("postgresql://", "postgresql+asyncpg://", 1)
        engine = create_async_engine(db_url)
        try:
            async with engine.connect() as connection:
                outer = await connection.begin()
                try:
                    async def db_override():
                        async with AsyncSession(
                            bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False
                        ) as session:
                            yield session

                    app = FastAPI()
                    app.include_router(api_router, prefix="/api")
                    app.dependency_overrides[get_db] = db_override
                    class TestProvider:
                        async def extract_project(self, description):
                            return ProjectExtract(
                                project_type="water_pipeline", road_name="Test Road",
                                start_date="2026-11-12", end_date="2026-11-18",
                                lane_closure=1, description=description,
                            )
                    monkeypatch.setattr("app.services.project_service.get_llm_provider", lambda: TestProvider())
                    async with httpx.AsyncClient(
                        transport=httpx.ASGITransport(app=app), base_url="http://test"
                    ) as client:
                        road = f"Integration test {uuid.uuid4()}"
                        extraction = await client.post("/api/projects/extract", json={"description": "Test project"})
                        assert extraction.status_code == 200
                        assert extraction.json()["organization"] is None
                        project = {
                            "organization": "Test", "project_type": "water_pipeline",
                            "description": "Test project", "road_name": road,
                            "start_date": "2026-11-12", "end_date": "2026-11-18",
                            "length_m": 150, "lane_closure": 1,
                        }
                        a = await client.post("/api/projects/", json=project)
                        assert a.status_code == 201, a.text
                        b = await client.post("/api/projects/", json={**project, "project_type": "telecom"})
                        assert b.status_code == 201, b.text
                        pid = a.json()["id"]
                        response = await client.post("/api/conflicts/analyze", json={"project_id": pid})
                        assert response.status_code == 200, response.text
                        assert response.json()["conflict_count"] == 1
                        assert response.json()["location_basis"] == "road_name"
                        assert response.json()["warnings"]
                        response = await client.post("/api/risk/predict", json={"project_id": pid})
                        assert response.status_code == 200, response.text
                        assert response.json()["experimental"] is True
                        assert response.json()["historical_features_available"] is False
                        assert response.json()["road_segment_matched"] is False
                        assert any("not a verified prediction" in s for s in response.json()["warnings"])
                        assert 0 <= response.json()["risk_score"] <= 100
                        assert response.json()["features_used"]["existing_projects"] == 1
                        response = await client.post("/api/coordinate/", json={"project_id": pid})
                        assert response.status_code == 200, response.text
                        assert len(response.json()["options"]) == 3
                        assert response.json()["llm_used"] is False
                        assert response.json()["recommended_option"] == "Review sequencing"
                        assert all(option["risk_score"] is None for option in response.json()["options"])
                        assert any("not verified proximity" in warning for warning in response.json()["warnings"])
                        before_db = (await connection.execute(text("""
                            SELECT p.start_date, p.end_date, p.duration_days,
                                   c.conflict_score, c.overlap_days, r.risk_score, r.model_version
                            FROM projects p JOIN conflicts c ON c.project_a_id = p.id
                            JOIN risk_predictions r ON r.project_id = p.id
                            WHERE p.id = :pid
                        """), {"pid": pid})).one()
                        change = {"project_id": pid, "new_start_date": "2026-11-18", "new_end_date": "2026-11-24"}
                        response = await client.post("/api/simulate/", json={"base_project_id": pid, "schedule_changes": [change]})
                        assert response.status_code == 200, response.text
                        simulation = response.json()
                        assert simulation["location_basis"] == "road_name"
                        assert simulation["before"]["temporal_overlap_count"] == 1
                        assert simulation["before"]["conflicts"][0]["overlap_days"] == 6
                        assert simulation["after"]["temporal_overlap_count"] == 0
                        assert simulation["after"]["conflict_count"] == 1
                        assert simulation["after"]["conflicts"][0]["overlap_days"] == 0
                        assert simulation["after"]["conflicts"][0]["conflict_score"] < simulation["before"]["conflicts"][0]["conflict_score"]
                        assert simulation["after"]["risk_score"] == simulation["before"]["risk_score"]
                        assert any("not saved" in warning for warning in simulation["warnings"])
                        after_db = (await connection.execute(text("""
                            SELECT p.start_date, p.end_date, p.duration_days,
                                   c.conflict_score, c.overlap_days, r.risk_score, r.model_version
                            FROM projects p JOIN conflicts c ON c.project_a_id = p.id
                            JOIN risk_predictions r ON r.project_id = p.id
                            WHERE p.id = :pid
                        """), {"pid": pid})).one()
                        assert before_db == after_db
                        neighbour_change = {**change, "project_id": b.json()["id"]}
                        response = await client.post("/api/simulate/", json={"base_project_id": pid, "schedule_changes": [neighbour_change]})
                        assert response.status_code == 200, response.text
                        assert response.json()["after"]["temporal_overlap_count"] == 0
                        same = {**change, "new_start_date": "2026-11-12", "new_end_date": "2026-11-18"}
                        response = await client.post("/api/simulate/", json={"base_project_id": pid, "schedule_changes": [same]})
                        assert response.json()["before"] == response.json()["after"]
                        with monkeypatch.context() as scoped:
                            seen = []
                            def duration_model(features):
                                seen.append(features.copy())
                                return float(features["project_duration"]), "LOW", "test-duration"
                            scoped.setattr("app.services.risk_service.ml_predict", duration_model)
                            longer = {**change, "new_end_date": "2026-11-30"}
                            response = await client.post("/api/simulate/", json={
                                "base_project_id": pid, "schedule_changes": [longer, neighbour_change],
                            })
                            assert response.status_code == 200, response.text
                            assert response.json()["before"]["risk_score"] == 6
                            assert response.json()["after"]["risk_score"] == 12
                            assert seen[0]["project_duration"] == 6 and seen[1]["project_duration"] == 12
                            assert seen[0]["existing_projects"] == seen[1]["existing_projects"] == 1
                            assert response.json()["after"]["temporal_overlap_count"] == 1
                        for changes in ([], [change, change], [{**change, "new_end_date": "2026-11-18"}]):
                            assert (await client.post("/api/simulate/", json={"base_project_id": pid, "schedule_changes": changes})).status_code == 422
                        response = await client.post("/api/simulate/", json={"base_project_id": pid, "schedule_changes": [{**change, "project_id": str(uuid.uuid4())}]})
                        assert response.status_code == 404
                        other = await client.post("/api/projects/", json={**project, "road_name": road + " other"})
                        response = await client.post("/api/simulate/", json={"base_project_id": pid, "schedule_changes": [{**change, "project_id": other.json()["id"]}]})
                        assert response.status_code == 422
                        response = await client.post("/api/simulate/", json={"base_project_id": other.json()["id"], "schedule_changes": [{**change, "project_id": other.json()["id"]}]})
                        assert response.status_code == 200
                        assert response.json()["before"]["conflict_count"] == 0
                        response = await client.post("/api/simulate/", json={"base_project_id": str(uuid.uuid4()), "schedule_changes": [change]})
                        assert response.status_code == 404
                        response = await client.post("/api/conflicts/analyze", json={"project_id": pid})
                        assert response.status_code == 200
                        response = await client.post("/api/risk/predict", json={"project_id": pid})
                        assert response.json()["features_used"]["existing_projects"] == 1
                        await connection.execute(text("""
                            UPDATE projects SET geometry = ST_GeomFromText(
                                'LINESTRING(77.59 12.97,77.591 12.971)', 4326)
                            WHERE id = ANY(:ids)
                        """), {"ids": [pid, b.json()["id"]]})
                        response = await client.post("/api/conflicts/analyze", json={"project_id": pid})
                        assert response.status_code == 200, response.text
                        assert response.json()["location_basis"] == "geometry"
                        assert response.json()["conflict_count"] == 1
                        response = await client.post("/api/simulate/", json={"base_project_id": pid, "schedule_changes": [change]})
                        assert response.status_code == 200, response.text
                        assert response.json()["location_basis"] == "geometry"
                        assert response.json()["after"]["temporal_overlap_count"] == 0
                        segment_id = str(uuid.uuid4())
                        await connection.execute(text("""
                            INSERT INTO road_segments (id, road_name, geometry, road_width, road_type)
                            VALUES (:id, 'Test Road', ST_GeomFromText(
                                'LINESTRING(77.59 12.97,77.591 12.971)', 4326), 7, 'tertiary')
                        """), {"id": segment_id})
                        await connection.execute(text(
                            "UPDATE projects SET road_segment_id = :segment WHERE id = :pid"
                        ), {"segment": segment_id, "pid": pid})
                        response = await client.post("/api/risk/predict", json={"project_id": pid})
                        assert response.json()["road_segment_matched"] is True
                        assert response.json()["historical_features_available"] is False
                        await connection.execute(text("""
                            INSERT INTO road_segment_features (road_segment_id, grievance_count)
                            VALUES (:id, 4)
                        """), {"id": segment_id})
                        response = await client.post("/api/risk/predict", json={"project_id": pid})
                        assert response.json()["historical_features_available"] is True
                        assert response.json()["features_used"]["grievance_count"] == 4
                        assert any("not independently verified" in w for w in response.json()["warnings"])
                        def missing_model(_features):
                            raise FileNotFoundError("test missing model")
                        monkeypatch.setattr("app.services.risk_service.ml_predict", missing_model)
                        response = await client.post("/api/risk/predict", json={"project_id": pid})
                        assert response.status_code == 200, response.text
                        assert response.json()["model_version"] == "fallback"
                        assert any("deterministic fallback" in w for w in response.json()["warnings"])
                        response = await client.post("/api/simulate/", json={"base_project_id": pid, "schedule_changes": [change]})
                        assert response.status_code == 200
                        assert response.json()["after"]["model_version"] == "fallback"
                        assert any("deterministic fallback" in w for w in response.json()["warnings"])
                        for path in ("/api/conflicts/analyze", "/api/risk/predict"):
                            response = await client.post(path, json={"project_id": str(uuid.uuid4())})
                            assert response.status_code == 404
                finally:
                    await outer.rollback()
        finally:
            await engine.dispose()

    asyncio.run(run())
