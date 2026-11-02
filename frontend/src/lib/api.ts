const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`API ${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  extractProject: (description: string) =>
    request("/api/projects/extract", {
      method: "POST",
      body: JSON.stringify({ description }),
    }),

  createProject: (payload: object) =>
    request("/api/projects/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  analyzeConflicts: (project_id: string) =>
    request("/api/conflicts/analyze", {
      method: "POST",
      body: JSON.stringify({ project_id }),
    }),

  predictRisk: (project_id: string) =>
    request("/api/risk/predict", {
      method: "POST",
      body: JSON.stringify({ project_id }),
    }),

  coordinate: (project_id: string, conflict_ids: string[]) =>
    request("/api/coordinate/", {
      method: "POST",
      body: JSON.stringify({ project_id, conflict_ids }),
    }),

  simulate: (base_project_id: string, schedule_changes: object[]) =>
    request("/api/simulate/", {
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
