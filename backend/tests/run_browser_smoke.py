"""Run the real frontend against a disposable Phase 8 database and backend.

Start the frontend first, then run: python -m tests.run_browser_smoke
Requires RUN_DB_INTEGRATION=1, pytest, and frontend Playwright/Chromium.
"""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.request
import psycopg2

from tests.test_phase8 import migrate, temporary_database


def main() -> int:
    if os.environ.get("RUN_DB_INTEGRATION") != "1":
        raise SystemExit("Set RUN_DB_INTEGRATION=1 to allow disposable test database provisioning.")
    root = Path(__file__).resolve().parents[2]
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    with temporary_database() as url:
        migrate(url)
        with psycopg2.connect(url) as connection, connection.cursor() as cursor:
            cursor.execute("""INSERT INTO road_segments (id, road_name, road_type, geometry)
                              VALUES ('phase9-browser-road', 'Browser Phase 9 Road', 'residential',
                              ST_GeomFromText('LINESTRING(77.64 12.97,77.641 12.971)', 4326))""")
        environment = {**os.environ, "DATABASE_URL": url.replace("postgresql://", "postgresql+asyncpg://", 1),
                       "DATABASE_SYNC_URL": url, "ENVIRONMENT": "development", "ENABLE_DEMO_APPROVALS": "true",
                       "DEMO_REVIEWER_ID": "isolated-browser-reviewer",
                       "BACKEND_CORS_ORIGINS": "http://127.0.0.1:3000,http://localhost:3000"}
        log_path = root / "logs" / "browser-test-backend.log"
        log_path.parent.mkdir(exist_ok=True)
        with log_path.open("w", encoding="utf-8") as log:
            target = f"http://127.0.0.1:{port}"

            def read(path):
                with urllib.request.urlopen(target + path, timeout=5) as response:
                    return json.load(response)

            def start_backend():
                process = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(port)],
                                           cwd=root / "backend", env=environment, stdout=log, stderr=log,
                                           creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
                for _ in range(60):
                    try:
                        read("/health")
                        return process
                    except OSError:
                        if process.poll() is not None:
                            raise RuntimeError(f"Test backend exited; inspect {log_path}")
                        time.sleep(0.25)
                process.terminate()
                process.wait(timeout=10)
                raise RuntimeError(f"Test backend did not become ready; inspect {log_path}")

            def stop_backend(process):
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)

            backend = start_backend()
            try:
                npm = "npm.cmd" if os.name == "nt" else "npm"
                result = subprocess.run([npm, "run", "test:e2e"], cwd=root / "frontend",
                                        env={**os.environ, "E2E_API_URL": target}).returncode
                if result:
                    return result
                approved = next(plan for plan in read("/api/coordination-plans") if plan["status"] == "APPROVED")
                plan_path = "/api/coordination-plans/" + approved["id"]
                workplan_path = "/api/workplans/" + read(plan_path)["workplan_id"]
                before = [read(workplan_path), read(plan_path + "/events")]
                stop_backend(backend)
                backend = start_backend()
                after = [read(workplan_path), read(plan_path + "/events")]
                assert before == after, "Workplan or audit history changed across backend restart."
                print("Verified workplan and audit history persistence after backend restart.")
                return 0
            finally:
                stop_backend(backend)


if __name__ == "__main__":
    raise SystemExit(main())
