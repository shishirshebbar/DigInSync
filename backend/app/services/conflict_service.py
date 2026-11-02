"""Conflict service — Phase 3 implementation."""
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.conflict import ConflictAnalyzeRequest, ConflictAnalyzeResponse


async def analyze(db: AsyncSession, payload: ConflictAnalyzeRequest) -> ConflictAnalyzeResponse:
    # TODO: Phase 3 — implement spatial + temporal conflict detection
    raise NotImplementedError("Conflict engine implemented in Phase 3")
