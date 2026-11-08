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
    return {**dict(row), "proposal_status_counts": dict(statuses)}
