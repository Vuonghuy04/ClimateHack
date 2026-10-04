import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { ImportCellValue, ImportColumn, ImportedRawRow, ImportWarning } from "./types";

export type ParsedImport = { headers: ImportColumn[]; rawRows: ImportedRawRow[]; warnings: ImportWarning[]; errors: string[] };
export type ImportFileInspection = { fileType: "csv" | "xlsx" | "xls"; sheets: string[] };

function cellValue(value: unknown): ImportCellValue {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function isBlankRow(row: unknown[]) { return row.every((value) => value === null || value === undefined || value === ""); }

function columnsFromHeader(header: unknown[], warnings: ImportWarning[]): ImportColumn[] {
  const seen = new Map<string, number>();
  return header.map((value, sourceIndex) => {
    const originalLabel = String(value ?? "").trim();
    const base = originalLabel || `Column ${sourceIndex + 1}`;
    const prior = seen.get(base.toLowerCase()) ?? 0;
    seen.set(base.toLowerCase(), prior + 1);
    if (!originalLabel) warnings.push({ code: "BLANK_HEADER", message: `Column ${sourceIndex + 1} has no header. A safe display name was assigned.` });
    if (prior) warnings.push({ code: "DUPLICATE_HEADER", message: `Duplicate header “${base}” was kept as “${base} (${prior + 1})”.` });
    const label = prior ? `${base} (${prior + 1})` : base;
    const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "column";
    return { id: prior ? `${slug}_${prior + 1}` : slug, label, originalLabel, sourceIndex };
  });
}

/** Converts a parsed source matrix without mutating or normalizing its source values. */
export function parseImportMatrix(matrix: unknown[][], parserWarnings: ImportWarning[] = []): ParsedImport {
  const warnings = [...parserWarnings];
  const errors: string[] = [];
  if (!matrix.length) return { headers: [], rawRows: [], warnings, errors: ["The file is empty."] };
  const firstRow = matrix.findIndex((row) => !isBlankRow(row));
  if (firstRow === -1) return { headers: [], rawRows: [], warnings, errors: ["The selected sheet has no usable headers."] };
  const headerRow = matrix[firstRow];
  if (!headerRow.length || isBlankRow(headerRow)) return { headers: [], rawRows: [], warnings, errors: ["The selected sheet has no headers."] };
  const dataRows = matrix.slice(firstRow + 1).filter((row) => !isBlankRow(row));
  const widest = Math.max(headerRow.length, ...dataRows.map((row) => row.length));
  const completeHeader = [...headerRow];
  while (completeHeader.length < widest) completeHeader.push("");
  const headers = columnsFromHeader(completeHeader, warnings);
  const rawRows = dataRows.map((row, index) => {
    const values: Record<string, ImportCellValue> = {};
    headers.forEach((header, columnIndex) => { values[header.id] = cellValue(row[columnIndex]); });
    if (row.length !== headers.length || row.some((value) => value === null || value === undefined || value === "")) warnings.push({ code: "INCOMPLETE_ROW", message: "Some cells were blank or missing; blank source cells were retained as null.", rowNumber: firstRow + index + 2 });
    return { sourceRowNumber: firstRow + index + 2, values };
  });
  if (!rawRows.length) warnings.push({ code: "NO_DATA_ROWS", message: "The source has headers but no non-blank data rows." });
  return { headers, rawRows, warnings, errors };
}

export function parseCsvText(text: string): ParsedImport {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), { skipEmptyLines: "greedy" });
  const parserWarnings: ImportWarning[] = parsed.errors.map((error) => ({ code: `CSV_${error.code || "PARSE"}`, message: error.message, ...(typeof error.row === "number" ? { rowNumber: error.row + 1 } : {}) }));
  return parseImportMatrix(parsed.data, parserWarnings);
}

function spreadsheetType(name: string): "csv" | "xlsx" | "xls" | null {
  const extension = name.split(".").pop()?.toLowerCase();
  return extension === "csv" || extension === "xlsx" || extension === "xls" ? extension : null;
}

export async function inspectImportFile(file: File): Promise<ImportFileInspection> {
  const fileType = spreadsheetType(file.name);
  if (!fileType) throw new Error("Choose a CSV, XLSX or XLS spreadsheet file.");
  if (fileType === "csv") return { fileType, sheets: [] };
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  if (!workbook.SheetNames.length) throw new Error("This workbook has no worksheets to import.");
  return { fileType, sheets: workbook.SheetNames };
}

export async function parseImportFile(file: File, sheetName?: string): Promise<{ fileType: "csv" | "xlsx" | "xls"; sheetName: string | null; parsed: ParsedImport }> {
  const inspection = await inspectImportFile(file);
  if (inspection.fileType === "csv") return { fileType: "csv", sheetName: null, parsed: parseCsvText(await file.text()) };
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  const selectedSheet = sheetName ?? workbook.SheetNames[0];
  const worksheet = workbook.Sheets[selectedSheet];
  if (!worksheet) throw new Error("Choose one of the worksheets in this workbook.");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: null, blankrows: false, raw: true });
  return { fileType: inspection.fileType, sheetName: selectedSheet, parsed: parseImportMatrix(matrix) };
}
