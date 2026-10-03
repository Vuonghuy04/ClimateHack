import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { extractObservation, transcribeObservation, providerFailure } from "../src/lib/openai.server";

const context = { country: "FJ", commodity: "tomatoes", stage: "transport", date: "2026-10-04", location: "Suva" } as const;
const output = { incoming: { amount: 120, unit: "kg", kgPerCrate: null }, affected: { amount: 17, unit: "kg", kgPerCrate: null }, allocations: [], cause: "Bruising", measurement: "unknown", detectedContext: { country: null, commodity: null, stage: null }, evidence: { incoming: "120 kg", affected: "17 kg", cause: "bruising", allocations: null, commodity: null, stage: null } };
beforeEach(() => { vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder"); vi.stubEnv("OPENAI_EXTRACTION_MODEL", "gpt-4.1-mini"); vi.stubEnv("OPENAI_TRANSCRIPTION_MODEL", "gpt-4o-mini-transcribe"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("uses the installed SDK strict Responses format and parses its real response envelope", async () => {
  let body: Record<string, any> = {};
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init); expect(request.url).toBe("https://api.openai.com/v1/responses"); body = await request.json();
    return Response.json({ id: "resp_test", object: "response", created_at: 0, status: "completed", output: [{ id: "msg_test", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }] }] });
  }));
  expect(await extractObservation("120 kg, 17 kg rejected for bruising.", context)).toEqual(output);
  expect(body.model).toBe("gpt-4.1-mini"); expect(body.store).toBe(false);
  expect(body.text.format.type).toBe("json_schema"); expect(body.text.format.strict).toBe(true);
  expect(body.text.format.schema.additionalProperties).toBe(false);
  expect(body.text.format.schema.required).toContain("evidence");
});

it("sends a supported audio file with the requested transcription model", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init); expect(request.url).toBe("https://api.openai.com/v1/audio/transcriptions");
    const form = await request.formData(); expect(form.get("model")).toBe("gpt-4o-mini-transcribe"); expect((form.get("file") as File).name).toBe("observation.webm");
    return Response.json({ text: "120 kg tomatoes, 17 kg rejected." });
  }));
  expect(await transcribeObservation(new File(["test audio"], "observation.webm", { type: "audio/webm" }))).toContain("17 kg");
});

it("does not expose provider error bodies to the browser", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { message: "sensitive provider detail", type: "invalid_request_error" } }, { status: 401 })));
  try { await extractObservation("Observation", context); throw new Error("Expected provider rejection"); }
  catch (error) { const safe = providerFailure(error); expect(safe.code).toBe("AI_AUTH_ERROR"); expect(JSON.stringify(safe)).not.toContain("sensitive provider detail"); }
});
