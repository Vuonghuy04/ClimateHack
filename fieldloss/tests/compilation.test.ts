import { describe, expect, it } from "vitest";
import { confirmDraft, createDraft } from "../src/lib/domain";
import { approveCommodity, compilationPackage, compileDraft } from "../src/lib/compilation";
import { observationProvenance } from "../src/lib/provenance";
import type { DataSource, DraftCompilationState, ReadinessCommodity, StoredState } from "../src/lib/types";

function source(id: string, format: DataSource["inputFormat"], year: number): DataSource { return { id, name: id, organisation: null, country: "Fiji", reportingYear: year, sourceType: format === "image" ? "photo-scan" : format === "xlsx" || format === "csv" ? "spreadsheet" : "field-observation", inputFormat: format, originalFilename: format === "xlsx" ? "survey.xlsx" : null, sheetName: format === "xlsx" ? "Results" : null, importedAt: "2026-01-01T00:00:00.000Z", notes: null, archivedAt: null }; }
function record(id: string, from: DataSource, date: string, affected = 10) { const draft = createDraft({ country: "FJ", commodity: "taro", stage: "storage", date, location: "Sigatoka" }); draft.incoming.amount = 100; draft.affected.amount = affected; draft.allocations = [{ destination: "discarded", quantity: { amount: affected, unit: "kg", kgPerCrate: null } }]; return { ...confirmDraft(draft, "2026-10-04T00:00:00.000Z", observationProvenance(from, draft, "manual")), id }; }
const config = (basket: ReadinessCommodity[] = ["taro"], overrides: Partial<DraftCompilationState["config"]> = {}): DraftCompilationState => ({ config: { country: "FJ", baselineYear: 2023, currentYear: 2026, aggregationMethod: "unweighted-demonstration", commodityBasket: basket.map((commodity) => ({ id: commodity, commodity, foodGroup: null, productionWeight: null })), ...overrides }, approvals: [] });
function state(records: StoredState["records"], sources: DataSource[], draftCompilation: DraftCompilationState, duplicateExcludedRecordIds: string[] = []): StoredState { return { schemaVersion: 1, draft: null, records, trials: [], imports: [], photoSources: [], sources, qualityIssueStates: {}, duplicateExcludedRecordIds, readinessRequirements: [] , draftCompilation }; }

describe("Draft national compilation", () => {
  it("blocks availability when baseline or commodity evidence is missing", () => {
    const currentSource = source("voice", "voice", 2026); const missingBaseline = compileDraft(state([record("current", currentSource, "2026-09-12")], [currentSource], config())); expect(missingBaseline.draftAvailable).toBe(false); expect(missingBaseline.blockers.some((item) => item.includes("Baseline evidence missing"))).toBe(true); const missingCommodity = compileDraft(state([], [], config(["tuna"]))).rows[0]; expect(missingCommodity.currentEstimate).toBeNull(); expect(missingCommodity.blockers).toContain("Current observation-derived estimate missing");
  });

  it("combines mixed source formats while preserving source and measurement details", () => {
    const sources = [source("Ministry Excel", "xlsx", 2026), source("NGO CSV", "csv", 2026), source("Notebook photo", "image", 2023), source("Voice", "voice", 2026)]; const rows = [record("base", sources[2], "2023-09-12", 12), record("excel", sources[0], "2026-09-12", 8), record("csv", sources[1], "2026-09-13", 10), record("voice", sources[3], "2026-09-14", 5)]; const summary = compileDraft(state(rows, sources, config())); const row = summary.rows[0]; expect(row.currentEstimate).toBeGreaterThan(0); expect(row.baselineEstimate).toBeGreaterThan(0); expect(row.sourceNames).toHaveLength(4); expect(row.explanation).toContain("Observation-derived");
  });

  it("requires approval and then produces a complete demonstration compilation", () => {
    const base = source("baseline", "xlsx", 2023); const current = source("current", "csv", 2026); const initial = state([record("base", base, "2023-09-12", 12), record("current", current, "2026-09-12", 8)], [base, current], config()); const first = compileDraft(initial); const approval = approveCommodity(initial, first.rows[0])!; const complete = compileDraft({ ...initial, draftCompilation: { ...initial.draftCompilation!, approvals: [approval] } }); expect(complete.draftAvailable).toBe(true); expect(complete.currentNationalEstimate).toBe(8); expect(complete.baselineNationalEstimate).toBe(12); expect(complete.rows[0].approved).toBe(true);
  });

  it("does not count an excluded duplicate in a commodity estimate", () => {
    const a = source("A", "csv", 2026); const b = source("B", "image", 2026); const first = record("one", a, "2026-09-12"); const second = record("two", b, "2026-09-12"); const summary = compileDraft(state([first, second], [a, b], config(), ["two"])); expect(summary.rows[0].usableCount).toBe(0); expect(summary.rows[0].excludedCount).toBe(1);
  });

  it("exports a labelled transparent package", () => {
    const summary = compileDraft(state([], [], config())); const pack = compilationPackage(summary, state([], [], config())); expect(pack.packageType).toBe("draft-national-compilation"); expect(pack.disclaimer).toContain("Not an official FAO/SDG submission"); expect(pack.estimates[0]).toHaveProperty("sourceIds"); expect(pack.estimates[0]).toHaveProperty("calculation");
  });
});
