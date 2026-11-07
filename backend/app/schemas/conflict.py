from pydantic import BaseModel
from typing import Optional


class ConflictDetail(BaseModel):
    project_a_id: str
    project_b_id: str
    project_a_name: str
    project_b_name: str
    spatial_overlap: bool
    temporal_overlap: bool
    overlap_days: int
    impact_overlap: bool
    conflict_score: float
    severity: str  # LOW | MEDIUM | HIGH


class ConflictAnalyzeRequest(BaseModel):
    project_id: str
    radius_m: float = 500


class ConflictAnalyzeResponse(BaseModel):
    project_id: str
    conflict_count: int
    conflicts: list[ConflictDetail]
    has_high_severity: bool
    location_basis: str
    warnings: list[str]
