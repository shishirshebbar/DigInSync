from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.project import ProjectCreate, ProjectRead, ProjectExtract, ProjectExtractRequest
from app.llm.provider import ExtractionError
from app.services import project_service

router = APIRouter()


@router.post("/", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
async def create_project(payload: ProjectCreate, db: AsyncSession = Depends(get_db)):
    """Create a structured project (after NL extraction + user confirmation)."""
    return await project_service.create_project(db, payload)


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    project = await project_service.get_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/", response_model=list[ProjectRead])
async def list_nearby_projects(
    lat: float,
    lon: float,
    radius_m: float = 500,
    db: AsyncSession = Depends(get_db),
):
    """Find nearby projects using PostGIS spatial query."""
    return await project_service.find_nearby_projects(db, lat, lon, radius_m)


@router.post("/extract", response_model=ProjectExtract)
async def extract_project(body: ProjectExtractRequest):
    """
    Agent 1 — Project Intelligence Agent.
    Accepts natural-language description, returns structured project fields.
    """
    try:
        return await project_service.extract_project_from_nl(body.description)
    except ExtractionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.user_message) from exc
