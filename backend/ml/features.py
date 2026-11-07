"""
Feature extraction for the ML risk model.

Pulls all 12 features defined in the brief for a given project
from the database — road segment data, historical counts, conflict info.
Returns a dict ready for model inference.
"""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from app.models import Project, RoadSegment, Conflict


ROAD_TYPE_ENCODING = {
    "motorway": 7, "trunk": 6, "primary": 5, "secondary": 4,
    "tertiary": 3, "unclassified": 2, "residential": 1, "service": 0,
}


async def extract_features(db: AsyncSession, project: Project) -> tuple[dict, list[str], bool]:
    """
    Extract all ML features for a project.
    Falls back to safe defaults when data is missing (e.g. no road segment matched yet).
    """
    # ── Road segment features ─────────────────────────────────────────────────
    road_width = 7.0  # default: tertiary road width
    road_type_enc = 3  # default: tertiary

    if project.road_segment_id:
        seg_res = await db.execute(
            select(RoadSegment).where(RoadSegment.id == project.road_segment_id)
        )
        seg = seg_res.scalar_one_or_none()
        if seg:
            road_width = seg.road_width or 7.0
            road_type_enc = ROAD_TYPE_ENCODING.get(seg.road_type or "", 3)

    # ── Historical feature counts from road_segment_features ─────────────────
    hist_work_orders = 0
    hist_road_repairs = 0
    pothole_count = 0
    grievance_count = 0
    historical_available = False
    warnings = []
    if project.road_segment_id and seg:
        if not seg.road_width:
            warnings.append("Road width is unavailable; a default width is used.")
        if seg.road_type not in ROAD_TYPE_ENCODING:
            warnings.append("Road type is unavailable or unsupported; a default type is used.")

    if project.road_segment_id:
        feat_res = await db.execute(text("""
            SELECT historical_work_orders, historical_road_repairs,
                   pothole_count, grievance_count
            FROM road_segment_features
            WHERE road_segment_id = :seg_id
        """), {"seg_id": project.road_segment_id})
        row = feat_res.fetchone()
        if row:
            historical_available = True
            hist_work_orders = row[0] or 0
            hist_road_repairs = row[1] or 0
            pothole_count = row[2] or 0
            grievance_count = row[3] or 0
    else:
        warnings.append("No road geometry is matched to this project; road width and type use defaults.")
        warnings.append("Work orders are matched by text, not by verified road location; pothole fallback is citywide, not nearby.")
        if project.road_name:
            wo_res = await db.execute(text("""
                SELECT COUNT(*) FROM historical_work_orders
                WHERE LOWER(description) LIKE LOWER(:road)
                   OR LOWER(ward) LIKE LOWER(:road)
            """), {"road": f"%{project.road_name}%"})
            hist_work_orders = wo_res.scalar() or 0

            ph_res = await db.execute(text(
                "SELECT COUNT(*) FROM potholes WHERE status != 'CLOSED'"
            ))
            pothole_count = min(int((ph_res.scalar() or 0) / 100), 20)  # normalise
    if not historical_available:
        warnings.append("Road-segment historical features are unavailable; zeros or fallback values are used and do not mean no incidents.")
    else:
        warnings.append("Cached historical counts are not independently verified as complete for this road.")

    # ── Project overlap counts ────────────────────────────────────────────────
    # How many other active projects are on the same road?
    nearby_res = await db.execute(
        select(Project).where(
            Project.road_name == project.road_name,
            Project.id != project.id,
            Project.status.in_(["PENDING", "APPROVED", "IN_PROGRESS"]),
        )
    )
    nearby_projects = len(nearby_res.scalars().all())

    # Count existing conflicts for this project
    conflict_res = await db.execute(text("""
        SELECT COUNT(DISTINCT CASE WHEN project_a_id = :pid THEN project_b_id ELSE project_a_id END) FROM conflicts
        WHERE (project_a_id = :pid OR project_b_id = :pid)
          AND status = 'OPEN'
    """), {"pid": project.id})
    existing_conflicts = int(conflict_res.scalar() or 0)

    # Count overlapping utility types
    overlapping_res = await db.execute(text("""
        SELECT COUNT(DISTINCT p.project_type)
        FROM conflicts c
        JOIN projects p ON (
            CASE WHEN c.project_a_id = :pid THEN c.project_b_id
                 ELSE c.project_a_id END = p.id
        )
        WHERE (c.project_a_id = :pid OR c.project_b_id = :pid) AND c.status = 'OPEN'
    """), {"pid": project.id})
    overlapping_utilities = int(overlapping_res.scalar() or 0)

    features = {
        "road_width": road_width,
        "road_type_enc": road_type_enc,
        "historical_work_orders": hist_work_orders,
        "historical_road_repairs": hist_road_repairs,
        "pothole_count": pothole_count,
        "grievance_count": grievance_count,
        "existing_projects": existing_conflicts,
        "nearby_projects": nearby_projects,
        "project_duration": project.duration_days,
        "lane_closure": project.lane_closure,
        "project_length": project.length_m or 0.0,
        "number_of_overlapping_utilities": overlapping_utilities,
    }
    return features, warnings, historical_available


# Feature column order — MUST match training order
FEATURE_COLUMNS = [
    "road_width",
    "road_type_enc",
    "historical_work_orders",
    "historical_road_repairs",
    "pothole_count",
    "grievance_count",
    "existing_projects",
    "nearby_projects",
    "project_duration",
    "lane_closure",
    "project_length",
    "number_of_overlapping_utilities",
]
