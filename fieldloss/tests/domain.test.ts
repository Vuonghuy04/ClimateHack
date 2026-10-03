import { describe, expect, it } from "vitest";
import { normalizeQuantity, evaluateDraft, confirmDraft } from "../src/lib/domain";
import type { Draft, Destination, Quantity } from "../src/lib/types";

const quantity = (amount: number | null, unit: Quantity["unit"] = "kg", kgPerCrate: number | null = null): Quantity => ({ amount, unit, kgPerCrate });
const draft = (destination: Destination = "composted"): Draft => ({
  id: "event-1", context: { country: "FJ", commodity: "tomatoes", stage: "transport", date: "2026-10-04", location: "Suva" },
  transcript: "Started with 120 kg. 17 kg bruised and composted.", incoming: quantity(120), affected: quantity(17),
  allocations: [{ destination, quantity: quantity(17) }], cause: "Bruising", measurement: "weighed", evidence: {},
  detectedContext: { country: null, commodity: null, stage: null }, acknowledgedConflicts: [],
});

describe("physical mass conversion", () => {
  it.each([[17000, "g", 17], [0.12, "tonnes", 120], [17, "kg", 17]] as const)("converts %s %s to %s kg", (amount, unit, expected) => {
    expect(normalizeQuantity(quantity(amount, unit))).toBe(expected);
  });
  it("requires an explicit crate weight", () => {
    expect(normalizeQuantity(quantity(3, "crates"))).toBeNull();
    expect(normalizeQuantity(quantity(3, "crates", 20))).toBe(60);
  });
  it("rejects missing, negative, infinite and invalid crate values", () => {
    for (const value of [quantity(null), quantity(-2), quantity(Infinity), quantity(3, "crates", 0)]) expect(normalizeQuantity(value)).toBeNull();
  });
});

describe("destination-aware loss reporting", () => {
  it("calculates 17/120 as 14.2% without asking AI to do arithmetic", () => {
    const result = evaluateDraft(draft());
    expect(result.issues).toEqual([]);
    expect(result.lossKg).toBe(17);
    expect(result.lossPercent).toBeCloseTo(14.1666666667);
    expect(result.lossPercent?.toFixed(1)).toBe("14.2");
  });
  it.each(["donated", "resold", "animal_feed", "productive_use"] as const)("does not count %s as qualifying loss", (destination) => {
    expect(evaluateDraft(draft(destination)).lossKg).toBe(0);
  });
  it("counts only the composted part of split destinations", () => {
    const value = draft();
    value.allocations = [{ destination: "composted", quantity: quantity(10) }, { destination: "donated", quantity: quantity(7) }];
    expect(evaluateDraft(value).lossKg).toBe(10);
    expect(evaluateDraft(value).lossPercent?.toFixed(1)).toBe("8.3");
  });
  it("requires destination clarification for rejected food", () => {
    const value = draft("unknown");
    const result = evaluateDraft(value);
    expect(result.issues.some((issue) => issue.field.includes("destination"))).toBe(true);
    expect(result.lossPercent).toBeNull();
    expect(() => confirmDraft(value)).toThrow();
  });
  it("asks for a missing destination once, without a duplicate total error", () => {
    const value = draft(); value.allocations = [];
    expect(evaluateDraft(value).issues.filter((issue) => issue.field === "allocations")).toHaveLength(1);
  });
  it("blocks incomplete allocation totals", () => {
    const value = draft(); value.allocations[0].quantity.amount = 10;
    expect(evaluateDraft(value).issues.some((issue) => issue.field === "allocations")).toBe(true);
  });
  it("bounds a floating-point split at 100% and rejects proportionally excessive tiny masses", () => {
    const value = draft(); value.incoming.amount = 0.3; value.affected.amount = 0.3;
    value.allocations = [{ destination: "composted", quantity: quantity(0.1) }, { destination: "discarded", quantity: quantity(0.2) }];
    expect(confirmDraft(value).lossPercent).toBeLessThanOrEqual(100);
    value.incoming.amount = 0.0000002; value.affected.amount = 0.0000004; value.allocations = [{ destination: "composted", quantity: quantity(0.0000004) }];
    expect(() => confirmDraft(value)).toThrow();
  });
  it("blocks zero starting mass, losses above starting mass and missing mass", () => {
    for (const amount of [0, 10, null]) {
      const value = draft(); value.incoming.amount = amount;
      expect(evaluateDraft(value).issues.length).toBeGreaterThan(0);
      expect(() => confirmDraft(value)).toThrow();
    }
  });
  it("requires an explicit resolution of conflicting context", () => {
    const value = draft(); value.detectedContext.commodity = "bananas";
    expect(evaluateDraft(value).issues.some((issue) => issue.kind === "conflict")).toBe(true);
    value.acknowledgedConflicts = ["commodity"];
    expect(evaluateDraft(value).issues).toEqual([]);
  });
  it("allows unknown cause and a valid zero-loss event", () => {
    const value = draft(); value.cause = null; value.affected.amount = 0; value.allocations = [];
    expect(evaluateDraft(value).issues).toEqual([]);
    expect(evaluateDraft(value).lossKg).toBe(0);
  });
  it("confirms all nine commodity-stage combinations with normalized masses", () => {
    for (const commodity of ["tomatoes", "bananas", "taro"] as const) for (const stage of ["handling", "storage", "transport"] as const) {
      const value = draft(); value.context.commodity = commodity; value.context.stage = stage;
      const record = confirmDraft(value, "2026-10-04T01:00:00.000Z");
      expect(record.incomingKg).toBe(120);
      expect(record.lossKg).toBe(17);
      expect(record.context.commodity).toBe(commodity);
      expect(record.isSample).toBe(false);
    }
  });
});
