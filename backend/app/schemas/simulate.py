from datetime import date

from pydantic import BaseModel, Field, model_validator

from app.schemas.conflict import ConflictDetail


class ScheduleChange(BaseModel):
    project_id: str = Field(min_length=1, max_length=100)
    new_start_date: date
    new_end_date: date

    @model_validator(mode="after")
    def validate_dates(self):
        if self.new_end_date <= self.new_start_date:
            raise ValueError("End date must be after start date")
        return self


class SimulateRequest(BaseModel):
    base_project_id: str = Field(min_length=1, max_length=100)
    schedule_changes: list[ScheduleChange] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def validate_unique_projects(self):
        ids = [change.project_id for change in self.schedule_changes]
        if len(ids) != len(set(ids)):
            raise ValueError("Each project may have only one schedule change")
        return self


class SimulateResult(BaseModel):
    start_date: date
    end_date: date
    duration_days: int
    conflict_count: int
    temporal_overlap_count: int
    has_high_severity: bool
    conflicts: list[ConflictDetail]
    risk_score: float
    risk_level: str
    model_version: str


class SimulateResponse(BaseModel):
    before: SimulateResult
    after: SimulateResult
    location_basis: str
    warnings: list[str]
