"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, ArrowRight, SlidersHorizontal } from "lucide-react";
import { COMMODITIES, COUNTRIES, STAGES, DESTINATIONS, type ConfirmedRecord } from "@/lib/types";
import { formatMass } from "@/lib/domain";
import { recordsToCsv } from "@/lib/storage";
import { useWorkspace } from "./workspace";

function RecordRow({ record }: { record: ConfirmedRecord }) {
  return <details className="record-row"><summary><div className="record-identity"><strong>{COMMODITIES[record.context.commodity]}</strong><span>{STAGES[record.context.stage]} · {record.context.location || COUNTRIES[record.context.country]}</span></div><div className="record-country"><strong>{COUNTRIES[record.context.country]}</strong><span>{record.context.date}</span></div><div className="record-loss tabular"><strong>{formatMass(record.lossKg)} kg</strong><span>{record.lossPercent.toFixed(1)}% of incoming mass</span></div><span className={`badge ${record.isSample ? "sample" : "entered"}`}>{record.isSample ? "Sample data" : "Entered observation"}</span><span className="expand-mark" aria-hidden="true">+</span></summary><div className="record-detail"><div><h3>Reviewed quantities</h3><p>{formatMass(record.incomingKg)} kg entering · {formatMass(record.affectedKg)} kg affected</p><p>{record.allocations.map((allocation) => `${DESTINATIONS[allocation.destination]}: ${formatMass(allocation.kg)} kg`).join(" · ")}</p><p>Cause: {record.cause || "Unknown"} · Quantities: {record.measurement}</p></div><div><h3>Original observation</h3><p className="preserve-text">{record.transcript || "Entered manually; no transcript."}</p><p className="small muted">Confirmed {new Date(record.confirmedAt).toLocaleString("en-AU")}</p></div></div></details>;
}

export function RecordsScreen() {
  const { state, ready } = useWorkspace();
  const [country, setCountry] = useState("all");
  const [commodity, setCommodity] = useState("all");
  const [stage, setStage] = useState("all");
  const [source, setSource] = useState("all");
  if (!ready) return <p role="status" className="loading">Opening records…</p>;
  const records = state.records.filter((record) => (country === "all" || record.context.country === country) && (commodity === "all" || record.context.commodity === commodity) && (stage === "all" || record.context.stage === stage) && (source === "all" || (source === "sample") === record.isSample));
  const incoming = records.reduce((sum, record) => sum + record.incomingKg, 0);
  const loss = records.reduce((sum, record) => sum + record.lossKg, 0);
  const samples = records.filter((record) => record.isSample).length;
  const chart = Object.entries(COMMODITIES).map(([key, label]) => ({ key, label, kg: records.filter((record) => record.context.commodity === key).reduce((sum, record) => sum + record.lossKg, 0), count: records.filter((record) => record.context.commodity === key).length }));
  const max = Math.max(1, ...chart.map((item) => item.kg));
  function exportCsv() {
    const url = URL.createObjectURL(new Blob([recordsToCsv(records)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `fieldloss-records-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <><div className="page-heading with-action"><div><span className="eyebrow">FROM OBSERVATION TO EVIDENCE</span><h1>Your loss records.</h1><p>See what was recorded, where it happened and where to follow up.</p></div><button className="button secondary" onClick={exportCsv} disabled={!records.length}><Download size={18} />Export CSV</button></div>
    <section className="panel filters" aria-label="Filter records"><SlidersHorizontal size={18} aria-hidden="true" /><div className="field"><label htmlFor="filter-country">Country</label><select id="filter-country" value={country} onChange={(event) => setCountry(event.target.value)}><option value="all">All countries</option>{Object.entries(COUNTRIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div><div className="field"><label htmlFor="filter-crop">Commodity</label><select id="filter-crop" value={commodity} onChange={(event) => setCommodity(event.target.value)}><option value="all">All commodities</option>{Object.entries(COMMODITIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div><div className="field"><label htmlFor="filter-stage">Stage</label><select id="filter-stage" value={stage} onChange={(event) => setStage(event.target.value)}><option value="all">All stages</option>{Object.entries(STAGES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div><div className="field"><label htmlFor="filter-source">Record source</label><select id="filter-source" value={source} onChange={(event) => setSource(event.target.value)}><option value="all">Entered + samples</option><option value="entered">Entered observations</option><option value="sample">Sample data only</option></select></div></section>
    {samples > 0 && <div className="sample-notice"><span className="badge sample">Sample data</span><p>{samples} illustrative {samples === 1 ? "record is" : "records are"} included in this view. Filter to entered observations for your field data. Benchmark trials are excluded.</p></div>}
    <div className="dashboard-grid"><section className="panel totals-panel"><div className="section-label">CURRENT VIEW</div><div className="dashboard-metric"><span>Confirmed observations</span><strong className="tabular">{records.length}</strong></div><div className="dashboard-metric"><span>Recorded incoming mass</span><strong className="tabular">{formatMass(incoming)}<small> kg</small></strong></div><div className="dashboard-metric"><span>Recorded qualifying loss</span><strong className="tabular">{formatMass(loss)}<small> kg</small></strong></div></section><section className="panel chart-panel"><div className="section-label">WHERE LOSS WAS RECORDED</div><h2>Qualifying loss by commodity</h2><p className="small muted">Recorded kilograms, alongside observation counts.</p><div className="bar-chart">{chart.map((item) => <div className="chart-row" key={item.key}><div><strong>{item.label}</strong><span className="small muted">{item.count} {item.count === 1 ? "observation" : "observations"}</span></div><div className="bar-track" aria-hidden="true"><div className="bar-fill" style={{ width: `${item.kg / max * 100}%` }} /></div><strong className="tabular">{formatMass(item.kg)} kg</strong></div>)}</div></section></div>
    <section className="panel records-list"><div className="list-heading"><div><span className="section-label">THE FIELD NOTEBOOK</span><h2>Confirmed observations <span className="count-chip">{records.length}</span></h2></div><Link className="text-button" href="/">New observation<ArrowRight size={17} /></Link></div>{records.length ? records.map((record) => <RecordRow key={record.id} record={record} />) : <div className="empty-state"><h3>No records in this view</h3><p>Adjust the filters or record your first observation.</p></div>}</section><p className="small muted dashboard-note">These records describe observed batches. They do not represent national loss rates or the official Food Loss Index.</p>
  </>;
}
