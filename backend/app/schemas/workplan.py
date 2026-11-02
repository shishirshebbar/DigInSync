from pydantic import BaseModel
from datetime import date
from typing import Optional


class WorkplanTask(BaseModel):
    id: str
    task: str
    organization: str
    start_date: date
    end_date: date
    dependency: Optional[str] = None
    status: str


class WorkplanRead(BaseModel):
    id: str
    coordination_plan_id: str
    project_id: str
    tasks: list[WorkplanTask]

    model_config = {"from_attributes": True}
