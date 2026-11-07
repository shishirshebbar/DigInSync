"""Build review options from the existing deterministic analysis services."""
from sqlalchemy.ext.asyncio import AsyncSession

from app.llm.provider import CoordinationContext, ExtractionError, get_llm_provider
from app.schemas.conflict import ConflictAnalyzeRequest
from app.schemas.coordinate import CoordinateRequest, CoordinateResponse, CoordinationOption
from app.schemas.risk import RiskPredictRequest
from app.services import conflict_service, risk_service


async def coordinate(db: AsyncSession, payload: CoordinateRequest) -> CoordinateResponse:
    conflicts = await conflict_service.analyze(
        db, ConflictAnalyzeRequest(project_id=payload.project_id)
    )
    risk = await risk_service.predict(db, RiskPredictRequest(project_id=payload.project_id))
    overlapping = [item for item in conflicts.conflicts if item.temporal_overlap]
    context: CoordinationContext = {
        "candidate_count": conflicts.conflict_count,
        "overlapping_count": len(overlapping),
        "high_severity_count": sum(item.severity == "HIGH" for item in conflicts.conflicts),
        "max_overlap_days": max((item.overlap_days for item in overlapping), default=0),
        "location_basis": conflicts.location_basis,
        "baseline_risk_score": risk.risk_score,
        "baseline_risk_level": risk.risk_level,
    }

    options = [
        CoordinationOption(
            option_name="Review sequencing",
            description="Review whether the works can be scheduled in sequence with the relevant teams.",
            tradeoffs="May reduce simultaneous activity, but could delay one or more projects.",
            schedule_impact="Dates and delay have not been assessed.",
        ),
        CoordinationOption(
            option_name="Explore joint work",
            description="Ask the responsible teams whether a shared work window or excavation is feasible.",
            tradeoffs="Could avoid repeated work, but requires technical and organizational agreement.",
            schedule_impact="A joint schedule has not been agreed or assessed.",
        ),
        CoordinationOption(
            option_name="Retain schedule with coordination",
            description="Review the existing schedule and coordinate access, traffic management and responsibilities.",
            tradeoffs="Avoids an assumed delay, but overlapping work may still require mitigation.",
            schedule_impact="No schedule changes have been evaluated.",
        ),
    ]
    recommended = "Review sequencing" if overlapping else "Retain schedule with coordination"
    explanation = (
        f"Analysis found {conflicts.conflict_count} candidate project(s), "
        f"including {len(overlapping)} with overlapping dates. "
        "Review the options with the relevant teams; feasibility and impacts are not verified."
    )
    warnings = list(dict.fromkeys([
        *conflicts.warnings,
        *risk.warnings,
        "Option-specific risk scores, durations and schedule impacts have not been calculated.",
        "Options are suggestions for human review, not approved plans.",
    ]))
    llm_used = False
    if payload.use_ai:
        try:
            explanation = await get_llm_provider().explain_coordination(context)
            llm_used = True
            warnings.append("AI-generated explanations may be inaccurate and require human review.")
        except ExtractionError as exc:
            warnings.append(f"AI explanation unavailable: {exc.user_message} Showing the deterministic explanation.")

    return CoordinateResponse(
        project_id=payload.project_id,
        options=options,
        recommended_option=recommended,
        explanation=explanation,
        llm_used=llm_used,
        baseline_risk_score=risk.risk_score,
        warnings=warnings,
    )
