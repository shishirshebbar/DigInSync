export interface ExtractedProject {
  project_type: string;
  road_name: string;
  start_date: string;
  end_date: string;
  length_m: number | null;
  lane_closure: number;
  organization: string | null;
  description: string | null;
}

export interface ConfictDetail {
  project_a_id: string;
  project_b_id: string;
  project_a_name: string;
  project_b_name: string;
  spatial_overlap: boolean;
  temporal_overlap: boolean;
  overlap_days: number;
  impact_overlap: boolean;
  conflict_score: number;
  severity: "LOW" | "MEDIUM" | "HIGH";
}

export interface ConflictResult {
  project_id: string;
  conflict_count: number;
  conflicts: ConfictDetail[];
  has_high_severity: boolean;
}

export interface RiskResult {
  project_id: string;
  risk_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  model_version: string;
}

export interface CoordinationOption {
  option_name: string;
  description: string;
  risk_score: number;
  estimated_duration: number;
  tradeoffs: string;
  schedule_impact: string;
}

export interface WorkplanTask {
  id: string;
  task: string;
  organization: string;
  start_date: string;
  end_date: string;
  dependency: string | null;
  status: string;
}

export interface Workplan {
  id: string;
  coordination_plan_id: string;
  project_id: string;
  tasks: WorkplanTask[];
}
