"""Draft validation plus opt-in, isolated PostGIS migration/workflow tests."""
import asyncio
from contextlib import contextmanager
from pathlib import Path
import os
import subprocess
import sys
from types import SimpleNamespace
import uuid

import httpx
import psycopg2
from psycopg2 import sql
import pytest
from fastapi import FastAPI
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.api.router import api_router
from app.database import get_db
from app.env import load_project_env
from app.schemas.proposal import ProposalUpdate
from app.services import proposal_service

BACKEND = Path(__file__).resolve().parents[1]
TASK = {"id": "dig", "task": "Excavation", "organization": "Water team",
        "start_date": "2026-11-12", "end_date": "2026-11-14", "notes": "Confirm access"}
FOLLOWUP = {**TASK, "id": "install", "task": "Install pipeline", "start_date": "2026-11-14",
            "end_date": "2026-11-18", "dependency": "dig"}


@pytest.mark.parametrize("tasks", [
    [TASK, TASK], [{**TASK, "end_date": TASK["start_date"]}],
    [{**TASK, "dependency": "missing"}],
    [{**TASK, "dependency": "install"}, FOLLOWUP],
    [TASK, {**FOLLOWUP, "start_date": "2026-11-13"}],
    [{**TASK, "organization": " "}],
])
def test_invalid_task_graphs_and_fields(tasks):
    with pytest.raises(ValidationError):
        ProposalUpdate(expected_revision=1, tasks=tasks)


def test_exclusive_end_dependency_and_no_client_actor():
    assert len(ProposalUpdate(expected_revision=1, tasks=[TASK, FOLLOWUP]).tasks) == 2
    with pytest.raises(ValidationError):
        ProposalUpdate(expected_revision=1, tasks=[TASK], actor="pretend-admin")


@contextmanager
def temporary_database():
    if os.environ.get("RUN_DB_INTEGRATION") != "1":
        pytest.skip("requires PostgreSQL and CREATEDB; set RUN_DB_INTEGRATION=1")
    load_project_env(BACKEND.parent / ".env.local")
    url = make_url(os.environ["DATABASE_SYNC_URL"])
    name = "digsync_phase8_test_" + uuid.uuid4().hex
    admin = psycopg2.connect(url.render_as_string(hide_password=False))
    admin.autocommit = True
    try:
        with admin.cursor() as cursor:
            cursor.execute(sql.SQL("CREATE DATABASE {} TEMPLATE template0").format(sql.Identifier(name)))
        yield url.set(database=name).render_as_string(hide_password=False)
    finally:
        # Only this newly generated disposable database is removed.
        assert name.startswith("digsync_phase8_test_") and len(name) == 52
        with admin.cursor() as cursor:
            cursor.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(name)))
        admin.close()


def migrate(url):
    environment = {**os.environ, "DATABASE_URL": url, "DATABASE_SYNC_URL": url}
    result = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=BACKEND,
                            env=environment, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


def test_fresh_and_existing_migrations_preserve_legacy_tasks():
    with temporary_database() as url:
        migrate(url)
        with psycopg2.connect(url) as connection, connection.cursor() as cursor:
            cursor.execute("SELECT version_num FROM alembic_version")
            assert cursor.fetchone()[0] == "0004_approval_workplans"
            cursor.execute("SELECT indexname FROM pg_indexes WHERE tablename='projects'")
            assert {"idx_projects_geometry", "idx_projects_road_name"}.issubset({row[0] for row in cursor})
        migrate(url)  # Re-running head is harmless.
    with temporary_database() as url:
        with psycopg2.connect(url) as connection, connection.cursor() as cursor:
            cursor.execute((BACKEND / "create_schema.sql").read_text(encoding="utf-8"))
            cursor.execute("""INSERT INTO projects (id, organization, project_type, description, start_date, end_date, duration_days)
                              VALUES ('legacy-p', 'Water', 'water_pipeline', 'Existing project', '2026-11-12', '2026-11-18', 6)""")
            cursor.execute("""INSERT INTO coordination_plans (id, project_id, option_name, description, risk_score, estimated_duration, tradeoffs)
                              VALUES ('legacy-plan', 'legacy-p', 'Existing suggestion', 'Preserve', 20, 6, 'Existing tradeoffs')""")
            cursor.execute("""INSERT INTO workplans (id, coordination_plan_id, project_id, task, organization, start_date, end_date)
                              VALUES ('legacy-task', 'legacy-plan', 'legacy-p', 'Existing task', 'Water', '2026-11-12', '2026-11-18')""")
        migrate(url)
        with psycopg2.connect(url) as connection, connection.cursor() as cursor:
            cursor.execute("SELECT task, workplan_id FROM workplans WHERE id='legacy-task'")
            task, header_id = cursor.fetchone()
            assert task == "Existing task" and header_id
            cursor.execute("SELECT approved_by, warnings FROM workplan_headers WHERE id=%s", (header_id,))
            actor, warnings = cursor.fetchone()
            assert actor is None and "legacy" in warnings[0]
            cursor.execute("SELECT status FROM coordination_plans WHERE id='legacy-plan'")
            assert cursor.fetchone()[0] == "LEGACY"


def test_persistent_decisions_concurrency_and_atomic_rollback(monkeypatch):
    settings = SimpleNamespace(environment="development", enable_demo_approvals=True, demo_reviewer_id="test-demo-reviewer")
    monkeypatch.setattr(proposal_service, "get_settings", lambda: settings)

    async def run(url):
        engine = create_async_engine(url.replace("postgresql://", "postgresql+asyncpg://", 1))
        app = FastAPI()
        app.include_router(api_router, prefix="/api")

        async def db_override():
            async with AsyncSession(engine, expire_on_commit=False) as session:
                yield session

        app.dependency_overrides[get_db] = db_override
        try:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test") as client:
                data = {"organization": "Water", "project_type": "water_pipeline", "description": "Test works",
                        "road_name": "Phase 8 test road", "start_date": "2026-11-12", "end_date": "2026-11-18"}
                response = await client.post("/api/projects/", json=data)
                assert response.status_code == 201, response.text
                project_id = response.json()["id"]
                neighbour = (await client.post("/api/projects/", json={**data, "organization": "Telecom"})).json()["id"]

                async def create(tasks=None):
                    response = await client.post("/api/coordination-plans", json={
                        "project_id": project_id, "option_key": "review_sequencing", "tasks": tasks or [],
                        "related_project_ids": [neighbour],
                    })
                    assert response.status_code == 201, response.text
                    return response.json()

                plan = await create()
                path = f'/api/coordination-plans/{plan["id"]}'
                assert plan["status"] == "DRAFT" and plan["revision"] == 1
                assert len(plan["project_snapshots"]) == 2
                assert any("Experimental" in warning or "experimental" in warning
                           for warning in plan["analysis_snapshot"]["warnings"])
                assert (await client.post(path + "/approve", json={"expected_revision": 1})).status_code == 422
                saved = await client.patch(path, json={"expected_revision": 1, "tasks": [TASK, FOLLOWUP],
                                                       "related_project_ids": [neighbour], "notes": "Agreed locally"})
                assert saved.status_code == 200, saved.text
                assert saved.json()["revision"] == 2
                assert (await client.patch(path, json={"expected_revision": 1})).status_code == 409
                assert (await client.post(path + "/approve", json={"expected_revision": 1})).status_code == 409
                approved = await client.post(path + "/approve", json={"expected_revision": 2})
                assert approved.status_code == 200, approved.text
                workplan = approved.json()
                assert len(workplan["tasks"]) == 2 and workplan["approved_by"] == "test-demo-reviewer"
                assert workplan["tasks"][1]["dependency"] == workplan["tasks"][0]["id"]
                assert workplan["tasks"][0]["notes"] == TASK["notes"]
                assert (await client.get('/api/workplans/' + workplan["id"])).json() == workplan
                assert (await client.post('/api/workplans/coordination-plans/' + plan["id"] + '/approve',
                                          json={"expected_revision": 2})).json()["id"] == workplan["id"]
                assert (await client.patch(path, json={"expected_revision": 2})).status_code == 409
                assert (await client.post(path + "/reject", json={"expected_revision": 2, "reason": "late"})).status_code == 409
                history = (await client.get(path + "/events")).json()
                assert [event["event"] for event in history] == ["CREATED", "MODIFIED", "APPROVED"]
                for pid in [project_id, neighbour]:
                    original = (await client.get('/api/projects/' + pid)).json()
                    assert original["start_date"] == data["start_date"] and original["end_date"] == data["end_date"]
                assert len((await client.get(f'/api/projects/{project_id}/coordination-plans')).json()) == 1

                rejected = await create([TASK])
                reject_path = f'/api/coordination-plans/{rejected["id"]}'
                assert (await client.post(reject_path + '/reject', json={"expected_revision": 1, "reason": " "})).status_code == 422
                result = await client.post(reject_path + '/reject', json={"expected_revision": 1, "reason": "Need agency agreement"})
                assert result.status_code == 200 and result.json()["status"] == "REJECTED"
                assert (await client.post(reject_path + '/approve', json={"expected_revision": 1})).status_code == 409

                partial = await create([TASK])
                changed = await client.patch(f'/api/coordination-plans/{partial["id"]}',
                                             json={"expected_revision": 1, "notes": "Notes-only update"})
                assert changed.status_code == 200, changed.text
                assert changed.json()["tasks"][0]["id"] == TASK["id"]
                assert len(changed.json()["project_snapshots"]) == 2

                stale = await create([TASK])
                stale_path = f'/api/coordination-plans/{stale["id"]}'
                async with engine.begin() as connection:
                    await connection.execute(text("UPDATE projects SET organization='Changed owner' WHERE id=:id"), {"id": neighbour})
                assert (await client.post(stale_path + '/approve', json={"expected_revision": 1})).status_code == 409
                refreshed = await client.patch(stale_path, json={"expected_revision": 1, "tasks": [TASK], "related_project_ids": [neighbour]})
                assert refreshed.status_code == 200
                assert (await client.post(stale_path + '/approve', json={"expected_revision": 2})).status_code == 200

                concurrent = await create([TASK])
                approval_path = f'/api/coordination-plans/{concurrent["id"]}/approve'
                results = await asyncio.gather(*[client.post(approval_path, json={"expected_revision": 1}) for _ in range(2)])
                assert [result.status_code for result in results] == [200, 200], [result.text for result in results]
                assert results[0].json()["id"] == results[1].json()["id"]
                events = (await client.get(f'/api/coordination-plans/{concurrent["id"]}/events')).json()
                assert [event["event"] for event in events] == ["CREATED", "APPROVED"]

                failure = await create([TASK])
                failure_path = f'/api/coordination-plans/{failure["id"]}'
                original_event = proposal_service._event

                def fail_after_tasks(db, plan, action, actor, details):
                    if action == "APPROVED":
                        raise RuntimeError("Injected failure before commit")
                    return original_event(db, plan, action, actor, details)

                with monkeypatch.context() as patch:
                    patch.setattr(proposal_service, "_event", fail_after_tasks)
                    assert (await client.post(failure_path + '/approve', json={"expected_revision": 1})).status_code == 500
                unchanged = (await client.get(failure_path)).json()
                assert unchanged["status"] == "DRAFT" and unchanged["workplan_id"] is None
                async with engine.connect() as connection:
                    assert (await connection.execute(text("SELECT count(*) FROM workplans WHERE coordination_plan_id=:id"),
                                                     {"id": failure["id"]})).scalar() == 0
                assert (await client.post(failure_path + '/approve', json={"expected_revision": 1})).status_code == 200

                settings.enable_demo_approvals = False
                assert (await client.post('/api/coordination-plans', json={"project_id": project_id, "option_key": "retain_schedule"})).status_code == 403
                settings.enable_demo_approvals = True
                settings.environment = "production"
                assert (await client.post(path + '/approve', json={"expected_revision": 2})).status_code == 403
                assert (await client.get('/api/workplans/missing')).status_code == 404
                assert (await client.get('/api/coordination-plans/missing')).status_code == 404
                settings.environment = "development"
                async with engine.begin() as connection:
                    await connection.execute(text("""INSERT INTO coordination_plans
                        (id, project_id, option_name, description, tradeoffs, status)
                        VALUES ('legacy-without-header', :pid, 'Legacy approval', 'Imported', 'Unknown', 'APPROVED')"""),
                        {"pid": project_id})
                assert (await client.post('/api/coordination-plans/legacy-without-header/approve',
                                          json={"expected_revision": 1})).status_code == 409
        finally:
            await engine.dispose()

    with temporary_database() as url:
        migrate(url)
        asyncio.run(run(url))
