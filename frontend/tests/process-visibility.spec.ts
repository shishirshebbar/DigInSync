import { expect, test, type Page, type Route } from "@playwright/test";
import type { Proposal, SavedProject, SimulationResult } from "../src/types";

const project: SavedProject = {
  id: "process-project", road_name: "Process Test Road", organization: "Water team", project_type: "water_pipeline",
  description: "Review the confirmed project", start_date: "2026-11-12", end_date: "2026-11-18", duration_days: 6,
  length_m: 150, lane_closure: 1, status: "PENDING", road_segment_id: null,
};
const baseline: SimulationResult = {
  start_date: project.start_date, end_date: project.end_date, duration_days: 6, conflict_count: 1,
  temporal_overlap_count: 1, has_high_severity: true, conflicts: [{ project_a_id: project.id, project_b_id: "candidate-project",
    project_a_name: "Water work", project_b_name: "Telecom work", spatial_overlap: true, temporal_overlap: true,
    overlap_days: 6, impact_overlap: true, conflict_score: 78.6, severity: "HIGH" }],
  risk_score: 48, risk_level: "MEDIUM", model_version: "fallback",
};

type Call = { path: string; method: string; body: unknown };
type Override = (route: Route, url: URL) => Promise<boolean>;
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, json: body });
function gate() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  return { wait, release };
}

async function mockApi(page: Page, override?: Override) {
  const calls: Call[] = [];
  let plan: Proposal = {
    id: "process-proposal", project_id: project.id, option_key: "review_sequencing", option_name: "Review sequencing",
    status: "DRAFT", revision: 1, created_at: "2026-11-09T10:00:00Z", description: "Review this coordination draft",
    tradeoffs: "Confirm responsibilities", notes: "Saved notes", tasks: [{ id: "task-one", task: "Water work",
      organization: "Water team", start_date: project.start_date, end_date: project.end_date, dependency: null, notes: "" }],
    project_snapshots: [project], available_projects: [], analysis_snapshot: { baseline, location_basis: "road_name", warnings: ["Road-name matching is unverified."] },
    workplan_id: null, decision_reason: null, decided_by: null, decided_at: null,
  };
  const workplan = () => ({ id: "process-workplan", coordination_plan_id: plan.id, project_id: project.id,
    tasks: plan.tasks.map((task) => ({ ...task, status: "PLANNED" })), approved_by: "demo-reviewer",
    approved_at: "2026-11-09T10:15:00Z", proposal_revision: plan.revision, warnings: ["Local demo only."] });
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    const body = route.request().postDataJSON();
    calls.push({ path, method, body });
    if (override && await override(route, url)) return;
    if (path === "/api/projects/catalog") return json(route, { items: [project], total: 1, limit: 25, offset: 0 });
    if (path === "/api/projects/extract") return json(route, project);
    if (path === "/api/projects/" && method === "POST") return json(route, { ...project, ...body }, 201);
    if (/^\/api\/projects\/[^/]+\/map$/.test(path)) return json(route, { type: "FeatureCollection", features: [
      { type: "Feature", id: project.id, geometry: null, properties: { ...project, role: "base" } },
    ], total: 1, limit: 100, offset: 0, unmapped_ids: [project.id], location_basis: "road_name", warnings: ["Road-name matching is unverified."] });
    if (/^\/api\/projects\/[^/]+$/.test(path)) return json(route, path.endsWith("other-project") ? { ...project, id: "other-project", road_name: "Other Project Road" } : project);
    if (path === "/api/roads") return json(route, { type: "FeatureCollection", features: [], total: 0, limit: 25, offset: 0 });
    if (path === "/api/conflicts/analyze") return json(route, { project_id: body.project_id, conflicts: baseline.conflicts,
      conflict_count: 1, has_high_severity: true, location_basis: "road_name", warnings: ["Road-name matching is unverified."] });
    if (path === "/api/risk/predict") return json(route, { project_id: body.project_id, risk_score: 48, risk_level: "MEDIUM", model_version: "fallback",
      experimental: true, road_segment_matched: false, historical_features_available: false,
      features_used: { road_width: 7, road_type: "3", historical_work_orders: 0, historical_road_repairs: 0,
        pothole_count: 0, grievance_count: 0, existing_projects: 1, nearby_projects: 1, project_duration: 6,
        lane_closure: 1, project_length: 150, number_of_overlapping_utilities: 1 },
      warnings: ["Model artifact unavailable; deterministic fallback used.", "Road history is unavailable; zero does not mean no incidents."] });
    if (path === "/api/coordinate/") return json(route, { project_id: project.id, llm_used: false, baseline_risk_score: 48,
      explanation: "Review the deterministic options with responsible teams.", recommended_option: "Review sequencing",
      options: ["review_sequencing", "explore_joint_work", "retain_schedule"].map((key, index) => ({ option_key: key,
        option_name: ["Review sequencing", "Explore joint work", "Retain schedule with coordination"][index], description: "For team review",
        risk_score: null, estimated_duration: null, tradeoffs: "Confirm feasibility", schedule_impact: "Not assessed" })),
      warnings: body.use_ai ? ["AI explanation unavailable: quota exceeded. Showing the deterministic explanation."] : [] });
    if (path === "/api/simulate/") return json(route, { before: baseline, after: { ...baseline, start_date: "2026-11-20", end_date: "2026-11-26",
      temporal_overlap_count: 0, conflicts: [{ ...baseline.conflicts[0], temporal_overlap: false, overlap_days: 0, conflict_score: 45 }] },
      location_basis: "road_name", warnings: ["Simulation only; no schedule changes saved."] });
    if (path === "/api/coordination-plans/config") return json(route, { enabled: true, reviewer: "demo-reviewer", mode: "local_demo" });
    if (path === "/api/coordination-plans") return json(route, method === "POST" ? plan : [plan], method === "POST" ? 201 : 200);
    if (path.endsWith("/events")) return json(route, [{ id: "event-created", event: "CREATED", actor: "demo-reviewer", revision: plan.revision,
      created_at: plan.created_at, details: {} }]);
    if (path.endsWith("/approve")) { plan = { ...plan, status: "APPROVED", workplan_id: "process-workplan", decided_by: "demo-reviewer" }; return json(route, workplan()); }
    if (path.endsWith("/reject")) { plan = { ...plan, status: "REJECTED", decision_reason: body.reason, decided_by: "demo-reviewer" }; return json(route, plan); }
    if (path === "/api/coordination-plans/process-proposal") {
      if (method === "PATCH") plan = { ...plan, notes: body.notes, tasks: body.tasks, revision: plan.revision + 1 };
      return json(route, plan);
    }
    if (path.startsWith("/api/workplans/")) return json(route, workplan());
    if (path === "/api/impact/") return json(route, { projects_total: 1, mapped_projects: 0, unmapped_projects: 1,
      proposal_status_counts: { DRAFT: 1 }, workplans_generated: 0, task_count: 0, conflicts_detected: 1, high_severity_conflicts: 1,
      spatial_coverage: { road_segments: 5, roads_with_feature_rows: 0, work_orders: 10, geocoded_work_orders: 0,
        grievances: 20, geocoded_grievances: 0, road_repairs: 0, geocoded_road_repairs: 0, potholes: 0, geocoded_potholes: 0 } });
    if (path === "/api/wards/context") return json(route, { dataset: url.searchParams.get("dataset"), ward: url.searchParams.get("ward"), geographic_precision: "ward", record_count: 0 });
    throw new Error(`Unexpected API request: ${method} ${path}`);
  });
  return calls;
}

test("tracks concurrent work, preserves conflict/risk ordering and keeps activity across navigation", async ({ page }) => {
  const conflicts = gate();
  const calls = await mockApi(page, async (route, url) => {
    if (url.pathname === "/api/conflicts/analyze") await conflicts.wait;
    return false;
  });
  await page.goto(`/projects/${project.id}`);
  const tracker = page.getByRole("region", { name: "Workflow progress" });
  await expect(tracker.getByText("Candidate conflicts", { exact: true }).locator("..")).toContainText("Running");
  await expect(tracker.getByText("Project and location", { exact: true }).locator("..")).toContainText("Completed with warnings");
  expect(calls.filter((call) => call.path === "/api/risk/predict")).toHaveLength(0);
  expect(calls.filter((call) => call.path === "/api/conflicts/analyze")).toHaveLength(1);
  await expect(tracker.getByText("Experimental indicator", { exact: true }).locator("..")).toContainText("Runs after conflict request settles");
  conflicts.release();
  await expect(page.getByRole("meter")).toBeVisible();
  await tracker.locator("summary").filter({ hasText: /^Process details/ }).click();
  await expect(tracker.locator('[data-operation="conflicts"]')).toHaveCount(1);
  expect(calls.filter((call) => call.path === "/api/risk/predict")).toHaveLength(1);
  await page.locator("summary").filter({ hasText: /^Inputs used/ }).click();
  await expect(page.getByRole("row", { name: "Road width 7 m" })).toBeVisible();
  await expect(page.getByText("Zero does not establish an absence of incidents.", { exact: false })).toBeVisible();
  await page.screenshot({ path: "test-results/process-workspace-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: "test-results/process-workspace-mobile.png", fullPage: true });
  await page.getByRole("navigation").getByRole("link", { name: "Dashboard", exact: true }).click();
  const trigger = page.getByRole("navigation").getByRole("button", { name: /^Activity/ });
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "Activity", exact: true });
  await expect(drawer.locator('[data-operation="risk"]')).toContainText("Deterministic fallback used");
  await page.screenshot({ path: "test-results/process-activity-mobile.png" });
  await page.keyboard.press("Shift+Tab");
  expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBeTruthy();
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.getByRole("navigation").getByRole("link", { name: "New project", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByLabel("Project description for AI extraction")).toBeVisible();
  await page.reload();
  await page.getByRole("navigation").getByRole("button", { name: /^Activity/ }).click();
  await expect(drawer).toContainText("No requests observed during this visit yet.");
});

test("provider rate limits allow manual entry and validation does not issue save requests", async ({ page }) => {
  const calls = await mockApi(page, async (route, url) => {
    if (url.pathname === "/api/projects/extract") { await json(route, { detail: "AI extraction rate limited." }, 429); return true; }
    return false;
  });
  await page.goto("/");
  await page.getByLabel("Project description for AI extraction").fill("Water work on Process Test Road");
  await page.getByRole("button", { name: "Analyze Project", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("manual project entry remains available");
  expect(calls.filter((call) => call.path === "/api/projects/extract")).toHaveLength(1);
  await page.getByRole("button", { name: "Enter project details manually" }).click();
  await expect(page.getByRole("region", { name: "Workflow progress" })).toContainText("Skipped · manual entry");
  await page.getByLabel("Project type", { exact: true }).selectOption("water_pipeline");
  await page.getByLabel("Road name", { exact: true }).fill(project.road_name!);
  await page.getByLabel("Start date", { exact: true }).fill(project.start_date);
  await page.getByLabel("End date", { exact: true }).fill("2026-11-10");
  await page.getByLabel("Lane closure", { exact: true }).selectOption("1");
  await page.getByLabel("Organization", { exact: true }).fill(project.organization);
  await page.getByRole("button", { name: "Confirm & Analyze" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("End date must be after start date");
  expect(calls.filter((call) => call.path === "/api/projects/")).toHaveLength(0);
  await page.getByLabel("End date", { exact: true }).fill(project.end_date);
  await page.getByRole("button", { name: "Confirm & Analyze" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}$`));
  expect(calls.filter((call) => call.path === "/api/projects/")).toEqual([{ path: "/api/projects/", method: "POST", body: {
    organization: project.organization, project_type: "water_pipeline", description: "Water work on Process Test Road",
    road_name: project.road_name, road_segment_id: null, start_date: project.start_date, end_date: project.end_date,
    length_m: null, lane_closure: 1,
  } }]);
});

test("dashboard failures stay independent and ward lookups show zero, populated and failed results", async ({ page }) => {
  let failTotals = true;
  let wardAttempt = 0;
  const ward = gate();
  const calls = await mockApi(page, async (route, url) => {
    if (url.pathname === "/api/impact/" && failTotals) { await json(route, { detail: "Totals temporarily unavailable." }, 503); return true; }
    if (url.pathname === "/api/wards/context") {
      wardAttempt += 1;
      if (wardAttempt === 1) await ward.wait;
      if (wardAttempt === 3) { await json(route, { detail: "Check the ward identifier." }, 422); return true; }
      await json(route, { dataset: url.searchParams.get("dataset"), ward: url.searchParams.get("ward"), geographic_precision: "ward", record_count: wardAttempt === 1 ? 0 : 37 });
      return true;
    }
    return false;
  });
  await page.goto("/dashboard");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Totals temporarily unavailable");
  await expect(page.getByRole("link", { name: project.road_name!, exact: true })).toBeVisible();
  const panel = page.getByRole("region", { name: "Ward dataset context" });
  await panel.getByLabel("Ward identifier").fill("101");
  await panel.getByRole("button", { name: "Look up ward records" }).click();
  await expect(panel.getByRole("button", { name: "Looking up records…" })).toBeDisabled();
  ward.release();
  await expect(panel).toContainText("No records match this identifier");
  await panel.getByLabel("Source dataset").selectOption("grievances");
  await expect(panel.getByText("0 matching record(s)")).toHaveCount(0);
  await panel.getByLabel("Ward identifier").fill("Indiranagar");
  await panel.getByRole("button", { name: "Look up ward records" }).click();
  await expect(panel).toContainText("37 matching record(s)");
  await panel.getByRole("button", { name: "Look up ward records" }).click();
  await expect(panel.getByRole("alert")).toContainText("Review the entered fields");
  await expect(panel.getByLabel("Ward identifier")).toHaveValue("Indiranagar");
  failTotals = false;
  await page.getByRole("button", { name: "Retry dashboard" }).click();
  await expect(page.getByRole("heading", { name: "Saved projects", exact: true })).toBeVisible();
  expect(calls.filter((call) => call.path === "/api/wards/context")).toHaveLength(3);
  expect(calls.every((call) => call.method === "GET")).toBeTruthy();
  await page.screenshot({ path: "test-results/process-dashboard.png", fullPage: true });
});

test("coordination fallback and read-only simulation keep existing request contracts", async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole("meter")).toBeVisible();
  await page.getByRole("button", { name: "Request AI explanation", exact: true }).click();
  await expect(page.getByText("AI explanation unavailable: quota exceeded. Showing the deterministic explanation.", { exact: true })).toBeVisible();
  expect(calls.filter((call) => call.path === "/api/coordinate/")).toEqual([{ path: "/api/coordinate/", method: "POST", body: { project_id: project.id, use_ai: true } }]);
  await page.getByRole("button", { name: "Try a schedule change" }).click();
  await page.getByLabel("New start date").fill("2026-11-20");
  await page.getByLabel("New end date").fill("2026-11-26");
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.getByRole("heading", { name: "Schedule comparison" })).toBeVisible();
  expect(calls.filter((call) => call.path === "/api/simulate/")).toEqual([{ path: "/api/simulate/", method: "POST", body: {
    base_project_id: project.id, schedule_changes: [{ project_id: project.id, new_start_date: "2026-11-20", new_end_date: "2026-11-26" }],
  } }]);
  expect(calls.filter((call) => call.path === "/api/projects/" || call.method === "PATCH")).toHaveLength(0);
  await page.getByRole("button", { name: "Prepare proposal with these dates" }).click();
  await expect(page).toHaveURL(/proposals\?plan=process-proposal/);
  await expect(page.getByRole("button", { name: "Save draft revision" })).toBeEnabled();
  expect(calls.filter((call) => call.path === "/api/coordination-plans" && call.method === "POST")).toHaveLength(1);
});

test("a confirmed draft save remains distinct from a failed refresh, and stale decisions keep edits", async ({ page }) => {
  let saved = false;
  let failRead = false;
  const calls = await mockApi(page, async (route, url) => {
    if (url.pathname === "/api/coordination-plans/process-proposal" && route.request().method() === "PATCH") { saved = true; failRead = true; return false; }
    if (url.pathname === "/api/coordination-plans/process-proposal" && failRead) { await json(route, { detail: "Refresh unavailable." }, 503); return true; }
    if (url.pathname.endsWith("/approve")) { await json(route, { detail: "Conflict analysis changed. Save and review the draft before approval." }, 409); return true; }
    return false;
  });
  await page.goto("/proposals?plan=process-proposal");
  await expect(page.getByRole("button", { name: "Save draft revision" })).toBeEnabled();
  await page.getByLabel("Coordination notes").fill("Confirmed tasks and responsibilities");
  await page.getByRole("button", { name: "Save draft revision" }).click();
  await expect(page.getByText("Draft revision 2 saved.", { exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Refresh unavailable");
  await expect(page.getByLabel("Coordination notes")).toHaveValue("Confirmed tasks and responsibilities");
  expect(saved).toBeTruthy();
  failRead = false;
  await page.getByRole("button", { name: "Reload proposal", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save draft revision" })).toBeEnabled();
  await page.getByLabel(/I reviewed the saved tasks/).check();
  await page.getByRole("button", { name: "Approve and generate workplan" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Reload the saved proposal");
  await expect(page.getByLabel("Coordination notes")).toHaveValue("Confirmed tasks and responsibilities");
  await expect(page.getByLabel(/I reviewed the saved tasks/)).not.toBeChecked();
  expect(calls.filter((call) => call.path.endsWith("/approve"))).toHaveLength(1);
});

test("lost mutation responses are not retried, and late project results stay with their project", async ({ page }) => {
  const heldRisk = gate();
  const calls = await mockApi(page, async (route, url) => {
    if (url.pathname === "/api/risk/predict" && route.request().postDataJSON().project_id === project.id) await heldRisk.wait;
    if (url.pathname.endsWith("/reject")) { await route.abort("failed"); return true; }
    return false;
  });
  await page.goto(`/projects/${project.id}`);
  await expect.poll(() => calls.filter((call) => call.path === "/api/risk/predict").length).toBe(1);
  await page.getByRole("navigation").getByRole("link", { name: "Dashboard", exact: true }).click();
  // Navigate through the client router to a different entity while the old request remains pending.
  // Supply a second saved project through the catalog, then follow its normal Next Link.
  await page.route("**/api/projects/catalog?**", (route) => json(route, { items: [{ ...project, id: "other-project", road_name: "Other Project Road" }], total: 1, limit: 25, offset: 0 }));
  await page.getByRole("button", { name: "Refresh dashboard" }).click();
  await page.getByRole("link", { name: "Other Project Road", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Other Project Road", exact: true })).toBeVisible();
  await expect(page.getByRole("meter")).toBeVisible();
  heldRisk.release();
  const tracker = page.getByRole("region", { name: "Workflow progress" });
  await tracker.locator("summary").filter({ hasText: /^Process details/ }).click();
  await expect(tracker.locator('[data-operation="risk"]')).toHaveCount(1);
  await expect(tracker.locator('[data-operation="risk"]')).toContainText("Project other-pr");
  await page.getByRole("navigation").getByRole("link", { name: "Saved proposals", exact: true }).click();
  await page.getByRole("link", { name: /Review sequencing/ }).click();
  await expect(page.getByRole("button", { name: "Save draft revision" })).toBeEnabled();
  await page.getByLabel("Rejection reason").fill("Needs further review");
  await page.getByRole("button", { name: "Reject proposal", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("result could not be confirmed");
  await expect(page.getByLabel("Rejection reason")).toHaveValue("Needs further review");
  expect(calls.filter((call) => call.path.endsWith("/reject"))).toHaveLength(1);
});

test("missing risk inputs and disabled demo review remain readable", async ({ page }) => {
  const calls = await mockApi(page, async (route, url) => {
    if (url.pathname === "/api/risk/predict") {
      await json(route, { project_id: project.id, risk_score: 32, risk_level: "MEDIUM", model_version: "model-v1",
        experimental: true, road_segment_matched: true, historical_features_available: true, warnings: [] }); return true;
    }
    if (url.pathname.endsWith("/config")) { await json(route, { enabled: false, reviewer: "demo-reviewer", mode: "local_demo" }); return true; }
    return false;
  });
  await page.goto(`/projects/${project.id}`);
  await page.locator("summary").filter({ hasText: /^Inputs used/ }).click();
  await expect(page.getByText("Input values were not returned by this server.", { exact: false })).toBeVisible();
  await page.getByRole("navigation").getByRole("link", { name: "Saved proposals", exact: true }).click();
  await page.getByRole("link", { name: /Review sequencing/ }).click();
  await expect(page.getByText("Demo editing and decisions are disabled on this server.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Coordination notes")).toBeDisabled();
  expect(calls.filter((call) => call.method !== "GET" && !["/api/conflicts/analyze", "/api/risk/predict"].includes(call.path))).toHaveLength(0);
});

test("approval is one running operation and a workplan read failure does not erase the confirmed decision", async ({ page }) => {
  const approval = gate();
  let failWorkplan = true;
  const calls = await mockApi(page, async (route, url) => {
    if (url.pathname.endsWith("/approve")) await approval.wait;
    if (url.pathname === "/api/workplans/process-workplan" && failWorkplan) {
      await json(route, { detail: "Workplan reload temporarily unavailable." }, 503); return true;
    }
    return false;
  });
  await page.goto("/proposals?plan=process-proposal");
  await expect(page.getByRole("button", { name: "Save draft revision" })).toBeEnabled();
  await page.getByLabel(/I reviewed the saved tasks/).check();
  await page.getByRole("button", { name: "Approve and generate workplan" }).click();
  const tracker = page.getByRole("region", { name: "Workflow progress" });
  await expect(tracker.getByText("Local decision", { exact: true }).locator("..")).toContainText("Running");
  await expect(tracker.getByText("Saved workplan", { exact: true }).locator("..")).toContainText("Available after approval");
  await expect(page.getByRole("heading", { name: "Joint Workplan" })).toHaveCount(0);
  approval.release();
  await expect(page.getByRole("heading", { name: "Joint Workplan" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Workplan reload temporarily unavailable");
  await expect(page.getByText("Local approval recorded and workplan generated. Original project dates unchanged.", { exact: true })).toBeVisible();
  failWorkplan = false;
  await page.getByRole("button", { name: "Reload proposal", exact: true }).click();
  await expect(tracker.getByText("Saved workplan", { exact: true }).locator("..")).toContainText("Completed with warnings");
  await tracker.locator("summary").filter({ hasText: /^Process details/ }).click();
  await expect(tracker.locator('[data-operation="approve"]')).toHaveCount(1);
  await expect(tracker.locator('[data-operation="approve"]')).toContainText("Local approval recorded for revision 1");
  expect(calls.filter((call) => call.path.endsWith("/approve"))).toEqual([{ path: "/api/coordination-plans/process-proposal/approve", method: "POST", body: { expected_revision: 1 } }]);
  expect(calls.filter((call) => call.path === "/api/projects/" || call.method === "PATCH")).toHaveLength(0);
});
