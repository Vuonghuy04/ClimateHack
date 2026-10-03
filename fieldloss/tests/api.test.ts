import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as extract } from "../src/app/api/extract/route";
import { POST as transcribe } from "../src/app/api/transcribe/route";

const provider = vi.hoisted(() => ({ aiConfigured: vi.fn(), extractObservation: vi.fn(), transcribeObservation: vi.fn(), providerFailure: vi.fn(() => ({ error: "Provider unavailable", code: "AI_REQUEST_FAILED" })) }));
vi.mock("@/lib/openai.server", () => provider);
const context = { country: "FJ", commodity: "tomatoes", stage: "transport", date: "2026-10-04", location: "" };
const observation = { incoming: { amount: 120, unit: "kg", kgPerCrate: null }, affected: { amount: 17, unit: "kg", kgPerCrate: null }, allocations: [], cause: "Bruising", measurement: "unknown", detectedContext: { country: null, commodity: null, stage: null }, evidence: { incoming: "120 kg", affected: "17 kg", cause: "bruising", allocations: null, commodity: null, stage: null } };
const jsonRequest = (body: unknown) => new Request("http://localhost/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const audioRequest = (blob?: Blob) => { const form = new FormData(); if (blob) form.append("audio", blob, "observation.webm"); return new Request("http://localhost/api/transcribe", { method: "POST", body: form }); };

beforeEach(() => { vi.clearAllMocks(); provider.aiConfigured.mockReturnValue(true); });
afterEach(() => vi.restoreAllMocks());
describe("server boundary validation", () => {
  it("rejects empty text and unsupported context without calling the AI provider", async () => {
    for (const body of [{ transcript: "", context }, { transcript: "Observation", context: { ...context, commodity: "rice" } }]) expect((await extract(jsonRequest(body))).status).toBe(422);
    expect(provider.extractObservation).not.toHaveBeenCalled();
  });
  it("returns a manual fallback when no key is configured", async () => {
    provider.aiConfigured.mockReturnValue(false);
    const response = await extract(jsonRequest({ transcript: "120 kg", context }));
    expect(response.status).toBe(503); expect((await response.json()).code).toBe("AI_NOT_CONFIGURED"); expect(provider.extractObservation).not.toHaveBeenCalled();
  });
  it("returns missing destination issues with a structured draft", async () => {
    provider.extractObservation.mockResolvedValue(observation);
    const response = await extract(jsonRequest({ transcript: "120 kg, 17 kg bruising", context }));
    expect(response.status).toBe(200); const data = await response.json(); expect(data.extraction.affected.amount).toBe(17); expect(data.issues.some((issue: { field: string }) => issue.field === "allocations")).toBe(true);
  });
  it("rejects malformed provider output safely", async () => {
    provider.extractObservation.mockResolvedValue({ ...observation, incoming: "not a quantity" });
    expect((await extract(jsonRequest({ transcript: "Observation", context }))).status).toBe(502);
  });
  it("rejects empty and unsupported audio before calling transcription", async () => {
    expect((await transcribe(audioRequest())).status).toBe(422);
    expect((await transcribe(audioRequest(new Blob(["x"], { type: "image/png" })))).status).toBe(415);
    expect(provider.transcribeObservation).not.toHaveBeenCalled();
  });
  it("returns empty-speech clarification and trims a real transcript", async () => {
    provider.transcribeObservation.mockResolvedValue("  ");
    expect((await transcribe(audioRequest(new Blob(["audio"], { type: "audio/webm" })))).status).toBe(422);
    provider.transcribeObservation.mockResolvedValue("  120 kg tomatoes.  ");
    expect(await (await transcribe(audioRequest(new Blob(["audio"], { type: "audio/webm" })))).json()).toEqual({ transcript: "120 kg tomatoes." });
  });
});
