from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.map import MapCollection
from app.services import map_service

router = APIRouter()


@router.get("", response_model=MapCollection)
async def get_roads(q: str = Query(default="", max_length=200), bbox: str | None = None,
                    limit: int = Query(default=25, ge=1, le=500), offset: int = Query(default=0, ge=0),
                    db: AsyncSession = Depends(get_db)):
    return await map_service.roads(db, q, bbox, limit, offset)
