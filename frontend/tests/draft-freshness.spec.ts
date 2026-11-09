import { expect, test, type Page } from "@playwright/test";
import { baseline, gate, json, mockApi, project } from "./helpers/process-fixture";

async function unloadIsProtected(page: Page) {
  return page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
}

async function enterProject(page: Page) {
  await page.getByLabel("Organization", { exact: true }).fill("Water");
  await page.getByLabel("Project type", { exact: true }).selectOption("water_pipeline");
  await page.getByLabel("Project description", { exact: true }).fill("Road work");
  await page.getByLabel("Road name", { exact: true }).fill("Example Road");
  await page.getByLabel("Start date", { exact: true }).fill("2026-11-12");
  await page.getByLabel("End date", { exact: true }).fill("2026-11-18");
  await page.getByLabel("Lane closure", { exact: true }).selectOption("0");
}

test("unsaved project and proposal drafts remain protected across navigation until both are resolved", async ({ page }) => {
  await mockApi(page);
  await page.goto("/projects/new");
  await page.getByLabel("Organization", { exact: true }).fill("Unsaved work");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Proposals" }).click();
  await expect(page.getByRole("link", { name: "Review sequencing", exact: true })).toBeVisible();
  expect(await unloadIsProtected(page)).toBe(true);
  await page.getByRole("link", { name: "Review sequencing", exact: true }).click();
  await expect(page.getByLabel("Coordination notes")).toBeVisible();
  await page.getByLabel("Coordination notes").fill("Unsaved proposal");
  await page.getByRole("link", { name: "New project" }).click();
  await page.getByRole("button", { name: "Discard draft" }).click();
  await page.getByRole("button", { name: "Discard details" }).click();
  expect(await unloadIsProtected(page)).toBe(true);
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Proposals" }).click();
  await page.getByRole("link", { name: "Review sequencing", exact: true }).click();
  await expect(page.getByLabel("Coordination notes")).toHaveValue("Unsaved proposal");
  await page.getByRole("button", { name: "Save draft revision" }).click();
  await expect(page.getByText("Draft revision 2 saved.")).toBeVisible();
  await expect.poll(() => unloadIsProtected(page)).toBe(false);
});

for (const outcome of ["success", "failure"] as const) {
  test(`project save ${outcome} after navigating away settles the editor`, async ({ page }) => {
    const held = gate();
    const calls = await mockApi(page, async (route, url) => {
      if (url.pathname !== "/api/projects/" || route.request().method() !== "POST") return false;
      await held.wait;
      if (outcome === "success") await json(route, project, 201);
      else await json(route, { detail: "Save rejected." }, 422);
      return true;
    });
    await page.goto("/projects/new");
    await enterProject(page);
    await page.getByRole("button", { name: "Create project and review analysis" }).click();
    await expect.poll(() => calls.filter((call) => call.path === "/api/projects/").length).toBe(1);
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Overview" }).click();
    await expect(page.getByRole("heading", { name: "Coordination overview" })).toBeVisible();
    held.release();
    await page.getByRole("button", { name: /Activity/ }).click();
    const activity = page.getByRole("dialog", { name: "Activity" });
    await expect(activity.locator('[data-operation="create"]')).toContainText(
      outcome === "success" ? "Project saved." : "Save rejected.",
    );
    await page.getByRole("button", { name: "Close activity" }).click();
    await page.getByRole("link", { name: "New project" }).click();
    await expect(page.getByRole("button", { name: "Create project and review analysis" })).toBeEnabled();
    if (outcome === "success") {
      await expect(page.getByLabel("Organization", { exact: true })).toHaveValue("");
      await expect(page.getByRole("link", { name: "Open saved project" })).toHaveAttribute("href", `/projects/${project.id}`);
      expect(await unloadIsProtected(page)).toBe(false);
    } else {
      await expect(page.getByLabel("Organization", { exact: true })).toHaveValue("Water");
      await expect(page.getByRole("alert").filter({ hasText: "Save rejected." })).toBeVisible();
      expect(await unloadIsProtected(page)).toBe(true);
    }
  });
}

test("analysis refresh invalidates even an in-flight simulation until it is rerun", async ({ page }) => {
  const held = gate();
  let analyses = 0;
  let simulations = 0;
  await mockApi(page, async (route, url) => {
    if (url.pathname === "/api/conflicts/analyze") {
      analyses += 1;
      await json(route, {
        project_id: project.id,
        conflicts: analyses === 1 ? baseline.conflicts : [],
        conflict_count: analyses === 1 ? 1 : 0,
        has_high_severity: analyses === 1,
        location_basis: "road_name",
        warnings: [],
      });
      return true;
    }
    if (url.pathname === "/api/simulate/") {
      simulations += 1;
      if (simulations === 1) await held.wait;
      await json(route, { before: baseline, after: baseline, location_basis: "road_name", warnings: [] });
      return true;
    }
    return false;
  });
  await page.goto(`/projects/${project.id}?view=schedule`);
  const run = page.getByRole("button", { name: "Run simulation" });
  await expect(run).toBeEnabled();
  await run.click();
  await expect.poll(() => simulations).toBe(1);
  await page.getByRole("button", { name: "Refresh analysis" }).click();
  await expect.poll(() => analyses).toBe(2);
  held.release();
  await expect(page.getByText(/Analysis was refreshed/)).toBeVisible();
  await expect(page.getByLabel("Simulation comparison")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Prepare proposal with these dates" })).toHaveCount(0);
  await expect(run).toBeEnabled();
  await run.click();
  await expect(page.getByLabel("Simulation comparison")).toBeVisible();
  await expect(page.getByRole("button", { name: "Prepare proposal with these dates" })).toBeVisible();
  expect(simulations).toBe(2);
});

test("refreshing completed analysis preserves proposed dates but hides the old comparison", async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto(`/projects/${project.id}?view=schedule`);
  const start = page.getByLabel("New start date");
  await start.fill("2026-11-20");
  await page.getByLabel("New end date").fill("2026-11-26");
  const run = page.getByRole("button", { name: "Run simulation" });
  await expect(run).toBeEnabled();
  await run.click();
  await expect(page.getByLabel("Simulation comparison")).toBeVisible();
  await page.getByRole("button", { name: "Refresh analysis" }).click();
  await expect(page.getByText(/Analysis was refreshed/)).toBeVisible();
  await expect(page.getByLabel("Simulation comparison")).toHaveCount(0);
  await expect(start).toHaveValue("2026-11-20");
  await expect(run).toBeEnabled();
  await run.click();
  await expect(page.getByLabel("Simulation comparison")).toBeVisible();
  expect(calls.filter((call) => call.path === "/api/simulate/")).toHaveLength(2);
});
