import { expect, test } from "@playwright/test";

const quantity = (amount: number) => ({ amount, unit: "kg", kgPerCrate: null });
const extraction = { incoming: quantity(120), affected: quantity(17), allocations: [{ destination: "composted", quantity: quantity(17) }], cause: "Bruising", measurement: "weighed", detectedContext: { country: null, commodity: "bananas", stage: null }, evidence: { incoming: "120 kg", affected: "17 kg", cause: "bruising", allocations: "composted", commodity: "bananas", stage: null } };

test("new speech clears previous suggestions before a failed extraction and reload", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [{ stop() {} }] }) as unknown as MediaStream;
    class FakeRecorder {
      static isTypeSupported() { return true; }
      state = "inactive"; ondataavailable?: (event: { data: Blob }) => void; onstop?: () => void;
      start() { this.state = "recording"; }
      stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["audio"], { type: "audio/webm" }) }); this.onstop?.(); }
    }
    window.MediaRecorder = FakeRecorder as unknown as typeof MediaRecorder;
  });
  await page.route("**/api/extract", (route) => route.fulfill({ json: { extraction: { ...extraction, detectedContext: { country: null, commodity: null, stage: null } } } }));
  await page.goto("/"); await page.getByLabel("Your observation").fill("120 kg, 17 kg bruising and composted."); await page.getByRole("button", { name: "Create draft record" }).click();
  await page.getByRole("button", { name: "Return to observation text" }).click();
  await page.unroute("**/api/extract"); await page.route("**/api/extract", (route) => route.fulfill({ status: 502, json: { error: "Extraction unavailable" } }));
  await page.route("**/api/transcribe", (route) => route.fulfill({ json: { transcript: "A different delivery: 50 kg taro, 2 kg donated." } }));
  await page.getByRole("button", { name: "Record observation", exact: true }).click(); await page.getByRole("button", { name: /Stop ·/ }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Extraction unavailable");
  await page.reload(); await page.getByRole("button", { name: "Enter fields manually", exact: true }).click();
  await expect(page.getByLabel("Mass entering this stage", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Affected or rejected mass", { exact: true })).toHaveValue("");
  await expect(page.getByText("From observation", { exact: true })).toHaveCount(0);
});

test("changing selected context invalidates the previous conflict decision", async ({ page }) => {
  await page.route("**/api/extract", (route) => route.fulfill({ json: { extraction } }));
  await page.goto("/"); await page.getByLabel("Your observation").fill("120 kg bananas, 17 kg bruising and composted."); await page.getByRole("button", { name: "Create draft record" }).click();
  await page.getByRole("button", { name: "Keep Tomatoes", exact: true }).click(); await page.getByRole("button", { name: "Return to observation text" }).click();
  await page.getByLabel("Commodity", { exact: true }).selectOption("taro"); await page.getByRole("button", { name: "Enter fields manually", exact: true }).click();
  await expect(page.getByRole("button", { name: "Keep Taro", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Confirm record", exact: true }).click(); await expect(page.getByRole("heading", { name: "Observation confirmed" })).toHaveCount(0);
});

test("manual benchmark trials cannot switch to assisted capture", async ({ page }) => {
  await page.goto("/benchmark"); await page.getByRole("button", { name: "Start manual trial" }).click();
  await expect(page.getByRole("button", { name: "Return to observation text" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create draft record" })).toHaveCount(0);
});

test("a stale tab cannot overwrite another tab's confirmed records or benchmark trials", async ({ page, context }) => {
  await page.goto("/"); const other = await context.newPage(); await other.goto("/");
  await page.getByRole("button", { name: "Enter fields manually", exact: true }).click(); await page.getByLabel("Mass entering this stage", { exact: true }).fill("120"); await page.getByLabel("Affected or rejected mass", { exact: true }).fill("17"); await page.getByRole("button", { name: "Composted", exact: true }).click(); await page.getByRole("button", { name: "Confirm record", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Observation confirmed" })).toBeVisible();
  await other.getByLabel("Your observation").fill("Another draft"); await page.goto("/records");
  await expect(page.getByText("Entered observation", { exact: true })).toHaveCount(1);
  await page.goto("/benchmark"); await page.getByRole("button", { name: "Start manual trial" }).click(); await page.getByLabel("Mass entering this stage", { exact: true }).fill("120"); await page.getByLabel("Affected or rejected mass", { exact: true }).fill("17"); await page.getByLabel("Reported cause", { exact: true }).fill("Bruising"); await page.getByLabel("How were quantities obtained?").selectOption("weighed"); await page.getByRole("button", { name: "Composted", exact: true }).click(); await page.getByRole("button", { name: "Confirm record", exact: true }).click();
  await expect(page.getByText("All checked fields match", { exact: true })).toBeVisible();
  await other.getByLabel("Your observation").fill("More words"); await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("fieldloss:v1")!).trials.length)).toBe(1);
});
