"""Coordinate service — Phase 6 implementation."""
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.coordinate import CoordinateRequest, CoordinateResponse


async def coordinate(db: AsyncSession, payload: CoordinateRequest) -> CoordinateResponse:
    # TODO: Phase 6 — implement Coordination Agent
    raise NotImplementedError("Coordination Agent implemented in Phase 6")
