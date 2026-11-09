import { expect, test, type Page } from "@playwright/test";

const details = {
  organization: "Water team",
  project_type: "water_pipeline",
  description: "Replace a water pipeline",
  road_name: "80 Feet Road",
  start_date: "2026-11-12",
  end_date: "2026-11-18",
  length_m: null,
  lane_closure: 0,
};
const roads = [1, 2, 3, 4].map((number) => ({
  type: "Feature",
  id: `preview-road-${number}`,
  geometry: {
    type: "LineString",
    coordinates: [
      [77.64, 12.97],
      [77.641 + number * 0.001, 12.971],
    ],
  },
  properties: {
    road_name: "80 Feet Road",
    road_type: "secondary",
    osm_id: String(1000 + number),
    length_m: 200 + number,
  },
}));

async function setup(page: Page) {
  const saves: unknown[] = [];
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/projects/extract")
      return route.fulfill({ json: { ...details, organization: null } });
    if (url.pathname === "/api/roads") {
      const offset = Number(url.searchParams.get("offset") ?? 0);
      return route.fulfill({
        json: {
          type: "FeatureCollection",
          features: url.searchParams.has("bbox") ? [] : roads.slice(offset, offset + 3),
          total: url.searchParams.has("bbox") ? 0 : 4,
          limit: 3,
          offset,
        },
      });
    }
    if (url.pathname === "/api/projects/" && route.request().method() === "POST") {
      saves.push(route.request().postDataJSON());
      return route.fulfill({
        status: 201,
        json: { ...details, id: "field-test-project", duration_days: 6, status: "PENDING" },
      });
    }
    if (url.pathname === "/api/projects/field-test-project")
      return route.fulfill({
        json: { ...details, id: "field-test-project", duration_days: 6, status: "PENDING" },
      });
    if (url.pathname.endsWith("/map"))
      return route.fulfill({
        json: {
          type: "FeatureCollection",
          features: [],
          total: 0,
          limit: 100,
          offset: 0,
          unmapped_ids: [],
          location_basis: "road_name",
          warnings: [],
        },
      });
    if (url.pathname === "/api/conflicts/analyze")
      return route.fulfill({
        json: {
          project_id: "field-test-project",
          conflict_count: 0,
          conflicts: [],
          has_high_severity: false,
          location_basis: "road_name",
          warnings: [],
        },
      });
    if (url.pathname === "/api/risk/predict")
      return route.fulfill({
        json: {
          project_id: "field-test-project",
          risk_score: 20,
          risk_level: "LOW",
          model_version: "fallback",
          experimental: true,
          road_segment_matched: false,
          historical_features_available: false,
          warnings: [],
        },
      });
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  await page.goto("/projects/new");
  return saves;
}

async function enterDetails(page: Page) {
  await page.getByLabel("Project type", { exact: true }).selectOption(details.project_type);
  await page.getByLabel("Road name", { exact: true }).fill(details.road_name);
  await page.getByLabel("Start date", { exact: true }).fill(details.start_date);
  await page.getByLabel("End date", { exact: true }).fill(details.end_date);
  await page.getByLabel("Lane closure", { exact: true }).selectOption("0");
  await page.getByLabel("Project description", { exact: true }).fill(details.description);
}

test("required markers and blur validation preserve accessible labels and focus the first missing field", async ({
  page,
}) => {
  const saves = await setup(page);
  const form = page.getByRole("form", { name: "Project details", exact: true });
  await expect(form.locator("label .required-marker")).toHaveCount(7);
  await expect(form.locator("[required]")).toHaveCount(7);
  await expect(page.getByLabel("Length (metres)", { exact: true })).not.toHaveAttribute("required");
  const organization = page.getByLabel("Organization", { exact: true });
  await expect(organization).toHaveAttribute("aria-invalid", "false");
  await organization.focus();
  await page.keyboard.press("Tab");
  await expect(organization).toHaveAttribute("aria-invalid", "true");
  await expect(organization).toHaveAccessibleDescription("Organization is required.");
  await expect(organization).toHaveCSS("border-color", "rgb(185, 28, 28)");
  await organization.fill("   ");
  await expect(organization).toHaveAttribute("aria-invalid", "true");
  await organization.fill(details.organization);
  await expect(organization).toHaveAttribute("aria-invalid", "false");
  await expect(form.getByText("Organization is required.", { exact: true })).toHaveCount(0);
  await form.getByRole("button", { name: "Create project and review analysis" }).click();
  await expect(page.getByLabel("Project type", { exact: true })).toBeFocused();
  await expect(form.locator('[aria-invalid="true"]')).toHaveCount(6);
  await expect(organization).toHaveValue(details.organization);
  expect(saves).toEqual([]);
});

test("date and length errors clear when corrected, organization is mandatory, and lane closure zero saves unchanged", async ({
  page,
}) => {
  const saves = await setup(page);
  await enterDetails(page);
  const form = page.getByRole("form", { name: "Project details", exact: true });
  const end = page.getByLabel("End date", { exact: true });
  const length = page.getByLabel("Length (metres)", { exact: true });
  const organization = page.getByLabel("Organization", { exact: true });
  await organization.fill(details.organization);
  await end.fill("2026-11-10");
  await length.fill("0");
  await form.getByRole("button", { name: "Create project and review analysis" }).click();
  await expect(end).toBeFocused();
  await expect(end).toHaveAccessibleDescription("End date must be after start date.");
  await expect(length).toHaveAccessibleDescription("Length must be a positive number.");
  await end.fill(details.end_date);
  await expect(end).toHaveAttribute("aria-invalid", "false");
  await length.clear();
  await expect(length).toHaveAttribute("aria-invalid", "false");
  await expect(page.getByLabel("Lane closure", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "false",
  );
  await organization.clear();
  await expect(organization).toHaveAttribute("aria-invalid", "true");
  await expect(form.getByRole("alert")).toHaveText("Organization is required.");
  expect(saves).toEqual([]);
  await form.screenshot({ path: "test-results/required-fields-desktop.png" });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await form.screenshot({ path: "test-results/required-fields-mobile.png" });
  await organization.fill(`  ${details.organization}  `);
  await expect(form.getByRole("alert")).toHaveCount(0);
  await organization.press("Enter");
  await expect(page).toHaveURL(/\/projects\/field-test-project$/);
  expect(saves).toEqual([{ ...details, road_segment_id: null }]);
});

test("AI extraction leaves missing organization untouched until blur or submit", async ({
  page,
}) => {
  const saves = await setup(page);
  await page.getByRole("button", { name: "Fill from a description" }).click();
  await page
    .getByLabel("Project description for AI extraction")
    .fill("Replace a pipeline on 80 Feet Road");
  await page.getByRole("button", { name: "Review suggested details", exact: true }).click();
  await page.getByRole("button", { name: "Apply selected suggestions", exact: true }).click();
  const organization = page.getByLabel("Organization", { exact: true });
  await expect(organization).toHaveValue("");
  await expect(organization).toHaveAttribute("aria-required", "true");
  await expect(organization).toHaveAttribute("aria-invalid", "false");
  await page.getByRole("button", { name: "Create project and review analysis" }).click();
  await expect(organization).toBeFocused();
  await expect(organization).toHaveAccessibleDescription("Organization is required.");
  await expect(page.getByLabel("Road name", { exact: true })).toHaveValue(details.road_name);
  expect(saves).toEqual([]);
});

test("road previews expand beneath the chosen row and remain separate from selection and pagination", async ({
  page,
}) => {
  const saves = await setup(page);
  await page.getByLabel("Road name", { exact: true }).fill(details.road_name);
  const picker = page.getByRole("region", { name: "Optional road location", exact: true });
  await picker.getByRole("button", { name: "Search imported roads" }).click();
  const rows = picker.locator("ul > li");
  await expect(rows).toHaveCount(3);
  const second = rows.filter({ hasText: "OSM way 1002" });
  await second.getByRole("button", { name: "Preview", exact: true }).focus();
  await page.keyboard.press("Enter");
  const preview = second.getByRole("region", {
    name: "Road preview for 80 Feet Road",
    exact: true,
  });
  await expect(preview.getByRole("region", { name: /Project location map/ })).toBeVisible();
  const hide = second.getByRole("button", { name: "Hide preview", exact: true });
  await expect(hide).toHaveAttribute("aria-expanded", "true");
  expect(await hide.getAttribute("aria-controls")).toBe(await preview.getAttribute("id"));
  await expect(picker.getByText("No road location selected.", { exact: false })).toBeVisible();
  const third = rows.filter({ hasText: "OSM way 1003" });
  const previewBounds = await preview.boundingBox();
  const thirdBounds = await third.boundingBox();
  expect(previewBounds!.y + previewBounds!.height).toBeLessThan(thirdBounds!.y);
  const first = rows.filter({ hasText: "OSM way 1001" });
  await first.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(second.getByRole("region", { name: /Road preview for/ })).toHaveCount(0);
  await expect(first.getByRole("region", { name: /Project location map/ })).toBeVisible();
  await expect(picker.getByRole("region", { name: /Project location map/ })).toHaveCount(1);
  await first.getByRole("button", { name: "Hide preview", exact: true }).click();
  await expect(picker.getByRole("region", { name: /Project location map/ })).toHaveCount(0);
  await third.getByRole("button", { name: "Select segment", exact: true }).click();
  await expect(third.getByRole("region", { name: /Project location map/ })).toBeVisible();
  await expect(
    picker.getByText("Location selected: 80 Feet Road.", { exact: false }),
  ).toBeVisible();
  await picker.getByRole("button", { name: "Next roads", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("OSM way 1004");
  await expect(picker.getByRole("region", { name: /Project location map/ })).toHaveCount(0);
  await expect(
    picker.getByText("Location selected: 80 Feet Road.", { exact: false }),
  ).toBeVisible();
  await picker.getByRole("button", { name: "Previous roads", exact: true }).click();
  await expect(rows).toHaveCount(3);
  await second.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(preview.getByRole("region", { name: /Project location map/ })).toBeVisible();
  await picker.screenshot({ path: "test-results/inline-road-preview-desktop.png" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await picker.screenshot({ path: "test-results/inline-road-preview-mobile.png" });
  await picker.getByRole("button", { name: "Search imported roads", exact: true }).click();
  await expect(second.getByRole("button", { name: "Preview", exact: true })).toBeEnabled();
  await expect(picker.getByRole("region", { name: /Project location map/ })).toHaveCount(0);
  expect(saves).toEqual([]);
});
