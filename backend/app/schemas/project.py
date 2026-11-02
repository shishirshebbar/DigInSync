from pydantic import BaseModel, Field
from datetime import date
from typing import Optional


class ProjectExtract(BaseModel):
    """Output of the Project Intelligence Agent (NL → structured)."""
    project_type: str
    road_name: str
    start_date: date
    end_date: date
    length_m: Optional[float] = None
    lane_closure: int = 0
    organization: Optional[str] = None
    description: Optional[str] = None


class ProjectCreate(BaseModel):
    organization: str
    project_type: str
    description: str
    road_name: str
    start_date: date
    end_date: date
    length_m: Optional[float] = None
    lane_closure: int = 0
    impact_level: str = "MEDIUM"
    priority: str = "NORMAL"


class ProjectRead(ProjectCreate):
    id: str
    road_segment_id: Optional[str] = None
    duration_days: int
    status: str
    risk_score: Optional[float] = None
    risk_level: Optional[str] = None

    model_config = {"from_attributes": True}
