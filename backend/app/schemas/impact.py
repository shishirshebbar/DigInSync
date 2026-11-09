from pydantic import BaseModel


class ImpactMetrics(BaseModel):
    projects_total: int
    mapped_projects: int
    unmapped_projects: int
    proposal_status_counts: dict[str, int]
    workplans_generated: int
    task_count: int
    conflicts_detected: int
    high_severity_conflicts: int
