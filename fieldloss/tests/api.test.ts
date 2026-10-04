import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as extract } from "../src/app/api/extract/route";
import { POST as transcribe } from "../src/app/api/transcribe/route";
import { POST as mapSchema } from "../src/app/api/map-schema/route";
import { POST as extractDocument } from "../src/app/api/extract-document/route";

const provider = vi.hoisted(() => ({ aiConfigured: vi.fn(), extractObservation: vi.fn(), transcribeObservation: vi.fn(), suggestSchemaMappings: vi.fn(), extractDocument: vi.fn(), providerFailure: vi.fn(() => ({ error: "Provider unavailable", code: "AI_REQUEST_FAILED" })) }));
vi.mock("@/lib/openai.server", () => provider);
const context = { country: "FJ", commodity: "tomatoes", stage: "transport", date: "2026-10-04", location: "" };
const observation = { incoming: { amount: 120, unit: "kg", kgPerCrate: null }, affected: { amount: 17, unit: "kg", kgPerCrate: null }, allocations: [], cause: "Bruising", measurement: "unknown", detectedContext: { country: null, commodity: null, stage: null }, evidence: { incoming: "120 kg", affected: "17 kg", cause: "bruising", allocations: null, commodity: null, stage: null } };
const jsonRequest = (body: unknown) => new Request("http://localhost/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const audioRequest = (blob?: Blob) => { const form = new FormData(); if (blob) form.append("audio", blob, "observation.webm"); return new Request("http://localhost/api/transcribe", { method: "POST", body: form }); };
const mappingRequest = (body: unknown) => new Request("http://localhost/api/map-schema", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const imageRequest = (blob?: Blob) => { const form = new FormData(); if (blob) form.append("image", blob, "notebook.jpg"); return new Request("http://localhost/api/extract-document", { method: "POST", body: form }); };
const documentObservation = { commodity: "tomatoes", country: "FJ", region: null, location: "Sigatoka", date: "2026-09-12", stage: "transport", incoming: { amount: 180, unit: "kg", kgPerCrate: null }, affected: { amount: 22, unit: "kg", kgPerCrate: null }, allocations: [{ destination: "discarded", quantity: { amount: 22, unit: "kg", kgPerCrate: null } }], cause: "bruised", measurement: null, notes: "tomato shipment", confidenceByField: { commodity: .9 }, unresolvedFields: [] };

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
  it("returns a manual-mapping fallback when no key is configured", async () => {
    provider.aiConfigured.mockReturnValue(false);
    const body = { dataset: { datasetName: "Survey", organisation: null, country: null, reportingYear: null, sourceType: "other", notes: null }, headers: [{ id: "crop", label: "Crop" }], sampleRows: [{ crop: "Tomato" }] };
    const response = await mapSchema(mappingRequest(body));
    expect(response.status).toBe(503); expect((await response.json()).code).toBe("AI_NOT_CONFIGURED"); expect(provider.suggestSchemaMappings).not.toHaveBeenCalled();
  });
  it("returns a manual photo fallback when no key is configured", async () => {
    provider.aiConfigured.mockReturnValue(false);
    const response = await extractDocument(imageRequest(new Blob(["image"], { type: "image/jpeg" })));
    expect(response.status).toBe(503); expect((await response.json()).code).toBe("AI_NOT_CONFIGURED"); expect(provider.extractDocument).not.toHaveBeenCalled();
  });
  it("validates structured document output and rejects malformed provider responses", async () => {
    provider.extractDocument.mockResolvedValue({ observations: [documentObservation], documentWarnings: [] });
    expect((await extractDocument(imageRequest(new Blob(["image"], { type: "image/jpeg" })))).status).toBe(200);
    provider.extractDocument.mockResolvedValue({ observations: [{ ...documentObservation, allocations: "invented" }], documentWarnings: [] });
    expect((await extractDocument(imageRequest(new Blob(["image"], { type: "image/jpeg" })))).status).toBe(502);
  });
});
