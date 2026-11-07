from pydantic import BaseModel
from typing import Optional


class RiskFeatures(BaseModel):
    road_width: Optional[float] = None
    road_type: Optional[str] = None
    historical_work_orders: int = 0
    historical_road_repairs: int = 0
    pothole_count: int = 0
    grievance_count: int = 0
    existing_projects: int = 0
    nearby_projects: int = 0
    project_duration: int = 0
    lane_closure: int = 0
    project_length: float = 0
    number_of_overlapping_utilities: int = 0


class RiskPredictRequest(BaseModel):
    project_id: str


class RiskPredictResponse(BaseModel):
    project_id: str
    risk_score: float  # 0–100
    risk_level: str    # LOW | MEDIUM | HIGH
    model_version: str
    features_used: Optional[RiskFeatures] = None
    experimental: bool
    road_segment_matched: bool
    historical_features_available: bool
    warnings: list[str]
