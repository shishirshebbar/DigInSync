"""Local demo proposals. Decisions never change original project schedules."""
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import CoordinationPlan, PlanAuditEvent, Project, Workplan, WorkplanHeader
from app.schemas.proposal import ProposalContent, ProposalCreate, ProposalUpdate, ProposalRead, PlanDecision, PlanRejection
from app.schemas.simulate import ScheduleChange, SimulateRequest
from app.services import conflict_service, simulate_service
from app.services.coordinate_service import coordination_options

WORKPLAN_WARNING = "Original project dates unchanged. Demo coordination approval is not construction authorization."


def reviewer() -> str:
    settings = get_settings()
    if settings.environment != "development" or not settings.enable_demo_approvals:
        raise HTTPException(403, "Demo decisions are disabled. Enable them explicitly in a local development environment.")
    if not settings.demo_reviewer_id.strip():
        raise HTTPException(403, "Configure a nonblank demo reviewer identity.")
    return settings.demo_reviewer_id.strip()


def project_snapshot(project: Project) -> dict:
    fields = ("id", "organization", "project_type", "description", "road_name", "road_segment_id",
              "length_m", "lane_closure", "impact_level", "priority", "status", "duration_days")
    return {**{name: getattr(project, name) for name in fields},
            "start_date": project.start_date.isoformat(), "end_date": project.end_date.isoformat(),
            "geometry": str(project.geometry) if project.geometry is not None else None}


async def _plan(db: AsyncSession, plan_id: str, lock: bool = False) -> CoordinationPlan:
    query = select(CoordinationPlan).where(CoordinationPlan.id == plan_id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    plan = (await db.execute(query)).scalar_one_or_none()
    if plan is None:
        raise HTTPException(404, "Coordination proposal not found.")
    return plan


def _check_revision(plan: CoordinationPlan, expected: int) -> None:
    if plan.revision != expected:
        raise HTTPException(409, "This proposal changed. Reload and review the latest revision before continuing.")


async def _projects(db: AsyncSession, ids: list[str]) -> list[Project]:
    rows = await db.execute(select(Project).where(Project.id.in_(ids)).order_by(Project.id)
                            .with_for_update(of=Project).execution_options(populate_existing=True))
    projects = list(rows.scalars().all())
    if len(projects) != len(set(ids)):
        raise HTTPException(409, "A participating project no longer exists. Review the proposal again.")
    return projects


async def _capture(db: AsyncSession, project_id: str, related_ids: list[str]) -> tuple[list, dict]:
    if project_id in related_ids:
        raise HTTPException(422, "The base project is already included; select only additional projects.")
    projects = await _projects(db, [project_id, *related_ids])
    base = next(project for project in projects if project.id == project_id)
    neighbours = await conflict_service._find_neighbours(db, base, 500)
    if not set(related_ids).issubset({item.id for item in neighbours}):
        raise HTTPException(422, "Related projects must be current conflict candidates for the base project.")
    analysis = await simulate_service.simulate(db, SimulateRequest(
        base_project_id=project_id, schedule_changes=[ScheduleChange(
            project_id=project_id, new_start_date=base.start_date, new_end_date=base.end_date)],
    ))
    warnings = [warning for warning in analysis.warnings if not warning.startswith("Simulation only;")]
    return [project_snapshot(project) for project in projects], {
        "baseline": analysis.before.model_dump(mode="json"), "location_basis": analysis.location_basis,
        "warnings": [*warnings, WORKPLAN_WARNING],
    }


def _event(db: AsyncSession, plan: CoordinationPlan, action: str, actor: str, details: dict) -> None:
    db.add(PlanAuditEvent(coordination_plan_id=plan.id, event=action, actor=actor,
                          revision=plan.revision, details=details, created_at=datetime.now(timezone.utc)))


async def read(db: AsyncSession, plan_id: str) -> ProposalRead:
    plan = await _plan(db, plan_id)
    base = await db.get(Project, plan.project_id)
    candidates = await conflict_service._find_neighbours(db, base, 500) if base else []
    available = {item.id: project_snapshot(item) for item in candidates}
    if base:
        available[base.id] = project_snapshot(base)
    header = (await db.execute(select(WorkplanHeader).where(
        WorkplanHeader.coordination_plan_id == plan.id))).scalar_one_or_none()
    return ProposalRead(
        id=plan.id, project_id=plan.project_id, option_key=plan.option_key, option_name=plan.option_name,
        description=plan.description, tradeoffs=plan.tradeoffs, status=plan.status, revision=plan.revision,
        notes=plan.notes, tasks=plan.draft_tasks, project_snapshots=plan.project_snapshots,
        available_projects=list(available.values()), analysis_snapshot=plan.analysis_snapshot,
        workplan_id=header.id if header else None, decision_reason=plan.decision_reason,
        decided_by=plan.decided_by, decided_at=plan.decided_at, created_at=plan.created_at,
    )


async def list_plans(db: AsyncSession, project_id: str | None = None) -> list[dict]:
    query = select(CoordinationPlan)
    if project_id:
        query = query.where(CoordinationPlan.project_id == project_id)
    plans = (await db.execute(query.order_by(CoordinationPlan.created_at.desc(), CoordinationPlan.id).limit(100))).scalars().all()
    return [{"id": plan.id, "project_id": plan.project_id, "option_name": plan.option_name,
             "status": plan.status, "revision": plan.revision, "created_at": plan.created_at} for plan in plans]


async def create(db: AsyncSession, payload: ProposalCreate) -> ProposalRead:
    actor = reviewer()
    if await db.get(Project, payload.project_id) is None:
        raise HTTPException(404, "Project not found.")
    snapshots, analysis = await _capture(db, payload.project_id, payload.related_project_ids)
    option = next(item for item in coordination_options() if item.option_key == payload.option_key)
    plan = CoordinationPlan(
        project_id=payload.project_id, option_key=option.option_key, option_name=option.option_name,
        description=option.description, tradeoffs=option.tradeoffs, risk_score=None, estimated_duration=None,
        status="DRAFT", revision=1, notes=payload.notes, project_snapshots=snapshots,
        analysis_snapshot=analysis, draft_tasks=[task.model_dump(mode="json") for task in payload.tasks],
    )
    db.add(plan)
    await db.flush()
    _event(db, plan, "CREATED", actor, {"content": payload.model_dump(mode="json"), "project_snapshots": snapshots, "analysis_snapshot": analysis})
    await db.commit()
    return await read(db, plan.id)


async def update(db: AsyncSession, plan_id: str, payload: ProposalUpdate) -> ProposalRead:
    actor = reviewer()
    plan = await _plan(db, plan_id, lock=True)
    _check_revision(plan, payload.expected_revision)
    if plan.status != "DRAFT":
        raise HTTPException(409, "Only drafts can be modified. Prepare a new proposal for further changes.")
    content = ProposalContent.model_validate({
        "notes": plan.notes, "tasks": plan.draft_tasks,
        "related_project_ids": [item["id"] for item in plan.project_snapshots if item["id"] != plan.project_id],
        **payload.model_dump(exclude_unset=True, exclude={"expected_revision"}),
    })
    snapshots, analysis = await _capture(db, plan.project_id, content.related_project_ids)
    plan.notes, plan.draft_tasks = content.notes, [task.model_dump(mode="json") for task in content.tasks]
    plan.project_snapshots, plan.analysis_snapshot = snapshots, analysis
    plan.revision += 1
    _event(db, plan, "MODIFIED", actor, {"content": content.model_dump(mode="json"), "project_snapshots": snapshots, "analysis_snapshot": analysis})
    await db.commit()
    return await read(db, plan.id)


async def approve(db: AsyncSession, plan_id: str, payload: PlanDecision):
    from app.services.workplan_service import get_workplan

    actor = reviewer()
    plan = await _plan(db, plan_id, lock=True)
    _check_revision(plan, payload.expected_revision)
    if plan.status == "APPROVED":
        header = (await db.execute(select(WorkplanHeader).where(
            WorkplanHeader.coordination_plan_id == plan.id))).scalar_one_or_none()
        if header is None:
            raise HTTPException(409, "This legacy approval has no recorded workplan. Prepare a new proposal.")
        return await get_workplan(db, header.id)
    if plan.status != "DRAFT":
        raise HTTPException(409, "Only a draft can be approved.")
    checked = ProposalUpdate(expected_revision=plan.revision, tasks=plan.draft_tasks)
    if not checked.tasks:
        raise HTTPException(422, "Add and save at least one confirmed task before approving.")
    if not plan.project_snapshots:
        raise HTTPException(409, "The reviewed project snapshot is missing. Save a new draft.")
    projects = await _projects(db, [item["id"] for item in plan.project_snapshots])
    if [project_snapshot(project) for project in projects] != plan.project_snapshots:
        raise HTTPException(409, "Participating project details changed. Reload, save and review the draft before approval.")
    now = datetime.now(timezone.utc)
    header = WorkplanHeader(coordination_plan_id=plan.id, project_id=plan.project_id,
                            approved_by=actor, approved_at=now, proposal_revision=plan.revision,
                            warnings=plan.analysis_snapshot.get("warnings", [WORKPLAN_WARNING]))
    db.add(header)
    await db.flush()
    for position, task in enumerate(checked.tasks):
        db.add(Workplan(id=f"{header.id}:{task.id}", workplan_id=header.id, position=position,
                        coordination_plan_id=plan.id, project_id=plan.project_id,
                        task=task.task, organization=task.organization, start_date=task.start_date,
                        end_date=task.end_date, dependency=f"{header.id}:{task.dependency}" if task.dependency else None,
                        notes=task.notes, status="PLANNED"))
    plan.status, plan.decided_by, plan.decided_at = "APPROVED", actor, now
    _event(db, plan, "APPROVED", actor, {"workplan_id": header.id, "original_project_dates_unchanged": True})
    await db.commit()
    return await get_workplan(db, header.id)


async def reject(db: AsyncSession, plan_id: str, payload: PlanRejection) -> ProposalRead:
    actor = reviewer()
    plan = await _plan(db, plan_id, lock=True)
    _check_revision(plan, payload.expected_revision)
    if plan.status != "DRAFT":
        raise HTTPException(409, "Only a draft can be rejected.")
    plan.status, plan.decision_reason = "REJECTED", payload.reason
    plan.decided_by, plan.decided_at = actor, datetime.now(timezone.utc)
    _event(db, plan, "REJECTED", actor, {"reason": payload.reason})
    await db.commit()
    return await read(db, plan.id)


async def events(db: AsyncSession, plan_id: str):
    await _plan(db, plan_id)
    return (await db.execute(select(PlanAuditEvent).where(PlanAuditEvent.coordination_plan_id == plan_id)
                            .order_by(PlanAuditEvent.created_at, PlanAuditEvent.id))).scalars().all()
