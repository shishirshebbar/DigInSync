from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.simulate import SimulateRequest, SimulateResponse
from app.services import simulate_service

router = APIRouter()


@router.post("/", response_model=SimulateResponse)
async def run_simulation(
    payload: SimulateRequest, db: AsyncSession = Depends(get_db)
):
    """What-if simulator — recalculate conflict + risk for modified schedule."""
    return await simulate_service.simulate(db, payload)
