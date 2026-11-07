"""Ward-level context from the two BBMP source datasets."""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db

router = APIRouter()


class WardContext(BaseModel):
    dataset: Literal["work_orders", "grievances"]
    ward: str
    record_count: int
    geographic_precision: Literal["ward"] = "ward"


@router.get("/context", response_model=WardContext)
async def ward_context(
    dataset: Literal["work_orders", "grievances"],
    ward: str = Query(min_length=1, max_length=200),
    db: AsyncSession = Depends(get_db),
) -> WardContext:
    ward = ward.strip()
    if not ward:
        raise HTTPException(status_code=422, detail="Ward must not be blank")
    if dataset == "work_orders":
        query = text("""
            SELECT COUNT(*) FROM historical_work_orders
            WHERE lower(trim(ward)) = lower(:ward)
        """)
    else:
        query = text("""
            SELECT COUNT(*) FROM grievances
            WHERE lower(trim(ward)) = lower(:ward)
        """)
    result = await db.execute(query, {"ward": ward})
    return WardContext(dataset=dataset, ward=ward, record_count=result.scalar_one())
