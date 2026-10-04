import { describe, expect, it } from "vitest";
import { confirmDraft, createDraft } from "../src/lib/domain";
import { detectDataQualityIssues, getRecordQualityStatus } from "../src/lib/quality";
import { observationProvenance } from "../src/lib/provenance";
import { decodeState, encodeState } from "../src/lib/storage";
import type { CandidateCanonicalRecord, DataSource, StoredState } from "../src/lib/types";

function source(id: string, overrides: Partial<DataSource> = {}): DataSource { return { id, name: id, organisation: null, country: "Fiji", reportingYear: 2026, sourceType: "field-observation", inputFormat: "manual-text", originalFilename: null, sheetName: null, importedAt: "2026-01-01T00:00:00.000Z", notes: null, archivedAt: null, ...overrides }; }
function record(id: string, from: DataSource, options: { affected?: number; date?: string; location?: string; measurement?: "weighed" | "estimated" | "unknown"; destinations?: "discarded"[] | "animal_feed"[]; confidence?: number } = {}) {
  const draft = createDraft({ country: "FJ", commodity: "tomatoes", stage: "transport", date: options.date ?? "2026-09-12", location: options.location ?? "Sigatoka" }); draft.incoming.amount = 180; draft.affected.amount = options.affected ?? 17; draft.measurement = options.measurement ?? "weighed"; draft.allocations = (options.destinations ?? ["discarded"]).map((destination) => ({ destination, quantity: { amount: (options.affected ?? 17), unit: "kg" as const, kgPerCrate: null } }));
  const trace = observationProvenance(from, draft, "manual", "2026-10-04T00:00:00.000Z"); if (options.confidence !== undefined) trace.fields[0] = { ...trace.fields[0], aiConfidence: options.confidence, mappingMethod: "ai-extraction" };
  return { ...confirmDraft(draft, "2026-10-04T00:00:00.000Z", trace), id };
}
function state(records: StoredState["records"], sources: DataSource[], candidates: CandidateCanonicalRecord[] = []): StoredState { return { schemaVersion: 1, draft: null, records, trials: [], imports: candidates.length ? [{ id: "batch", datasetName: "Batch", originalFilename: "survey.xlsx", fileType: "xlsx", sheetName: "Results", organisation: null, country: "Fiji", reportingYear: 2026, sourceType: "other", notes: null, importedAt: "2026-10-04T00:00:00.000Z", headers: [], rawRows: [], status: "validation-required", parseWarnings: [], mapping: null, candidates }] : [], photoSources: [], sources, qualityIssueStates: {}, duplicateExcludedRecordIds: [], readinessRequirements: [] }; }

describe("cross-dataset data quality", () => {
  it("detects exact same-source and cross-source normalized duplicates", () => {
    const a = source("excel", { inputFormat: "xlsx", originalFilename: "ministry.xlsx" }); const b = source("photo", { inputFormat: "image", sourceType: "photo-scan" });
    expect(detectDataQualityIssues(state([record("a", a), record("b", a)], [a])).some((issue) => issue.category === "duplicate" && issue.severity === "error")).toBe(true);
    expect(detectDataQualityIssues(state([record("a", a), record("b", b)], [a, b])).some((issue) => issue.title === "Likely cross-source duplicate")).toBe(true);
  });

  it("does not flag legitimate similar events with a different date or location", () => {
    const a = source("a"); const issues = detectDataQualityIssues(state([record("a", a), record("b", a, { date: "2026-09-13", location: "Nadi" })], [a]));
    expect(issues.some((issue) => issue.category === "duplicate")).toBe(false);
  });

  it("flags conflicting masses, destinations and measurement methods without choosing a winner", () => {
    const a = source("a"); const b = source("b"); const issues = detectDataQualityIssues(state([record("a", a, { measurement: "weighed" }), record("b", b, { affected: 42, measurement: "estimated", destinations: ["animal_feed"] })], [a, b]));
    expect(issues.some((issue) => issue.category === "conflict")).toBe(true);
    expect(issues.some((issue) => issue.category === "measurement-method")).toBe(false);
  });

  it("flags destination definitions and known measurement differences for equivalent normalized masses", () => {
    const a = source("a"); const b = source("b"); const issues = detectDataQualityIssues(state([record("a", a, { measurement: "weighed" }), record("b", b, { measurement: "estimated", destinations: ["animal_feed"] })], [a, b]));
    expect(issues.some((issue) => issue.category === "definition")).toBe(true); expect(issues.some((issue) => issue.category === "measurement-method")).toBe(true);
  });

  it("flags source metadata time and geography contradictions", () => {
    const a = source("a", { country: "Australia", reportingYear: 2024 }); const issues = detectDataQualityIssues(state([record("a", a)], [a]));
    expect(issues.some((issue) => issue.category === "geography")).toBe(true); expect(issues.some((issue) => issue.category === "time")).toBe(true);
  });

  it("flags low-confidence image fields until a human correction is recorded", () => {
    const a = source("photo", { inputFormat: "image", sourceType: "photo-scan" }); const issues = detectDataQualityIssues(state([record("a", a, { confidence: .42 })], [a]));
    expect(issues.some((issue) => issue.category === "source-confidence")).toBe(true);
  });

  it("blocks a mapped crate candidate without a conversion", () => {
    const a = source("import:batch", { inputFormat: "xlsx" }); const candidate = { id: "candidate", sourceRowNumber: 28, values: { commodity: "taro", foodGroup: null, country: "FJ", region: null, location: "Suva", observationDate: "2026-09-12", reportingYear: 2026, stage: "transport", incoming: { amount: 20, unit: "crates", kgPerCrate: null }, affected: { amount: 4, unit: "crates", kgPerCrate: null }, destination: null, cause: null, measurement: null, notes: null, sourceGeography: null, samplingStratum: null, periodFlag: null }, provenance: {}, trace: null, unresolvedFields: ["incomingUnit" as const], validationIssues: [], validationStatus: "needs-information" as const, mappingStatus: "candidate" as const } satisfies CandidateCanonicalRecord;
    const issues = detectDataQualityIssues(state([], [a], [candidate])); expect(issues.some((issue) => issue.category === "conversion" && issue.severity === "error")).toBe(true);
  });

  it("keeps source evidence while duplicate exclusion changes the shared quality status", () => {
    const a = source("a"); const first = record("first", a); const second = record("second", a); const base = state([first, second], [a]); const issue = detectDataQualityIssues(base).find((item) => item.category === "duplicate")!;
    const excluded = { ...base, duplicateExcludedRecordIds: ["second"], qualityIssueStates: { [issue.id]: { status: "resolved" as const, updatedAt: "2026-10-04T00:00:00.000Z" } } };
    expect(getRecordQualityStatus("second", detectDataQualityIssues(excluded), excluded.duplicateExcludedRecordIds)).toBe("duplicate-excluded"); expect(decodeState(encodeState(excluded)).qualityIssueStates[issue.id].status).toBe("resolved"); expect(excluded.records).toHaveLength(2);
  });
});
