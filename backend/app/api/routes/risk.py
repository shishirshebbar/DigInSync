from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.risk import RiskPredictRequest, RiskPredictResponse
from app.services import risk_service

router = APIRouter()


@router.post("/predict", response_model=RiskPredictResponse)
async def predict_risk(
    payload: RiskPredictRequest, db: AsyncSession = Depends(get_db)
):
    """Run ML disruption risk prediction (XGBoost)."""
    return await risk_service.predict(db, payload)
