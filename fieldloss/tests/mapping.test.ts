import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { createCandidates, normalizeCommodity } from "../src/lib/mapping";
import { parseCsvText, parseImportMatrix } from "../src/lib/imports";
import type { ColumnMapping, ImportBatch } from "../src/lib/types";
import { schemaMappingResponseSchema } from "../src/lib/schemas";

function batch(headers: ImportBatch["headers"], rawRows: ImportBatch["rawRows"], metadata: Partial<Pick<ImportBatch, "country" | "reportingYear">> = {}): ImportBatch {
  return { id: "batch", datasetName: "Survey", originalFilename: "survey.csv", fileType: "csv", sheetName: null, organisation: null, country: metadata.country ?? null, reportingYear: metadata.reportingYear ?? null, sourceType: "other", notes: null, importedAt: "2026-10-04T00:00:00.000Z", headers, rawRows, status: "mapping-required", parseWarnings: [], mapping: null, candidates: [] };
}
function mappings(...entries: [string, ColumnMapping["target"]][]): ColumnMapping[] { return entries.map(([sourceColumnId, target]) => ({ sourceColumnId, target, confidence: null, reasoning: null, suggestedTransformation: null, method: "manual" })); }

describe("schema mapping and deterministic normalization", () => {
  it("maps renamed CSV columns and converts tonnes to canonical kilograms", () => {
    const parsed = parseCsvText("Produce,Loss Qty,Loss Unit,Stage,Country\nTomato,0.021,tonnes,Transport,Fiji");
    const candidate = createCandidates(batch(parsed.headers, parsed.rawRows), mappings(["produce", "commodity"], ["loss_qty", "affectedAmount"], ["loss_unit", "affectedUnit"], ["stage", "stage"], ["country", "country"]), { applyDatasetCountry: false, applyReportingYear: false })[0];
    expect(candidate.values.commodity).toBe("tomatoes");
    expect(candidate.values.affected).toEqual({ amount: 21, unit: "kg", kgPerCrate: null });
    expect(candidate.values.stage).toBe("transport");
    expect(candidate.provenance.affectedUnit).toMatchObject({ originalValue: "tonnes", normalizedValue: "kg", transformation: "tonnes_to_kg" });
  });

  it("normalizes grams from an Excel-origin matrix while preserving the original value", () => {
    const sheet = XLSX.utils.aoa_to_sheet([["crop", "rejected", "measure", "stage", "country"], ["tomatoes", 12000, "grams", "Transport", "FJ"]]);
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
    const parsed = parseImportMatrix(matrix);
    const candidate = createCandidates(batch(parsed.headers, parsed.rawRows), mappings(["crop", "commodity"], ["rejected", "affectedAmount"], ["measure", "affectedUnit"], ["stage", "stage"], ["country", "country"]), { applyDatasetCountry: false, applyReportingYear: false })[0];
    expect(candidate.values.affected.amount).toBe(12);
    expect(candidate.provenance.affectedAmount?.originalValue).toBe(12000);
    expect(candidate.provenance.affectedUnit?.transformation).toBe("grams_to_kg");
  });

  it("uses only explicit safe commodity aliases", () => {
    expect(normalizeCommodity("Tomato")).toBe("tomatoes");
    expect(normalizeCommodity("tomatoes")).toBe("tomatoes");
    expect(normalizeCommodity("plantain")).toBeNull();
  });

  it("does not turn rejected food into a destination", () => {
    const parsed = parseCsvText("crop,rejected,unit,stage,country\nTomato,rejected,kg,Transport,Fiji");
    const candidate = createCandidates(batch(parsed.headers, parsed.rawRows), mappings(["crop", "commodity"], ["rejected", "destination"], ["unit", "affectedUnit"], ["stage", "stage"], ["country", "country"]), { applyDatasetCountry: false, applyReportingYear: false })[0];
    expect(candidate.values.destination).toBeNull();
    expect(candidate.provenance.destination?.transformation).toBe("unresolved");
  });

  it("keeps ignored columns out of canonical values and provenance", () => {
    const parsed = parseCsvText("crop,internal_note\nTomato,do not use");
    const candidate = createCandidates(batch(parsed.headers, parsed.rawRows), mappings(["crop", "commodity"], ["internal_note", "ignored"]), { applyDatasetCountry: false, applyReportingYear: false })[0];
    expect(candidate.values.commodity).toBe("tomatoes");
    expect(candidate.provenance.notes).toBeUndefined();
  });

  it("requires explicit consent before applying dataset metadata defaults", () => {
    const parsed = parseCsvText("crop,stage\nTomato,Transport");
    const source = batch(parsed.headers, parsed.rawRows, { country: "Fiji", reportingYear: 2025 });
    const mapping = mappings(["crop", "commodity"], ["stage", "stage"]);
    expect(createCandidates(source, mapping, { applyDatasetCountry: false, applyReportingYear: false })[0].values.country).toBeNull();
    const candidate = createCandidates(source, mapping, { applyDatasetCountry: true, applyReportingYear: true })[0];
    expect(candidate.values.country).toBe("FJ");
    expect(candidate.values.reportingYear).toBe(2025);
    expect(candidate.provenance.country).toMatchObject({ source: "dataset-metadata", originalValue: "Fiji" });
  });

  it("uses existing validation after manual mappings rather than duplicating its rules", () => {
    const parsed = parseCsvText("crop,incoming,incoming_unit,affected,affected_unit,stage,country\nTomato,10,kg,17,kg,Transport,Fiji");
    const candidate = createCandidates(batch(parsed.headers, parsed.rawRows), mappings(["crop", "commodity"], ["incoming", "incomingAmount"], ["incoming_unit", "incomingUnit"], ["affected", "affectedAmount"], ["affected_unit", "affectedUnit"], ["stage", "stage"], ["country", "country"]), { applyDatasetCountry: false, applyReportingYear: false })[0];
    expect(candidate.validationIssues.some((issue) => issue.message.includes("Affected mass cannot exceed"))).toBe(true);
  });

  it("rejects invalid structured AI output and permits low-confidence suggestions to remain human-reviewed", () => {
    expect(schemaMappingResponseSchema.safeParse({ mappings: [{ sourceColumnId: "crop", target: "not-a-field", confidence: 0.8, reasoning: "no", suggestedTransformation: null }] }).success).toBe(false);
    expect(schemaMappingResponseSchema.safeParse({ mappings: [{ sourceColumnId: "crop", target: "commodity", confidence: 0.2, reasoning: "Header is vague", suggestedTransformation: null }] }).success).toBe(true);
  });
});
