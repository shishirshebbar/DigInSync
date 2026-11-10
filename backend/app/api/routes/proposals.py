from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.schemas.proposal import (
    AuditEventRead, PlanDecision, PlanRejection, ProposalCreate, ProposalRead, ProposalUpdate,
)
from app.schemas.workplan import WorkplanRead
from app.services import proposal_service

router = APIRouter()


@router.get("/config")
async def demo_config():
    settings = get_settings()
    return {"enabled": settings.environment == "development" and settings.enable_demo_approvals
            and bool(settings.demo_reviewer_id.strip()), "reviewer": settings.demo_reviewer_id,
            "mode": "local_demo"}


@router.get("")
async def list_proposals(project_id: str | None = None, db: AsyncSession = Depends(get_db)):
    return await proposal_service.list_plans(db, project_id)


@router.post("", response_model=ProposalRead, status_code=201)
async def create_proposal(payload: ProposalCreate, db: AsyncSession = Depends(get_db)):
    return await proposal_service.create(db, payload)


@router.get("/{plan_id}", response_model=ProposalRead)
async def get_proposal(plan_id: str, db: AsyncSession = Depends(get_db)):
    return await proposal_service.read(db, plan_id)


@router.patch("/{plan_id}", response_model=ProposalRead)
async def update_proposal(plan_id: str, payload: ProposalUpdate, db: AsyncSession = Depends(get_db)):
    return await proposal_service.update(db, plan_id, payload)


@router.post("/{plan_id}/approve", response_model=WorkplanRead)
async def approve_proposal(plan_id: str, payload: PlanDecision, db: AsyncSession = Depends(get_db)):
    return await proposal_service.approve(db, plan_id, payload)


@router.post("/{plan_id}/reject", response_model=ProposalRead)
async def reject_proposal(plan_id: str, payload: PlanRejection, db: AsyncSession = Depends(get_db)):
    return await proposal_service.reject(db, plan_id, payload)


@router.get("/{plan_id}/events", response_model=list[AuditEventRead])
async def get_events(plan_id: str, db: AsyncSession = Depends(get_db)):
    return await proposal_service.events(db, plan_id)
