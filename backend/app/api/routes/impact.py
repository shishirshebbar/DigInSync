from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services import impact_service
from app.schemas.impact import ImpactMetrics

router = APIRouter()


@router.get("/", response_model=ImpactMetrics)
async def get_impact(db: AsyncSession = Depends(get_db)):
    """Return measurable impact metrics calculated from prototype data."""
    return await impact_service.get_metrics(db)
