import { expect, test } from "@playwright/test";

test("mapping saves visibly and exposes every candidate in Data quality after reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/api/status", (route) => route.fulfill({ json: { configured: false } }));
  await page.goto("/datasets/import");
  await page.getByRole("button", { name: "Spreadsheet", exact: false }).first().click();
  await page.locator('input[type="file"]').setInputFiles({ name: "review.csv", mimeType: "text/csv", buffer: Buffer.from("commodity,country,stage,observationDate,incomingAmount,incomingUnit,affectedAmount,affectedUnit,destination\ntomatoes,FJ,transport,2026-10-04,120,kg,17,kg,composted\ntaro,FJ,handling,2026-10-03,,,5,kg,\n") });
  await page.getByRole("button", { name: "Save import & continue to map columns" }).click();
  for (const field of ["commodity", "country", "stage", "observationDate", "incomingAmount", "incomingUnit", "affectedAmount", "affectedUnit", "destination"]) {
    await page.getByLabel(`Map ${field}`, { exact: true }).selectOption(field);
  }
  await page.getByRole("button", { name: "Confirm mapping & create candidates", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Mapping saved" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm mapping & create candidates", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Mapping saved" })).toContainText("2 candidate rows");
  await page.getByRole("link", { name: "Review data quality", exact: true }).click();
  const evidence = page.getByRole("region", { name: "Evidence included in quality checks" });
  await expect(evidence.getByText("Mapped candidate", { exact: true })).toHaveCount(2);
  await expect(evidence.getByText("Needs information", { exact: true })).toHaveCount(1);
  await page.reload();
  await expect(evidence.getByText("Mapped candidate", { exact: true })).toHaveCount(2);
  await page.goto("/gaps");
  await expect(page.getByText(/Incoming quantity is missing/).first()).toBeVisible();
  await expect(page.getByText(/Destination is missing/).first()).toBeVisible();
  expect(errors.filter((error) => error.includes("same key"))).toEqual([]);
});

test("a confirmed observation remains visible in Data quality without issue cards", async ({ page }) => {
  await page.route("**/api/status", (route) => route.fulfill({ json: { configured: false } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Enter fields manually", exact: true }).click();
  await page.getByLabel("Mass entering this stage", { exact: true }).fill("120");
  await page.getByLabel("Affected or rejected mass", { exact: true }).fill("17");
  await page.getByRole("button", { name: "Composted", exact: true }).click();
  await page.getByRole("button", { name: "Confirm record", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Observation confirmed" })).toBeVisible();
  await page.goto("/quality");
  await expect(page.getByRole("region", { name: "Evidence included in quality checks" }).getByText("Confirmed observation", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "No cross-dataset issues match these filters." })).toBeVisible();
});
