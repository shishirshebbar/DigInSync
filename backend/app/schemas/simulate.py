from pydantic import BaseModel
from datetime import date


class ScheduleChange(BaseModel):
    project_id: str
    new_start_date: date
    new_end_date: date


class SimulateRequest(BaseModel):
    base_project_id: str
    schedule_changes: list[ScheduleChange]


class SimulateResult(BaseModel):
    conflict_count: int
    has_high_severity: bool
    risk_score: float
    risk_level: str


class SimulateResponse(BaseModel):
    before: SimulateResult
    after: SimulateResult
    improvement: bool
