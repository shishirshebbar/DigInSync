import { expect, test } from "@playwright/test";
import { mockApi, gate, json, project } from "./helpers/process-fixture";

test("tracks concurrent work, preserves conflict/risk ordering and keeps activity across navigation", async ({
  page,
}) => {
  const conflicts = gate();
  const calls = await mockApi(page, async (_route, url) => {
    if (url.pathname === "/api/conflicts/analyze") await conflicts.wait;
    return false;
  });
  await page.goto(`/projects/${project.id}`);
  const tracker = page.getByRole("region", { name: "Workflow progress" });
  await tracker.getByText("View process details", { exact: false }).click();
  await expect(
    tracker.getByText("Candidate conflicts", { exact: true }).locator(".."),
  ).toContainText("Running");
  await expect(
    tracker.getByText("Project and location", { exact: true }).locator(".."),
  ).toContainText("Completed with warnings");
  expect(calls.filter((call) => call.path === "/api/risk/predict")).toHaveLength(0);
  expect(calls.filter((call) => call.path === "/api/conflicts/analyze")).toHaveLength(1);
  await expect(
    tracker.getByText("Experimental indicator", { exact: true }).locator(".."),
  ).toContainText("Runs after conflict request settles");
  conflicts.release();
  await expect(page.getByRole("meter")).toBeVisible();
  await expect(tracker.locator('[data-operation="conflicts"]')).toHaveCount(1);
  expect(calls.filter((call) => call.path === "/api/risk/predict")).toHaveLength(1);
  await page.getByText("Inputs used for this indicator", { exact: true }).click();
  await expect(page.getByRole("row", { name: "Road width 7 m" })).toBeVisible();
  await page.screenshot({ path: "test-results/process-workspace-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("dialog", { name: "Navigation", exact: true })
    .getByRole("link", { name: "Overview", exact: true })
    .click();
  const trigger = page.getByRole("button", { name: /^Activity/ });
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "Activity", exact: true });
  await expect(drawer.locator('[data-operation="risk"]')).toContainText(
    "Deterministic fallback used",
  );
  await page.keyboard.press("Shift+Tab");
  expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBeTruthy();
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.getByRole("link", { name: "New project", exact: true }).first().click();
  await expect(page).toHaveURL(/\/projects\/new$/);
  await page.reload();
  await trigger.click();
  await expect(drawer).toContainText("No requests observed during this visit yet.");
});

test("provider rate limits preserve form entry and validation prevents invalid saves", async ({
  page,
}) => {
  const calls = await mockApi(page, async (route, url) => {
    if (url.pathname === "/api/projects/extract") {
      await json(route, { detail: "AI extraction rate limited." }, 429);
      return true;
    }
    return false;
  });
  await page.goto("/projects/new");
  await page.getByRole("button", { name: "Fill from a description" }).click();
  await page
    .getByLabel("Project description for AI extraction")
    .fill("Water work on Process Test Road");
  await page.getByRole("button", { name: "Review suggested details", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "manual project entry remains available",
  );
  await page.getByLabel("Project type", { exact: true }).selectOption("water_pipeline");
  await page
    .getByLabel("Project description", { exact: true })
    .fill("Water work on Process Test Road");
  await page.getByLabel("Road name", { exact: true }).fill(project.road_name!);
  await page.getByLabel("Start date", { exact: true }).fill(project.start_date);
  await page.getByLabel("End date", { exact: true }).fill("2026-11-10");
  await page.getByLabel("Lane closure", { exact: true }).selectOption("1");
  await page.getByLabel("Organization", { exact: true }).fill(project.organization);
  await page.getByRole("button", { name: "Create project and review analysis" }).click();
  await expect(page.getByRole("main").getByRole("alert").last()).toContainText(
    "End date must be after start date",
  );
  expect(calls.filter((call) => call.path === "/api/projects/")).toHaveLength(0);
  await page.getByLabel("End date", { exact: true }).fill(project.end_date);
  await page.getByRole("button", { name: "Create project and review analysis" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}$`));
  expect(calls.filter((call) => call.path === "/api/projects/")).toEqual([
    {
      path: "/api/projects/",
      method: "POST",
      body: {
        organization: project.organization,
        project_type: "water_pipeline",
        description: "Water work on Process Test Road",
        road_name: project.road_name,
        road_segment_id: null,
        start_date: project.start_date,
        end_date: project.end_date,
        length_m: null,
        lane_closure: 1,
      },
    },
  ]);
});

test("overview failures stay independent and ward lookup handles zero, populated and failed results", async ({
  page,
}) => {
  let failTotals = true;
  let wardAttempt = 0;
  const ward = gate();
  const calls = await mockApi(page, async (route, url) => {
    if (url.pathname === "/api/impact/" && failTotals) {
      await json(route, { detail: "Totals temporarily unavailable." }, 503);
      return true;
    }
    if (url.pathname === "/api/wards/context") {
      wardAttempt += 1;
      if (wardAttempt === 1) await ward.wait;
      if (wardAttempt === 3) {
        await json(route, { detail: "Check the ward identifier." }, 422);
        return true;
      }
      await json(route, {
        dataset: url.searchParams.get("dataset"),
        ward: url.searchParams.get("ward"),
        geographic_precision: "ward",
        record_count: wardAttempt === 1 ? 0 : 37,
      });
      return true;
    }
    return false;
  });
  await page.goto("/dashboard");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Totals temporarily unavailable",
  );
  await expect(page.getByRole("link", { name: project.road_name!, exact: true })).toBeVisible();
  failTotals = false;
  await page.getByRole("button", { name: "Retry overview" }).click();
  await expect(page.getByRole("heading", { name: "Saved projects", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Explore data coverage" }).click();
  const panel = page.getByRole("region", { name: "Ward dataset context" });
  await panel.getByLabel("Ward identifier").fill("101");
  await panel.getByRole("button", { name: "Look up ward records" }).click();
  await expect(panel.getByRole("button", { name: "Looking up records…" })).toBeDisabled();
  ward.release();
  await expect(panel).toContainText("No records match this identifier");
  await panel.getByLabel("Source dataset").selectOption("grievances");
  await panel.getByLabel("Ward identifier").fill("Indiranagar");
  await panel.getByRole("button", { name: "Look up ward records" }).click();
  await expect(panel).toContainText("37 matching record(s)");
  await panel.getByRole("button", { name: "Look up ward records" }).click();
  await expect(panel.getByRole("alert")).toContainText("Review the entered fields");
  await expect(panel.getByLabel("Ward identifier")).toHaveValue("Indiranagar");
  expect(calls.filter((call) => call.path === "/api/wards/context")).toHaveLength(3);
  expect(calls.every((call) => call.method === "GET")).toBeTruthy();
});

test("coordination fallback and read-only simulation preserve request contracts across sections", async ({
  page,
}) => {
  const calls = await mockApi(page);
  await page.goto(`/projects/${project.id}?view=coordination`);
  await page.getByRole("button", { name: "Request AI explanation", exact: true }).click();
  await page.getByText("Coordination limitations", { exact: false }).click();
  await expect(
    page.getByText(
      "AI explanation unavailable: quota exceeded. Showing the deterministic explanation.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(calls.filter((call) => call.path === "/api/coordinate/")).toEqual([
    { path: "/api/coordinate/", method: "POST", body: { project_id: project.id, use_ai: true } },
  ]);
  await page
    .getByRole("navigation", { name: "Project sections" })
    .getByRole("link", { name: "Schedule comparison", exact: true })
    .click();
  await page.getByLabel("New start date").fill("2026-11-20");
  await page.getByLabel("New end date").fill("2026-11-26");
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.getByRole("heading", { name: "Schedule comparison" })).toBeVisible();
  expect(calls.filter((call) => call.path === "/api/simulate/")).toEqual([
    {
      path: "/api/simulate/",
      method: "POST",
      body: {
        base_project_id: project.id,
        schedule_changes: [
          { project_id: project.id, new_start_date: "2026-11-20", new_end_date: "2026-11-26" },
        ],
      },
    },
  ]);
  await page
    .getByRole("navigation", { name: "Project sections" })
    .getByRole("link", { name: "Analysis", exact: true })
    .click();
  await expect(page.getByRole("meter")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Project sections" })
    .getByRole("link", { name: "Schedule comparison", exact: true })
    .click();
  await expect(page.getByLabel("New start date")).toHaveValue("2026-11-20");
  expect(calls.filter((call) => call.path === "/api/conflicts/analyze")).toHaveLength(1);
  expect(
    calls.filter((call) => call.path === "/api/projects/" || call.method === "PATCH"),
  ).toHaveLength(0);
  await page.getByRole("button", { name: "Prepare proposal with these dates" }).click();
  await expect(page).toHaveURL(/proposals\/process-proposal/);
  await expect(page.getByRole("button", { name: "Save draft revision" })).toBeEnabled();
  expect(
    calls.filter((call) => call.path === "/api/coordination-plans" && call.method === "POST"),
  ).toHaveLength(1);
});

test("confirmed saves survive failed refresh and stale decisions preserve saved content", async ({
  page,
}) => {
  let failRead = false;
  const calls = await mockApi(page, async (route, url) => {
    if (
      url.pathname === "/api/coordination-plans/process-proposal" &&
      route.request().method() === "PATCH"
    ) {
      failRead = true;
      return false;
    }
    if (url.pathname === "/api/coordination-plans/process-proposal" && failRead) {
      await json(route, { detail: "Refresh unavailable." }, 503);
      return true;
    }
    if (url.pathname.endsWith("/approve")) {
      await json(
        route,
        { detail: "Conflict analysis changed. Save and review the draft before approval." },
        409,
      );
      return true;
    }
    return false;
  });
  await page.goto("/proposals?plan=process-proposal");
  await expect(page.getByRole("button", { name: "Save draft revision" })).toBeEnabled();
  await page.getByLabel("Coordination notes").fill("Confirmed tasks and responsibilities");
  await page.getByRole("button", { name: "Save draft revision" }).click();
  await expect(page.getByText("Draft revision 2 saved.", { exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Refresh unavailable");
  await expect(page.getByLabel("Coordination notes")).toHaveValue(
    "Confirmed tasks and responsibilities",
  );
  failRead = false;
  await page.getByRole("button", { name: "Reload proposal", exact: true }).click();
  await page.getByRole("link", { name: "Review saved revision", exact: true }).click();
  await page.getByLabel(/I reviewed the saved tasks/).check();
  await page.getByRole("button", { name: "Approve and generate workplan" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Reload the saved proposal",
  );
  await expect(page.getByLabel(/I reviewed the saved tasks/)).not.toBeChecked();
  await page
    .getByRole("navigation", { name: "Proposal sections" })
    .getByRole("link", { name: "Draft", exact: true })
    .click();
  await expect(page.getByLabel("Coordination notes")).toHaveValue(
    "Confirmed tasks and responsibilities",
  );
  expect(calls.filter((call) => call.path.endsWith("/approve"))).toHaveLength(1);
});

test("lost mutation responses are not retried and late results stay with their project", async ({
  page,
}) => {
  const heldRisk = gate();
  const calls = await mockApi(page, async (route, url) => {
    if (
      url.pathname === "/api/risk/predict" &&
      route.request().postDataJSON().project_id === project.id
    )
      await heldRisk.wait;
    if (url.pathname.endsWith("/reject")) {
      await route.abort("failed");
      return true;
    }
    return false;
  });
  await page.goto(`/projects/${project.id}`);
  await expect.poll(() => calls.filter((call) => call.path === "/api/risk/predict").length).toBe(1);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Overview", exact: true })
    .click();
  await page.route("**/api/projects/catalog?**", (route) =>
    json(route, {
      items: [{ ...project, id: "other-project", road_name: "Other Project Road" }],
      total: 1,
      limit: 25,
      offset: 0,
    }),
  );
  await page.getByRole("button", { name: "Refresh overview" }).click();
  await page.getByRole("link", { name: "Other Project Road", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Other Project Road", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("meter")).toBeVisible();
  heldRisk.release();
  const tracker = page.getByRole("region", { name: "Workflow progress" });
  await tracker.getByText("View process details", { exact: false }).click();
  await expect(tracker.locator('[data-operation="risk"]')).toHaveCount(1);
  await expect(tracker.locator('[data-operation="risk"]')).toContainText("Project other-pr");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Proposals", exact: true })
    .click();
  await page.getByRole("link", { name: "Review sequencing", exact: true }).click();
  await page.getByRole("link", { name: "Review saved revision" }).click();
  await page.getByRole("button", { name: "Reject proposal", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Reject proposal", exact: true });
  await dialog.getByLabel("Rejection reason").fill("Needs further review");
  await dialog.getByRole("button", { name: "Record rejection", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("result could not be confirmed");
  await expect(dialog.getByLabel("Rejection reason")).toHaveValue("Needs further review");
  expect(calls.filter((call) => call.path.endsWith("/reject"))).toHaveLength(1);
});

test("missing risk inputs and disabled demo review remain readable without editing controls", async ({
  page,
}) => {
  const calls = await mockApi(page, async (route, url) => {
    if (url.pathname === "/api/risk/predict") {
      await json(route, {
        project_id: project.id,
        risk_score: 32,
        risk_level: "MEDIUM",
        model_version: "model-v1",
        experimental: true,
        road_segment_matched: true,
        historical_features_available: true,
        warnings: [],
      });
      return true;
    }
    if (url.pathname.endsWith("/config")) {
      await json(route, { enabled: false, reviewer: "demo-reviewer", mode: "local_demo" });
      return true;
    }
    return false;
  });
  await page.goto(`/projects/${project.id}`);
  await page.getByText("Inputs used for this indicator", { exact: true }).click();
  await expect(
    page.getByText("Input values were not returned by this server.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Proposals", exact: true })
    .click();
  await page.getByRole("link", { name: "Review sequencing", exact: true }).click();
  await expect(
    page.getByText("Demo editing and decisions are disabled on this server.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saved proposal review" })).toBeVisible();
  await expect(page.getByLabel("Coordination notes")).toHaveCount(0);
  expect(
    calls.filter(
      (call) =>
        call.method !== "GET" &&
        !["/api/conflicts/analyze", "/api/risk/predict"].includes(call.path),
    ),
  ).toHaveLength(0);
});

test("approval is one observed operation and failed workplan reads retain the confirmed decision", async ({
  page,
}) => {
  const approval = gate();
  let failWorkplan = true;
  const calls = await mockApi(page, async (route, url) => {
    if (url.pathname.endsWith("/approve")) await approval.wait;
    if (url.pathname === "/api/workplans/process-workplan" && failWorkplan) {
      await json(route, { detail: "Workplan reload temporarily unavailable." }, 503);
      return true;
    }
    return false;
  });
  await page.goto("/proposals/process-proposal?view=review");
  await page.getByLabel(/I reviewed the saved tasks/).check();
  await page.getByRole("button", { name: "Approve and generate workplan" }).click();
  const tracker = page.getByRole("region", { name: "Workflow progress" });
  await tracker.getByText("View process details", { exact: false }).click();
  await expect(tracker.getByText("Local decision", { exact: true }).locator("..")).toContainText(
    "Running",
  );
  await expect(tracker.getByText("Saved workplan", { exact: true }).locator("..")).toContainText(
    "Available after approval",
  );
  approval.release();
  await expect(page.getByRole("heading", { name: "Joint Workplan" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Workplan reload temporarily unavailable",
  );
  await expect(
    page.getByText(
      "Local approval recorded and workplan generated. Original project dates unchanged.",
      { exact: true },
    ),
  ).toBeVisible();
  failWorkplan = false;
  await page.getByRole("button", { name: "Reload proposal", exact: true }).click();
  await expect(tracker.getByText("Saved workplan", { exact: true }).locator("..")).toContainText(
    "Completed with warnings",
  );
  expect(calls.filter((call) => call.path.endsWith("/approve"))).toEqual([
    {
      path: "/api/coordination-plans/process-proposal/approve",
      method: "POST",
      body: { expected_revision: 1 },
    },
  ]);
  expect(
    calls.filter((call) => call.path === "/api/projects/" || call.method === "PATCH"),
  ).toHaveLength(0);
});
