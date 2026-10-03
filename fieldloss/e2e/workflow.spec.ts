import { expect, test } from "@playwright/test";

const extraction = {
  incoming: { amount: 120, unit: "kg", kgPerCrate: null }, affected: { amount: 17, unit: "kg", kgPerCrate: null }, allocations: [], cause: "Bruising", measurement: "unknown",
  detectedContext: { country: null, commodity: "tomatoes", stage: "transport" },
  evidence: { incoming: "120 kg", affected: "17 kg", cause: "bruising", allocations: null, commodity: "tomatoes", stage: "transport" },
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/status", (route) => route.fulfill({ json: { configured: true } }));
});

test("an assisted record requires fate clarification, confirms 14.2%, and survives reload", async ({ page }) => {
  await page.route("**/api/extract", (route) => route.fulfill({ json: { extraction, issues: [] } }));
  await page.goto("/");
  await page.getByLabel("Your observation").fill("120 kg tomatoes. 17 kg rejected after transport because of bruising.");
  await page.getByRole("button", { name: "Create draft record" }).click();
  await expect(page.getByRole("heading", { name: "Review this record" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm record", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Observation confirmed" })).toHaveCount(0);
  await page.getByRole("button", { name: "Composted", exact: true }).click();
  await page.getByRole("button", { name: "Confirm record", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Observation confirmed" })).toBeVisible();
  await expect(page.getByText("14.2%", { exact: true })).toBeVisible();
  await expect(page.getByText("Review packing and handling", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Records", exact: true }).click();
  await expect(page.getByText("Entered observation", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Entered observation", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/fieldloss.*\.csv/);
});

test("API errors preserve the text and allow a zero-loss donation through manual entry", async ({ page }) => {
  await page.route("**/api/extract", (route) => route.fulfill({ status: 502, json: { error: "The AI request did not complete. Your observation is preserved." } }));
  await page.goto("/");
  await page.getByLabel("Your observation").fill("120 kg tomatoes. 17 kg bruised but donated.");
  await page.getByRole("button", { name: "Create draft record" }).click();
  await expect(page.getByLabel("Your observation")).toHaveValue("120 kg tomatoes. 17 kg bruised but donated.");
  await page.getByRole("button", { name: "Enter fields manually", exact: true }).click();
  await page.getByLabel("Mass entering this stage", { exact: true }).fill("120");
  await page.getByLabel("Affected or rejected mass", { exact: true }).fill("17");
  await page.getByRole("button", { name: "Donated", exact: true }).click();
  await page.getByRole("button", { name: "Confirm record", exact: true }).click();
  await expect(page.getByText("0.0%", { exact: true })).toBeVisible();
});

test("benchmark manual trials are graded and kept out of operational records", async ({ page }) => {
  await page.goto("/benchmark");
  await expect(page.getByText("No trials yet", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "Start manual trial" }).click();
  await page.getByLabel("Mass entering this stage", { exact: true }).fill("120");
  await page.getByLabel("Affected or rejected mass", { exact: true }).fill("17");
  await page.getByLabel("Reported cause", { exact: true }).fill("Bruising");
  await page.getByLabel("How were quantities obtained?").selectOption("weighed");
  await page.getByRole("button", { name: "Composted", exact: true }).click();
  await page.getByRole("button", { name: "Confirm record", exact: true }).click();
  await expect(page.getByText("All checked fields match", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Records", exact: true }).click();
  await expect(page.getByText("Entered observation", { exact: true })).toHaveCount(0);
});

test("the workspace has no horizontal overflow at phone, tablet and desktop widths", async ({ page }) => {
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Record observation", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
