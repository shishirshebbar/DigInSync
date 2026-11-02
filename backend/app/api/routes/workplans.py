from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.workplan import WorkplanRead
from app.services import workplan_service

router = APIRouter()


@router.get("/{workplan_id}", response_model=WorkplanRead)
async def get_workplan(workplan_id: str, db: AsyncSession = Depends(get_db)):
    workplan = await workplan_service.get_workplan(db, workplan_id)
    if not workplan:
        raise HTTPException(status_code=404, detail="Workplan not found")
    return workplan


@router.post("/coordination-plans/{plan_id}/approve")
async def approve_plan(plan_id: str, db: AsyncSession = Depends(get_db)):
    """Human approval — triggers Workplan Agent."""
    return await workplan_service.approve_and_generate(db, plan_id)
