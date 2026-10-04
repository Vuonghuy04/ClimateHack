import type { CandidateCanonicalRecord, DataQualityIssue, DataSource, Destination, RecordQualityStatus, StoredState } from "./types";

export type QualityRecord = { id: string; sourceId: string; commodity: string | null; country: string | null; region: string | null; location: string | null; date: string | null; stage: string | null; incomingKg: number | null; affectedKg: number | null; destinations: Destination[]; measurement: string | null; period: string | null; confidence: { field: string; value: number; corrected: boolean }[]; unresolvedConversion: boolean; source: DataSource | null; imageId: string | null; confirmed: boolean };
const key = (value: string | null) => value?.trim().toLowerCase().replace(/\s+/g, " ") || null;
const close = (a: number | null, b: number | null, tolerance = .001) => a !== null && b !== null && Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b), 1) * tolerance;
const eventKey = (record: QualityRecord) => [record.commodity, record.date, key(record.location), record.stage].join("|");
const sourceCountry = (source: DataSource | null) => key(source?.country ?? null) === "fiji" ? "FJ" : key(source?.country ?? null) === "australia" ? "AU" : null;
const issueId = (category: DataQualityIssue["category"], ids: string[], detail: string) => `${category}:${[...ids].sort().join("+")}:${detail}`;
const qualityIssue = (category: DataQualityIssue["category"], severity: DataQualityIssue["severity"], records: QualityRecord[], detail: string, title: string, explanation: string): DataQualityIssue => ({ id: issueId(category, records.map((record) => record.id), detail), severity, category, recordIds: records.map((record) => record.id), sourceIds: [...new Set(records.map((record) => record.sourceId))], title, explanation, status: "open" });

function candidateRecord(candidate: CandidateCanonicalRecord, sources: DataSource[]): QualityRecord {
  const values = candidate.values; const sourceId = candidate.trace?.sourceId ?? "";
  return { id: candidate.id, sourceId, commodity: values.commodity, country: values.country, region: values.region, location: values.location, date: values.observationDate, stage: values.stage, incomingKg: values.incoming.unit === "kg" ? values.incoming.amount : null, affectedKg: values.affected.unit === "kg" ? values.affected.amount : null, destinations: values.destination ? [values.destination] : [], measurement: values.measurement, period: values.periodFlag, confidence: candidate.trace?.fields.filter((field) => field.aiConfidence !== null).map((field) => ({ field: field.field, value: field.aiConfidence!, corrected: field.manuallyCorrected })) ?? [], unresolvedConversion: [values.incoming, values.affected].some((quantity) => quantity.unit === "crates" && !quantity.kgPerCrate), source: sources.find((source) => source.id === sourceId) ?? null, imageId: null, confirmed: false };
}

export function qualityRecords(state: StoredState): QualityRecord[] {
  const confirmed = state.records.filter((record) => !record.isSample).map((record) => ({ id: record.id, sourceId: record.provenance?.sourceId ?? "", commodity: record.context.commodity, country: record.context.country, region: null, location: record.context.location, date: record.context.date, stage: record.context.stage, incomingKg: record.incomingKg, affectedKg: record.affectedKg, destinations: record.allocations.map((allocation) => allocation.destination), measurement: record.measurement, period: null, confidence: record.provenance?.fields.filter((field) => field.aiConfidence !== null).map((field) => ({ field: field.field, value: field.aiConfidence!, corrected: field.manuallyCorrected })) ?? [], unresolvedConversion: false, source: state.sources.find((source) => source.id === record.provenance?.sourceId) ?? null, imageId: record.provenance?.source.imageId ?? null, confirmed: true }));
  return [...confirmed, ...state.imports.flatMap((batch) => batch.candidates.map((candidate) => candidateRecord(candidate, state.sources)))];
}

export function detectDataQualityIssues(state: StoredState): DataQualityIssue[] {
  const records = qualityRecords(state); const issues: DataQualityIssue[] = [];
  for (const record of records) {
    if (record.unresolvedConversion) issues.push(qualityIssue("conversion", "error", [record], "crate", "Crate conversion required", "This source reports crates without an officer-provided kilograms-per-crate conversion. It is blocked from mass-based analysis."));
    if (record.source && sourceCountry(record.source) && record.country && sourceCountry(record.source) !== record.country) issues.push(qualityIssue("geography", "warning", [record], "country", "Source and row country differ", `The source metadata says ${record.source.country}; the normalized row says ${record.country}. Review the source context before aggregation.`));
    if (record.source?.reportingYear && record.date && Number(record.date.slice(0, 4)) !== record.source.reportingYear) issues.push(qualityIssue("time", "warning", [record], "year", "Source year and event date differ", `The source reporting year is ${record.source.reportingYear}, while this event date is ${record.date}.`));
    record.confidence.filter((item) => item.value < .7 && !item.corrected).forEach((item) => issues.push(qualityIssue("source-confidence", "warning", [record], item.field, "Low-confidence extracted field", `${item.field} was extracted from a source image with ${(item.value * 100).toFixed(0)}% confidence and has not been manually corrected.`)));
  }
  for (let index = 0; index < records.length; index += 1) for (let otherIndex = index + 1; otherIndex < records.length; otherIndex += 1) {
    const a = records[index]; const b = records[otherIndex]; if (!a.commodity || !a.date || !a.stage || a.commodity !== b.commodity || a.date !== b.date || a.stage !== b.stage) continue;
    const sameMass = close(a.incomingKg, b.incomingKg) && close(a.affectedKg, b.affectedKg);
    const nearMass = close(a.incomingKg, b.incomingKg, .1) && close(a.affectedKg, b.affectedKg, .1);
    if (sameMass && key(a.location) && key(b.location) && key(a.location) !== key(b.location)) { issues.push(qualityIssue("geography", "warning", [a, b], "location", "Locations differ for a similar event", `${a.location} and ${b.location} are attached to otherwise matching event values. The application will not choose a location.`)); continue; }
    if (sameMass && key(a.region) && key(b.region) && key(a.region) !== key(b.region)) { issues.push(qualityIssue("geography", "warning", [a, b], "region", "Regions differ for a similar event", `${a.region} and ${b.region} are attached to otherwise matching event values. The application will not choose a region.`)); continue; }
    if (!a.location || !b.location || eventKey(a) !== eventKey(b)) continue;
    if (sameMass) issues.push(qualityIssue("duplicate", a.sourceId === b.sourceId ? "error" : "warning", [a, b], "exact", a.sourceId === b.sourceId ? "Exact duplicate in one source" : "Likely cross-source duplicate", `Same commodity, date, location, stage and normalized masses were found in ${a.source?.name || "one source"} and ${b.source?.name || "another source"}. Keep both or exclude one from aggregate counting after review.`));
    else if (nearMass) issues.push(qualityIssue("duplicate", "warning", [a, b], "possible", "Possible duplicate", "The event context and normalized quantities are close across sources. This may be one event recorded twice, but no automatic merge was made."));
    else if (a.affectedKg !== null && b.affectedKg !== null) issues.push(qualityIssue("conflict", "warning", [a, b], "mass", "Conflicting affected quantities", `${a.affectedKg} kg and ${b.affectedKg} kg were reported for what may be the same event. The application cannot select the correct value.`));
    const signature = (record: QualityRecord) => [...record.destinations].sort().join(",");
    if (sameMass && signature(a) !== signature(b)) issues.push(qualityIssue("definition", "warning", [a, b], "destination", "Destination/definition difference", "Comparable event quantities have different food destinations. Do not assume these sources classify qualifying loss the same way."));
    if (sameMass && a.measurement && b.measurement && a.measurement !== "unknown" && b.measurement !== "unknown" && a.measurement !== b.measurement) issues.push(qualityIssue("measurement-method", "warning", [a, b], "method", "Measurement methods differ", `${a.measurement} and ${b.measurement} are both recorded for a similar event. They remain distinct evidence methods.`));
  }
  const states = state.qualityIssueStates;
  return issues.map((issue) => states[issue.id] ? { ...issue, status: states[issue.id].status } : issue);
}

export function getRecordQualityStatus(recordId: string, issues: DataQualityIssue[], duplicateExcludedRecordIds: string[]): RecordQualityStatus {
  if (duplicateExcludedRecordIds.includes(recordId)) return "duplicate-excluded";
  const open = issues.filter((issue) => issue.status === "open" && issue.recordIds.includes(recordId));
  if (open.some((issue) => issue.severity === "error")) return "blocked";
  if (open.length) return "usable-with-warning";
  return "clean";
}

export function usableQualityRecords(state: StoredState) { const issues = detectDataQualityIssues(state); return qualityRecords(state).filter((record) => getRecordQualityStatus(record.id, issues, state.duplicateExcludedRecordIds) !== "blocked" && getRecordQualityStatus(record.id, issues, state.duplicateExcludedRecordIds) !== "duplicate-excluded"); }
