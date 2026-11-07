"""
Conflict service — Phase 3.

Finds projects near the given project_id using PostGIS ST_DWithin,
then runs the deterministic conflict engine against each neighbour.
Saves results to the conflicts table and returns structured response.
"""
from __future__ import annotations

import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from app.models import Project, Conflict
from app.schemas.conflict import (
    ConflictAnalyzeRequest,
    ConflictAnalyzeResponse,
    ConflictDetail,
)
from app.conflict.engine import analyze_pair


def _uuid() -> str:
    return str(uuid.uuid4())


async def analyze(
    db: AsyncSession, payload: ConflictAnalyzeRequest
) -> ConflictAnalyzeResponse:
    # 1. Load the target project
    result = await db.execute(select(Project).where(Project.id == payload.project_id))
    project = result.scalar_one_or_none()
    if not project:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Project not found")

    # 2. Find neighbouring projects via PostGIS or road_name match
    neighbours = await _find_neighbours(db, project, payload.radius_m)

    # 3. Run conflict engine against each neighbour
    conflicts: list[ConflictDetail] = []

    for neighbour in neighbours:
        if neighbour.id == project.id:
            continue

        # Spatial overlap — use PostGIS if both have geometry, else road_name match
        spatial = await _check_spatial_overlap(db, project, neighbour, payload.radius_m)

        result_obj = analyze_pair(
            spatial_overlap=spatial,
            start_a=project.start_date,
            end_a=project.end_date,
            start_b=neighbour.start_date,
            end_b=neighbour.end_date,
            type_a=project.project_type,
            type_b=neighbour.project_type,
        )

        # Only record if there is at least one dimension of conflict
        if not (result_obj.spatial_overlap or result_obj.temporal_overlap):
            continue

        # Persist to conflicts table
        conflict_row = Conflict(
            id=_uuid(),
            project_a_id=project.id,
            project_b_id=neighbour.id,
            spatial_overlap=result_obj.spatial_overlap,
            temporal_overlap=result_obj.temporal_overlap,
            overlap_days=result_obj.overlap_days,
            impact_score=result_obj.conflict_score,
            conflict_score=result_obj.conflict_score,
            severity=result_obj.severity,
            status="OPEN",
        )
        db.add(conflict_row)

        conflicts.append(ConflictDetail(
            project_a_id=project.id,
            project_b_id=neighbour.id,
            project_a_name=f"{project.project_type} — {project.road_name or 'unknown road'}",
            project_b_name=f"{neighbour.project_type} — {neighbour.road_name or 'unknown road'}",
            spatial_overlap=result_obj.spatial_overlap,
            temporal_overlap=result_obj.temporal_overlap,
            overlap_days=result_obj.overlap_days,
            impact_overlap=result_obj.impact_overlap,
            conflict_score=result_obj.conflict_score,
            severity=result_obj.severity,
        ))

    await db.commit()

    return ConflictAnalyzeResponse(
        project_id=project.id,
        conflict_count=len(conflicts),
        conflicts=conflicts,
        has_high_severity=any(c.severity == "HIGH" for c in conflicts),
    )


async def _find_neighbours(
    db: AsyncSession, project: Project, radius_m: float
) -> list[Project]:
    """
    Find candidate projects to check for conflicts.
    Strategy (in order):
      1. PostGIS ST_DWithin on geometry (if project has geometry)
      2. Exact road_name match (fallback when no geometry)
    Always exclude CANCELLED/COMPLETED projects.
    """
    active_statuses = ("PENDING", "APPROVED", "IN_PROGRESS")

    if project.geometry is not None:
        stmt = text("""
            SELECT * FROM projects
            WHERE id != :pid
              AND status = ANY(:statuses)
              AND geometry IS NOT NULL
              AND ST_DWithin(
                    geometry::geography,
                    ST_GeomFromEWKT(:geom)::geography,
                    :radius
                  )
        """)
        res = await db.execute(stmt, {
            "pid": project.id,
            "statuses": list(active_statuses),
            "geom": f"SRID=4326;{project.geometry}",
            "radius": radius_m,
        })
        rows = res.mappings().all()
        return [Project(**dict(r)) for r in rows]

    # Fallback: road_name match
    if project.road_name:
        res = await db.execute(
            select(Project).where(
                Project.id != project.id,
                Project.road_name == project.road_name,
                Project.status.in_(active_statuses),
            )
        )
        return list(res.scalars().all())

    return []


async def _check_spatial_overlap(
    db: AsyncSession, project: Project, neighbour: Project, radius_m: float
) -> bool:
    """
    Returns True if the two projects spatially overlap.
    Uses PostGIS if both have geometry, otherwise falls back to road_name equality.
    """
    if project.geometry is not None and neighbour.geometry is not None:
        res = await db.execute(text("""
            SELECT ST_DWithin(
                ST_GeomFromEWKT(:geom_a)::geography,
                ST_GeomFromEWKT(:geom_b)::geography,
                :radius
            ) AS overlaps
        """), {
            "geom_a": f"SRID=4326;{project.geometry}",
            "geom_b": f"SRID=4326;{neighbour.geometry}",
            "radius": radius_m,
        })
        row = res.fetchone()
        return bool(row[0]) if row else False

    # Fallback: same road name = spatial overlap
    if project.road_name and neighbour.road_name:
        return project.road_name.strip().lower() == neighbour.road_name.strip().lower()

    return False
