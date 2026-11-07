const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
import type { ConflictResult, CoordinationResult, ExtractedProject, RiskResult, ScheduleChange, SimulationResponse } from "@/types";

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
    throw new Error(`Request failed (HTTP ${res.status}). Please check the entered details.`);
  }
  return res.json() as Promise<T>;
}

export const api = {
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
    request<ConflictResult>("/api/conflicts/analyze", {
      method: "POST",
      body: JSON.stringify({ project_id }),
    }),

  predictRisk: (project_id: string) =>
    request<RiskResult>("/api/risk/predict", {
      method: "POST",
      body: JSON.stringify({ project_id }),
    }),

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

  approvePlan: (plan_id: string) =>
    request(`/api/workplans/coordination-plans/${plan_id}/approve`, {
      method: "POST",
    }),

  getWorkplan: (workplan_id: string) =>
    request(`/api/workplans/${workplan_id}`),

  getImpact: () => request("/api/impact/"),
};
