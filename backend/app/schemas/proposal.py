"""Validated draft and decision contracts for the local review workflow."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

OptionKey = Literal["review_sequencing", "explore_joint_work", "retain_schedule"]


class DraftTask(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    id: str = Field(min_length=1, max_length=100)
    task: str = Field(min_length=1, max_length=300)
    organization: str = Field(min_length=1, max_length=200)
    start_date: date
    end_date: date
    dependency: str | None = Field(default=None, min_length=1, max_length=100)
    notes: str = Field(default="", max_length=2000)

    @model_validator(mode="after")
    def dates_valid(self):
        if self.end_date <= self.start_date:
            raise ValueError("Task end date must be after start date (exclusive).")
        return self


class ProposalContent(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    related_project_ids: list[str] = Field(default_factory=list, max_length=50)
    notes: str = Field(default="", max_length=4000)
    tasks: list[DraftTask] = Field(default_factory=list, max_length=100)

    @field_validator("related_project_ids")
    @classmethod
    def unique_projects(cls, value):
        if len(set(value)) != len(value) or any(not item.strip() or len(item) > 100 for item in value):
            raise ValueError("Related project IDs must be unique, nonblank and at most 100 characters.")
        return value

    @model_validator(mode="after")
    def dependencies_valid(self):
        tasks = {task.id: task for task in self.tasks}
        if len(tasks) != len(self.tasks):
            raise ValueError("Task IDs must be unique.")
        for task in self.tasks:
            seen = {task.id}
            current = task
            while current.dependency:
                if current.dependency not in tasks:
                    raise ValueError("Dependencies must reference tasks in this proposal.")
                if current.dependency in seen:
                    raise ValueError("Task dependencies must not contain cycles.")
                seen.add(current.dependency)
                current = tasks[current.dependency]
            if task.dependency and tasks[task.dependency].end_date > task.start_date:
                raise ValueError("A dependency must finish before its dependent task starts.")
        return self


class ProposalCreate(ProposalContent):
    project_id: str = Field(min_length=1, max_length=100)
    option_key: OptionKey


class ProposalUpdate(ProposalContent):
    expected_revision: int = Field(ge=1)


class PlanDecision(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    expected_revision: int = Field(ge=1)


class PlanRejection(PlanDecision):
    reason: str = Field(min_length=1, max_length=2000)


class ProposalRead(BaseModel):
    id: str
    project_id: str
    option_key: str | None
    option_name: str
    description: str
    tradeoffs: str
    status: str
    revision: int
    notes: str
    tasks: list[DraftTask]
    project_snapshots: list[dict]
    available_projects: list[dict]
    analysis_snapshot: dict
    workplan_id: str | None
    decision_reason: str | None
    decided_by: str | None
    decided_at: datetime | None
    created_at: datetime


class AuditEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    event: str
    actor: str
    revision: int
    details: dict
    created_at: datetime
