import { type Page, type Route } from "@playwright/test";
import type { Proposal, SavedProject, SimulationResult } from "../../src/types";

export const project: SavedProject = {
  id: "process-project",
  road_name: "Process Test Road",
  organization: "Water team",
  project_type: "water_pipeline",
  description: "Review the confirmed project",
  start_date: "2026-11-12",
  end_date: "2026-11-18",
  duration_days: 6,
  length_m: 150,
  lane_closure: 1,
  status: "PENDING",
  road_segment_id: null,
};
export const baseline: SimulationResult = {
  start_date: project.start_date,
  end_date: project.end_date,
  duration_days: 6,
  conflict_count: 1,
  temporal_overlap_count: 1,
  has_high_severity: true,
  conflicts: [
    {
      project_a_id: project.id,
      project_b_id: "candidate-project",
      project_a_name: "Water work",
      project_b_name: "Telecom work",
      spatial_overlap: true,
      temporal_overlap: true,
      overlap_days: 6,
      impact_overlap: true,
      conflict_score: 78.6,
      severity: "HIGH",
    },
  ],
  risk_score: 48,
  risk_level: "MEDIUM",
  model_version: "fallback",
};

type Call = { path: string; method: string; body: unknown };
type Override = (route: Route, url: URL) => Promise<boolean>;
export const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, json: body });
export function gate() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}

export async function mockApi(page: Page, override?: Override) {
  const calls: Call[] = [];
  let plan: Proposal = {
    id: "process-proposal",
    project_id: project.id,
    option_key: "review_sequencing",
    option_name: "Review sequencing",
    status: "DRAFT",
    revision: 1,
    created_at: "2026-11-09T10:00:00Z",
    description: "Review this coordination draft",
    tradeoffs: "Confirm responsibilities",
    notes: "Saved notes",
    tasks: [
      {
        id: "task-one",
        task: "Water work",
        organization: "Water team",
        start_date: project.start_date,
        end_date: project.end_date,
        dependency: null,
        notes: "",
      },
    ],
    project_snapshots: [project],
    available_projects: [],
    analysis_snapshot: {
      baseline,
      location_basis: "road_name",
      warnings: ["Road-name matching is unverified."],
    },
    workplan_id: null,
    decision_reason: null,
    decided_by: null,
    decided_at: null,
  };
  const workplan = () => ({
    id: "process-workplan",
    coordination_plan_id: plan.id,
    project_id: project.id,
    tasks: plan.tasks.map((task) => ({ ...task, status: "PLANNED" })),
    approved_by: "demo-reviewer",
    approved_at: "2026-11-09T10:15:00Z",
    proposal_revision: plan.revision,
    warnings: ["Local demo only."],
  });
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    const body = route.request().postDataJSON();
    calls.push({ path, method, body });
    if (override && (await override(route, url))) return;
    if (path === "/api/projects/catalog")
      return json(route, { items: [project], total: 1, limit: 25, offset: 0 });
    if (path === "/api/projects/extract") return json(route, project);
    if (path === "/api/projects/" && method === "POST")
      return json(route, { ...project, ...body }, 201);
    if (/^\/api\/projects\/[^/]+\/map$/.test(path))
      return json(route, {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: project.id,
            geometry: null,
            properties: { ...project, role: "base" },
          },
        ],
        total: 1,
        limit: 100,
        offset: 0,
        unmapped_ids: [project.id],
        location_basis: "road_name",
        warnings: ["Road-name matching is unverified."],
      });
    if (/^\/api\/projects\/[^/]+$/.test(path))
      return json(
        route,
        path.endsWith("other-project")
          ? { ...project, id: "other-project", road_name: "Other Project Road" }
          : project,
      );
    if (path === "/api/roads")
      return json(route, {
        type: "FeatureCollection",
        features: [],
        total: 0,
        limit: 25,
        offset: 0,
      });
    if (path === "/api/conflicts/analyze")
      return json(route, {
        project_id: body.project_id,
        conflicts: baseline.conflicts,
        conflict_count: 1,
        has_high_severity: true,
        location_basis: "road_name",
        warnings: ["Road-name matching is unverified."],
      });
    if (path === "/api/risk/predict")
      return json(route, {
        project_id: body.project_id,
        risk_score: 48,
        risk_level: "MEDIUM",
        model_version: "fallback",
        experimental: true,
        road_segment_matched: false,
        historical_features_available: false,
        features_used: {
          road_width: 7,
          road_type: "3",
          historical_work_orders: 0,
          historical_road_repairs: 0,
          pothole_count: 0,
          grievance_count: 0,
          existing_projects: 1,
          nearby_projects: 1,
          project_duration: 6,
          lane_closure: 1,
          project_length: 150,
          number_of_overlapping_utilities: 1,
        },
        warnings: [
          "Model artifact unavailable; deterministic fallback used.",
          "Road history is unavailable; zero does not mean no incidents.",
        ],
      });
    if (path === "/api/coordinate/")
      return json(route, {
        project_id: project.id,
        llm_used: false,
        baseline_risk_score: 48,
        explanation: "Review the deterministic options with responsible teams.",
        recommended_option: "Review sequencing",
        options: ["review_sequencing", "explore_joint_work", "retain_schedule"].map(
          (key, index) => ({
            option_key: key,
            option_name: [
              "Review sequencing",
              "Explore joint work",
              "Retain schedule with coordination",
            ][index],
            description: "For team review",
            risk_score: null,
            estimated_duration: null,
            tradeoffs: "Confirm feasibility",
            schedule_impact: "Not assessed",
          }),
        ),
        warnings: body.use_ai
          ? ["AI explanation unavailable: quota exceeded. Showing the deterministic explanation."]
          : [],
      });
    if (path === "/api/simulate/")
      return json(route, {
        before: baseline,
        after: {
          ...baseline,
          start_date: "2026-11-20",
          end_date: "2026-11-26",
          temporal_overlap_count: 0,
          conflicts: [
            {
              ...baseline.conflicts[0],
              temporal_overlap: false,
              overlap_days: 0,
              conflict_score: 45,
            },
          ],
        },
        location_basis: "road_name",
        warnings: ["Simulation only; no schedule changes saved."],
      });
    if (path === "/api/coordination-plans/config")
      return json(route, { enabled: true, reviewer: "demo-reviewer", mode: "local_demo" });
    if (path === "/api/coordination-plans")
      return json(route, method === "POST" ? plan : [plan], method === "POST" ? 201 : 200);
    if (path.endsWith("/events"))
      return json(route, [
        {
          id: "event-created",
          event: "CREATED",
          actor: "demo-reviewer",
          revision: plan.revision,
          created_at: plan.created_at,
          details: {},
        },
      ]);
    if (path.endsWith("/approve")) {
      plan = {
        ...plan,
        status: "APPROVED",
        workplan_id: "process-workplan",
        decided_by: "demo-reviewer",
      };
      return json(route, workplan());
    }
    if (path.endsWith("/reject")) {
      plan = {
        ...plan,
        status: "REJECTED",
        decision_reason: body.reason,
        decided_by: "demo-reviewer",
      };
      return json(route, plan);
    }
    if (path === "/api/coordination-plans/process-proposal") {
      if (method === "PATCH")
        plan = { ...plan, notes: body.notes, tasks: body.tasks, revision: plan.revision + 1 };
      return json(route, plan);
    }
    if (path.startsWith("/api/workplans/")) return json(route, workplan());
    if (path === "/api/impact/")
      return json(route, {
        projects_total: 1,
        mapped_projects: 0,
        unmapped_projects: 1,
        proposal_status_counts: { DRAFT: 1 },
        workplans_generated: 0,
        task_count: 0,
        conflicts_detected: 1,
        high_severity_conflicts: 1,
        spatial_coverage: {
          road_segments: 5,
          roads_with_feature_rows: 0,
          work_orders: 10,
          geocoded_work_orders: 0,
          grievances: 20,
          geocoded_grievances: 0,
          road_repairs: 0,
          geocoded_road_repairs: 0,
          potholes: 0,
          geocoded_potholes: 0,
        },
      });
    if (path === "/api/wards/context")
      return json(route, {
        dataset: url.searchParams.get("dataset"),
        ward: url.searchParams.get("ward"),
        geographic_precision: "ward",
        record_count: 0,
      });
    throw new Error(`Unexpected API request: ${method} ${path}`);
  });
  return calls;
}
