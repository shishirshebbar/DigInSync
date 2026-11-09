import math
from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from geoalchemy2.shape import to_shape
from shapely.geometry import mapping
from app.models import RoadSegment, Project
from app.schemas.map import MapFeature, MapCollection, ProjectMap, ProjectCatalog
from app.services import project_service, conflict_service


def parse_bbox(value: str) -> tuple[float, float, float, float]:
    try:
        west, south, east, north = [float(item) for item in value.split(",")]
        if not all(math.isfinite(v) for v in (west, south, east, north)):
            raise ValueError()
        if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
            raise ValueError()
        if east - west > 0.35 or north - south > 0.35:
            raise ValueError()
        return west, south, east, north
    except (ValueError, TypeError):
        raise HTTPException(422, "bbox must be west,south,east,north, with each span at most 0.35 degrees.")


def feature(item, role="road") -> MapFeature:
    geometry = mapping(to_shape(item.geometry)) if item.geometry is not None else None
    properties = {"road_name": item.road_name or "Unknown road", "role": role}
    if isinstance(item, Project):
        properties.update(organization=item.organization, project_type=item.project_type,
                          start_date=item.start_date.isoformat(), end_date=item.end_date.isoformat())
    else:
        properties.update(road_type=item.road_type, osm_id=item.osm_id, length_m=item.length_m,
                          source="OpenStreetMap contributors (ODbL)" if item.osm_id else "Imported road data; see import provenance")
    return MapFeature(id=item.id, geometry=geometry, properties=properties)


async def roads(db: AsyncSession, q: str, bbox: str | None, limit: int, offset: int):
    query = select(RoadSegment).where(RoadSegment.geometry.is_not(None))
    if q.strip():
        escaped = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.where(RoadSegment.road_name.ilike(f"%{escaped}%", escape="\\"))
    if bbox:
        query = query.where(func.ST_Intersects(RoadSegment.geometry, func.ST_MakeEnvelope(*parse_bbox(bbox), 4326)))
    elif not q.strip():
        raise HTTPException(422, "Provide a road search or map bounding box.")
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = (await db.scalars(query.order_by(RoadSegment.road_name, RoadSegment.id).limit(limit).offset(offset))).all()
    return MapCollection(features=[feature(row) for row in rows], total=total, limit=limit, offset=offset)


async def catalog(db: AsyncSession, q: str, limit: int, offset: int):
    query = select(Project)
    if q.strip():
        query = query.where(Project.road_name.icontains(q.strip(), autoescape=True))
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = (await db.scalars(query.order_by(Project.created_at.desc(), Project.id).limit(limit).offset(offset))).all()
    return ProjectCatalog(items=rows, total=total, limit=limit, offset=offset)


async def project_map(db: AsyncSession, project_id: str):
    base = await project_service.get_project(db, project_id)
    if base is None:
        raise HTTPException(404, "Project not found")
    candidates = await conflict_service._find_neighbours(db, base, 500)
    rows = [base, *sorted(candidates, key=lambda item: item.id)]
    return ProjectMap(features=[feature(item, "base" if item.id == base.id else "candidate") for item in rows],
                      total=len(rows), limit=len(rows), offset=0,
                      unmapped_ids=[item.id for item in rows if item.geometry is None],
                      location_basis="geometry" if base.geometry is not None else "road_name",
                      warnings=["User-selected road segments are location references, not verified excavation extents.",
                                "Proximity analysis excludes projects without geometry." if base.geometry is not None else
                                "Candidates use exact road-name matching; proximity is unverified."])
