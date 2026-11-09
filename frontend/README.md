# DigInSync frontend

The Next.js frontend connects directly to the existing FastAPI API. All workflow
visibility is implemented in the frontend; the backend endpoints and behavior are
unchanged.

## Run locally

Start the configured PostGIS database first. In separate PowerShell terminals:

```powershell
# Backend (from the repository root)
cd backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload
```

```powershell
# Frontend (from the repository root)
cd frontend
npm.cmd run dev -- --hostname localhost --port 3000
```

Open http://localhost:3000. The API defaults to http://localhost:8000; override it
with `NEXT_PUBLIC_API_URL` in the ignored frontend `.env.local` if necessary.
The backend CORS origins must allow the frontend origin.

## Follow the workflow

- Workflow progress shows requests running for the current project or proposal,
  completed results, warnings, and actions awaiting user input. Expand Process
  details to see each request and an explanation of its checks.
- Activity in the navigation opens the shared request timeline. It remains
  available across navigation, resets on page reload, and retains up to 100
  completed requests plus all running requests. It uses no browser storage and
  does not retain request bodies, credentials, or raw server logs.
- Times measure the browser request, including network time. The API does not
  stream internal check progress, so combined operations remain running until
  their response arrives; no completion percentages are estimated.
- Saved proposal Decision history comes from the backend and remains separate
  from browser activity. Loading an old decision does not imply it happened now.
- Expand Inputs used for this indicator to inspect the risk API's returned
  inputs and coverage warnings. Defaults and zero counts are not evidence of
  complete data or an absence of incidents.
- Ward dataset context on the dashboard queries one source identifier at a time.
  Ward identifiers are not reconciled across datasets, and counts do not prove
  road-level proximity. The lookup does not change project analysis.

If a save or decision response is lost, check saved records before resubmitting.
The frontend never automatically retries mutations. Confirmed mutations remain
visible even if a subsequent read fails. Provider failures retain manual entry
and deterministic coordination options.

## Verification

From `frontend`:

```powershell
npm.cmd run lint
npm.cmd run build
# Start the frontend before running browser checks.
$env:E2E_BASE_URL = "http://localhost:3000"
npm.cmd run test:e2e -- tests/process-visibility.spec.ts
```

The process-visibility tests use controlled API responses for concurrency,
provider errors, recovery, data limitations, keyboard focus, and mobile layouts.
To run all browser tests with a disposable real database and backend, use the
existing runner from `backend` (requires the local database and CREATEDB rights):

```powershell
$env:RUN_DB_INTEGRATION = "1"
$env:E2E_BASE_URL = "http://localhost:3000"
try {
  .\.venv\Scripts\python.exe -m tests.run_browser_smoke
} finally {
  Remove-Item Env:RUN_DB_INTEGRATION
  Remove-Item Env:E2E_BASE_URL
}
```

The runner also checks workplan and decision-history persistence after backend
restart. Screenshots and failure traces are written to ignored
`frontend/test-results`. Live-provider calls, deployment, production identity,
data reconciliation and ML validation remain separate work.
