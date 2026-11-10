## DigInSync

DigInSync is a prototype for coordinating road and utility works in Bengaluru. You enter a project (optionally with Gemini-assisted extraction from text), review conflicts with nearby works, compare schedules, and draft coordination proposals. It also shows an experimental risk indicator.


# Problem statement
Water, telecom, electricity, drainage, and road-maintenance teams can plan work independently on the
same road or in the same area. Without a shared view of location, timing, and responsibilities, one project
may overlap another or require a road to be reopened after restoration. These situations create the risk of
repeated excavation, avoidable closures, duplicated restoration effort, and disruption to residents,
businesses, and road users.
The planning gap is the absence of a consistent way to compare proposed works, expose uncertainty in the
available data, and turn a discussion into a traceable coordination plan. A useful solution must help people
act on reliable evidence while preserving agency review and responsibility.
# Proposed solution
DigInSync provides a shared planning workspace where coordinators register work, inspect candidate
projects and schedules, compare alternatives, and prepare a proposal with named organizations and task
dependencies. Human reviewers assess a saved revision before recording a local decision and generating a
workplan. AI assists information extraction and explanation; deterministic rules perform conflict analysis and
validation.
The intended users are infrastructure planners, utility coordinators, and project reviewers. The central
workflow is project entry, evidence review, optional schedule comparison, proposal preparation, savedrevision
review, and workplan generation.


## Setup

**Prerequisites:** Python 3.11, Node.js, Docker Desktop, Git.

1. **Configure environment**
   ```powershell
   copy .env.example .env.local
   ```
   Edit `.env.local`: set a strong `POSTGRES_PASSWORD` (and use it in `DATABASE_URL` / `DATABASE_SYNC_URL`). `LLM_API_KEY` is optional; without it you can enter project details manually. Never commit this file.

2. **Start the database** (PostGIS on host port 5433)
   ```powershell
   docker compose up -d db
   ```

3. **Run the backend** (http://localhost:8000)
   ```powershell
   cd backend
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   alembic upgrade head
   python -m uvicorn app.main:app --reload
   ```

4. **Run the frontend** (new terminal, http://localhost:3000)
   ```powershell
   cd frontend
   npm ci
   npm run dev
   ```

More details: [backend/README.md](backend/README.md), [frontend/README.md](frontend/README.md).
