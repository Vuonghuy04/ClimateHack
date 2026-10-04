import type { CandidateCanonicalRecord, DataSource, DataSourceType, Draft, FieldChange, FieldProvenance, ImportBatch, PhotoSource, RecordProvenance } from "./types";

const sourceTypeByDataset: Record<ImportBatch["sourceType"], DataSourceType> = { ministry_survey: "ministry-survey", national_statistics_survey: "statistics-survey", fao_flapp: "flapp", ngo_project: "ngo-project", research_study: "research", administrative_data: "administrative", fieldloss_export: "spreadsheet", other: "other" };
export const importSourceId = (batchId: string) => `import:${batchId}`;
export const photoSourceId = (id: string) => `photo:${id}`;
export const legacySourceId = "legacy:local-records";

export function sourceFromImport(batch: ImportBatch): DataSource {
  return { id: importSourceId(batch.id), name: batch.datasetName, organisation: batch.organisation, country: batch.country, reportingYear: batch.reportingYear, sourceType: sourceTypeByDataset[batch.sourceType], inputFormat: batch.fileType === "csv" ? "csv" : "xlsx", originalFilename: batch.originalFilename, sheetName: batch.sheetName, importedAt: batch.importedAt, notes: batch.notes, archivedAt: null };
}

export function sourceFromPhoto(source: PhotoSource): DataSource {
  return { id: photoSourceId(source.id), name: source.sourceName || source.originalFilename, organisation: source.organisation, country: source.country, reportingYear: source.reportingYear, sourceType: "photo-scan", inputFormat: "image", originalFilename: source.originalFilename, sheetName: null, importedAt: source.importedAt, notes: null, archivedAt: null };
}

export function sourceFromObservation(inputFormat: "voice" | "manual-text", timestamp: string): DataSource {
  const id = crypto.randomUUID();
  return { id, name: inputFormat === "voice" ? "Voice field observation" : "Typed field observation", organisation: null, country: null, reportingYear: null, sourceType: "field-observation", inputFormat, originalFilename: null, sheetName: null, importedAt: timestamp, notes: null, archivedAt: null };
}

export function legacySource(): DataSource {
  return { id: legacySourceId, name: "Existing local observations", organisation: null, country: null, reportingYear: null, sourceType: "other", inputFormat: "legacy", originalFilename: null, sheetName: null, importedAt: "2000-01-01T00:00:00.000Z", notes: "Created during provenance migration; original source details were not stored in the earlier version.", archivedAt: null };
}

function field(field: string, originalValue: unknown, normalizedValue: unknown, options: Partial<FieldProvenance> = {}): FieldProvenance {
  return { field, sourceField: options.sourceField ?? null, originalValue, normalizedValue, transformation: options.transformation ?? null, aiConfidence: options.aiConfidence ?? null, mappingMethod: options.mappingMethod ?? "direct", manuallyCorrected: options.manuallyCorrected ?? false, correctedAt: options.correctedAt ?? null, evidence: options.evidence ?? null };
}

function blankProvenance(id: string, sourceId: string, origin: RecordProvenance["origin"], inputFormat: RecordProvenance["inputFormat"]): RecordProvenance {
  return { id, sourceId, origin, inputFormat, source: { importBatchId: null, originalFilename: null, sheetName: null, rowNumber: null, rawRowReference: null, imageId: null, extractedObservationIndex: null, extractionTimestamp: null, extractionMethod: null, transcriptionMethod: null }, fields: [], audit: [], validation: { status: "needs-review", evaluatedAt: null, issueCount: 0, issues: [] }, reviewedAt: null };
}

export function observationProvenance(source: DataSource, draft: Draft, inputMethod: "voice" | "text" | "manual", now = new Date().toISOString(), aiDraft: Draft | null = null): RecordProvenance {
  const inputFormat = inputMethod === "voice" ? "voice" : "manual-text";
  const trace = blankProvenance(crypto.randomUUID(), source.id, inputMethod === "voice" ? "voice" : "manual-text", inputFormat);
  trace.source.transcriptionMethod = inputMethod === "voice" ? "openai-transcription" : null;
  trace.source.extractionMethod = inputMethod === "manual" ? null : "openai-structured-extraction";
  trace.fields = [field("commodity", draft.evidence.commodity ?? draft.context.commodity, draft.context.commodity, { evidence: draft.evidence.commodity ?? null, mappingMethod: inputMethod === "manual" ? "direct" : "ai-extraction" }), field("stage", draft.evidence.stage ?? draft.context.stage, draft.context.stage, { evidence: draft.evidence.stage ?? null, mappingMethod: inputMethod === "manual" ? "direct" : "ai-extraction" }), field("incoming", draft.evidence.incoming ?? draft.incoming, draft.incoming, { evidence: draft.evidence.incoming ?? null, mappingMethod: inputMethod === "manual" ? "direct" : "ai-extraction" }), field("affected", draft.evidence.affected ?? draft.affected, draft.affected, { evidence: draft.evidence.affected ?? null, mappingMethod: inputMethod === "manual" ? "direct" : "ai-extraction" }), field("allocations", draft.evidence.allocations ?? draft.allocations, draft.allocations, { evidence: draft.evidence.allocations ?? null, mappingMethod: inputMethod === "manual" ? "direct" : "ai-extraction" }), field("cause", draft.evidence.cause ?? draft.cause, draft.cause, { evidence: draft.evidence.cause ?? null, mappingMethod: inputMethod === "manual" ? "direct" : "ai-extraction" })];
  if (aiDraft) {
    const original: Record<string, unknown> = { commodity: aiDraft.context.commodity, stage: aiDraft.context.stage, incoming: aiDraft.incoming, affected: aiDraft.affected, allocations: aiDraft.allocations, cause: aiDraft.cause };
    trace.fields = trace.fields.map((item) => { const changed = JSON.stringify(original[item.field]) !== JSON.stringify(item.normalizedValue); return changed ? { ...item, manuallyCorrected: true, correctedAt: now } : item; });
    trace.audit = trace.fields.filter((item) => item.manuallyCorrected).map((item) => ({ field: item.field, previousValue: original[item.field], newValue: item.normalizedValue, timestamp: now, origin: "user" as const, reason: "Reviewed AI suggestion" }));
  } else trace.audit = inputMethod === "manual" ? [] : [{ field: "draft", previousValue: null, newValue: "AI suggestions reviewed", timestamp: now, origin: "ai-extraction", reason: null }];
  return trace;
}

export function photoProvenance(source: PhotoSource, original: Draft, reviewed: Draft, index: number, confidence: Record<string, number>, now = new Date().toISOString()): RecordProvenance {
  const trace = blankProvenance(crypto.randomUUID(), photoSourceId(source.id), "photo-scan", "image");
  trace.source = { ...trace.source, originalFilename: source.originalFilename, imageId: source.imageId, extractedObservationIndex: index, extractionTimestamp: source.extractedAt, extractionMethod: source.extractionMethod, rawRowReference: `image:${source.imageId}#observation:${index + 1}` };
  const values: [string, unknown, unknown][] = [["context", original.context, reviewed.context], ["incoming", original.incoming, reviewed.incoming], ["affected", original.affected, reviewed.affected], ["allocations", original.allocations, reviewed.allocations], ["cause", original.cause, reviewed.cause], ["measurement", original.measurement, reviewed.measurement]];
  trace.fields = values.map(([name, before, after]) => field(name, before, after, { mappingMethod: source.extractionMethod === "openai-vision" ? "ai-extraction" : "direct", aiConfidence: confidence[name] ?? null, manuallyCorrected: JSON.stringify(before) !== JSON.stringify(after), correctedAt: JSON.stringify(before) !== JSON.stringify(after) ? now : null }));
  trace.audit = trace.fields.filter((item) => item.manuallyCorrected).map((item) => ({ field: item.field, previousValue: item.originalValue, newValue: item.normalizedValue, timestamp: now, origin: "user" as const, reason: "Confirmed after document extraction" }));
  return trace;
}

export function candidateProvenance(batch: ImportBatch, candidate: Omit<CandidateCanonicalRecord, "trace">): RecordProvenance {
  const trace = blankProvenance(crypto.randomUUID(), importSourceId(batch.id), "spreadsheet", batch.fileType === "csv" ? "csv" : "xlsx");
  trace.source = { ...trace.source, importBatchId: batch.id, originalFilename: batch.originalFilename, sheetName: batch.sheetName, rowNumber: candidate.sourceRowNumber, rawRowReference: `${batch.id}:row:${candidate.sourceRowNumber}` };
  trace.fields = Object.entries(candidate.provenance).map(([name, item]) => field(name, item.originalValue, item.normalizedValue, { sourceField: item.sourceLabel, transformation: item.transformation, mappingMethod: batch.mapping?.mappings.find((mapping) => mapping.sourceColumnId === item.sourceColumnId)?.method ?? "manual" }));
  trace.audit = trace.fields.filter((item) => item.transformation && item.transformation !== "normalized").map((item) => ({ field: item.field, previousValue: item.originalValue, newValue: item.normalizedValue, timestamp: batch.mapping?.confirmedAt ?? batch.importedAt, origin: "normalization" as const, reason: item.transformation }));
  trace.validation = { status: candidate.validationStatus === "ready-for-review" ? "needs-review" : "needs-review", evaluatedAt: batch.mapping?.confirmedAt ?? null, issueCount: candidate.validationIssues.length, issues: candidate.validationIssues };
  return trace;
}

export function legacyProvenance(recordId: string): RecordProvenance {
  const trace = blankProvenance(`legacy:${recordId}`, legacySourceId, "legacy", "legacy");
  trace.validation = { status: "legacy-unknown", evaluatedAt: null, issueCount: 0, issues: [] };
  trace.audit = [{ field: "provenance", previousValue: null, newValue: "Legacy local record", timestamp: "2000-01-01T00:00:00.000Z", origin: "migration", reason: "No source provenance existed in the prior local format." }];
  return trace;
}

export function finalizeProvenance(provenance: RecordProvenance | null, issues: RecordProvenance["validation"]["issues"], timestamp: string): RecordProvenance | null {
  if (!provenance) return null;
  return { ...provenance, reviewedAt: timestamp, validation: { status: issues.length ? "needs-review" : "passed", evaluatedAt: timestamp, issueCount: issues.length, issues } };
}

export function archiveSource(source: DataSource, timestamp = new Date().toISOString()): DataSource { return { ...source, archivedAt: timestamp }; }
