import type { AuditEvent, ConflictResult, CoordinationResult, DemoConfig, ExtractedProject, ImpactMetrics, MapCollection, ProjectCatalog, ProjectMapData, Proposal, RiskResult, SavedProject, SimulationResponse, WardContext, Workplan } from "@/types";

export type Operation = "extract" | "create" | "project" | "map" | "roads" | "conflicts" | "risk" | "coordinate" | "simulate" | "proposalCreate" | "proposalRead" | "proposalSave" | "approve" | "reject" | "workplan" | "events" | "demo" | "proposals" | "catalog" | "impact" | "ward";
export type ActivityStatus = "running" | "completed" | "warning" | "failed";
export interface Activity {
  id: number;
  operation: Operation;
  title: string;
  explanation: string;
  projectId?: string;
  proposalId?: string;
  workplanId?: string;
  context: string;
  startedAt: number;
  finishedAt?: number;
  status: ActivityStatus;
  summary: string;
  warnings: string[];
}

export const operations: Record<Operation, { title: string; explanation: string }> = {
  extract: { title: "Read project description", explanation: "The configured AI provider extracts editable project details. Review the returned fields before saving." },
  create: { title: "Save project", explanation: "Validate and save the confirmed project, dates, organization, and optional road reference." },
  project: { title: "Load saved project", explanation: "Retrieve the saved details and original schedule for this project." },
  map: { title: "Check location and candidates", explanation: "Load recorded geometry and candidate projects using proximity where geometry exists, or exact road-name matching otherwise." },
  roads: { title: "Search imported roads", explanation: "Look up imported road segments for selection or the current map view. A segment is a reference, not a verified excavation extent." },
  conflicts: { title: "Analyze candidate conflicts", explanation: "Find active candidates, compare location, dates, work types and sequencing relationships, and save the returned conflict analysis." },
  risk: { title: "Calculate experimental indicator", explanation: "Collect available project, road and historical inputs, calculate the model or fallback indicator, and save the result. This is not a disruption probability." },
  coordinate: { title: "Prepare coordination options", explanation: "Recheck conflicts and the experimental indicator, then prepare three review templates. An AI explanation is requested only when selected." },
  simulate: { title: "Compare proposed schedule", explanation: "Compare the original and proposed dates against available candidates and recalculate scenario indicators. This operation saves no schedule changes and makes no AI call." },
  proposalCreate: { title: "Prepare proposal draft", explanation: "Capture participating project details and analysis, then save a reviewable draft and its decision-history event." },
  proposalRead: { title: "Load saved proposal", explanation: "Retrieve the saved proposal revision, participating projects and reviewed analysis." },
  proposalSave: { title: "Save draft revision", explanation: "Check the revision, refresh project and analysis snapshots, and save the edited draft with a history event." },
  approve: { title: "Approve and generate workplan", explanation: "Check the saved revision, tasks and freshness of project and conflict snapshots, then record the local decision and generate its workplan. These checks are one backend operation." },
  reject: { title: "Record rejection", explanation: "Check the saved revision and record the local rejection and its reason." },
  workplan: { title: "Retrieve saved workplan", explanation: "Load the generated tasks, responsibilities, dates, dependencies and recorded approval details." },
  events: { title: "Load decision history", explanation: "Retrieve server-recorded proposal revisions and decisions. This saved history is separate from this browser's activity." },
  demo: { title: "Check demo review availability", explanation: "Check whether local-demo editing and decisions are enabled for this connection." },
  proposals: { title: "Load saved proposals", explanation: "Retrieve recent saved proposal summaries and their review status." },
  catalog: { title: "Search saved projects", explanation: "Retrieve the requested page of saved projects matching the road-name search." },
  impact: { title: "Load dashboard totals", explanation: "Count saved projects, workplans, proposal decisions and available spatial records. Counts do not prove data completeness." },
  ward: { title: "Look up ward dataset", explanation: "Count records matching the entered ward identifier in the selected dataset. Identifiers are not reconciled across datasets; counts do not establish nearby incidents." },
};

const empty: readonly Activity[] = [];
let activities: readonly Activity[] = empty;
let nextId = 0;
const listeners = new Set<() => void>();
const proposalProjects = new Map<string, string>();
const workplanProjects = new Map<string, string>();
const projectNames = new Map<string, string>();

export const getActivities = () => activities;
export const getServerActivities = () => empty;
export function subscribeActivities(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function publish(next: readonly Activity[]) {
  // Never discard a running operation. Evict the oldest completed records only.
  const completed = next.filter((item) => item.status !== "running").slice(-100);
  const retained = new Set(completed.map((item) => item.id));
  activities = next.filter((item) => item.status === "running" || retained.has(item.id));
  listeners.forEach((listener) => listener());
}

export function beginActivity(path: string, options?: RequestInit): number | undefined {
  if (typeof window === "undefined") return undefined;
  const url = new URL(path, window.location.origin);
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const body: Record<string, unknown> = typeof options?.body === "string" ? JSON.parse(options.body) : {};
  const method = options?.method ?? "GET";
  let operation: Operation;
  let projectId: string | undefined;
  let proposalId: string | undefined;
  let workplanId: string | undefined;
  if (parts[1] === "projects") {
    operation = parts[2] === "extract" ? "extract" : parts[2] === "catalog" ? "catalog" : parts[3] === "map" ? "map"
      : parts[3] === "coordination-plans" ? "proposals" : method === "POST" ? "create" : "project";
    if (["project", "map", "proposals"].includes(operation)) projectId = parts[2];
  } else if (parts[1] === "coordination-plans") {
    operation = parts[2] === "config" ? "demo" : parts[3] === "approve" ? "approve" : parts[3] === "reject" ? "reject"
      : parts[3] === "events" ? "events" : method === "PATCH" ? "proposalSave" : method === "POST" ? "proposalCreate"
        : parts[2] ? "proposalRead" : "proposals";
    if (parts[2] && parts[2] !== "config") proposalId = parts[2];
    projectId = proposalId ? proposalProjects.get(proposalId) : undefined;
  } else if (parts[1] === "workplans") {
    operation = "workplan"; workplanId = parts[2]; projectId = workplanProjects.get(workplanId);
  } else {
    const byRoute: Record<string, Operation> = { roads: "roads", conflicts: "conflicts", risk: "risk", coordinate: "coordinate", simulate: "simulate", impact: "impact", wards: "ward" };
    operation = byRoute[parts[1]];
    if (!operation) return undefined;
  }
  if (typeof body.project_id === "string") projectId = body.project_id;
  if (typeof body.base_project_id === "string") projectId = body.base_project_id;
  const context = proposalId ? `Proposal ${proposalId.slice(0, 8)}` : projectId ? `${projectNames.has(projectId) ? `${projectNames.get(projectId)} · ` : ""}Project ${projectId.slice(0, 8)}`
    : operation === "ward" ? `${url.searchParams.get("dataset") === "work_orders" ? "Work orders" : "Grievances"} · ${url.searchParams.get("ward")}`
      : operation === "roads" ? url.searchParams.get("bbox") ? "Map road layer" : "Road selection"
        : ["extract", "create"].includes(operation) ? "New project" : "Saved records";
  const id = ++nextId;
  publish([...activities, { id, operation, ...operations[operation], projectId, proposalId, workplanId, context,
    startedAt: Date.now(), status: "running", summary: operation === "coordinate"
      ? body.use_ai ? "Preparing options with an optional AI explanation." : "Preparing deterministic options without AI."
      : "Waiting for the server response.", warnings: [] }]);
  return id;
}

function resultSummary(operation: Operation, data: unknown): string {
  switch (operation) {
    case "extract": {
      const value = data as ExtractedProject;
      const missing = [value.project_type, value.road_name, value.start_date, value.end_date, value.organization, value.description, value.lane_closure].filter((field) => field === null || field === undefined || field === "").length;
      return `Details ready for review.${missing ? ` ${missing} required field(s) still need attention.` : " Confirm all extracted fields before saving."}`;
    }
    case "create": return "Project saved. Open its workspace to review location and analysis.";
    case "project": { const value = data as SavedProject; return `Saved schedule: ${value.start_date} to ${value.end_date} (end exclusive).`; }
    case "map": { const value = data as ProjectMapData; return `${Math.max(0, value.total - 1)} candidate project(s). Location basis: ${value.location_basis === "geometry" ? "recorded geometry" : "exact road name, unverified proximity"}.`; }
    case "roads": { const value = data as MapCollection; return `${value.total} matching road segment(s); ${value.features.length} returned in this view.`; }
    case "conflicts": { const value = data as ConflictResult; return `${value.conflict_count} candidate(s), ${value.conflicts.filter((item) => item.temporal_overlap).length} with overlapping dates. ${value.has_high_severity ? "High-severity candidates need review." : "Review available data and coverage limitations."}`; }
    case "risk": { const value = data as RiskResult; return `${value.risk_score}/100 (${value.risk_level}). ${value.model_version === "fallback" ? "Deterministic fallback used." : `Model version ${value.model_version}.`} Historical road features ${value.historical_features_available ? "present, completeness unverified" : "unavailable"}.`; }
    case "coordinate": { const value = data as CoordinationResult; return `${value.options.length} review options prepared. ${value.llm_used ? "AI explanation returned; review for accuracy." : "Deterministic explanation returned."}`; }
    case "simulate": { const value = data as SimulationResponse; return `Overlapping schedules: ${value.before.temporal_overlap_count} before, ${value.after.temporal_overlap_count} proposed. Original schedules unchanged; no simulation results saved.`; }
    case "proposalCreate": case "proposalRead": case "proposalSave": case "reject": { const value = data as Proposal; return `${value.status} · revision ${value.revision}. ${operation === "proposalSave" ? "Draft saved with refreshed review snapshots." : operation === "reject" ? "Local rejection recorded." : "Saved proposal ready to review."}`; }
    case "approve": { const value = data as Workplan; return `Local approval recorded for revision ${value.proposal_revision}; workplan generated with ${value.tasks.length} task(s). Original project dates unchanged.`; }
    case "workplan": { const value = data as Workplan; return `${value.tasks.length} saved task(s) retrieved for revision ${value.proposal_revision}.`; }
    case "events": return `${(data as AuditEvent[]).length} saved decision-history event(s) retrieved.`;
    case "demo": return (data as DemoConfig).enabled ? "Local-demo editing and decisions are available. This is not agency authorization." : "Demo editing and decisions are disabled. Saved proposals remain readable.";
    case "proposals": return `${(data as Proposal[]).length} saved proposal(s) retrieved.`;
    case "catalog": { const value = data as ProjectCatalog; return `${value.total} matching project(s); ${value.items.length} returned on this page.`; }
    case "impact": { const value = data as ImpactMetrics; return `${value.projects_total} saved project(s), ${value.workplans_generated} workplan(s). Counts describe stored prototype records.`; }
    case "ward": { const value = data as WardContext; return `${value.record_count} record(s) for ${value.ward}. Ward-level context only; no road-level proximity established.`; }
  }
}

export function completeActivity(id: number | undefined, data: unknown) {
  if (id === undefined) return;
  const record = activities.find((item) => item.id === id);
  if (!record) return;
  const value = (data ?? {}) as { id?: string; project_id?: string; coordination_plan_id?: string; workplan_id?: string; road_name?: string; warnings?: string[] };
  const projectId = value.project_id ?? (record.operation === "create" ? value.id : record.projectId);
  const proposalId = value.coordination_plan_id ?? (["proposalCreate", "proposalRead", "proposalSave", "reject"].includes(record.operation) ? value.id : record.proposalId);
  const workplanId = ["approve", "workplan"].includes(record.operation) ? value.id : value.workplan_id;
  if (projectId && value.road_name) projectNames.set(projectId, value.road_name);
  if (projectId && proposalId) proposalProjects.set(proposalId, projectId);
  if (projectId && workplanId) workplanProjects.set(workplanId, projectId);
  const warnings = [...(value.warnings ?? [])];
  if (record.operation === "demo" && !(data as DemoConfig).enabled) warnings.push("Demo editing and decisions are disabled for this connection.");
  let summary = "Server response received. Review the result in its panel.";
  try { summary = resultSummary(record.operation, data); }
  catch { /* Presentation must never turn a successful server request into a failed mutation. */ }
  publish(activities.map((item) => {
    const updated: Activity = item.id === id ? { ...item, projectId, proposalId, workplanId, finishedAt: Date.now(),
      status: warnings.length ? "warning" : "completed", summary, warnings } : item;
    return updated.projectId && !updated.proposalId && projectNames.has(updated.projectId)
      ? { ...updated, context: `${projectNames.get(updated.projectId)} · Project ${updated.projectId.slice(0, 8)}` } : updated;
  }));
}

export function failActivity(id: number | undefined, summary: string) {
  if (id === undefined) return;
  publish(activities.map((item) => item.id === id ? { ...item, status: "failed", finishedAt: Date.now(), summary } : item));
}
