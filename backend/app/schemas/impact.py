from pydantic import BaseModel


class SpatialCoverage(BaseModel):
    road_segments: int
    roads_with_feature_rows: int
    work_orders: int
    geocoded_work_orders: int
    grievances: int
    geocoded_grievances: int
    road_repairs: int
    geocoded_road_repairs: int
    potholes: int
    geocoded_potholes: int


class ImpactMetrics(BaseModel):
    projects_total: int
    mapped_projects: int
    unmapped_projects: int
    proposal_status_counts: dict[str, int]
    workplans_generated: int
    task_count: int
    conflicts_detected: int
    high_severity_conflicts: int
    spatial_coverage: SpatialCoverage
