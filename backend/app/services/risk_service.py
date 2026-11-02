"""Risk service — Phase 4 implementation."""
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.risk import RiskPredictRequest, RiskPredictResponse


async def predict(db: AsyncSession, payload: RiskPredictRequest) -> RiskPredictResponse:
    # TODO: Phase 4 — implement ML risk prediction
    raise NotImplementedError("ML risk model implemented in Phase 4")
