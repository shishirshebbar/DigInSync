"""Retrieve approved workplan headers and their immutable task snapshots."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Workplan, WorkplanHeader
from app.schemas.workplan import WorkplanRead, WorkplanTask


async def get_workplan(db: AsyncSession, workplan_id: str) -> WorkplanRead | None:
    header = await db.get(WorkplanHeader, workplan_id)
    if header is None:
        return None
    tasks = (await db.execute(select(Workplan).where(Workplan.workplan_id == header.id)
                              .order_by(Workplan.position, Workplan.id))).scalars().all()
    return WorkplanRead(
        id=header.id, coordination_plan_id=header.coordination_plan_id, project_id=header.project_id,
        approved_by=header.approved_by, approved_at=header.approved_at, proposal_revision=header.proposal_revision,
        warnings=header.warnings, tasks=[WorkplanTask.model_validate(task, from_attributes=True) for task in tasks],
    )


async def approve_and_generate(db: AsyncSession, plan_id: str, payload):
    from app.services.proposal_service import approve
    return await approve(db, plan_id, payload)
