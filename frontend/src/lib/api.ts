const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
import type { AuditEvent, ConflictResult, CoordinationResult, DemoConfig, ExtractedProject, OptionKey, Proposal, ProposalContent, ProposalSummary, RiskResult, ScheduleChange, SimulationResponse, Workplan } from "@/types";
import type { ImpactMetrics, MapCollection, ProjectCatalog, ProjectMapData, SavedProject } from "@/types";

const pending = new Map<string, Promise<unknown>>();
function once<T>(key: string, action: () => Promise<T>): Promise<T> {
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;
  const promise = action().finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    if (body && typeof body === "object" && "detail" in body && typeof body.detail === "string") {
      throw new Error(body.detail);
    }
    if (body && typeof body === "object" && "detail" in body && Array.isArray(body.detail)) {
      const messages = body.detail.map((item: unknown) => {
        if (item && typeof item === "object" && "msg" in item && typeof item.msg === "string") return item.msg;
        return "Invalid field.";
      });
      throw new Error(messages.join(" "));
    }
    throw new Error(`Request failed (HTTP ${res.status}). Please check the entered details.`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getProject: (id: string) => request<SavedProject>(`/api/projects/${encodeURIComponent(id)}`),
  projectMap: (id: string) => request<ProjectMapData>(`/api/projects/${encodeURIComponent(id)}/map`),
  catalog: (q = "", offset = 0) => request<ProjectCatalog>(`/api/projects/catalog?${new URLSearchParams({ q, offset: String(offset), limit: "25" })}`),
  roads: (q = "", offset = 0, bbox?: string) => request<MapCollection>(`/api/roads?${new URLSearchParams({ q, offset: String(offset), limit: bbox ? "500" : "10", ...(bbox ? { bbox } : {}) })}`),
  extractProject: (description: string) =>
    request<ExtractedProject>("/api/projects/extract", {
      method: "POST",
      body: JSON.stringify({ description }),
    }),

  createProject: (payload: object) =>
    request("/api/projects/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  analyzeConflicts: (project_id: string) =>
    once(`conflicts:${project_id}`, () => request<ConflictResult>("/api/conflicts/analyze", {
      method: "POST",
      body: JSON.stringify({ project_id }),
    })),

  predictRisk: (project_id: string) =>
    once(`risk:${project_id}`, () => request<RiskResult>("/api/risk/predict", {
      method: "POST",
      body: JSON.stringify({ project_id }),
    })),

  coordinate: (project_id: string, use_ai: boolean) =>
    request<CoordinationResult>("/api/coordinate/", {
      method: "POST",
      body: JSON.stringify({ project_id, use_ai }),
    }),

  simulate: (base_project_id: string, schedule_changes: ScheduleChange[]) =>
    request<SimulationResponse>("/api/simulate/", {
      method: "POST",
      body: JSON.stringify({ base_project_id, schedule_changes }),
    }),

  approvePlan: (plan_id: string, expected_revision: number) =>
    request<Workplan>(`/api/coordination-plans/${encodeURIComponent(plan_id)}/approve`, {
      method: "POST",
      body: JSON.stringify({ expected_revision }),
    }),

  getWorkplan: (workplan_id: string) =>
    request<Workplan>(`/api/workplans/${encodeURIComponent(workplan_id)}`),

  demoConfig: () => request<DemoConfig>("/api/coordination-plans/config"),

  listProposals: (project_id?: string) => request<ProposalSummary[]>(project_id
    ? `/api/projects/${encodeURIComponent(project_id)}/coordination-plans` : "/api/coordination-plans"),

  getProposal: (id: string) => request<Proposal>(`/api/coordination-plans/${encodeURIComponent(id)}`),

  createProposal: (project_id: string, option_key: OptionKey, tasks: ProposalContent["tasks"] = []) =>
    request<Proposal>("/api/coordination-plans", { method: "POST", body: JSON.stringify({ project_id, option_key, tasks }) }),

  updateProposal: (id: string, expected_revision: number, content: ProposalContent) =>
    request<Proposal>(`/api/coordination-plans/${encodeURIComponent(id)}`, {
      method: "PATCH", body: JSON.stringify({ ...content, expected_revision }),
    }),

  rejectProposal: (id: string, expected_revision: number, reason: string) =>
    request<Proposal>(`/api/coordination-plans/${encodeURIComponent(id)}/reject`, {
      method: "POST", body: JSON.stringify({ expected_revision, reason }),
    }),

  proposalEvents: (id: string) => request<AuditEvent[]>(`/api/coordination-plans/${encodeURIComponent(id)}/events`),

  getImpact: () => request<ImpactMetrics>("/api/impact/"),
};
