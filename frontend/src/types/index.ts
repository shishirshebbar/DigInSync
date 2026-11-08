export interface ExtractedProject {
  road_segment_id?: string | null;
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
  option_key: OptionKey;
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
  notes: string;
}

export interface Workplan {
  id: string;
  coordination_plan_id: string;
  project_id: string;
  tasks: WorkplanTask[];
  approved_by: string | null;
  approved_at: string | null;
  proposal_revision: number;
  warnings: string[];
}

export type OptionKey = "review_sequencing" | "explore_joint_work" | "retain_schedule";

export interface DraftTask {
  id: string;
  task: string;
  organization: string;
  start_date: string;
  end_date: string;
  dependency: string | null;
  notes: string;
}

export interface ProjectSnapshot {
  id: string;
  organization: string;
  project_type: string;
  description: string;
  road_name: string | null;
  start_date: string;
  end_date: string;
}

export interface ProposalSummary {
  id: string;
  project_id: string;
  option_name: string;
  status: string;
  revision: number;
  created_at: string;
}

export interface Proposal extends ProposalSummary {
  option_key: OptionKey | null;
  description: string;
  tradeoffs: string;
  notes: string;
  tasks: DraftTask[];
  project_snapshots: ProjectSnapshot[];
  available_projects: ProjectSnapshot[];
  analysis_snapshot: { baseline?: SimulationResult; location_basis?: string; warnings?: string[] };
  workplan_id: string | null;
  decision_reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
}

export interface ProposalContent {
  related_project_ids: string[];
  notes: string;
  tasks: DraftTask[];
}

export interface AuditEvent {
  id: string;
  event: string;
  actor: string;
  revision: number;
  created_at: string;
  details: { reason?: string; workplan_id?: string; content?: ProposalContent };
}

export interface DemoConfig {
  enabled: boolean;
  reviewer: string;
  mode: string;
}

export interface SavedProject extends ExtractedProject {
  id: string;
  organization: string;
  project_type: string;
  road_name: string | null;
  description: string;
  start_date: string;
  end_date: string;
  duration_days: number;
  status: string;
}

export interface MapFeature {
  type: "Feature";
  id: string;
  geometry: { type: "LineString"; coordinates: number[][] } | null;
  properties: { road_name: string; role: string; organization?: string; project_type?: string;
    start_date?: string; end_date?: string; road_type?: string; source?: string; osm_id?: string | null; length_m?: number | null };
}

export interface MapCollection {
  type: "FeatureCollection";
  features: MapFeature[];
  total: number;
  limit: number;
  offset: number;
}

export interface ProjectMapData extends MapCollection {
  unmapped_ids: string[];
  location_basis: string;
  warnings: string[];
}

export interface ProjectCatalog {
  items: SavedProject[];
  total: number;
  limit: number;
  offset: number;
}

export interface ImpactMetrics {
  projects_total: number;
  mapped_projects: number;
  unmapped_projects: number;
  proposal_status_counts: Record<string, number>;
  workplans_generated: number;
  task_count: number;
  conflicts_detected: number;
  high_severity_conflicts: number;
}
