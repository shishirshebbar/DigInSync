# DigInSync: project progress and contributor setup

DigInSync is a prototype for coordinating Bengaluru infrastructure projects.
It combines project entry, candidate conflict analysis, an experimental risk
indicator, coordination suggestions, a read-only schedule simulator, and
local-demo proposals, decisions and workplans.

## What a clone contains

This guide describes local `main` after Phase 8-9 PR #1 was merged, plus the
subsequent **uncommitted local changes** described below. Those changes and this
guide must be committed and pushed before they appear in another clone.

The following are **not included** in the clone:

- `.env.local` and credentials: each contributor must create their own.
- `data/raw` source files, including BBMP CSVs, KML maps and OSM downloads.
- Trained model and metadata under `backend/ml/models`.
- PostgreSQL data: projects, imported roads and records live in a local
  database, not in Git.
- Generated reports and previous session artifacts.

Only `.gitkeep` placeholders for the raw-data and model directories are
tracked. Obtain source datasets through an authorized channel and check their
license, provenance, version, column names and privacy requirements before use.
Never commit credentials, private datasets or database dumps.

## Progress by phase

| Phase | Status | What works / what remains |
|---|---|---|
| 1: Foundation | Implemented | FastAPI, Next.js, PostgreSQL/PostGIS configuration and application structure. |
| 2: Data | Partial | Real BBMP and OSM ingestion code exists. Data is not shipped with the repository; road matching and spatial features are incomplete. |
| 3: Conflicts | Implemented, limited | Deterministic candidate scoring uses PostGIS proximity when geometry exists, or exact road-name matching otherwise. Both have coverage limitations. |
| 4: Risk | Experimental | Model training and inference exist; an explicit deterministic fallback is used if the model file is absent. Neither is a validated disruption prediction. |
| 5: Project entry | Implemented; extraction tested locally | Manual entry and editable confirmation work. A frontend Gemini extraction returned HTTP 200 after configuring a supported model; outputs still require review. |
| 6: Coordination | Implemented; live AI verification pending | Three deterministic review templates are available. An optional Gemini explanation uses aggregate context; unavailable AI falls back with a warning. |
| 7: Simulation | Implemented | Compare proposed dates without saving them or using an LLM. The current UI changes the base project only. |
| 8: Approval and workplans | Implemented for local demo | Persist and review proposals, record decisions and audit events, and generate/retrieve workplans. Proper authentication and authorization remain. |
| 9: Frontend polish | Implemented for prototype | Project workspace, map, conflict and risk panels, coordination, simulation, proposals and impact dashboard exist. Further end-to-end and accessibility checks remain. |
| 10: Deployment | Not completed | Provision services, configure secrets and networking, and test a public URL. |
| 11: Testing and hardening | Partial | Focused tests exist; complete live-provider, clean-install, end-to-end, deployment and reliability checks. |

### Local changes awaiting commit and push

The following are in the local working tree and are **not yet in the merged
commit**. Include them in a future commit to share them:

- Approval freshness checks compare reviewed project/candidate snapshots and
  conflict analysis with current data. Changed data requires a new review.
  Drafts created before candidate snapshots were added must be saved again.
- Demo proposal mutations require direct loopback access. This is not
  authentication and does not provide production security. See
  [backend notes](./backend/README.md) for configuration and limitations.
- The impact API and dashboard show data-coverage counts, with warnings that
  stored counts do not prove completeness or nearby incidents.
- A group-disjoint proxy evaluation and regression tests were added; it does
  not replace the deployed model or validate real outcomes.
- The Docker database host port and example database URLs were changed to
  `5433`, avoiding a conflict with another local PostgreSQL instance.

Local secrets and settings in `.env.local`, including the configured Gemini
model, remain ignored and are not shared by pushing. Each contributor must
configure their own environment. Review the working tree before committing:
an empty untracked `frontend/tests/road-preview.spec.ts` is also present and
should not be mistaken for a completed test.

### Critical limitations

- The ML labels are constructed from ward-level proxies, not observed project
  disruption outcomes. The published 76.4% sample-level accuracy measures
  agreement with those proxies; it is **not** real-world accuracy or a
  disruption probability. The 419 training identifier groups are not verified
  distinct wards; the work-order numbers and grievance names lack a verified
  crosswalk. Random sample splits can share source groups between training and
  evaluation. A group-disjoint proxy baseline has since been evaluated, but
  its label thresholds still use all groups. Resolve identifiers and evaluate
  against observed outcomes before making predictive claims.
- Supplied BBMP records have ward information but no coordinates. Projects are
  not automatically matched to road segments, and road-segment historical
  features were absent in the previous local database. No nearby incidents
  should be inferred from missing records. The API and UI display warnings.
- Conflict counts include spatial candidates even when their dates do not
  overlap. Simulation displays overlapping schedules, overlap days and
  individual scores separately. The experimental model uses duration and
  candidate counts, not calendar dates or overlap days; a date shift may not
  change its indicator.
- Local counts from an earlier import (1,628 work orders, 126,974 grievances,
  153,615 OSM road ways) describe that machine's database, not a fresh clone.
  The ward crosswalk and proposed boundary repairs have not been approved.

## Prerequisites

Recommended local development setup:

1. Git and internet access for dependencies and optional public OSM downloads.
2. Python 3.11 and `pip` (the backend Dockerfile uses Python 3.12).
3. Node.js 20.9 or later and npm; the frontend uses Next.js 16 and React 19.
4. Docker Desktop with the Compose plugin, running, for the PostGIS database;
   or a separate PostgreSQL 16 instance with PostGIS and PostGIS topology
   installed and permission to create extensions.
5. Free ports 5433, 8000 and 3000, sufficient disk space for dependencies and
   optionally a large OSM extract, and a current browser.
6. Optional: a valid **Google Gemini API** key, a supported Gemini model and
   provider quota for AI features. A telemetry API key is not a Gemini key.
   Manual entry, deterministic coordination and simulation need no LLM key.
7. Optional: the compatible BBMP CSVs for real-data ingestion and the real-data
   training script. A fresh clone can otherwise use the risk fallback.

The commands below use Windows PowerShell and assume a **new, empty** local
database. They have not been rerun from a completely clean clone in this
session. Adapt paths and virtual-environment activation for other systems.

## Local setup

### 1. Clone and configure

```powershell
git clone https://github.com/shishirshebbar/DigInSync.git
Set-Location DigInSync
Copy-Item .env.example .env.local
```

Edit `.env.local` locally; do not share its contents. Set a local
`POSTGRES_PASSWORD`, and set both `DATABASE_URL` and `DATABASE_SYNC_URL` to
match the same username, password, database and host. For the steps below,
retain `POSTGRES_USER=digsync` and `POSTGRES_DB=digsync`; Compose's health
check is hard-coded to those names. From the host, use `localhost` as the
database host and port `5433` (the container listens on port `5432`). If using
a special character in a database URL password,
URL-encode it. Existing environment variables take precedence over values in
`.env.local`.

For AI features, set `LLM_PROVIDER=gemini`, `LLM_API_KEY` and a model available
to your Google project in `GEMINI_MODEL`. The existing example and code
default refer to `gemini-1.5-flash` and must be updated; do not rely on that
model being available. One local extraction succeeded with
`gemini-3.5-flash-lite`, but availability and quota depend on the Google
project. AI project extraction sends the entered description to
the provider; optional AI coordination sends aggregate counts and the baseline
indicator. The UI discloses this. For manual-only use, leave the placeholder
key and do not request an AI explanation.

For local proposal decisions, set `ENVIRONMENT=development`,
`ENABLE_DEMO_APPROVALS=true`, and a nonblank `DEMO_REVIEWER_ID`; connect
directly to the local backend. This is a demo switch, not an identity or
authorization system. Never expose it as a production approval mechanism.

### 2. Start the database and initialize the schema

```powershell
docker compose up -d db
docker compose ps
```

Wait until the database reports healthy. On a **fresh, empty database only**:

```powershell
Get-Content -Raw .\backend\create_schema.sql |
  docker compose exec -T db psql -v ON_ERROR_STOP=1 -U digsync -d digsync
```

The script creates the schema and sets the Alembic version to
`0003_grievance_ward`. It updates the Alembic version table, so **do not run it
against an existing database or use it as an upgrade procedure**. Back up
existing databases and inspect their migration state before changing them.
For pgAdmin, connect to host `127.0.0.1`, port `5433`, database `digsync`,
username `digsync` and the database password configured in `.env.local`.
An existing Docker volume retains its original database password even if
`POSTGRES_PASSWORD` is subsequently changed in `.env.local`.

The merged 0002 migration checks whether `projects.road_name` already exists
before adding it. A complete clean-clone migration test is still needed. The
schema script only stamps revision 0003; the 0004 migration is required for
Phase 8 proposals and workplans.

### 3. Install and start the backend

In a PowerShell terminal from the repository root:

```powershell
Set-Location backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m alembic upgrade head
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

For the fresh schema-script setup above, `alembic upgrade head` applies 0004.
For an existing database, back it up and inspect its revision and migration
history before upgrading; do not run the schema script on it.

If PowerShell execution policy blocks activation, invoke
`.\.venv\Scripts\python.exe` directly instead of `python`. Check
`http://localhost:8000/health` and `http://localhost:8000/docs`. `/health`
and `/ready` indicate that the app responds; they do not prove the database,
data, model or Gemini connection works.

### 4. Install and start the frontend

In another terminal:

```powershell
Set-Location frontend
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:3000`. The frontend defaults to the backend at
`http://localhost:8000`; configure `NEXT_PUBLIC_API_URL` in the frontend
environment if different, and ensure the backend CORS origin matches the UI.
The repository tracks a frontend lockfile; `npm.cmd ci` can be used for a
lockfile-based clean install.

The Compose file also defines backend and frontend containers. The frontend
Dockerfile uses `npm ci` and requires a Next.js standalone build;
`next.config.ts` now sets `output: "standalone"` so `next build` produces
the expected `server.js` entry-point. Use the local backend/frontend steps
above for development; the full-container path with container-to-container
database URLs requires a production deployment (Phase 10) and is not yet
verified end to end.

### 5. Optional: import data and train a model

From `backend`, with the virtual environment active and the database ready:

```powershell
# After independently obtaining compatible source files:
python -m data.ingest.bbmp_data
python -m ml.train_real

# Optional: download and import OSM road ways (large download).
python -m data.ingest.osm_roads
```

Place `work_orders.csv` and `grievances.csv` directly in `data/raw` before
running BBMP ingestion. The loader requires `slno`, `id`, `ward` and
`wodetails` in work orders, and `Complaint ID`, `Category`, `Grievance Date`,
`Ward Name` and `Grievance Status` in grievances. Training additionally needs
the work-order `amount` column. The loader validates required columns and uses
transactional upserts; it does not invent replacement records or clear
existing projects. Re-imports depend on stable source IDs, particularly the
work-order `slno`. The source files have no coordinates.

`train_real` generates an experimental model and metadata in
`backend/ml/models` from those CSVs; they remain ignored by Git. Without the
model artifact, the API reports a deterministic fallback. Only load trusted
joblib files: deserialization can execute code. The OSM loader downloads the
Karnataka extract from `download.openstreetmap.fr`, caches it under
`data/raw/osm`, and imports ways within a Bengaluru-area bounding box.
OpenStreetMap data is provided by OpenStreetMap contributors under the ODbL:
https://www.openstreetmap.org/copyright. Importing roads does not match
projects to roads or populate the missing historical spatial features.

## How to verify

Manual smoke test:

1. Start the database, backend and frontend. Use **Enter project details
   manually**, enter explicit dates and confirm. This creates a real project in
   the configured database; use a disposable development database.
2. Verify conflict and experimental-risk panels, including data warnings.
3. Select **Review coordination options**. This uses templates and no LLM.
4. Select **Try a schedule change** and compare before/after overlap details.
   No simulation change is saved.
5. Separately, with a working Gemini key and model, test AI extraction and the
   optional AI coordination explanation. Review outputs; do not enter sensitive
   text. A failure falls back only for coordination; manual entry remains
   available if extraction fails.

For automated backend tests, `pytest` is not listed in the runtime requirements:

```powershell
# From backend, with its virtual environment active
python -m pip install pytest
python -m pytest -q
```

The PostgreSQL integration test is opt-in and uses an outer rollback:

```powershell
$env:RUN_DB_INTEGRATION = "1"
python -m pytest -q tests\test_project_analysis_integration.py
Remove-Item Env:\RUN_DB_INTEGRATION
```

It still requires a reachable, initialized PostGIS database with the configured
credentials. For frontend checks from `frontend`:

```powershell
npm.cmd run lint
npm.cmd run build
```

In the previous Windows environment, the native SWC binary failed to load; the
Webpack build succeeded with the WASM fallback using
`.\node_modules\.bin\next.cmd build --webpack`. This workaround may not be
needed elsewhere.

**Current verification status (steps 1–3 complete as of 2026-11-09):**
- Steps 1–3 are done. The full backend suite passes 98/98 tests with database
  integration enabled (`RUN_DB_INTEGRATION=1`). Fresh and existing-database
  migrations were verified against a disposable PostGIS instance.
- `next.config.ts` sets `output: "standalone"` and `allowedDevOrigins`, fixing
  the Docker build and Playwright dev-server HMR. The frontend Turbopack build
  is clean. Frontend lint passes.
- Playwright end-to-end: 24/27 tests pass; the 3 remaining are skipped when
  `E2E_API_URL` is absent (they require the `run_browser_smoke` live-backend
  runner). The form blur validation bug in `ProjectConfirmation` (disabled
  fieldset blocking `onBlur`) was fixed.
- A `webServer` block was added to `playwright.config.ts` so tests are
  self-contained on any clean clone.

To reproduce the group-disjoint proxy baseline when the compatible BBMP files
are available, run `python -m ml.evaluate_proxy_groups` from `backend`. The
previous run reported 76.6% holdout accuracy and 75.2% mean five-fold
accuracy, measuring agreement with constructed proxy labels, **not** observed
disruption outcomes. The 419 source identifier groups are not verified wards,
and label construction uses thresholds calculated across all groups.

## Remaining work, in order

1. ~~**Share local work**~~ — committed and pushed.
2. ~~**Clean-clone foundations**~~ — migrations verified (fresh + existing DB),
   standalone output fixed, Turbopack build clean, `playwright.config.ts`
   `webServer` block added.
3. ~~**End-to-end testing and hardening**~~ — 98/98 backend tests pass with DB
   integration; 24/27 Playwright tests pass (3 skipped, requiring live backend
   runner); blur-validation and HMR fixes applied.
4. **Deployment (Phase 10) — in progress:**
   - Supabase PostGIS database provisioned; `postgis` and `postgis_topology`
     extensions enabled. Host: `db.foaobkfnzmrfyhavexec.supabase.co:5432`.
   - `backend/start.sh` runs `alembic upgrade head` then starts uvicorn.
     `backend/Dockerfile` updated to use `start.sh` as CMD.
   - `backend/railway.toml` and `frontend/railway.toml` added.
   - `.railway.env.example` documents all required Railway env vars.
   - **Remaining:** deploy both services on Railway, set env vars from
     `.railway.env.example`, verify `/health` and public frontend URL,
     set up UptimeRobot to keep Supabase active.
5. **Production approvals:** implement authenticated identities, per-user
   permissions and an independent security review before real agency use.
   The direct-loopback demo guard is not authentication.
6. **Spatial/data gap (deferred):** review ward boundaries and source revisions,
   establish a trustworthy crosswalk, match projects to roads, obtain suitable
   geocoded incident datasets, and validate feature completeness before use.
7. **ML validation:** obtain observed project outcomes where possible, resolve
   identifier groups, use leakage-resistant group-aware evaluation, and
   document model performance and uncertainty.
8. **Gemini maintenance:** update outdated example/default model settings,
   evaluate migration from the unmaintained legacy SDK, and implement
   appropriate rate/concurrency controls for multi-user usage. Investigate the
   observed `RequestsDependencyWarning` without assuming it caused a failure.
   AI coordination tool-calling remains unverified end-to-end.

See the [implementation brief](./DigInSync_IBM_Bob_Implementation_Brief_v2.md)
for the original vision; this file records current limitations and status.
