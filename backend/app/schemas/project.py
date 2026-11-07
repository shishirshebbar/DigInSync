from pydantic import BaseModel, Field, model_validator
from datetime import date
from typing import Literal, Optional


class ProjectExtractRequest(BaseModel):
    description: str = Field(min_length=1, max_length=4000)

    @model_validator(mode="after")
    def validate_description(self):
        self.description = self.description.strip()
        if not self.description:
            raise ValueError("Description must not be blank")
        return self


class ProjectExtract(BaseModel):
    """Output of the Project Intelligence Agent (NL → structured)."""
    project_type: Literal["water_pipeline", "telecom", "electricity", "road_repair", "drainage", "utility", "utility_maintenance", "street_light"] | None = None
    road_name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    length_m: Optional[float] = Field(default=None, gt=0, allow_inf_nan=False)
    lane_closure: Literal[0, 1] | None = None
    organization: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def validate_dates(self):
        if self.start_date and self.end_date and self.end_date <= self.start_date:
            raise ValueError("End date must be after start date")
        return self


class ProjectCreate(BaseModel):
    organization: str = Field(min_length=1, max_length=200)
    project_type: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=4000)
    road_name: str = Field(min_length=1, max_length=200)
    start_date: date
    end_date: date
    length_m: Optional[float] = Field(default=None, gt=0, allow_inf_nan=False)
    lane_closure: Literal[0, 1] = 0
    impact_level: str = "MEDIUM"
    priority: str = "NORMAL"

    @model_validator(mode="after")
    def validate_project(self):
        for field in ("organization", "project_type", "description", "road_name"):
            value = getattr(self, field).strip()
            if not value:
                raise ValueError(f"{field} must not be blank")
            setattr(self, field, value)
        if self.end_date <= self.start_date:
            raise ValueError("End date must be after start date")
        return self


class ProjectRead(ProjectCreate):
    id: str
    road_segment_id: Optional[str] = None
    duration_days: int
    status: str
    risk_score: Optional[float] = None
    risk_level: Optional[str] = None

    model_config = {"from_attributes": True}
