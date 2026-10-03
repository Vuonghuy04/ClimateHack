import { expect, test } from "@playwright/test";

const quantity = (amount: number, unit = "kg", kgPerCrate: number | null = null) => ({ amount, unit, kgPerCrate });
const extraction = { incoming: quantity(120), affected: quantity(17), allocations: [], cause: "Bruising", measurement: "weighed", detectedContext: { country: null, commodity: null, stage: null }, evidence: { incoming: "120 kg", affected: "17 kg", cause: "bruising", allocations: null, commodity: null, stage: null } };

test("denied microphone access offers working manual entry", async ({ page }) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Permission denied", "NotAllowedError"); }; });
  await page.goto("/"); await page.getByRole("button", { name: "Record observation", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Microphone permission was denied");
  await page.getByRole("button", { name: "Enter fields manually", exact: true }).click();
  await expect(page.getByLabel("Mass entering this stage", { exact: true })).toBeEditable();
});

test("a voice recording automatically transcribes and extracts on stop", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [{ stop() {} }] }) as unknown as MediaStream;
    class FakeRecorder {
      static isTypeSupported(type: string) { return type === "audio/mp4"; }
      state = "inactive";
      ondataavailable?: (event: { data: Blob }) => void;
      onstop?: () => void;
      start() { this.state = "recording"; }
      stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["test audio"], { type: "audio/mp4" }) }); this.onstop?.(); }
    }
    window.MediaRecorder = FakeRecorder as unknown as typeof MediaRecorder;
  });
  await page.route("**/api/transcribe", async (route) => { expect(route.request().postDataBuffer()?.toString()).toContain("observation.mp4"); await route.fulfill({ json: { transcript: "120 kg. 17 kg rejected for bruising." } }); });
  await page.route("**/api/extract", (route) => route.fulfill({ json: { extraction } }));
  await page.goto("/"); await page.getByRole("button", { name: "Record observation", exact: true }).click();
  await page.getByRole("button", { name: /Stop ·/ }).click();
  await expect(page.getByRole("heading", { name: "Review this record" })).toBeVisible();
  await expect(page.getByLabel("Mass entering this stage", { exact: true })).toHaveValue("120");
  await page.getByRole("button", { name: "Composted", exact: true }).click();
  await page.getByRole("button", { name: "Confirm record", exact: true }).click();
  await expect(page.getByText("14.2%", { exact: true })).toBeVisible();
});

test("split destinations, duplicate clicks and draft reload preserve a single 8.3% record", async ({ page }) => {
  await page.goto("/"); await page.getByRole("button", { name: "Enter fields manually", exact: true }).click();
  await page.getByLabel("Mass entering this stage", { exact: true }).fill("120");
  await page.getByLabel("Affected or rejected mass", { exact: true }).fill("17");
  await page.getByRole("button", { name: "Composted", exact: true }).click();
  await page.getByLabel("Destination quantity 1", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Add a destination" }).click();
  await page.getByLabel("Destination 2", { exact: true }).selectOption("donated");
  await page.getByLabel("Destination quantity 2", { exact: true }).fill("7");
  await page.reload(); await expect(page.getByLabel("Destination quantity 2", { exact: true })).toHaveValue("7");
  await page.getByRole("button", { name: "Confirm record", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByText("8.3%", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("fieldloss:v1")!).records.filter((record: { isSample: boolean }) => !record.isSample).length)).toBe(1);
});

test("conflicting context must be explicitly resolved", async ({ page }) => {
  await page.route("**/api/extract", (route) => route.fulfill({ json: { extraction: { ...extraction, allocations: [{ destination: "composted", quantity: quantity(17) }], detectedContext: { country: null, commodity: "bananas", stage: "storage" } } } }));
  await page.goto("/"); await page.getByLabel("Your observation").fill("120 kg bananas entered storage. 17 kg rejected for bruising and composted."); await page.getByRole("button", { name: "Create draft record" }).click();
  await page.getByRole("button", { name: "Confirm record", exact: true }).click(); await expect(page.getByRole("main").getByRole("alert")).toContainText("different commodity");
  await page.getByRole("button", { name: "Use Bananas", exact: true }).click(); await page.getByRole("button", { name: "Use Storage", exact: true }).click();
  await page.getByRole("button", { name: "Confirm record", exact: true }).click(); await expect(page.getByRole("heading", { name: "Observation confirmed" })).toBeVisible();
  await expect(page.getByText("Bananas · Storage · Fiji", { exact: true })).toBeVisible();
});

test("all screens and the review form fit phone, tablet and desktop; focus remains visible", async ({ page }) => {
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/records", "/benchmark"]) {
      await page.goto(path); await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.goto("/"); await page.getByRole("button", { name: "Enter fields manually", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Review this record" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.goto("/"); await page.keyboard.press("Tab"); await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  expect(await page.getByRole("link", { name: "Skip to main content" }).evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");
});

test("browser storage failure never reports an unsaved record as confirmed", async ({ page }) => {
  await page.goto("/"); await page.getByRole("button", { name: "Enter fields manually", exact: true }).click();
  await page.getByLabel("Mass entering this stage", { exact: true }).fill("120"); await page.getByLabel("Affected or rejected mass", { exact: true }).fill("17"); await page.getByRole("button", { name: "Composted", exact: true }).click();
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("Quota exceeded", "QuotaExceededError"); }; });
  await page.getByRole("button", { name: "Confirm record", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Observation confirmed" })).toHaveCount(0);
  await expect(page.getByRole("alert").first()).toContainText("could not save");
  await expect(page.getByLabel("Mass entering this stage", { exact: true })).toHaveValue("120");
});
