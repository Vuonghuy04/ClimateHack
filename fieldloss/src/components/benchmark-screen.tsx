"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Timer, Check, X } from "lucide-react";
import { SCENARIOS, gradeRecord, scenarioContext, summarizeTrials } from "@/lib/benchmark";
import { createDraft } from "@/lib/domain";
import { type BenchmarkMode, type BenchmarkTrial, type ConfirmedRecord, type Draft } from "@/lib/types";
import { ObservationFlow } from "./observation-flow";
import { useWorkspace } from "./workspace";

type Active = { draft: Draft; mode: BenchmarkMode; scenarioId: string; startedAt: number };
function seconds(ms: number | null) { return ms === null ? "—" : `${(ms / 1000).toFixed(1)}s`; }

export function BenchmarkScreen() {
  const { state, ready, addTrial } = useWorkspace();
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const [active, setActive] = useState<Active | null>(null);
  const [last, setLast] = useState<BenchmarkTrial | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [method, setMethod] = useState("all");
  useEffect(() => { if (!active) return; const timer = setInterval(() => setElapsed(performance.now() - active.startedAt), 200); return () => clearInterval(timer); }, [active?.startedAt]); // changing draft must not restart the timer
  if (!ready) return <p className="loading" role="status">Opening benchmark…</p>;
  const scenario = SCENARIOS.find((item) => item.id === (active?.scenarioId ?? scenarioId))!;
  const scenarioIndex = SCENARIOS.findIndex((item) => item.id === scenario.id);
  const recommended: BenchmarkMode = scenarioIndex % 2 === 0 ? "manual" : "assisted";
  const trials = state.trials.filter((trial) => method === "all" || trial.mode === "manual" || trial.inputMethod === method);
  const stats = summarizeTrials(trials);
  const pairs = SCENARIOS.filter((item) => ["manual", "assisted"].every((mode) => state.trials.some((trial) => trial.scenarioId === item.id && trial.mode === mode))).length;
  function start(mode: BenchmarkMode) {
    const draft = createDraft(scenarioContext(scenario.id));
    if (mode === "manual") draft.transcript = scenario.prompt;
    setLast(null); setElapsed(0); setActive({ draft, mode, scenarioId: scenario.id, startedAt: performance.now() });
  }
  async function complete(record: ConfirmedRecord, inputMethod: BenchmarkTrial["inputMethod"]) {
    if (!active) return;
    const errors = gradeRecord(record, active.scenarioId);
    const trial: BenchmarkTrial = { id: crypto.randomUUID(), scenarioId: active.scenarioId, mode: active.mode, inputMethod, elapsedMs: performance.now() - active.startedAt, correct: errors.length === 0, errors, completedAt: new Date().toISOString() };
    if (active.mode === "manual" && inputMethod !== "manual") throw new Error("Manual trials must use manual entry.");
    await addTrial(trial); setLast(trial); setActive(null);
  }
  return <><div className="page-heading"><span className="eyebrow">TEST THE JUDGING STORY</span><h1>Faster is useful.<br />Correct is essential.</h1><p>Measure an equivalent event in both workflows, from entry start to confirmation.</p></div>
    {active ? <><div className="trial-banner"><span className="badge entered">{active.mode === "manual" ? "Manual" : "Assisted"} trial</span><strong>{scenario.title}</strong><span className="trial-timer tabular"><Timer size={18} />{seconds(elapsed)}</span><button className="text-button" onClick={() => setActive(null)}>Cancel trial</button></div><section className="scenario-card"><h2>Use this same observation in both workflows</h2><p className="preserve-text">“{scenario.prompt}”</p><p className="clarification"><strong>Available follow-up:</strong> {scenario.clarification}</p>{active.mode === "assisted" && <p className="small muted">Speak or type the observation. Include the follow-up, or supply it during review.</p>}</section><ObservationFlow key={active.draft.id} draft={active.draft} onChange={(draft) => setActive((current) => current ? { ...current, draft } : null)} onConfirm={complete} manualOnly={active.mode === "manual"} initialPhase={active.mode === "manual" ? "review" : "capture"} /></> : <>
      {last && <div className={`notice ${last.correct ? "success" : "error"}`} role="status"><strong>{last.correct ? <Check size={18} /> : <X size={18} />}{last.correct ? "All checked fields match" : "This trial needs correction"}</strong><p>{seconds(last.elapsedMs)} · {last.mode} · {last.inputMethod} entry. Saved to Benchmark.</p>{!!last.errors.length && <ul>{last.errors.map((error) => <li key={error}>{error}</li>)}</ul>}</div>}
      <section className="panel benchmark-setup"><div className="section-label">FIVE PAIRED SCENARIOS</div><div className="setup-heading"><h2>Make the comparison fair.</h2><span className="count-chip">{pairs} / 5 paired</span></div><p className="muted">Use the same presets and information. Alternate which workflow you try first.</p><div className="field scenario-select"><label htmlFor="scenario">Scenario</label><select id="scenario" value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>{SCENARIOS.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.title}</option>)}</select></div><div className="scenario-preview"><p>“{scenario.prompt}”</p><p className="small"><strong>Follow-up:</strong> {scenario.clarification}</p></div><div className="trial-starts"><div><span className="small muted">Recommended order: {recommended} first</span><p className="small">Presets are already selected. Timing includes entry, clarification and review.</p></div><div className="button-row"><button className={`button ${recommended === "manual" ? "primary" : "secondary"}`} onClick={() => start("manual")}>Start manual trial<ArrowRight size={17} /></button><button className={`button ${recommended === "assisted" ? "primary" : "secondary"}`} onClick={() => start("assisted")}>Start assisted trial<ArrowRight size={17} /></button></div></div></section>
      <div className="benchmark-results-heading"><h2>Your measured results</h2><div className="field"><label htmlFor="benchmark-method">Assisted input method</label><select id="benchmark-method" value={method} onChange={(event) => setMethod(event.target.value)}><option value="all">All methods</option><option value="voice">Voice only</option><option value="text">Text only</option></select></div></div><div className="benchmark-stats">{(["manual", "assisted"] as BenchmarkMode[]).map((mode) => <section className="panel benchmark-stat" key={mode}><span className="section-label">{mode === "manual" ? "MANUAL ENTRY" : "ASSISTED ENTRY"}</span><strong className="median-time tabular">{seconds(stats[mode].medianMs)}</strong><span className="small muted">Median time through confirmation</span><div className="benchmark-stat-footer"><span>{stats[mode].correctCount} / {stats[mode].count} fully correct</span><span>{stats[mode].count} trials</span></div></section>)}</div>
      <section className="panel trials-list"><div className="list-heading"><h2>Completed trials</h2><span className="small muted">Benchmark data stays out of Records</span></div>{trials.length ? trials.slice().reverse().map((trial) => <div className="trial-row" key={trial.id}><div><strong>{SCENARIOS.find((item) => item.id === trial.scenarioId)?.title}</strong><span>{trial.mode} · {trial.inputMethod} · {new Date(trial.completedAt).toLocaleDateString("en-AU")}</span></div><strong className="tabular">{seconds(trial.elapsedMs)}</strong><span className={`badge ${trial.correct ? "entered" : "invalid"}`}>{trial.correct ? "Correct" : "Needs correction"}</span>{!!trial.errors.length && <p className="field-errors">{trial.errors.join(" · ")}</p>}</div>) : <div className="empty-state"><Timer size={26} /><h3>No trials yet</h3><p>Complete a manual and assisted trial to start measuring.</p></div>}</section><p className="small muted dashboard-note">Target: a correct, reviewed event in under 60 seconds. These are local demo trials, not a controlled usability study. A single event does not replace a full FLAPP survey. Report voice and text methods separately; repeat the paired scenarios with field officers.</p>
    </>}
  </>;
}
