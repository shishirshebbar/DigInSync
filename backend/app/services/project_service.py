import uuid
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from app.models import Project, RoadSegment
from app.schemas.project import ProjectCreate, ProjectExtract
from app.llm.provider import get_llm_provider
import structlog

logger = structlog.get_logger()


def _uuid() -> str:
    return str(uuid.uuid4())


async def create_project(db: AsyncSession, payload: ProjectCreate) -> Project:
    segment = None
    if payload.road_segment_id:
        segment = await db.get(RoadSegment, payload.road_segment_id)
        if segment is None or segment.geometry is None:
            from fastapi import HTTPException
            raise HTTPException(422, "Selected road segment is unavailable. Select another road or continue without a location.")
    duration = (payload.end_date - payload.start_date).days
    project = Project(
        id=_uuid(),
        organization=payload.organization,
        project_type=payload.project_type,
        description=payload.description,
        road_name=segment.road_name if segment else payload.road_name,
        road_segment_id=segment.id if segment else None,
        geometry=segment.geometry if segment else None,
        start_date=payload.start_date,
        end_date=payload.end_date,
        duration_days=duration,
        length_m=payload.length_m,
        lane_closure=payload.lane_closure,
        impact_level=payload.impact_level,
        priority=payload.priority,
        status="PENDING",
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


async def get_project(db: AsyncSession, project_id: str) -> Project | None:
    result = await db.execute(select(Project).where(Project.id == project_id))
    return result.scalar_one_or_none()


async def find_nearby_projects(
    db: AsyncSession, lat: float, lon: float, radius_m: float
) -> list[Project]:
    """PostGIS ST_DWithin query — returns projects whose geometry is within radius_m metres."""
    stmt = text("""
        SELECT p.*
        FROM projects p
        WHERE p.geometry IS NOT NULL
          AND ST_DWithin(
                p.geometry::geography,
                ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                :radius_m
              )
        ORDER BY ST_Distance(
                p.geometry::geography,
                ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography
               )
        LIMIT 20
    """)
    result = await db.execute(stmt, {"lat": lat, "lon": lon, "radius_m": radius_m})
    rows = result.mappings().all()
    return [Project(**dict(row)) for row in rows]


async def extract_project_from_nl(description: str) -> ProjectExtract:
    """Agent 1 — Project Intelligence Agent."""
    llm = get_llm_provider()
    return await llm.extract_project(description)
