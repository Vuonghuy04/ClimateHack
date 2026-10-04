"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, FilePenLine, Mic, Square, LoaderCircle } from "lucide-react";
import { applyExtraction } from "@/lib/extraction";
import { confirmDraft, reviseTranscript } from "@/lib/domain";
import type { ConfirmedRecord, Draft } from "@/lib/types";
import { ContextFields } from "./context-fields";
import { ReviewFields } from "./review-fields";
import { useAudioCapture } from "./use-audio-capture";

export function ObservationFlow({ draft, onChange, onConfirm, initialPhase = "capture", manualOnly = false }: { draft: Draft; onChange: (draft: Draft) => void; onConfirm: (record: ConfirmedRecord, inputMethod: "voice" | "text" | "manual", aiDraft: Draft | null) => void | Promise<void>; initialPhase?: "capture" | "review"; manualOnly?: boolean }) {
  const [phase, setPhase] = useState(manualOnly ? "review" : initialPhase);
  const [busy, setBusy] = useState<"transcribing" | "extracting" | "saving" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputMethod, setInputMethod] = useState<"voice" | "text" | "manual">(initialPhase === "review" ? "manual" : "text");
  const [aiDraft, setAiDraft] = useState<Draft | null>(null);
  const controller = useRef<AbortController | null>(null);
  const currentDraft = useRef(draft); currentDraft.current = draft;
  const saved = useRef(false);
  const saving = useRef(false);
  const heading = useRef<HTMLDivElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (phase === "review") heading.current?.focus(); }, [phase]);
  async function extract(text: string, base: Draft, signal: AbortSignal) {
    setBusy("extracting");
    const response = await fetch("/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript: text, context: base.context }), signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? data.error ?? "Extraction failed. Your observation is preserved; enter the fields manually or try again.");
    const extracted = applyExtraction({ ...base, transcript: text }, data.extraction); onChange(extracted); setAiDraft(extracted); setPhase("review");
  }
  async function extractText() {
    if (busy || !draft.transcript.trim()) return;
    setError(null); setInputMethod("text"); controller.current = new AbortController();
    try { await extract(draft.transcript, draft, controller.current.signal); }
    catch (caught) { if (!controller.current.signal.aborted) setError(caught instanceof Error ? caught.message : "Extraction failed. Enter the fields manually."); }
    finally { if (!controller.current.signal.aborted) setBusy(null); }
  }
  const audio = useAudioCapture(async (blob, filename) => {
    setBusy("transcribing"); setError(null); setInputMethod("voice"); controller.current = new AbortController();
    const base = currentDraft.current;
    try {
      const form = new FormData(); form.append("audio", blob, filename);
      const response = await fetch("/api/transcribe", { method: "POST", body: form, signal: controller.current.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? data.error ?? "Transcription failed. Type the observation or enter the fields manually.");
      const transcript = String(data.transcript); const cleared = reviseTranscript(base, transcript); onChange(cleared);
      await extract(transcript, cleared, controller.current.signal);
    } catch (caught) { if (!controller.current.signal.aborted) setError(caught instanceof Error ? caught.message : "The AI request failed. Use text or manual entry."); }
    finally { if (!controller.current.signal.aborted) setBusy(null); }
  });
  async function confirm() {
    if (saved.current || saving.current || busy) return;
    saving.current = true;
    setError(null); setBusy("saving");
    try { const record = confirmDraft(draft); await onConfirm(record, inputMethod, aiDraft); saved.current = true; }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The record could not be saved. Please try again."); }
    finally { saving.current = false; setBusy(null); }
  }
  const active = !!busy || audio.recording || audio.requesting;
  return <><div className="workflow-steps" aria-label="Reporting progress"><span className={phase === "capture" ? "current" : "complete"}><b>1</b>Capture</span><span className={phase === "review" ? "current" : ""}><b>2</b>Review</span><span><b>3</b>Confirm</span></div>
    {(error || audio.error) && <div className="notice error" role="alert">{error || audio.error}<p className="small">Your typed observation is kept. You can retry or enter the fields manually.</p></div>}
    {phase === "capture" ? <div className="capture-layout"><section className="panel capture-panel" aria-labelledby="capture-title"><div className="section-label">START IN THE FIELD</div><h2 id="capture-title">Tell us what happened.</h2><p className="muted intro">Speak naturally. We’ll turn your observation into a record you can check.</p><ContextFields context={draft.context} onChange={(context) => onChange({ ...draft, context, acknowledgedConflicts: [] })} disabled={active} />
      <div className={`recorder ${audio.recording ? "is-recording" : ""}`}><div><span className="section-label">VOICE OBSERVATION</span><p>{audio.recording ? "Listening. Stop when you’re finished." : "A short account, in your own words."}</p><span className="small muted">Up to 60 seconds · microphone permission required</span></div><button className={`button record-button ${audio.recording ? "danger" : "primary"}`} disabled={!!busy || audio.requesting} onClick={() => audio.recording ? audio.stop() : void audio.start()}>{audio.recording ? <Square size={20} fill="currentColor" /> : <Mic size={22} />}{audio.recording ? `Stop · ${audio.seconds}s` : audio.requesting ? "Opening microphone…" : "Record observation"}</button></div>
      <div className="or-divider"><span>or enter text</span></div><div className="field"><label htmlFor="observation">Your observation</label><textarea id="observation" rows={5} maxLength={8000} value={draft.transcript} disabled={active} onChange={(event) => onChange(reviseTranscript(draft, event.target.value))} placeholder="Started with 120 kg of tomatoes. After transport, 17 kg were rejected because of bruising…" /><span className="small muted">Include starting quantity, affected quantity, cause and where the food went. Editing text clears earlier suggestions.</span></div>
      {busy && <div className="processing" role="status"><LoaderCircle className="spinner" size={18} />{busy === "transcribing" ? "Transcribing your observation…" : "Preparing a draft record…"}</div>}<div className="capture-actions"><button className="text-button" disabled={active} onClick={() => { setInputMethod("manual"); setAiDraft(null); setPhase("review"); }}><FilePenLine size={17} />Enter fields manually</button><button className="button primary" disabled={active || !draft.transcript.trim()} onClick={() => void extractText()}>Create draft record<ArrowRight size={18} /></button></div>
    </section><aside className="capture-guide"><div className="guide-illustration" aria-hidden="true"><svg viewBox="0 0 280 160"><path d="M34 108h212v28H34zM55 79h168v29H55z" fill="#D4E5E4" stroke="#006D77" strokeWidth="2"/><path d="M43 114h194M66 85h146" stroke="#006D77" strokeWidth="2"/><circle cx="103" cy="62" r="22" fill="#F4C0A5" stroke="#B33C2E" strokeWidth="2"/><circle cx="149" cy="62" r="23" fill="#F4C0A5" stroke="#B33C2E" strokeWidth="2"/><circle cx="194" cy="62" r="20" fill="#F4C0A5" stroke="#B33C2E" strokeWidth="2"/><path d="m92 40 10 9 11-9m25 0 11 10 12-10m24 2 9 9 10-9" fill="none" stroke="#006D77" strokeWidth="3"/><path d="M15 137h250" stroke="#142B33" strokeWidth="2"/></svg></div><div className="section-label">A GOOD OBSERVATION INCLUDES</div><ol className="guide-list"><li><b>What came in</b><span>Mass entering this stage.</span></li><li><b>What was affected</b><span>Rejected or damaged quantity.</span></li><li><b>Why, if known</b><span>Bruising, heat, spoilage or another cause.</span></li><li><b>Where it went</b><span>Discarded, composted, donated or used elsewhere.</span></li></ol><div className="guide-footnote"><strong>A small record. A useful next step.</strong><p>Review one event, then use the evidence to improve the next delivery.</p></div></aside></div> : <section className="panel review-panel"><div tabIndex={-1} ref={heading} className="review-focus" /><ReviewFields draft={draft} onChange={onChange} onConfirm={confirm} busy={busy === "saving"} />{!manualOnly && <div className="review-back"><button className="text-button" disabled={!!busy} onClick={() => { setPhase("capture"); setError(null); }}>Return to observation text</button></div>}</section>}
  </>;
}
