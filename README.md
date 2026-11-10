# DigInSync

DigInSync is a prototype for coordinating road and utility works in Bengaluru. You enter a project (optionally with Gemini-assisted extraction from text), review conflicts with nearby works, compare schedules, and draft coordination proposals. It also shows an experimental risk indicator.





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
