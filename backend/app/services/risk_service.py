"""
Risk service — Phase 4.

1. Load the project from DB
2. Extract all 12 ML features via feature extractor
3. Run XGBoost inference
4. Persist risk_prediction to DB
5. Update project with risk_score + risk_level
6. Return structured response
"""
from __future__ import annotations

import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import Project, RiskPrediction
from app.schemas.risk import RiskPredictRequest, RiskPredictResponse, RiskFeatures
from ml.features import extract_features
from ml.predict import predict as ml_predict


def _uuid() -> str:
    return str(uuid.uuid4())


async def predict(db: AsyncSession, payload: RiskPredictRequest) -> RiskPredictResponse:
    # 1. Load project
    result = await db.execute(select(Project).where(Project.id == payload.project_id))
    project = result.scalar_one_or_none()
    if not project:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Project not found")

    # 2. Extract features
    features, warnings, historical_available = await extract_features(db, project)
    warnings.insert(0, "Experimental indicator trained on generated samples and proxy labels; it is not a verified prediction or probability of disruption.")

    # 3. ML inference
    risk_score, risk_level, model_version = score_features(features)
    if model_version == "fallback":
        warnings.append("Model artifact unavailable; this is a deterministic fallback, not an ML prediction.")

    # 4. Persist / update risk_prediction
    existing = await db.execute(
        select(RiskPrediction).where(RiskPrediction.project_id == project.id)
    )
    risk_row = existing.scalar_one_or_none()

    if risk_row:
        risk_row.risk_score = risk_score
        risk_row.risk_level = risk_level
        risk_row.model_version = model_version
    else:
        risk_row = RiskPrediction(
            id=_uuid(),
            project_id=project.id,
            risk_score=risk_score,
            risk_level=risk_level,
            model_version=model_version,
        )
        db.add(risk_row)

    await db.commit()

    return RiskPredictResponse(
        project_id=project.id,
        risk_score=risk_score,
        risk_level=risk_level,
        model_version=model_version,
        experimental=True,
        road_segment_matched=project.road_segment_id is not None,
        historical_features_available=historical_available,
        warnings=warnings,
        features_used=RiskFeatures(**{
            "road_width": features.get("road_width"),
            "road_type": str(features.get("road_type_enc")),
            "historical_work_orders": features.get("historical_work_orders", 0),
            "historical_road_repairs": features.get("historical_road_repairs", 0),
            "pothole_count": features.get("pothole_count", 0),
            "grievance_count": features.get("grievance_count", 0),
            "existing_projects": features.get("existing_projects", 0),
            "nearby_projects": features.get("nearby_projects", 0),
            "project_duration": features.get("project_duration", 0),
            "lane_closure": features.get("lane_closure", 0),
            "project_length": features.get("project_length", 0.0),
            "number_of_overlapping_utilities": features.get("number_of_overlapping_utilities", 0),
        }),
    )


def score_features(features: dict) -> tuple[float, str, str]:
    try:
        return ml_predict(features)
    except FileNotFoundError:
        score = _fallback_score(features)
        level = "HIGH" if score >= 60 else "LOW" if score < 30 else "MEDIUM"
        return score, level, "fallback"


def _fallback_score(features: dict) -> float:
    """
    Deterministic fallback when model artifact is missing.
    Uses the same domain rules as the training label generator.
    """
    score = 0.0
    score += 15 if features.get("road_width", 7) < 6 else 8 if features.get("road_width", 7) < 9 else 0
    score += min(features.get("historical_work_orders", 0) / 50 * 20, 20)
    score += min(features.get("historical_road_repairs", 0) / 30 * 10, 10)
    score += min(features.get("nearby_projects", 0) * 8, 24)
    score += min(features.get("existing_projects", 0) * 10, 20)
    score += 12 if features.get("lane_closure", 0) == 1 else 0
    score += min(features.get("project_duration", 0) / 30 * 10, 10)
    return min(round(score, 1), 100)
