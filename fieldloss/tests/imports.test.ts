import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseCsvText, parseImportMatrix } from "../src/lib/imports";
import { decodeState, encodeState } from "../src/lib/storage";
import type { ImportBatch } from "../src/lib/types";

describe("spreadsheet imports", () => {
  it("parses standard CSV data and preserves original cell strings", () => {
    const parsed = parseCsvText("commodity,loss_qty,unit\ntomatoes,17,kg");
    expect(parsed.errors).toEqual([]);
    expect(parsed.headers.map((header) => header.label)).toEqual(["commodity", "loss_qty", "unit"]);
    expect(parsed.rawRows[0]).toEqual({ sourceRowNumber: 2, values: { commodity: "tomatoes", loss_qty: "17", unit: "kg" } });
  });

  it("handles quoted commas and missing cells without dropping source rows", () => {
    const parsed = parseCsvText('location,cause,loss\n"Suva, Fiji","heat, then spoilage",\nNadi,bruise,12');
    expect(parsed.rawRows).toHaveLength(2);
    expect(parsed.rawRows[0].values.location).toBe("Suva, Fiji");
    expect(parsed.rawRows[0].values.cause).toBe("heat, then spoilage");
    expect(parsed.rawRows[0].values.loss).toBeNull();
    expect(parsed.warnings.some((warning) => warning.code === "INCOMPLETE_ROW")).toBe(true);
  });

  it("rejects empty files and safely retains duplicate source headers", () => {
    expect(parseCsvText("").errors).toContain("The file is empty.");
    const parsed = parseCsvText("Loss,Loss,Unit\n17,18,kg");
    expect(parsed.headers.map((header) => header.label)).toEqual(["Loss", "Loss (2)", "Unit"]);
    expect(parsed.headers.map((header) => header.originalLabel)).toEqual(["Loss", "Loss", "Unit"]);
    expect(parsed.rawRows[0].values).toEqual({ loss: "17", loss_2: "18", unit: "kg" });
    expect(parsed.warnings.some((warning) => warning.code === "DUPLICATE_HEADER")).toBe(true);
  });

  it("reads a selected Excel worksheet and keeps blank cells as null", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Produce", "Loss Qty", "Loss Unit"], ["Tomato", 0.021, "tonnes"], ["Taro", null, "kg"]]), "Tomato Survey");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Reference code"], ["A1"]]), "Reference Codes");
    expect(workbook.SheetNames).toEqual(["Tomato Survey", "Reference Codes"]);
    const selected = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["Tomato Survey"], { header: 1, defval: null, blankrows: false, raw: true });
    const parsed = parseImportMatrix(selected);
    expect(parsed.headers.map((header) => header.label)).toEqual(["Produce", "Loss Qty", "Loss Unit"]);
    expect(parsed.rawRows[0].values.loss_qty).toBe(0.021);
    expect(parsed.rawRows[1].values.loss_qty).toBeNull();
  });

  it("reports an empty selected Excel sheet", () => {
    expect(parseImportMatrix([]).errors).toContain("The file is empty.");
    expect(parseImportMatrix([[null, null]]).errors).toContain("The selected sheet has no usable headers.");
  });

  it("decodes state written before imports were introduced and persists import batches", () => {
    const previousState = JSON.stringify({ schemaVersion: 1, draft: null, records: [], trials: [] });
    expect(decodeState(previousState).imports).toEqual([]);
    const batch: ImportBatch = { id: "import-1", datasetName: "Survey", originalFilename: "survey.csv", fileType: "csv", sheetName: null, organisation: null, country: "Fiji", reportingYear: 2025, sourceType: "ministry_survey", notes: null, importedAt: "2026-10-04T00:00:00.000Z", headers: [{ id: "loss", label: "Loss", originalLabel: "Loss", sourceIndex: 0 }], rawRows: [{ sourceRowNumber: 2, values: { loss: "17" } }], status: "mapping-required", parseWarnings: [], mapping: null, candidates: [] };
    const encoded = encodeState({ schemaVersion: 1, draft: null, records: [], trials: [], imports: [batch], photoSources: [], sources: [], qualityIssueStates: {}, duplicateExcludedRecordIds: [], readinessRequirements: [] });
    expect(decodeState(encoded).imports).toEqual([batch]);
  });
});
