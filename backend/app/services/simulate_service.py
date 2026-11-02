"""Simulate service — Phase 7 implementation."""
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.simulate import SimulateRequest, SimulateResponse


async def simulate(db: AsyncSession, payload: SimulateRequest) -> SimulateResponse:
    # TODO: Phase 7 — implement what-if simulator
    raise NotImplementedError("What-if simulator implemented in Phase 7")
