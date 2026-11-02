"""Workplan service — Phase 8 implementation."""
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Workplan


async def get_workplan(db: AsyncSession, workplan_id: str) -> Workplan | None:
    # TODO: Phase 8
    raise NotImplementedError("Workplan service implemented in Phase 8")


async def approve_and_generate(db: AsyncSession, plan_id: str):
    # TODO: Phase 8 — human approval triggers Workplan Agent
    raise NotImplementedError("Workplan Agent implemented in Phase 8")
