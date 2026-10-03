import { expect, test } from "@playwright/test";
import { SCENARIOS } from "../src/lib/benchmark";

test("all five paired presets produce correct manual and assisted trials without field records", async ({ page }) => {
  await page.goto("/benchmark");
  for (const [index, scenario] of SCENARIOS.entries()) {
    const measurement = ["tomato-transport", "taro-handling"].includes(scenario.id) ? "weighed" : "estimated";
    await page.getByLabel("Scenario", { exact: true }).selectOption(scenario.id);
    const modes = index % 2 === 0 ? ["manual", "assisted"] : ["assisted", "manual"];
    for (const mode of modes) {
      await page.getByRole("button", { name: `Start ${mode} trial` }).click();
      if (mode === "assisted") {
        // Test the UI with a deterministic provider boundary. These times are automation, never seeded demo claims.
        const qty = (amount: number) => ({ amount, unit: "kg", kgPerCrate: null });
        await page.route("**/api/extract", (route) => route.fulfill({ json: { extraction: { incoming: scenario.id === "banana-storage" ? null : qty(scenario.expected.incomingKg), affected: qty(scenario.expected.affectedKg), allocations: scenario.expected.allocations.map((allocation) => ({ destination: allocation.destination, quantity: qty(allocation.kg) })), cause: scenario.expected.cause, measurement: "unknown", detectedContext: { country: null, commodity: scenario.context.commodity, stage: scenario.context.stage }, evidence: { incoming: null, affected: null, cause: null, allocations: null, commodity: null, stage: null } } } }));
        await page.getByLabel("Your observation").fill(scenario.prompt);
        await page.getByRole("button", { name: "Create draft record" }).click();
      }
      await page.getByLabel("Mass entering this stage", { exact: true }).fill(String(scenario.expected.incomingKg));
      await page.getByLabel("Affected or rejected mass", { exact: true }).fill(String(scenario.expected.affectedKg));
      await page.getByLabel("Reported cause", { exact: true }).fill(scenario.expected.cause);
      await page.getByLabel("How were quantities obtained?").selectOption(measurement);
      const destination = scenario.expected.allocations[0].destination;
      await page.getByRole("button", { name: destination === "composted" ? "Composted" : destination === "donated" ? "Donated" : "Discarded", exact: true }).click();
      await page.getByRole("button", { name: "Confirm record", exact: true }).click();
      await expect(page.getByText("All checked fields match", { exact: true })).toBeVisible();
      await page.unroute("**/api/extract");
    }
  }
  await expect(page.getByText("5 / 5 paired", { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("fieldloss:v1")!));
  expect(saved.trials).toHaveLength(10); expect(saved.trials.every((trial: { correct: boolean }) => trial.correct)).toBe(true);
  expect(saved.records.filter((record: { isSample: boolean }) => !record.isSample)).toHaveLength(0);
});
