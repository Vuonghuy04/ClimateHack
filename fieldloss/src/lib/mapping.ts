import { emptyQuantity, evaluateDraft } from "./domain";
import { candidateProvenance } from "./provenance";
import type { CandidateCanonicalRecord, CandidateCanonicalValues, CanonicalField, ColumnMapping, Destination, ImportBatch, ImportCellValue, Issue, MappingDefaults, Quantity, Stage, Commodity, Country, Measurement, TransformationAudit } from "./types";

const commodityAliases: Record<string, Commodity> = { tomato: "tomatoes", tomatoes: "tomatoes", banana: "bananas", bananas: "bananas", taro: "taro" };
const stageAliases: Record<string, Stage> = { handling: "handling", "post-harvest handling": "handling", postharvest: "handling", storage: "storage", transport: "transport", transportation: "transport" };
const destinationAliases: Record<string, Destination> = { compost: "composted", composted: "composted", discarded: "discarded", discard: "discarded", donated: "donated", donation: "donated", resold: "resold", resale: "resold", "animal feed": "animal_feed", feed: "animal_feed", "productive use": "productive_use" };
const countryAliases: Record<string, Country> = { fiji: "FJ", fj: "FJ", australia: "AU", au: "AU" };
const measurementAliases: Record<string, Measurement> = { weighed: "weighed", measured: "weighed", estimated: "estimated", estimate: "estimated", unknown: "unknown" };
const unitFactors: Record<string, number> = { g: 0.001, gram: 0.001, grams: 0.001, kg: 1, kilogram: 1, kilograms: 1, tonne: 1000, tonnes: 1000, "metric ton": 1000, "metric tons": 1000 };

function text(value: ImportCellValue) { return value === null ? null : String(value).trim() || null; }
function key(value: ImportCellValue) { return text(value)?.toLowerCase().replace(/\s+/g, " ") ?? null; }
function number(value: ImportCellValue) { if (typeof value === "number" && Number.isFinite(value)) return value; const parsed = typeof value === "string" && /^[-+]?\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : NaN; return Number.isFinite(parsed) ? parsed : null; }

export function normalizeCommodity(value: ImportCellValue): Commodity | null { const normalized = key(value); return normalized ? commodityAliases[normalized] ?? null : null; }
export function normalizeStage(value: ImportCellValue): Stage | null { const normalized = key(value); return normalized ? stageAliases[normalized] ?? null : null; }
export function normalizeDestination(value: ImportCellValue): Destination | null { const normalized = key(value); return normalized ? destinationAliases[normalized] ?? null : null; }
export function normalizeCountry(value: ImportCellValue): Country | null { const normalized = key(value); return normalized ? countryAliases[normalized] ?? null : null; }
export function normalizeMeasurement(value: ImportCellValue): Measurement | null { const normalized = key(value); return normalized ? measurementAliases[normalized] ?? null : null; }
export function normalizeUnit(value: ImportCellValue): { factor: number; label: string } | null { const normalized = key(value); return normalized && unitFactors[normalized] ? { factor: unitFactors[normalized], label: normalized } : null; }

export function blankMappings(batch: ImportBatch): ColumnMapping[] { return batch.headers.map((header) => ({ sourceColumnId: header.id, target: "unmapped", confidence: null, reasoning: null, suggestedTransformation: null, method: null })); }

function audit(batch: ImportBatch, columnId: string | null, originalValue: ImportCellValue, normalizedValue: TransformationAudit["normalizedValue"], transformation: string, source: "row" | "dataset-metadata"): TransformationAudit {
  return { sourceColumnId: columnId, sourceLabel: columnId ? batch.headers.find((header) => header.id === columnId)?.label ?? columnId : "Dataset metadata", originalValue, normalizedValue, transformation, source };
}

function mappedValue(batch: ImportBatch, row: ImportBatch["rawRows"][number], mappings: ColumnMapping[], target: CanonicalField) {
  const mapping = mappings.find((item) => item.target === target && row.values[item.sourceColumnId] !== null);
  if (!mapping) return null;
  return { columnId: mapping.sourceColumnId, value: row.values[mapping.sourceColumnId] };
}

function normalizedMass(batch: ImportBatch, row: ImportBatch["rawRows"][number], mappings: ColumnMapping[], amountTarget: "incomingAmount" | "affectedAmount", unitTarget: "incomingUnit" | "affectedUnit") {
  const amount = mappedValue(batch, row, mappings, amountTarget);
  const unit = mappedValue(batch, row, mappings, unitTarget);
  const numeric = amount ? number(amount.value) : null;
  const normalizedUnit = unit ? normalizeUnit(unit.value) : null;
  let quantity: Quantity = emptyQuantity();
  const provenance: Partial<Record<CanonicalField, TransformationAudit>> = {};
  if (amount) provenance[amountTarget] = audit(batch, amount.columnId, amount.value, numeric, numeric === null ? "not-a-number" : "numeric-value", "row");
  if (unit) provenance[unitTarget] = audit(batch, unit.columnId, unit.value, normalizedUnit ? "kg" : null, normalizedUnit ? `${normalizedUnit.label}_to_kg` : "unrecognized-unit", "row");
  if (numeric !== null) quantity = { amount: normalizedUnit ? numeric * normalizedUnit.factor : numeric, unit: normalizedUnit ? "kg" : "unknown", kgPerCrate: null };
  return { quantity, provenance };
}

function dateValue(value: ImportCellValue): string | null { const candidate = text(value); return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate) && !Number.isNaN(Date.parse(`${candidate}T00:00:00Z`)) ? candidate : null; }
function yearValue(value: ImportCellValue): number | null { const candidate = number(value); return candidate !== null && Number.isInteger(candidate) && candidate >= 1000 && candidate <= 9999 ? candidate : null; }

export function createCandidates(batch: ImportBatch, mappings: ColumnMapping[], defaults: MappingDefaults): CandidateCanonicalRecord[] {
  return batch.rawRows.map((row) => {
    const provenance: CandidateCanonicalRecord["provenance"] = {};
    const source = <T>(field: CanonicalField, normalize: (value: ImportCellValue) => T | null) => {
      const mapped = mappedValue(batch, row, mappings, field);
      if (!mapped) return null;
      const normalized = normalize(mapped.value);
      provenance[field] = audit(batch, mapped.columnId, mapped.value, normalized as ImportCellValue, normalized === null ? "unresolved" : "normalized", "row");
      return normalized;
    };
    let country = source("country", normalizeCountry);
    if (!country && defaults.applyDatasetCountry && batch.country) { country = normalizeCountry(batch.country); if (country) provenance.country = audit(batch, null, batch.country, country, "dataset-country-default", "dataset-metadata"); }
    const reportingMapped = source("reportingYear", yearValue);
    const reportingYear = reportingMapped ?? (defaults.applyReportingYear ? batch.reportingYear : null);
    if (reportingMapped === null && defaults.applyReportingYear && batch.reportingYear !== null) provenance.reportingYear = audit(batch, null, batch.reportingYear, batch.reportingYear, "dataset-reporting-year-default", "dataset-metadata");
    const incoming = normalizedMass(batch, row, mappings, "incomingAmount", "incomingUnit");
    const affected = normalizedMass(batch, row, mappings, "affectedAmount", "affectedUnit");
    Object.assign(provenance, incoming.provenance, affected.provenance);
    const commodity = source("commodity", normalizeCommodity);
    const stage = source("stage", normalizeStage);
    const destination = source("destination", normalizeDestination);
    const measurement = source("measurement", normalizeMeasurement);
    const location = source("location", text); const region = source("region", text); const foodGroup = source("foodGroup", text); const cause = source("cause", text); const notes = source("notes", text); const sourceGeography = source("sourceGeography", text); const samplingStratum = source("samplingStratum", text); const periodFlag = source("periodFlag", text); const observationDate = source("observationDate", dateValue);
    const values: CandidateCanonicalValues = { commodity, foodGroup, country, region, location, observationDate, reportingYear, stage, incoming: incoming.quantity, affected: affected.quantity, destination, cause, measurement, notes, sourceGeography, samplingStratum, periodFlag };
    const unresolvedFields: CanonicalField[] = [];
    if (!commodity) unresolvedFields.push("commodity"); if (!country) unresolvedFields.push("country"); if (!stage) unresolvedFields.push("stage"); if (!observationDate) unresolvedFields.push("observationDate"); if (incoming.quantity.amount === null) unresolvedFields.push("incomingAmount"); if (incoming.quantity.unit === "unknown") unresolvedFields.push("incomingUnit"); if (affected.quantity.amount === null) unresolvedFields.push("affectedAmount"); if (affected.quantity.unit === "unknown") unresolvedFields.push("affectedUnit"); if (affected.quantity.amount !== null && affected.quantity.amount > 0 && !destination) unresolvedFields.push("destination");
    const fallbackDraft = { id: `candidate-${batch.id}-${row.sourceRowNumber}`, context: { country: country ?? "FJ", commodity: commodity ?? "tomatoes", stage: stage ?? "transport", date: observationDate ?? "2000-01-01", location: location ?? "" }, transcript: "", incoming: values.incoming, affected: values.affected, allocations: destination && affected.quantity.amount !== null ? [{ destination, quantity: values.affected }] : [], cause, measurement: measurement ?? "unknown", evidence: {}, detectedContext: { country: null, commodity: null, stage: null }, acknowledgedConflicts: [] };
    const missingIssues: Issue[] = unresolvedFields.filter((field) => ["commodity", "country", "stage", "observationDate"].includes(field)).map((field) => ({ field, kind: "missing", message: `Map or provide ${field === "observationDate" ? "an observation date" : field} before this candidate can be reviewed.` }));
    const validationIssues = [...missingIssues, ...evaluateDraft(fallbackDraft).issues];
    const candidate = { id: fallbackDraft.id, sourceRowNumber: row.sourceRowNumber, values, provenance, unresolvedFields, validationIssues, validationStatus: validationIssues.length ? "needs-information" as const : "ready-for-review" as const, mappingStatus: "candidate" as const };
    return { ...candidate, trace: candidateProvenance(batch, candidate) };
  });
}
