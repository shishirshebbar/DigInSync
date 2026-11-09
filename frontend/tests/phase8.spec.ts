import { expect, test } from "@playwright/test";

test("save, refresh, modify, approve, reopen and reject against an isolated real backend", async ({ page, request }) => {
  const backend = process.env.E2E_API_URL;
  if (!backend) throw new Error("Run this test using the backend tests.run_browser_smoke runner, which provisions a disposable database.");
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  // Forward browser API requests to the isolated backend; no responses are mocked.
  await page.route("**/api/**", (route) => {
    const source = new URL(route.request().url());
    return route.continue({ url: backend + source.pathname + source.search });
  });
  const road = `Disposable browser test ${Date.now()}`;
  const project = { organization: "Demo telecom", project_type: "telecom", road_name: road,
    description: "Disposable Phase 8 browser test", start_date: "2026-11-12", end_date: "2026-11-18" };
  const neighborResponse = await request.post(backend + "/api/projects/", { data: project });
  expect(neighborResponse.status()).toBe(201);

  await page.goto("/");
  await page.getByRole("button", { name: "Enter project details manually" }).click();
  await page.getByLabel("Project type", { exact: true }).selectOption("water_pipeline");
  await page.getByLabel("Road name", { exact: true }).fill(road);
  await page.getByLabel("Start date", { exact: true }).fill(project.start_date);
  await page.getByLabel("End date", { exact: true }).fill(project.end_date);
  await page.getByLabel("Lane closure", { exact: true }).selectOption("1");
  await page.getByLabel("Organization", { exact: true }).fill("Demo water team");
  await page.getByLabel("Project description", { exact: true }).fill(project.description);
  const created = page.waitForResponse((response) => response.url().endsWith("/api/projects/") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Confirm & Analyze" }).click();
  const projectId = (await (await created).json()).id;
  await page.getByRole("button", { name: "Review coordination options", exact: true }).click();
  await page.getByRole("button", { name: "Prepare proposal", exact: true }).first().click();
  await expect(page).toHaveURL(/\/proposals\?plan=/);
  const proposalUrl = page.url();
  await expect(page.getByText("Viewing the saved revision.")).toBeVisible();
  await page.getByLabel(/Demo telecom · telecom/).check();
  await page.getByLabel("Coordination notes").fill("Confirmed local draft responsibilities");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page.getByLabel("Task name", { exact: true }).fill("Excavation");
  await page.getByLabel("Task notes", { exact: true }).fill("Confirm site access");
  await page.getByRole("button", { name: "Save draft revision" }).click();
  await expect(page.getByText("DRAFT · reviewed draft revision 2")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Coordination notes")).toHaveValue("Confirmed local draft responsibilities");
  await expect(page.getByLabel("Task name", { exact: true })).toHaveValue("Excavation");
  await page.getByLabel("Task name", { exact: true }).fill("Excavation and water work");
  await expect(page.getByRole("button", { name: "Approve and generate workplan" })).toBeDisabled();
  await page.getByRole("button", { name: "Save draft revision" }).click();
  await expect(page.getByText("DRAFT · reviewed draft revision 3")).toBeVisible();
  await page.getByLabel(/I reviewed the saved tasks/).check();
  await page.getByRole("button", { name: "Approve and generate workplan" }).click();
  await expect(page.getByRole("heading", { name: "Joint Workplan" })).toBeVisible();
  await expect(page.getByText("APPROVED · reviewed draft revision 3")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Excavation and water work", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Permanent workplan link" }).click();
  await expect(page).toHaveURL(/workplan=/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Joint Workplan" })).toBeVisible();
  await expect(page.getByLabel("Task name", { exact: true })).toBeDisabled();
  const unchanged = await (await request.get(backend + "/api/projects/" + projectId)).json();
  expect([unchanged.start_date, unchanged.end_date]).toEqual([project.start_date, project.end_date]);
  await page.screenshot({ path: "test-results/phase8-approved.png", fullPage: true });

  await page.getByRole("button", { name: "Prepare a new draft" }).click();
  await expect(page).not.toHaveURL(proposalUrl);
  await expect(page.getByText("DRAFT · reviewed draft revision 1")).toBeVisible();
  await page.getByLabel("Rejection reason").fill("Needs agreement from the participating teams");
  await page.getByRole("button", { name: "Reject proposal", exact: true }).click();
  await expect(page.getByText("REJECTED · reviewed draft revision 1")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Reason: Needs agreement from the participating teams")).toBeVisible();
  expect(browserErrors).toEqual([]);
});
