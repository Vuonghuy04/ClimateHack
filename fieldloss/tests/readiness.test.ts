import { describe, expect, it } from "vitest";
import { confirmDraft, createDraft } from "../src/lib/domain";
import { observationProvenance } from "../src/lib/provenance";
import { evaluateReadiness } from "../src/lib/readiness";
import { detectDataQualityIssues } from "../src/lib/quality";
import type { DataSource, ReadinessRequirement, StoredState } from "../src/lib/types";

function source(id: string, inputFormat: DataSource["inputFormat"] = "manual-text", overrides: Partial<DataSource> = {}): DataSource { return { id, name: id, organisation: null, country: "Fiji", reportingYear: 2026, sourceType: inputFormat === "image" ? "photo-scan" : "field-observation", inputFormat, originalFilename: inputFormat === "xlsx" ? "survey.xlsx" : null, sheetName: inputFormat === "xlsx" ? "Results" : null, importedAt: "2026-01-01T00:00:00.000Z", notes: null, archivedAt: null, ...overrides }; }
function record(id: string, from: DataSource, options: { location?: string; date?: string } = {}) { const draft = createDraft({ country: "FJ", commodity: "taro", stage: "storage", date: options.date ?? "2026-09-12", location: options.location ?? "Sigatoka" }); draft.incoming.amount = 100; draft.affected.amount = 10; draft.allocations = [{ destination: "composted", quantity: { amount: 10, unit: "kg", kgPerCrate: null } }]; return { ...confirmDraft(draft, "2026-10-04T00:00:00.000Z", observationProvenance(from, draft, "manual")), id }; }
function requirement(overrides: Partial<ReadinessRequirement> = {}): ReadinessRequirement { return { id: "fj-taro-storage", country: "FJ", commodity: "taro", stage: "storage", requiredRegions: [], targetObservations: 1, acceptedMeasurementMethods: ["weighed", "estimated", "unknown"], baselineRequired: false, priorityWeight: 2, ...overrides }; }
function state(records: StoredState["records"], sources: DataSource[], requirements: ReadinessRequirement[], qualityIssueStates: StoredState["qualityIssueStates"] = {}, duplicateExcludedRecordIds: string[] = []): StoredState { return { schemaVersion: 1, draft: null, records, trials: [], imports: [], photoSources: [], sources, qualityIssueStates, duplicateExcludedRecordIds, readinessRequirements: requirements }; }

describe("Prototype FLI Data Readiness", () => {
  it("reports missing configured requirements when no evidence exists", () => {
    const summary = evaluateReadiness(state([], [], [requirement()]), "FJ"); expect(summary.cells[0].status).toBe("missing"); expect(summary.score).toBe(0);
  });

  it("treats CSV, Excel, photo and field evidence consistently", () => {
    const sources = [source("csv", "csv"), source("excel", "xlsx"), source("photo", "image"), source("voice", "voice")]; const records = sources.map((item, index) => record(String(index), item, { location: `Location ${index}`, date: `2026-09-${12 + index}` }));
    const summary = evaluateReadiness(state(records, sources, [requirement({ targetObservations: 4 })]), "FJ"); expect(summary.cells[0].status).toBe("satisfied"); expect(summary.cells[0].sourceIds).toHaveLength(4);
  });

  it("shows partial for an unmet configured target, missing region, or missing baseline", () => {
    const a = source("a"); const one = record("one", a); expect(evaluateReadiness(state([one], [a], [requirement({ targetObservations: 2 })]), "FJ").cells[0].status).toBe("partial");
    expect(evaluateReadiness(state([one], [a], [requirement({ requiredRegions: ["Sigatoka", "Nadi"] })]), "FJ").cells[0].status).toBe("partial");
    expect(evaluateReadiness(state([one], [a], [requirement({ baselineRequired: true })]), "FJ").cells[0].status).toBe("partial");
  });

  it("does not count an excluded duplicate and keeps its source record", () => {
    const a = source("a"); const first = record("first", a); const second = record("second", a); const summary = evaluateReadiness(state([first, second], [a], [requirement()], {}, ["second"]), "FJ"); expect(summary.cells[0].excluded).toHaveLength(1); expect(summary.cells[0].status).not.toBe("satisfied");
  });

  it("treats evidence excluded from aggregate counting as missing, without removing it", () => {
    const a = source("a"); const item = record("one", a); const summary = evaluateReadiness(state([item], [a], [requirement()], {}, ["one"]), "FJ"); expect(summary.cells[0].status).toBe("missing"); expect(summary.cells[0].excluded.map((record) => record.id)).toEqual(["one"]);
  });

  it("uses shared quality resolution reactively instead of revalidating evidence", () => {
    const a = source("a", "manual-text", { reportingYear: 2024 }); const item = record("one", a); const base = state([item], [a], [requirement()]); const warning = detectDataQualityIssues(base)[0].id; expect(evaluateReadiness(base, "FJ").cells[0].status).toBe("partial");
    const resolved = state([item], [a], [requirement()], { [warning]: { status: "resolved", updatedAt: "2026-10-04T00:00:00.000Z" } }); expect(evaluateReadiness(resolved, "FJ").cells[0].status).toBe("satisfied");
  });

  it("leaves unconfigured stages out of the matrix rather than treating them as failed", () => {
    const summary = evaluateReadiness(state([], [], [requirement({ stage: "transport" })]), "FJ"); expect(summary.cells.some((cell) => cell.requirement.stage === "storage")).toBe(false); expect(summary.counts.na).toBe(0);
  });
});
