import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockApi, json, project } from "./helpers/process-fixture";

test("overview and responsive shell prioritize saved work with consistent navigation", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Coordination overview", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh overview" })).toBeEnabled();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await page.screenshot({ path: `test-results/redesign-overview-${width}.png`, fullPage: true });
  }
  const menu = page.getByRole("button", { name: "Open navigation" });
  await menu.click();
  const dialog = page.getByRole("dialog", { name: "Navigation", exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await menu.click();
  await dialog.getByRole("link", { name: "Projects", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("link", { name: project.road_name!, exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("manual details survive internal navigation and AI suggestions never silently replace them", async ({
  page,
}) => {
  const calls = await mockApi(page);
  await page.goto("/projects/new");
  await page.getByLabel("Organization", { exact: true }).fill("My confirmed team");
  await page.getByLabel("Road name", { exact: true }).fill("My confirmed road");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Overview", exact: true })
    .click();
  await page.getByRole("link", { name: "New project", exact: true }).first().click();
  await expect(page.getByLabel("Organization", { exact: true })).toHaveValue("My confirmed team");
  await page.getByRole("button", { name: "Fill from a description" }).click();
  await page
    .getByLabel("Project description for AI extraction")
    .fill("Water work on Process Test Road");
  await page.getByRole("button", { name: "Review suggested details", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Review suggested details", exact: true });
  await expect(dialog.getByRole("checkbox", { name: /^Organization/ })).not.toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /^Road name/ })).not.toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /^Start date/ })).toBeChecked();
  await dialog.getByRole("button", { name: "Apply selected suggestions" }).click();
  await expect(page.getByLabel("Organization", { exact: true })).toHaveValue("My confirmed team");
  await expect(page.getByLabel("Road name", { exact: true })).toHaveValue("My confirmed road");
  await expect(page.getByLabel("Start date", { exact: true })).toHaveValue(project.start_date);
  expect(calls.filter((call) => call.path === "/api/projects/")).toHaveLength(0);
  await page.getByRole("button", { name: "Discard draft", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Discard project draft?" })
    .getByRole("button", { name: "Keep editing" })
    .click();
  await expect(page.getByLabel("Organization", { exact: true })).toHaveValue("My confirmed team");
  await page.getByRole("button", { name: "Discard draft", exact: true }).click();
  await page.getByRole("button", { name: "Discard details", exact: true }).click();
  await expect(page.getByLabel("Organization", { exact: true })).toHaveValue("");
});

test("unsaved proposal edits persist across routes while Review uses saved content", async ({
  page,
}) => {
  const calls = await mockApi(page);
  await page.goto("/proposals/process-proposal");
  await expect(page.getByRole("button", { name: "Save draft revision" })).toBeEnabled();
  await page.getByLabel("Coordination notes").fill("Unsaved local agreement");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Projects", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Proposals", exact: true })
    .click();
  await page.getByRole("link", { name: "Review sequencing", exact: true }).click();
  await expect(page.getByLabel("Coordination notes")).toHaveValue("Unsaved local agreement");
  await page.getByRole("link", { name: "Review saved revision" }).click();
  await expect(page.getByText("Saved notes", { exact: true })).toBeVisible();
  await expect(page.getByLabel(/I reviewed the saved tasks/)).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reject proposal", exact: true })).toBeDisabled();
  await page
    .getByRole("navigation", { name: "Proposal sections" })
    .getByRole("link", { name: "Draft", exact: true })
    .click();
  await expect(page.getByLabel("Coordination notes")).toHaveValue("Unsaved local agreement");
  expect(
    calls.filter((call) => call.method === "PATCH" || call.path.endsWith("/approve")),
  ).toHaveLength(0);
});

test("task validation catches missing fields and dependency cycles before saving", async ({
  page,
}) => {
  const calls = await mockApi(page);
  await page.goto("/proposals/process-proposal");
  await expect(page.getByRole("button", { name: "Add task", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page.getByRole("button", { name: "Save draft revision" }).click();
  await expect(page.getByLabel("Task name", { exact: true }).last()).toBeFocused();
  await expect(page.getByLabel("Task name", { exact: true }).last()).toHaveAccessibleDescription(
    "Task name is required.",
  );
  await page.getByLabel("Task name", { exact: true }).last().fill("Second task");
  await page.getByLabel("Depends on").last().selectOption("task-one");
  await expect(page.getByLabel("Depends on").last()).toHaveAccessibleDescription(
    "The dependency must finish before this task starts.",
  );
  await page.locator("details.task-editor").first().locator("summary").click();
  const secondId = await page.locator("details.task-editor").last().getAttribute("data-task-id");
  await page.getByLabel("Depends on").first().selectOption(secondId!);
  await page.getByRole("button", { name: "Save draft revision" }).click();
  await expect(page.getByLabel("Depends on").first()).toHaveAccessibleDescription(
    "Task dependencies cannot form a cycle.",
  );
  expect(calls.filter((call) => call.method === "PATCH")).toHaveLength(0);
});

test("legacy workplan links resolve to readable documents without editing controls", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/proposals?plan=process-proposal&workplan=process-workplan");
  await expect(page).toHaveURL(/\/workplans\/process-workplan$/);
  await expect(page.getByRole("heading", { name: "Joint Workplan", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Water work", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.screenshot({ path: "test-results/redesign-workplan-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await expect(page.getByText("Water work", { exact: true }).last()).toBeVisible();
  await page.screenshot({ path: "test-results/redesign-workplan-mobile.png", fullPage: true });
});

test("main views pass automated accessibility checks and responsive layout checks", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await mockApi(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const screens = [
    ["/", "Coordination overview", "overview"],
    ["/projects", "Projects", "projects"],
    ["/projects/new", "New project", "entry"],
    [`/projects/${project.id}`, project.road_name!, "analysis"],
    ["/proposals", "Proposals", "proposals"],
    ["/proposals/process-proposal?view=review", "Review sequencing", "review"],
    ["/data-context", "Data context", "data"],
  ];
  for (const [url, heading, name] of screens) {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: heading, exact: true }).first()).toBeVisible();
    await expect(page.getByRole("main").getByText(/^Loading/)).toHaveCount(0);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations, `${name} at ${width}px`).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        name,
      ).toBeTruthy();
      await page.screenshot({ path: `test-results/redesign-${name}-${width}.png`, fullPage: true });
    }
  }
  expect(errors).toEqual([]);
});

test("proposal status filters describe only returned recent records", async ({ page }) => {
  await mockApi(page, async (route, url) => {
    if (url.pathname === "/api/coordination-plans") {
      await json(route, [
        {
          id: "a",
          project_id: project.id,
          option_name: "Draft sequencing",
          revision: 1,
          status: "DRAFT",
          created_at: "2026-11-09T10:00:00Z",
        },
        {
          id: "b",
          project_id: project.id,
          option_name: "Approved sequencing",
          revision: 2,
          status: "APPROVED",
          created_at: "2026-11-09T10:00:00Z",
        },
      ]);
      return true;
    }
    return false;
  });
  await page.goto("/proposals");
  await page.getByLabel("Status", { exact: true }).selectOption("APPROVED");
  await expect(
    page.getByRole("link", { name: "Approved sequencing", exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Draft sequencing", exact: true })).toHaveCount(0);
  await expect(page.getByText("Up to 100 recent proposals.", { exact: false })).toBeVisible();
});
