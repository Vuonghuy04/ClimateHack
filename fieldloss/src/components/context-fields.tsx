"use client";

import type { Context } from "@/lib/types";
import { COMMODITIES, COUNTRIES, STAGES } from "@/lib/types";

export function ContextFields({ context, onChange, disabled = false }: { context: Context; onChange: (context: Context) => void; disabled?: boolean }) {
  const change = (field: keyof Context, value: string) => onChange({ ...context, [field]: value });
  return <div className="context-fields">
    <div className="context-primary">
      <div className="field"><label htmlFor="country">Country</label><select id="country" value={context.country} disabled={disabled} onChange={(event) => change("country", event.target.value)}>{Object.entries(COUNTRIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="field"><label htmlFor="commodity">Commodity</label><select id="commodity" value={context.commodity} disabled={disabled} onChange={(event) => change("commodity", event.target.value)}>{Object.entries(COMMODITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="field stage-field"><label htmlFor="stage">Supply-chain stage</label><select id="stage" value={context.stage} disabled={disabled} onChange={(event) => change("stage", event.target.value)}>{Object.entries(STAGES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    </div>
    <div className="context-secondary"><div className="field"><label htmlFor="observation-date">Observation date</label><input id="observation-date" type="date" value={context.date} disabled={disabled} onChange={(event) => { if (event.target.value) change("date", event.target.value); }} /></div><div className="field"><label htmlFor="location">Location <span className="optional">Optional</span></label><input id="location" maxLength={200} value={context.location} disabled={disabled} placeholder="Town, market or collection point" onChange={(event) => change("location", event.target.value)} /></div></div>
  </div>;
}
