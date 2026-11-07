"""Read-only schedule comparison using the existing conflict engine and model."""
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.conflict.engine import analyze_pair
from app.schemas.conflict import ConflictAnalyzeRequest, ConflictDetail
from app.schemas.simulate import ScheduleChange, SimulateRequest, SimulateResponse, SimulateResult
from app.services import conflict_service, project_service, risk_service
from ml.features import extract_features


async def simulate(db: AsyncSession, payload: SimulateRequest) -> SimulateResponse:
    project = await project_service.get_project(db, payload.base_project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    radius = ConflictAnalyzeRequest(project_id=project.id).radius_m
    neighbours = await conflict_service._find_neighbours(db, project, radius)
    candidates = {neighbour.id: neighbour for neighbour in neighbours}
    changes = {change.project_id: change for change in payload.schedule_changes}
    for changed_id in changes:
        if changed_id != project.id and changed_id not in candidates:
            other = await project_service.get_project(db, changed_id)
            if other is None:
                raise HTTPException(status_code=404, detail="Changed project not found")
            raise HTTPException(status_code=422, detail="Schedule changes must target the base project or its active conflict candidates")

    spatial = {
        neighbour.id: await conflict_service._check_spatial_overlap(db, project, neighbour, radius)
        for neighbour in neighbours
    }
    features, feature_warnings, _ = await extract_features(db, project)

    def dates(item, scenario: dict[str, ScheduleChange]):
        change = scenario.get(item.id)
        return (change.new_start_date, change.new_end_date) if change else (item.start_date, item.end_date)

    def calculate(scenario: dict[str, ScheduleChange]) -> SimulateResult:
        start, end = dates(project, scenario)
        conflicts = []
        types = set()
        for neighbour in neighbours:
            neighbour_start, neighbour_end = dates(neighbour, scenario)
            pair = analyze_pair(
                spatial_overlap=spatial[neighbour.id],
                start_a=start, end_a=end, start_b=neighbour_start, end_b=neighbour_end,
                type_a=project.project_type, type_b=neighbour.project_type,
            )
            if not (pair.spatial_overlap or pair.temporal_overlap):
                continue
            types.add(neighbour.project_type)
            conflicts.append(ConflictDetail(
                project_a_id=project.id, project_b_id=neighbour.id,
                project_a_name=f"{project.project_type} — {project.road_name or 'unknown road'}",
                project_b_name=f"{neighbour.project_type} — {neighbour.road_name or 'unknown road'}",
                spatial_overlap=pair.spatial_overlap, temporal_overlap=pair.temporal_overlap,
                overlap_days=pair.overlap_days, impact_overlap=pair.impact_overlap,
                conflict_score=pair.conflict_score, severity=pair.severity,
            ))
        scenario_features = {
            **features,
            "project_duration": (end - start).days,
            "existing_projects": len(conflicts),
            "number_of_overlapping_utilities": len(types),
        }
        score, level, version = risk_service.score_features(scenario_features)
        return SimulateResult(
            start_date=start, end_date=end, duration_days=(end - start).days,
            conflict_count=len(conflicts),
            temporal_overlap_count=sum(item.temporal_overlap for item in conflicts),
            has_high_severity=any(item.severity == "HIGH" for item in conflicts),
            conflicts=conflicts, risk_score=score, risk_level=level, model_version=version,
        )

    before = calculate({})
    after = calculate(changes)
    warnings = [
        "Simulation only; project schedules, conflicts and risk predictions are not saved.",
        "Conflict count includes spatial candidates even when their schedules do not overlap; compare overlapping schedules and individual scores.",
        "The experimental indicator is trained on generated samples and proxy labels, not observed disruption outcomes.",
        "The model uses duration and candidate counts, not calendar dates or overlap days; changing dates may not change the indicator.",
        "Scenario risk uses recalculated candidate counts, which can differ from stored conflict counts used by the regular risk endpoint.",
        *feature_warnings,
    ]
    if project.geometry is None:
        warnings.append("Conflict candidates use exact road-name matches, not verified proximity.")
    else:
        warnings.append("Only projects with recorded geometry are checked by proximity; projects without geometry may be missed.")
    if before.model_version == "fallback" or after.model_version == "fallback":
        warnings.append("Model artifact unavailable; the indicator uses a deterministic fallback.")
    return SimulateResponse(
        before=before, after=after,
        location_basis="geometry" if project.geometry is not None else "road_name",
        warnings=list(dict.fromkeys(warnings)),
    )
