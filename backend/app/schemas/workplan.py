from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional


class WorkplanTask(BaseModel):
    id: str
    task: str
    organization: str
    start_date: date
    end_date: date
    dependency: Optional[str] = None
    status: str
    notes: str = ""


class WorkplanRead(BaseModel):
    id: str
    coordination_plan_id: str
    project_id: str
    tasks: list[WorkplanTask]
    approved_by: str | None = None
    approved_at: datetime | None = None
    proposal_revision: int
    warnings: list[str]

    model_config = {"from_attributes": True}
