from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.conflict import ConflictAnalyzeRequest, ConflictAnalyzeResponse
from app.services import conflict_service

router = APIRouter()


@router.post("/analyze", response_model=ConflictAnalyzeResponse)
async def analyze_conflicts(
    payload: ConflictAnalyzeRequest, db: AsyncSession = Depends(get_db)
):
    """Run deterministic spatial + temporal conflict detection."""
    return await conflict_service.analyze(db, payload)
