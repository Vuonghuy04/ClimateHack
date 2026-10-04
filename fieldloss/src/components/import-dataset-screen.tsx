"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Camera, ClipboardPen, FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import Link from "next/link";
import { DATASET_SOURCE_TYPES, type DatasetSourceType, type ImportBatch } from "@/lib/types";
import { inspectImportFile, parseImportFile, type ImportFileInspection, type ParsedImport } from "@/lib/imports";
import { useWorkspace } from "./workspace";

const previewRows = 15;
function filenameTitle(name: string) { return name.replace(/\.[^.]+$/, "") || "Imported dataset"; }
function displayCell(value: string | number | boolean | null) { return value === null ? "—" : String(value); }

export function ImportDatasetScreen() {
  const router = useRouter();
  const { saveImport } = useWorkspace();
  const picker = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<ImportFileInspection | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [datasetName, setDatasetName] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [country, setCountry] = useState("");
  const [year, setYear] = useState("");
  const [sourceType, setSourceType] = useState<DatasetSourceType>("other");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [spreadsheetSelected, setSpreadsheetSelected] = useState(false);

  async function parseSelected(selected: File, selectedSheet?: string) {
    setBusy(true); setError(null);
    try {
      const details = await inspectImportFile(selected);
      const nextSheet = details.fileType === "csv" ? "" : selectedSheet || details.sheets[0] || "";
      const result = await parseImportFile(selected, nextSheet || undefined);
      setFile(selected); setInspection(details); setSheetName(nextSheet); setParsed(result.parsed); setDatasetName((current) => current || filenameTitle(selected.name));
    } catch (caught) { setFile(null); setInspection(null); setParsed(null); setError(caught instanceof Error ? caught.message : "The spreadsheet could not be read."); }
    finally { setBusy(false); }
  }
  function choose(selected?: File) { if (selected) void parseSelected(selected); }
  function onFile(event: ChangeEvent<HTMLInputElement>) { choose(event.target.files?.[0]); event.target.value = ""; }
  function onDrop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); choose(event.dataTransfer.files[0]); }
  async function chooseSheet(nextSheet: string) { if (!file) return; setSheetName(nextSheet); setBusy(true); setError(null); try { const result = await parseImportFile(file, nextSheet); setParsed(result.parsed); } catch (caught) { setError(caught instanceof Error ? caught.message : "The worksheet could not be read."); } finally { setBusy(false); } }
  async function save() {
    if (!file || !inspection || !parsed) return;
    if (!datasetName.trim()) { setError("Enter a dataset name before saving."); return; }
    if (parsed.errors.length) { setError("Resolve the file errors before saving this import."); return; }
    const reportingYear = year.trim() ? Number(year) : null;
    if (reportingYear !== null && (!Number.isInteger(reportingYear) || reportingYear < 1000 || reportingYear > 9999)) { setError("Enter a valid four-digit reporting year, or leave it blank."); return; }
    setBusy(true); setError(null);
    const batch: ImportBatch = { id: crypto.randomUUID(), datasetName: datasetName.trim(), originalFilename: file.name, fileType: inspection.fileType, sheetName: inspection.fileType === "csv" ? null : sheetName || null, organisation: organisation.trim() || null, country: country.trim() || null, reportingYear, sourceType, notes: notes.trim() || null, importedAt: new Date().toISOString(), headers: parsed.headers, rawRows: parsed.rawRows, status: "mapping-required", parseWarnings: parsed.warnings, mapping: null, candidates: [] };
    try { await saveImport(batch); router.push(`/datasets/${batch.id}/map`); } catch (caught) { setError(caught instanceof Error ? caught.message : "The dataset could not be saved locally."); setBusy(false); }
  }
  const blockingErrors = parsed?.errors ?? [];
  return <><div className="page-heading"><span className="eyebrow">IMPORT EXISTING DATA</span><h1>Bring in source evidence.</h1><p>Start with a spreadsheet. Raw rows stay unchanged until a later mapping and review step.</p></div>
    {!spreadsheetSelected ? <section className="source-choice-grid"><button className="panel source-choice" type="button" onClick={() => setSpreadsheetSelected(true)}><FileSpreadsheet size={30} aria-hidden="true" /><span><strong>Spreadsheet</strong><small>CSV, XLSX or XLS</small></span><ArrowRight size={20} aria-hidden="true" /></button><Link className="panel source-choice" href="/datasets/photo"><Camera size={30} aria-hidden="true" /><span><strong>Photo / scan</strong><small>Notebook, paper form or scanned sheet</small></span><ArrowRight size={20} aria-hidden="true" /></Link><Link className="panel source-choice" href="/"><ClipboardPen size={30} aria-hidden="true" /><span><strong>Collect new observation</strong><small>Voice or typed field observation</small></span><ArrowRight size={20} aria-hidden="true" /></Link></section> : <section className="panel import-panel"><div className="import-steps"><span className="current"><b>1</b>Upload</span><span className={file ? "current" : ""}><b>2</b>Source details</span><span className={parsed ? "current" : ""}><b>3</b>Preview &amp; save</span></div>
      {!file && <div className="drop-zone" role="button" tabIndex={0} onDragOver={(event) => event.preventDefault()} onDrop={onDrop} onClick={() => picker.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") picker.current?.click(); }}><FileSpreadsheet size={34} aria-hidden="true" /><h2>Drop a CSV or Excel file here</h2><p>Or choose a file from this device. CSV, XLSX and XLS are accepted.</p><button type="button" className="button secondary" onClick={(event) => { event.stopPropagation(); picker.current?.click(); }}><Upload size={18} />Choose spreadsheet</button><input ref={picker} className="visually-hidden" type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={onFile} /></div>}
      {busy && <div className="processing" role="status"><LoaderCircle className="spinner" size={18} />Reading spreadsheet locally…</div>}
      {error && <div className="notice error" role="alert">{error}</div>}
      {file && inspection && <div className="import-workspace"><div className="file-summary"><FileSpreadsheet size={22} /><div><strong>{file.name}</strong><span>{inspection.fileType.toUpperCase()} · parsed in this browser</span></div><button className="text-button" type="button" disabled={busy} onClick={() => { setFile(null); setInspection(null); setParsed(null); setError(null); }}>Choose another file</button></div>
        {inspection.sheets.length > 0 && <div className="field sheet-picker"><label htmlFor="import-sheet">Worksheet to import</label><select id="import-sheet" value={sheetName} disabled={busy} onChange={(event) => void chooseSheet(event.target.value)}>{inspection.sheets.map((sheet) => <option key={sheet} value={sheet}>{sheet}</option>)}</select><p className="small muted">This workbook has {inspection.sheets.length} {inspection.sheets.length === 1 ? "worksheet" : "worksheets"}. Only the selected worksheet will be saved in this batch.</p></div>}
        <div className="metadata-grid"><div className="field"><label htmlFor="dataset-name">Dataset name</label><input id="dataset-name" maxLength={200} value={datasetName} onChange={(event) => setDatasetName(event.target.value)} /></div><div className="field"><label htmlFor="organisation">Organisation / source <span className="optional">Optional</span></label><input id="organisation" maxLength={200} value={organisation} onChange={(event) => setOrganisation(event.target.value)} placeholder="e.g. Fiji Ministry of Agriculture" /></div><div className="field"><label htmlFor="dataset-country">Country <span className="optional">Optional</span></label><input id="dataset-country" maxLength={100} value={country} onChange={(event) => setCountry(event.target.value)} placeholder="e.g. Fiji" /></div><div className="field"><label htmlFor="reporting-year">Reporting / reference year <span className="optional">Optional</span></label><input id="reporting-year" type="number" inputMode="numeric" min="1000" max="9999" value={year} onChange={(event) => setYear(event.target.value)} /></div><div className="field"><label htmlFor="source-type">Source type</label><select id="source-type" value={sourceType} onChange={(event) => setSourceType(event.target.value as DatasetSourceType)}>{Object.entries(DATASET_SOURCE_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="field metadata-notes"><label htmlFor="import-notes">Notes <span className="optional">Optional</span></label><textarea id="import-notes" rows={2} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Scope, collection method or other source context" /></div></div>
        {parsed && <div className="import-preview"><div className="section-heading"><div><span className="section-label">SOURCE PREVIEW</span><h2>{parsed.rawRows.length} {parsed.rawRows.length === 1 ? "row" : "rows"} · {parsed.headers.length} {parsed.headers.length === 1 ? "column" : "columns"}</h2></div><span className="small muted">First {Math.min(previewRows, parsed.rawRows.length)} rows shown</span></div>{blockingErrors.length > 0 && <div className="notice error" role="alert"><strong>Import cannot be saved yet</strong><ul>{blockingErrors.map((message) => <li key={message}>{message}</li>)}</ul></div>}{parsed.warnings.length > 0 && <div className="notice warning"><strong>{parsed.warnings.length} parsing {parsed.warnings.length === 1 ? "warning" : "warnings"}</strong><ul>{parsed.warnings.slice(0, 8).map((warning, index) => <li key={`${warning.code}-${index}`}>{warning.rowNumber ? `Row ${warning.rowNumber}: ` : ""}{warning.message}</li>)}</ul>{parsed.warnings.length > 8 && <p className="small">Additional warnings are retained with this import batch.</p>}</div>}<div className="table-scroll"><table className="import-table"><thead><tr><th scope="col">Source row</th>{parsed.headers.map((header) => <th scope="col" key={header.id}>{header.label}</th>)}</tr></thead><tbody>{parsed.rawRows.slice(0, previewRows).map((row) => <tr key={row.sourceRowNumber}><th scope="row">{row.sourceRowNumber}</th>{parsed.headers.map((header) => <td key={header.id}>{displayCell(row.values[header.id])}</td>)}</tr>)}</tbody></table></div>{!parsed.rawRows.length && !blockingErrors.length && <p className="notice warning">There are no data rows to map. You may save the dataset structure, but it will need rows before it can produce evidence records.</p>}</div>}
        <div className="import-actions"><button type="button" className="text-button" onClick={() => router.push("/datasets")}><ArrowLeft size={17} />Back to datasets</button><button type="button" className="button primary" disabled={busy || !parsed || !!blockingErrors.length} onClick={() => void save()}>Save import &amp; continue to map columns<ArrowRight size={18} /></button></div>
      </div>}
    </section>}</>;
}
