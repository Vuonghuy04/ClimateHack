"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Sparkles } from "lucide-react";
import { CANONICAL_FIELDS, type ColumnMapping, type ImportBatch, type MappingDefaults } from "@/lib/types";
import { blankMappings, createCandidates } from "@/lib/mapping";
import { useWorkspace } from "./workspace";

function confidence(value: number | null) { return value === null ? "Manual" : `${Math.round(value * 100)}%`; }

export function MappingPlaceholderScreen() {
  const params = useParams<{ id: string }>(); const search = useSearchParams();
  const { state, ready, updateImport } = useWorkspace();
  const [draftMappings, setDraftMappings] = useState<ColumnMapping[] | null>(null);
  const [draftDefaults, setDraftDefaults] = useState<MappingDefaults | null>(null);
  const [busy, setBusy] = useState<"suggesting" | "saving" | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!ready) return <p className="loading" role="status">Opening dataset…</p>;
  const found = state.imports.find((item) => item.id === params.id);
  if (!found) return <><div className="page-heading"><h1>Dataset not found.</h1><p>This import may have been removed from browser storage or opened from another browser.</p></div><Link className="button secondary" href="/datasets"><ArrowLeft size={18} />Back to datasets</Link></>;
  const batch: ImportBatch = found;
  const reviewOnly = search.get("review") === "needs-information"; const visibleCandidates = reviewOnly ? batch.candidates.filter((candidate) => candidate.validationStatus === "needs-information") : batch.candidates;
  const mappings = draftMappings ?? batch.mapping?.mappings ?? blankMappings(batch);
  const defaults = draftDefaults ?? batch.mapping?.defaults ?? { applyDatasetCountry: false, applyReportingYear: false };
  const updateMapping = (sourceColumnId: string, target: ColumnMapping["target"]) => setDraftMappings(mappings.map((mapping) => mapping.sourceColumnId === sourceColumnId ? { ...mapping, target, confidence: null, reasoning: null, suggestedTransformation: null, method: "manual" } : mapping));
  async function suggest() {
    setBusy("suggesting"); setError(null);
    try {
      const response = await fetch("/api/map-schema", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataset: { datasetName: batch.datasetName, organisation: batch.organisation, country: batch.country, reportingYear: batch.reportingYear, sourceType: batch.sourceType, notes: batch.notes }, headers: batch.headers.map(({ id, label }) => ({ id, label })), sampleRows: batch.rawRows.slice(0, 10).map((row) => row.values) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Mapping suggestions were unavailable. Map columns manually.");
      const suggested = new Map<string, { sourceColumnId: string; target: ColumnMapping["target"]; confidence: number; reasoning: string; suggestedTransformation: string | null }>(data.mappings.map((mapping: { sourceColumnId: string; target: ColumnMapping["target"]; confidence: number; reasoning: string; suggestedTransformation: string | null }) => [mapping.sourceColumnId, mapping]));
      setDraftMappings(batch.headers.map((header) => { const value = suggested.get(header.id); return value ? { ...value, method: "ai-suggested-human-confirmed" } : { sourceColumnId: header.id, target: "unmapped", confidence: null, reasoning: null, suggestedTransformation: null, method: null }; }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Mapping suggestions were unavailable. Map columns manually."); }
    finally { setBusy(null); }
  }
  async function confirm() {
    setBusy("saving"); setError(null);
    try {
      const candidates = createCandidates(batch, mappings, defaults);
      const method = mappings.some((mapping) => mapping.method === "ai-suggested-human-confirmed") ? "ai-suggested-human-confirmed" : "manual";
      const confirmedMappings = mappings.map((mapping) => mapping.target === "unmapped" ? { ...mapping, target: "ignored" as const, method: "manual" as const } : mapping);
      await updateImport({ ...batch, mapping: { mappings: confirmedMappings, defaults, confirmedAt: new Date().toISOString(), method }, candidates, status: candidates.some((candidate) => candidate.validationStatus === "needs-information") ? "validation-required" : "ready" });
      setDraftMappings(null); setDraftDefaults(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The mapping could not be saved locally."); }
    finally { setBusy(null); }
  }
  return <><div className="page-heading"><span className="eyebrow">SCHEMA MAPPING</span><h1>Map source columns.</h1><p>{batch.datasetName} · {batch.rawRows.length} source rows. Review every suggestion before candidate evidence is created.</p></div>
    <section className="panel mapping-panel"><div className="mapping-header"><div><span className="section-label">RAW SOURCE COLUMNS</span><h2>Assign the fields you can support.</h2><p className="muted">Unmapped and ignored fields stay in the raw import. Suggestions never create missing facts.</p></div><button className="button secondary" disabled={!!busy} onClick={() => void suggest()}><Sparkles size={18} />{busy === "suggesting" ? "Suggesting…" : "Suggest mappings with AI"}</button></div>
      {error && <div className="notice error" role="alert">{error}</div>}
      <div className="mapping-defaults"><h3>Optional dataset defaults</h3><p className="small muted">Apply metadata only when you explicitly want it used for rows that lack a mapped value.</p><label><input type="checkbox" checked={defaults.applyDatasetCountry} disabled={!batch.country} onChange={(event) => setDraftDefaults({ ...defaults, applyDatasetCountry: event.target.checked })} />Apply dataset country “{batch.country ?? "not provided"}” to rows missing country</label><label><input type="checkbox" checked={defaults.applyReportingYear} disabled={batch.reportingYear === null} onChange={(event) => setDraftDefaults({ ...defaults, applyReportingYear: event.target.checked })} />Apply dataset year “{batch.reportingYear ?? "not provided"}” to rows missing reporting year</label></div>
      <div className="mapping-table"><div className="mapping-row mapping-labels"><span>Source column</span><span>Canonical field</span><span>Suggestion</span></div>{batch.headers.map((header) => { const mapping = mappings.find((item) => item.sourceColumnId === header.id)!; return <div className="mapping-row" key={header.id}><div><strong>{header.label}</strong>{header.originalLabel !== header.label && <span className="small muted">Original: {header.originalLabel || "blank header"}</span>}</div><select aria-label={`Map ${header.label}`} value={mapping.target} disabled={!!busy} onChange={(event) => updateMapping(header.id, event.target.value as ColumnMapping["target"])}><option value="unmapped">Not mapped yet</option><option value="ignored">Ignore this column</option>{Object.entries(CANONICAL_FIELDS).map(([field, label]) => <option key={field} value={field}>{label}</option>)}</select><div className="mapping-suggestion"><strong>{confidence(mapping.confidence)}</strong>{mapping.reasoning && <span>{mapping.reasoning}</span>}{mapping.suggestedTransformation && <span className="small muted">{mapping.suggestedTransformation}</span>}</div></div>; })}</div>
      <div className="mapping-actions"><Link className="text-button" href="/datasets"><ArrowLeft size={17} />Back to datasets</Link><button className="button primary" disabled={!!busy} onClick={() => void confirm()}><Check size={18} />{busy === "saving" ? "Creating candidates…" : "Confirm mapping & create candidates"}</button></div>
    </section>
    {batch.candidates.length > 0 && <section className="panel candidate-panel"><div className="list-heading"><div><span className="section-label">NORMALIZED CANDIDATES</span><h2>{reviewOnly ? `${visibleCandidates.length} candidates needing information` : `${batch.candidates.length} candidates ready for review`}</h2></div><span className="small muted">Not confirmed records</span></div>{visibleCandidates.slice(0, 20).map((candidate) => <details className="candidate-row" key={candidate.id}><summary><span>Source row {candidate.sourceRowNumber}</span><strong>{candidate.values.commodity ?? "Commodity unresolved"} · {candidate.values.affected.amount ?? "—"} {candidate.values.affected.unit === "unknown" ? "unit unresolved" : candidate.values.affected.unit}</strong><span className={`badge ${candidate.validationStatus === "ready-for-review" ? "entered" : "invalid"}`}>{candidate.validationStatus === "ready-for-review" ? "Ready for review" : "Needs information"}</span></summary><div><p><strong>Canonical values:</strong> {candidate.values.stage ?? "stage unresolved"} · {candidate.values.destination ?? "destination unresolved"} · {candidate.values.country ?? "country unresolved"}</p>{candidate.trace && <div className="candidate-provenance"><p><strong>Source:</strong> {candidate.trace.source.originalFilename} · {candidate.trace.source.sheetName || "CSV"} · row {candidate.trace.source.rowNumber}</p>{candidate.trace.fields.map((field) => <p key={field.field}><strong>{field.field}:</strong> {String(field.originalValue ?? "—")} → {String(field.normalizedValue ?? "—")}{field.transformation ? ` · ${field.transformation}` : ""}{field.mappingMethod === "ai-suggested-human-confirmed" ? " · AI suggested, human confirmed" : " · manually mapped"}</p>)}</div>}{candidate.validationIssues.length > 0 && <ul className="field-errors">{candidate.validationIssues.map((issue) => <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>)}</ul>}<p className="small muted">Original values and transformations are retained with this candidate.</p></div></details>)}</section>}
  </>;
}
