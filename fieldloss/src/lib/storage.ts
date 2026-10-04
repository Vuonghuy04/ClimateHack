import type { ConfirmedRecord, ImportBatch, StoredState } from "./types";
import { COMMODITIES, COUNTRIES, STAGES } from "./types";
import { stateSchema, recordSchema } from "./schemas";
import { candidateProvenance, legacyProvenance, legacySource, sourceFromImport, sourceFromPhoto } from "./provenance";
import { DEFAULT_READINESS_REQUIREMENTS } from "./readiness";
export const STORAGE_KEY = "fieldloss:v1";
export function upsertRecord(records: ConfirmedRecord[], record: ConfirmedRecord): ConfirmedRecord[] {
  const existing = records.find((item) => item.id === record.id);
  if (!existing) return [record, ...records];
  const comparable = (item: ConfirmedRecord) => JSON.stringify({ ...recordSchema.parse(item), confirmedAt: "" });
  if (comparable(existing) !== comparable(record)) throw new Error("This draft was already confirmed in another tab. Start a fresh observation for a different event.");
  return records;
}
export function upsertImport(imports: ImportBatch[], batch: ImportBatch): ImportBatch[] {
  const existing = imports.find((item) => item.id === batch.id);
  if (!existing) return [batch, ...imports];
  if (JSON.stringify(existing) !== JSON.stringify(batch)) throw new Error("This imported dataset was changed in another tab. Start a new import instead.");
  return imports;
}
export function encodeState(state: StoredState): string { return JSON.stringify(stateSchema.parse(state)); }
export function decodeState(json: string): StoredState {
  const raw = JSON.parse(json) as Record<string, unknown>;
  const imports = (Array.isArray(raw.imports) ? raw.imports as ImportBatch[] : []).map((batch) => ({ ...batch, candidates: Array.isArray(batch.candidates) ? batch.candidates.map((candidate) => candidate.trace ? candidate : { ...candidate, trace: candidateProvenance(batch, candidate) }) : [] }));
  const photos = Array.isArray(raw.photoSources) ? raw.photoSources as StoredState["photoSources"] : [];
  const existingSources = Array.isArray(raw.sources) ? raw.sources as StoredState["sources"] : [];
  const sources = [...existingSources];
  const addSource = (source: StoredState["sources"][number]) => { if (!sources.some((item) => item.id === source.id)) sources.push(source); };
  imports.forEach((batch) => addSource(sourceFromImport(batch)));
  photos.forEach((source) => addSource(sourceFromPhoto(source)));
  const records = Array.isArray(raw.records) ? raw.records.map((record) => {
    if (!record || typeof record !== "object") return record;
    const item = record as Record<string, unknown>;
    if (item.provenance && typeof item.provenance === "object" && "sourceType" in item.provenance) {
      const old = item.provenance as { photoSourceId?: string; imageId?: string; originalFilename?: string; extractedObservationIndex?: number | null; extractedAt?: string | null; extractionMethod?: string; manuallyCorrectedFields?: string[] };
      return { ...item, provenance: { ...legacyProvenance(String(item.id)), id: `photo:${item.id}`, sourceId: `photo:${old.photoSourceId}`, origin: "photo-scan", inputFormat: "image", source: { importBatchId: null, originalFilename: old.originalFilename ?? null, sheetName: null, rowNumber: null, rawRowReference: old.imageId ? `image:${old.imageId}` : null, imageId: old.imageId ?? null, extractedObservationIndex: old.extractedObservationIndex ?? null, extractionTimestamp: old.extractedAt ?? null, extractionMethod: old.extractionMethod ?? null, transcriptionMethod: null }, fields: (old.manuallyCorrectedFields ?? []).map((field) => ({ field, sourceField: null, originalValue: null, normalizedValue: null, transformation: null, aiConfidence: null, mappingMethod: "ai-extraction", manuallyCorrected: true, correctedAt: null, evidence: null })), audit: [], validation: { status: "passed", evaluatedAt: item.confirmedAt ?? null, issueCount: 0, issues: [] }, reviewedAt: item.confirmedAt ?? null } };
    }
    if (!item.provenance) { addSource(legacySource()); return { ...item, provenance: legacyProvenance(String(item.id)) }; }
    return item;
  }) : raw.records;
  return stateSchema.parse({ ...raw, imports, photoSources: photos, sources, records, readinessRequirements: Array.isArray(raw.readinessRequirements) ? raw.readinessRequirements : DEFAULT_READINESS_REQUIREMENTS });
}

function csvCell(value: string | number) {
  let text = String(value);
  if (typeof value === "string" && /^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function recordsToCsv(records: ConfirmedRecord[], options: { includeProvenance?: boolean; sources?: StoredState["sources"] } = {}): string {
  const header = ["id", "date", "country", "location", "commodity", "stage", "incoming_kg", "affected_kg", "qualifying_loss_kg", "stage_loss_percent", "destinations", "reported_cause", "measurement", "confirmed_at", "sample_data"];
  if (options.includeProvenance) header.push("source_id", "source_name", "organisation", "input_format", "original_file", "sheet", "row", "image_source_id", "validation_status", "provenance_id");
  const rows = records.map((record) => [
    record.id, record.context.date, COUNTRIES[record.context.country], record.context.location, COMMODITIES[record.context.commodity], STAGES[record.context.stage],
    record.incomingKg, record.affectedKg, record.lossKg, Number(record.lossPercent.toFixed(3)), record.allocations.map((allocation) => `${allocation.destination}: ${allocation.kg} kg`).join("; "),
    record.cause ?? "Unknown", record.measurement, record.confirmedAt, record.isSample ? "yes" : "no",
  ]);
  const rowsWithProvenance = rows.map((row, index) => {
    if (!options.includeProvenance) return row;
    const trace = records[index].provenance; const source = options.sources?.find((item) => item.id === trace?.sourceId);
    return [...row, trace?.sourceId ?? "", source?.name ?? "", source?.organisation ?? "", trace?.inputFormat ?? "", trace?.source.originalFilename ?? "", trace?.source.sheetName ?? "", trace?.source.rowNumber ?? "", trace?.source.imageId ?? "", trace?.validation.status ?? "", trace?.id ?? ""];
  });
  return "\uFEFF" + [header, ...rowsWithProvenance].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
