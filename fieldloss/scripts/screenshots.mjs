import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
await mkdir(".verification", { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" });
for (const width of [375, 768, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  for (const [name, path] of [["capture", "/"], ["records", "/records"], ["benchmark", "/benchmark"]]) {
    await page.goto(`http://127.0.0.1:3000${path}`); await page.getByRole("heading", { level: 1 }).waitFor(); await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `.verification/${name}-${width}.png`, fullPage: true });
  }
  await page.goto("http://127.0.0.1:3000"); await page.getByRole("button", { name: "Enter fields manually", exact: true }).click();
  await page.getByLabel("Mass entering this stage", { exact: true }).fill("120"); await page.getByLabel("Affected or rejected mass", { exact: true }).fill("17"); await page.getByRole("button", { name: "Composted", exact: true }).click();
  await page.evaluate(() => { (document.activeElement instanceof HTMLElement) && document.activeElement.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: `.verification/review-${width}.png`, fullPage: true });
  await page.close();
}
await browser.close();
console.log("Saved capture, review, records and benchmark screenshots at 375, 768 and 1440px.");
