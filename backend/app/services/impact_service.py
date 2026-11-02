"""Impact metrics service."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


async def get_metrics(db: AsyncSession) -> dict:
    """
    Returns measurable impact metrics calculated from actual prototype data.
    Do not return invented numbers.
    """
    conflicts = await db.execute(text("SELECT COUNT(*) FROM conflicts"))
    conflict_count = conflicts.scalar() or 0

    high_severity = await db.execute(
        text("SELECT COUNT(*) FROM conflicts WHERE severity = 'HIGH'")
    )
    high_severity_count = high_severity.scalar() or 0

    workplans = await db.execute(text("SELECT COUNT(*) FROM workplans"))
    workplan_count = workplans.scalar() or 0

    return {
        "conflicts_detected": conflict_count,
        "high_severity_conflicts": high_severity_count,
        "workplans_generated": workplan_count,
    }
