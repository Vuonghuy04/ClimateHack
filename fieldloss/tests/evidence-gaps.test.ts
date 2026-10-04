import { describe, expect, it } from "vitest";
import { confirmDraft, createDraft } from "../src/lib/domain";
import { detectEvidenceGaps } from "../src/lib/evidence-gaps";
import { detectDataQualityIssues } from "../src/lib/quality";
import { observationProvenance } from "../src/lib/provenance";
import type { CandidateCanonicalRecord, DataSource, ImportBatch, ReadinessRequirement, StoredState } from "../src/lib/types";

function source(id: string, inputFormat: DataSource["inputFormat"] = "manual-text"): DataSource { return { id, name: `${id} source`, organisation: null, country: "Fiji", reportingYear: 2026, sourceType: inputFormat === "image" ? "photo-scan" : "field-observation", inputFormat, originalFilename: null, sheetName: null, importedAt: "2026-01-01T00:00:00.000Z", notes: null, archivedAt: null }; }
function record(id: string, from: DataSource, location = "Sigatoka", date = "2026-09-12") { const draft = createDraft({ country: "FJ", commodity: "taro", stage: "storage", date, location }); draft.incoming.amount = 100; draft.affected.amount = 10; draft.allocations = [{ destination: "composted", quantity: { amount: 10, unit: "kg", kgPerCrate: null } }]; return { ...confirmDraft(draft, "2026-10-04T00:00:00.000Z", observationProvenance(from, draft, "manual")), id }; }
function requirement(overrides: Partial<ReadinessRequirement> = {}): ReadinessRequirement { return { id: "taro-storage", country: "FJ", commodity: "taro", stage: "storage", requiredRegions: [], targetObservations: 1, acceptedMeasurementMethods: ["weighed", "estimated", "unknown"], baselineRequired: false, priorityWeight: 2, ...overrides }; }
function state(records: StoredState["records"] = [], sources: DataSource[] = [], requirements: ReadinessRequirement[] = [requirement()], partial: Partial<StoredState> = {}): StoredState { return { schemaVersion: 1, draft: null, records, trials: [], imports: [], photoSources: [], sources, qualityIssueStates: {}, duplicateExcludedRecordIds: [], readinessRequirements: requirements, ...partial }; }
function candidate(id: string, unresolvedFields: CandidateCanonicalRecord["unresolvedFields"]): CandidateCanonicalRecord { return { id, sourceRowNumber: 2, values: { commodity: "taro", foodGroup: null, country: "FJ", region: null, location: "Sigatoka", observationDate: "2026-09-12", reportingYear: 2026, stage: "storage", incoming: { amount: 100, unit: "kg", kgPerCrate: null }, affected: { amount: 4, unit: "crates", kgPerCrate: null }, destination: null, cause: null, measurement: "weighed", notes: null, sourceGeography: null, samplingStratum: null, periodFlag: null }, provenance: {}, trace: { id: "trace", sourceId: "import:sheet", origin: "spreadsheet", inputFormat: "xlsx", source: { importBatchId: "sheet", originalFilename: "survey.xlsx", sheetName: "Results", rowNumber: 2, rawRowReference: "sheet:row:2", imageId: null, extractedObservationIndex: null, extractionTimestamp: null, extractionMethod: null, transcriptionMethod: null }, fields: [], audit: [], validation: { status: "needs-review", evaluatedAt: null, issueCount: unresolvedFields.length, issues: unresolvedFields.map((field) => ({ field, message: "Required", kind: "missing" })) }, reviewedAt: null }, unresolvedFields, validationIssues: unresolvedFields.map((field) => ({ field, message: "Required", kind: "missing" })), validationStatus: "needs-information", mappingStatus: "candidate" }; }
function batch(candidates: CandidateCanonicalRecord[]): ImportBatch { return { id: "sheet", datasetName: "Spreadsheet", originalFilename: "survey.xlsx", fileType: "xlsx", sheetName: "Results", organisation: null, country: "Fiji", reportingYear: 2026, sourceType: "other", notes: null, importedAt: "2026-01-01T00:00:00.000Z", headers: [{ id: "a", label: "a", originalLabel: "a", sourceIndex: 0 }], rawRows: [], status: "validation-required", parseWarnings: [], mapping: null, candidates }; }

describe("Evidence gap detector", () => {
  it("keeps separate missing-field tasks uniquely identifiable across recalculation", () => {
    const spreadsheet = source("import:sheet", "xlsx");
    const item = candidate("candidate", ["destination", "incomingAmount", "incomingUnit"]);
    const before = state([], [spreadsheet], [requirement()], { imports: [batch([item])] });
    const gaps = detectEvidenceGaps(before, "FJ").gaps;
    expect(gaps.filter((gap) => gap.type === "missing-field")).toHaveLength(4);
    expect(new Set(gaps.map((gap) => gap.id)).size).toBe(gaps.length);
    const after = detectEvidenceGaps({ ...before, imports: [batch([{ ...item, unresolvedFields: [...item.unresolvedFields].reverse() }])] }, "FJ").gaps;
    expect(after.map((gap) => gap.id).sort()).toEqual(gaps.map((gap) => gap.id).sort());
  });

  it("reports a high-priority missing requirement and moves it to partial after evidence arrives", () => {
    const high = requirement({ priorityWeight: 3, targetObservations: 2 }); const empty = state([], [], [high]); expect(detectEvidenceGaps(empty, "FJ").gaps[0].title).toContain("evidence missing");
    const sourceOne = source("one"); const partial = detectEvidenceGaps(state([record("one", sourceOne)], [sourceOne], [high]), "FJ"); expect(partial.gaps.some((gap) => gap.title.startsWith("Additional"))).toBe(true);
    const sourceTwo = source("two"); const complete = detectEvidenceGaps(state([record("one", sourceOne), record("two", sourceTwo, "Nadi", "2026-09-13")], [sourceOne, sourceTwo], [high]), "FJ"); expect(complete.gaps.some((gap) => gap.type === "missing-data")).toBe(false);
  });

  it("explains configured geography and baseline gaps", () => {
    const item = source("one"); const configured = requirement({ requiredRegions: ["Sigatoka", "Northern Division"], baselineRequired: true }); const gaps = detectEvidenceGaps(state([record("one", item)], [item], [configured]), "FJ").gaps;
    expect(gaps.some((gap) => gap.type === "geographic-coverage" && gap.region === "Northern Division")).toBe(true); expect(gaps.some((gap) => gap.type === "baseline")).toBe(true);
  });

  it("surfaces spreadsheet missing fields and crate conversion as recoverable blockers", () => {
    const spreadsheet = source("import:sheet", "xlsx"); const gaps = detectEvidenceGaps(state([], [spreadsheet], [requirement()], { imports: [batch([candidate("candidate", ["destination"])])] }), "FJ").gaps;
    expect(gaps.some((gap) => gap.type === "missing-field" && gap.title.includes("Destination"))).toBe(true); expect(gaps.some((gap) => gap.title.includes("crate conversion"))).toBe(true);
  });

  it("removes a low-confidence extraction gap when its shared quality issue is resolved", () => {
    const photo = source("photo", "image"); const item = record("photo-record", photo); const confidenceRecord = { ...item, provenance: { ...item.provenance!, fields: item.provenance!.fields.map((field, index) => index === 0 ? { ...field, aiConfidence: .4 } : field) } }; const before = state([confidenceRecord], [photo]); const issue = detectDataQualityIssues(before).find((item) => item.category === "source-confidence")!;
    expect(detectEvidenceGaps(before, "FJ").gaps.some((gap) => gap.type === "source-confidence")).toBe(true);
    const after = { ...before, qualityIssueStates: { [issue.id]: { status: "resolved" as const, updatedAt: "2026-10-04T00:00:00.000Z" } } }; expect(detectEvidenceGaps(after, "FJ").gaps.some((gap) => gap.type === "source-confidence")).toBe(false);
  });

  it("orders complete high-priority gaps before lower-priority gaps", () => {
    const gaps = detectEvidenceGaps(state([], [], [requirement({ id: "low", priorityWeight: 1 }), requirement({ id: "high", commodity: "tomatoes", stage: "transport", priorityWeight: 3 })]), "FJ").gaps;
    expect(gaps[0].requirementId).toBe("high"); expect(gaps[0].severity).toBe("high");
  });
});
