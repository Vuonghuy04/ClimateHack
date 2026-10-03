"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ClipboardCheck } from "lucide-react";
import { createDraft, formatMass, localDate, nextAction } from "@/lib/domain";
import { COMMODITIES, COUNTRIES, STAGES, DESTINATIONS, type ConfirmedRecord } from "@/lib/types";
import { useWorkspace } from "./workspace";
import { ObservationFlow } from "./observation-flow";

export function ObservationScreen() {
  const { state, ready, setDraft, saveRecord } = useWorkspace();
  const [record, setRecord] = useState<ConfirmedRecord | null>(null);
  if (!ready) return <p className="loading" role="status">Opening your field notebook…</p>;
  function nextDelivery() { setDraft(createDraft(record ? { ...record.context, date: localDate() } : undefined)); setRecord(null); }
  if (record) {
    const action = nextAction(record.cause);
    return <div className="result-page"><div className="page-heading"><span className="eyebrow">NEW OBSERVATION</span><h1>One event. Ready to act on.</h1></div><section className="panel result-panel"><span className="success-icon"><Check size={28} /></span><p className="eyebrow">REVIEWED & SAVED IN THIS BROWSER</p><h2>Observation confirmed</h2><p className="muted">{COMMODITIES[record.context.commodity]} · {STAGES[record.context.stage]} · {COUNTRIES[record.context.country]}</p><div className="result-metrics"><div><span>Qualifying loss</span><strong>{formatMass(record.lossKg)}<small> kg</small></strong></div><div><span>Share of incoming mass</span><strong>{record.lossPercent.toFixed(1)}<small>%</small></strong></div></div><p className="small muted">{formatMass(record.incomingKg)} kg entered this stage; {formatMass(record.affectedKg)} kg were affected.<br />{record.allocations.map((item) => `${formatMass(item.kg)} kg ${DESTINATIONS[item.destination].toLowerCase()}`).join(" · ")}</p><div className="action-prompt"><ClipboardCheck size={24} /><div><span className="section-label">A PRACTICAL NEXT STEP</span><h3>{action.title}</h3><p>{action.detail}</p></div></div><p className="small muted">This is a batch/stage loss percentage. It is not an official Food Loss Index or a claim of prevented loss.</p><div className="button-row result-actions"><button className="button primary" onClick={nextDelivery}>Record next delivery<ArrowRight size={18} /></button><Link className="button secondary" href="/records">View records</Link></div></section></div>;
  }
  return <><div className="page-heading"><span className="eyebrow">YOUR FIELD NOTEBOOK</span><h1>Less paperwork.<br className="mobile-only" /> Better loss records.</h1><p>Capture what you see. Check the details. Make the next delivery better.</p></div>{state.draft && state.records.some((saved) => saved.id === state.draft!.id) && <div className="notice warning"><strong>This draft was confirmed in another tab.</strong><p>Start a fresh observation to record a different event.</p><button className="button secondary" onClick={() => setDraft(createDraft({ ...state.draft!.context, date: localDate() }))}>Start a fresh observation</button></div>}{state.draft ? <ObservationFlow key={state.draft.id} draft={state.draft} onChange={setDraft} initialPhase={state.draft.incoming.amount !== null || state.draft.affected.amount !== null ? "review" : "capture"} onConfirm={async (confirmed) => { await saveRecord(confirmed); setRecord(confirmed); }} /> : <section className="panel empty-state"><h2>Ready for your next observation?</h2><p>Your last confirmed record is in Records.</p><button className="button primary" onClick={nextDelivery}>New observation<ArrowRight size={18} /></button></section>}</>;
}
