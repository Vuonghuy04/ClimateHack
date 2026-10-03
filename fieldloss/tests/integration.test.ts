import { describe, expect, it } from "vitest";
import { createDraft, confirmDraft, evaluateDraft, reviseTranscript } from "../src/lib/domain";
import { applyExtraction } from "../src/lib/extraction";
import { STORAGE_KEY, encodeState, decodeState, upsertRecord, recordsToCsv } from "../src/lib/storage";
import { gradeRecord, summarizeTrials } from "../src/lib/benchmark";
import type { BenchmarkTrial, ConfirmedRecord, StoredState } from "../src/lib/types";

function record(): ConfirmedRecord {
  const value = createDraft({ country: "FJ", commodity: "tomatoes", stage: "transport", date: "2026-10-04", location: "Suva" });
  value.transcript = "120 kg tomatoes, 17 kg bruised, all composted.";
  value.incoming.amount = 120; value.affected.amount = 17;
  value.allocations = [{ destination: "composted", quantity: { amount: 17, unit: "kg", kgPerCrate: null } }];
  value.cause = "Bruising";
  value.measurement = "weighed";
  return confirmDraft(value, "2026-10-04T01:00:00.000Z");
}

describe("extraction as a draft, not trusted final data", () => {
  it("invalidates old suggestions and evidence when the officer revises the source text", () => {
    const value = createDraft(); value.incoming.amount = 120; value.affected.amount = 17; value.evidence.affected = "17 kg"; value.cause = "Bruising";
    const next = reviseTranscript(value, "Actually, 7 kg were composted.");
    expect(next.id).toBe(value.id); expect(next.context).toEqual(value.context);
    expect(next.transcript).toBe("Actually, 7 kg were composted."); expect(next.affected.amount).toBeNull(); expect(next.evidence).toEqual({});
  });
  it("keeps missing mass empty and requires destination clarification", () => {
    const value = createDraft(); value.transcript = "17 kg rejected because of bruising.";
    const next = applyExtraction(value, {
      incoming: null, affected: { amount: 17, unit: "kg", kgPerCrate: null }, allocations: [], cause: "bruising", measurement: "unknown",
      detectedContext: { country: null, commodity: null, stage: null },
      evidence: { incoming: null, affected: "17 kg", cause: "bruising", allocations: null, commodity: null, stage: null },
    });
    expect(next.incoming.amount).toBeNull();
    expect(next.affected.amount).toBe(17);
    expect(evaluateDraft(next).issues.some((issue) => issue.field === "allocations")).toBe(true);
  });
  it("preserves selection and shows conflict instead of silently changing crop", () => {
    const value = createDraft(); value.transcript = "120 kg bananas. Lost 17 kg, composted.";
    const next = applyExtraction(value, {
      incoming: { amount: 120, unit: "kg", kgPerCrate: null }, affected: { amount: 17, unit: "kg", kgPerCrate: null },
      allocations: [{ destination: "composted", quantity: { amount: 17, unit: "kg", kgPerCrate: null } }], cause: null, measurement: "unknown",
      detectedContext: { country: null, commodity: "bananas", stage: null },
      evidence: { incoming: "120 kg", affected: "17 kg", cause: "made-up evidence", allocations: "composted", commodity: "bananas", stage: null },
    });
    expect(next.context.commodity).toBe("tomatoes");
    expect(evaluateDraft(next).issues.some((issue) => issue.kind === "conflict")).toBe(true);
    expect(next.evidence.cause).toBeUndefined();
  });
});

describe("local persistence and export", () => {
  it("restores records, draft and benchmark trials through a versioned round trip", () => {
    const state: StoredState = { schemaVersion: 1, draft: createDraft(), records: [record()], trials: [] };
    const encoded = encodeState(state);
    expect(JSON.parse(encoded).schemaVersion).toBe(1);
    expect(decodeState(encoded)).toEqual(state);
    expect(STORAGE_KEY).toBeTruthy();
  });
  it("rejects corrupted and unsupported saved state", () => {
    expect(() => decodeState("broken-json")).toThrow();
    expect(() => decodeState('{"schemaVersion":2,"records":[],"trials":[],"draft":null}')).toThrow();
  });
  it("saves an observation only once when confirmation is repeated", () => {
    const value = record();
    const records = upsertRecord(upsertRecord([], value), value);
    expect(records).toHaveLength(1);
    expect(records[0].lossKg).toBe(17);
  });
  it("rejects a changed record with an identifier already confirmed in another tab", () => {
    const value = record(); const records = upsertRecord([], value);
    expect(() => upsertRecord(records, { ...value, cause: "A different event" })).toThrow("already confirmed");
    expect(upsertRecord(records, { ...value, confirmedAt: "2026-10-04T02:00:00.000Z" })).toHaveLength(1);
  });
  it("exports destinations and safely quotes text and spreadsheet formulas", () => {
    const value = record(); value.cause = '=HYPERLINK("https://example.test")'; value.context.location = "Suva, Fiji";
    const csv = recordsToCsv([value]);
    expect(csv).toContain("qualifying_loss_kg");
    expect(csv).toContain('"Suva, Fiji"');
    expect(csv).toContain("composted: 17 kg");
    expect(csv).toContain("'=HYPERLINK");
  });
});

describe("honest benchmark reporting", () => {
  it("checks the supplied measurement method and location, as well as quantities", () => {
    const value = record(); value.measurement = "unknown"; value.context.location = "Nadi";
    expect(gradeRecord(value, "tomato-transport")).toContain("Incorrect measurement method");
    expect(gradeRecord(value, "tomato-transport")).toContain("Incorrect location");
  });
  it("detects wrong mass, context and destinations in a completed record", () => {
    const value = record();
    expect(gradeRecord(value, "tomato-transport")).toEqual([]);
    value.incomingKg = 125; value.context.commodity = "taro"; value.allocations = [{ destination: "discarded", kg: 17 }];
    expect(gradeRecord(value, "tomato-transport").length).toBeGreaterThanOrEqual(3);
  });
  it("shows no measured median before any trial has been run", () => {
    expect(summarizeTrials([]).assisted.medianMs).toBeNull();
  });
  it("calculates medians and correct counts without including the other workflow", () => {
    const trials: BenchmarkTrial[] = [10_000, 30_000, 20_000].map((elapsedMs, index) => ({ id: String(index), scenarioId: "tomato-transport", mode: "assisted", inputMethod: "text", elapsedMs, correct: index !== 1, errors: [], completedAt: "2026-10-04T01:00:00Z" }));
    trials.push({ ...trials[0], id: "manual", mode: "manual", inputMethod: "manual", elapsedMs: 60_000, correct: true });
    expect(summarizeTrials(trials).assisted).toEqual({ count: 3, correctCount: 2, medianMs: 20_000 });
    expect(summarizeTrials(trials).manual.medianMs).toBe(60_000);
  });
});
