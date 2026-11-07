export interface ExtractedProject {
  project_type: string | null;
  road_name: string | null;
  start_date: string | null;
  end_date: string | null;
  length_m: number | null;
  lane_closure: number | null;
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
  location_basis: string;
  warnings: string[];
}

export interface RiskResult {
  project_id: string;
  risk_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  model_version: string;
  experimental: boolean;
  road_segment_matched: boolean;
  historical_features_available: boolean;
  warnings: string[];
}

export interface CoordinationOption {
  option_name: string;
  description: string;
  risk_score: number | null;
  estimated_duration: number | null;
  tradeoffs: string;
  schedule_impact: string;
}

export interface CoordinationResult {
  project_id: string;
  options: CoordinationOption[];
  recommended_option: string;
  explanation: string;
  llm_used: boolean;
  baseline_risk_score: number;
  warnings: string[];
}

export interface ScheduleChange {
  project_id: string;
  new_start_date: string;
  new_end_date: string;
}

export interface SimulationResult {
  start_date: string;
  end_date: string;
  duration_days: number;
  conflict_count: number;
  temporal_overlap_count: number;
  has_high_severity: boolean;
  conflicts: ConfictDetail[];
  risk_score: number;
  risk_level: string;
  model_version: string;
}

export interface SimulationResponse {
  before: SimulationResult;
  after: SimulationResult;
  location_basis: string;
  warnings: string[];
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
