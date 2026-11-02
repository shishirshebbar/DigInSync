from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.coordinate import CoordinateRequest, CoordinateResponse
from app.services import coordinate_service

router = APIRouter()


@router.post("/", response_model=CoordinateResponse)
async def generate_coordination(
    payload: CoordinateRequest, db: AsyncSession = Depends(get_db)
):
    """Agent 2 — Coordination Agent. Returns 2-3 coordination options."""
    return await coordinate_service.coordinate(db, payload)
