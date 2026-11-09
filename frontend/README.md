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

See [USER_FLOW.md](./USER_FLOW.md) for the screen map, end-to-end journey,
decision points, and recovery paths.

The landing page is the coordination overview. Projects opens a road-name
register; New project opens the structured form. The description assistant is
optional and previews suggestions before applying them. Existing values are
unchecked by default, and null suggestions never replace entered information.

Project workspaces have Analysis, Schedule comparison, Coordination, and
Proposals sections. Section links retain inputs and results without rerunning
analysis. Schedule comparisons remain read-only. Proposal workspaces separate
Draft, Review of the saved revision, and persistent Decision history. Approved
workplans have a dedicated read-only page.

Unsaved project fields and proposal edits are kept in memory across internal
navigation during the browser visit. They are not autosaved or stored in browser
storage. Reloading or closing the page warns when the current editor is dirty;
explicit discard asks for confirmation. Review always shows the saved proposal,
and unsaved edits cannot be approved. Data context contains coverage counts and
the source-specific ward lookup. It does not change project analysis.

Old `/dashboard` links resolve to the overview; old proposal and workplan query
links resolve to their corresponding dedicated pages.

- Workflow progress shows requests running for the current project or proposal,
  completed results, warnings, and actions awaiting user input. Expand View process
  details to see the phases, each request, and an explanation of its checks.
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
- Ward dataset context on Data context queries one source identifier at a time.
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
npm.cmd run test:e2e -- tests/process-visibility.spec.ts tests/road-preview.spec.ts tests/ux-redesign.spec.ts
```

The process-visibility tests use controlled API responses for concurrency,
provider errors, recovery, data limitations, keyboard focus, and mobile layouts.
The UX suite also checks visit-only drafts, selective AI application, task
validation, legacy links, responsive screenshots, and axe accessibility rules.
Automated accessibility checks do not establish complete WCAG conformance;
keyboard and visual checks are also required.
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
