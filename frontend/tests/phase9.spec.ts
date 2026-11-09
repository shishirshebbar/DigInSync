import { expect, test } from "@playwright/test";

test("road selection, map, simulation and dashboard preserve the approval workflow", async ({
  page,
  request,
}) => {
  const backend = process.env.E2E_API_URL;
  if (!backend)
    test.skip(true, "Run using python -m tests.run_browser_smoke from backend with RUN_DB_INTEGRATION=1.");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => {
    const source = new URL(route.request().url());
    return route.continue({ url: backend + source.pathname + source.search });
  });
  // Background tiles are deliberately unavailable; application responses use the real test backend.
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  const baseline = await (await request.get(backend + "/api/impact/")).json();
  const data = {
    organization: "Phase 9 telecom",
    project_type: "telecom",
    description: "Disposable map and dashboard test",
    road_name: "Browser Phase 9 Road",
    road_segment_id: "phase9-browser-road",
    start_date: "2026-11-12",
    end_date: "2026-11-18",
  };
  const neighbor = await request.post(backend + "/api/projects/", { data });
  expect(neighbor.status()).toBe(201);

  await page.goto("/projects/new");
  await page.getByLabel("Project type", { exact: true }).selectOption("water_pipeline");
  await page.getByLabel("Road name", { exact: true }).fill(data.road_name);
  await page.getByRole("button", { name: "Search imported roads" }).click();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("region", { name: /Project location map/ })).toBeVisible();
  await page.getByRole("button", { name: "Select segment", exact: true }).click();
  await expect(page.getByText(`Location selected: ${data.road_name}.`)).toBeVisible();
  await page.getByLabel("Road name", { exact: true }).fill("Road changed");
  await expect(page.getByText("No road location selected.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Select segment", exact: true }).click();
  await page.getByLabel("Start date", { exact: true }).fill(data.start_date);
  await page.getByLabel("End date", { exact: true }).fill(data.end_date);
  await page.getByLabel("Lane closure", { exact: true }).selectOption("1");
  await page.getByLabel("Organization", { exact: true }).fill("Phase 9 water");
  await page.getByLabel("Project description", { exact: true }).fill(data.description);
  await page.getByRole("button", { name: "Create project and review analysis" }).click();
  await expect(page).toHaveURL(/\/projects\/(?!new)[^/?]+$/);
  const workspaceUrl = page.url();
  const projectId = new URL(workspaceUrl).pathname.split("/").pop()!;
  await expect(page.getByRole("heading", { name: data.road_name, exact: true })).toBeVisible();
  await expect(page.getByRole("meter", { name: "Experimental risk indicator" })).toBeVisible();
  const location = page.getByRole("region", { name: "Location and candidate projects" });
  await expect(location.locator(".leaflet-overlay-pane path").first()).toBeVisible();
  await expect(location.getByText("Background tiles unavailable.", { exact: false })).toBeVisible();
  const candidate = page.getByRole("button", { name: /Phase 9 telecom · Browser Phase 9 Road/ });
  await candidate.focus();
  await page.keyboard.press("Enter");
  await expect(candidate).toHaveAttribute("aria-pressed", "true");
  await expect(
    location.locator('.leaflet-overlay-pane path[stroke="#7c3aed"]').first(),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: data.road_name, exact: true })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Project sections" })
    .getByRole("link", { name: "Schedule comparison", exact: true })
    .click();
  await page.getByLabel("New start date").fill("2026-11-20");
  await page.getByLabel("New end date").fill("2026-11-26");
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.getByRole("heading", { name: "Schedule comparison" })).toBeVisible();
  await expect(page.getByText("Decreased by 6", { exact: true })).toBeVisible();
  await expect(page.getByText("Unchanged", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/phase9-workspace.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page
    .getByRole("navigation", { name: "Project sections" })
    .getByRole("link", { name: "Analysis", exact: true })
    .click();
  await expect(page.getByRole("region", { name: /Project location map/ })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: "test-results/phase9-mobile.png", fullPage: true });
  await page
    .getByRole("navigation", { name: "Project sections" })
    .getByRole("link", { name: "Schedule comparison", exact: true })
    .click();
  await page.getByRole("button", { name: "Prepare proposal with these dates" }).click();
  await expect(page.getByText("Viewing the saved revision.")).toBeVisible();
  await page.getByRole("link", { name: "Review saved revision", exact: true }).click();
  await page.getByLabel(/I reviewed the saved tasks/).check();
  await page.getByRole("button", { name: "Approve and generate workplan" }).click();
  await expect(page.getByRole("heading", { name: "Joint Workplan" })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Overview", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Coordination overview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh overview" })).toBeEnabled();
  const metrics = await (await request.get(backend + "/api/impact/")).json();
  expect(metrics.projects_total).toBe(baseline.projects_total + 2);
  expect(metrics.mapped_projects).toBe(baseline.mapped_projects + 2);
  expect(metrics.workplans_generated).toBe(baseline.workplans_generated + 1);
  await expect(
    page
      .getByRole("heading", { name: "Saved workplans", exact: true })
      .locator("..")
      .getByText(String(metrics.workplans_generated), { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View all projects" }).click();
  await page.getByLabel("Search by road name", { exact: true }).fill(data.road_name);
  await page.getByRole("button", { name: "Search projects" }).click();
  await expect(page.getByRole("link", { name: data.road_name, exact: true })).toHaveCount(2);
  await page.screenshot({ path: "test-results/phase9-dashboard.png", fullPage: true });
  const unchanged = await (await request.get(backend + "/api/projects/" + projectId)).json();
  expect([unchanged.start_date, unchanged.end_date]).toEqual([data.start_date, data.end_date]);
  expect(unchanged.road_segment_id).toBe(data.road_segment_id);
  expect(errors).toEqual([]);
});

test("unmapped projects, empty searches and independent API retries remain usable", async ({
  page,
  request,
}) => {
  const backend = process.env.E2E_API_URL;
  if (!backend) test.skip(true, "Use the disposable browser runner.");
  let failRisk = true;
  await page.route("**/api/**", (route) => {
    const source = new URL(route.request().url());
    if (failRisk && source.pathname === "/api/risk/predict") return route.abort();
    return route.continue({ url: backend + source.pathname + source.search });
  });
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  const project = await (
    await request.post(backend + "/api/projects/", {
      data: {
        organization: "Unmapped browser",
        project_type: "utility",
        description: "Disposable unmapped test",
        road_name: "No imported road for Phase 9",
        start_date: "2026-11-12",
        end_date: "2026-11-18",
      },
    })
  ).json();
  await page.goto("/projects/" + project.id);
  await expect(page.getByText("Unmapped — location unverified", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry risk", exact: true })).toBeEnabled();
  failRisk = false;
  await page.getByRole("button", { name: "Retry risk", exact: true }).click();
  await expect(page.getByRole("meter", { name: "Experimental risk indicator" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry risk", exact: true })).toHaveCount(0);
  await page.goto("/projects");
  await page
    .getByLabel("Search by road name", { exact: true })
    .fill("Nothing matches this exact query 984729");
  await page.getByRole("button", { name: "Search projects" }).click();
  await expect(page.getByRole("heading", { name: "No projects found", exact: true })).toBeVisible();
});
