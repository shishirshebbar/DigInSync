"""Read-only workflow aggregates; stored conflicts are not realized civic impact."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


async def get_metrics(db: AsyncSession) -> dict:
    row = (await db.execute(text("""
        SELECT (SELECT COUNT(*) FROM projects) AS projects_total,
               (SELECT COUNT(*) FROM projects WHERE geometry IS NOT NULL) AS mapped_projects,
               (SELECT COUNT(*) FROM projects WHERE geometry IS NULL) AS unmapped_projects,
               (SELECT COUNT(*) FROM workplan_headers) AS workplans_generated,
               (SELECT COUNT(*) FROM workplans) AS task_count,
               (SELECT COUNT(DISTINCT (LEAST(project_a_id, project_b_id), GREATEST(project_a_id, project_b_id))) FROM conflicts) AS conflicts_detected,
               (SELECT COUNT(DISTINCT (LEAST(project_a_id, project_b_id), GREATEST(project_a_id, project_b_id))) FROM conflicts WHERE severity = 'HIGH') AS high_severity_conflicts
    """))).mappings().one()
    statuses = (await db.execute(text("SELECT status, COUNT(*) FROM coordination_plans GROUP BY status"))).all()
    coverage = (await db.execute(text("""
        SELECT (SELECT COUNT(*) FROM road_segments) AS road_segments,
               (SELECT COUNT(*) FROM road_segment_features) AS roads_with_feature_rows,
               (SELECT COUNT(*) FROM historical_work_orders) AS work_orders,
               (SELECT COUNT(*) FROM historical_work_orders WHERE geometry IS NOT NULL) AS geocoded_work_orders,
               (SELECT COUNT(*) FROM grievances) AS grievances,
               (SELECT COUNT(*) FROM grievances WHERE geometry IS NOT NULL) AS geocoded_grievances,
               (SELECT COUNT(*) FROM road_repairs) AS road_repairs,
               (SELECT COUNT(*) FROM road_repairs WHERE geometry IS NOT NULL) AS geocoded_road_repairs,
               (SELECT COUNT(*) FROM potholes) AS potholes,
               (SELECT COUNT(*) FROM potholes WHERE geometry IS NOT NULL) AS geocoded_potholes
    """))).mappings().one()
    return {**dict(row), "proposal_status_counts": dict(statuses), "spatial_coverage": dict(coverage)}
