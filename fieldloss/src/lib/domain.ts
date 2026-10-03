import type { Context, Draft, Evaluation, Quantity, ConfirmedRecord, Issue } from "./types";

export function emptyQuantity(): Quantity { return { amount: null, unit: "kg", kgPerCrate: null }; }

export function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function createDraft(context?: Context): Draft {
  return {
    id: crypto.randomUUID(), context: context ?? { country: "FJ", commodity: "tomatoes", stage: "transport", date: localDate(), location: "" },
    transcript: "", incoming: emptyQuantity(), affected: emptyQuantity(), allocations: [], cause: null, measurement: "unknown", evidence: {},
    detectedContext: { country: null, commodity: null, stage: null }, acknowledgedConflicts: [],
  };
}

export function normalizeQuantity(quantity: Quantity): number | null {
  if (quantity.amount === null || !Number.isFinite(quantity.amount) || quantity.amount < 0) return null;
  let factor: number;
  switch (quantity.unit) {
    case "kg": factor = 1; break;
    case "g": factor = 0.001; break;
    case "tonnes": factor = 1000; break;
    case "crates":
      if (quantity.kgPerCrate === null || !Number.isFinite(quantity.kgPerCrate) || quantity.kgPerCrate <= 0) return null;
      factor = quantity.kgPerCrate; break;
    default: return null;
  }
  const result = quantity.amount * factor;
  return Number.isFinite(result) ? result : null;
}

export function reviseTranscript(draft: Draft, transcript: string): Draft {
  if (transcript === draft.transcript) return draft;
  return { ...draft, transcript, incoming: emptyQuantity(), affected: emptyQuantity(), allocations: [], cause: null, measurement: "unknown", evidence: {}, detectedContext: { country: null, commodity: null, stage: null }, acknowledgedConflicts: [] };
}

export function evaluateDraft(draft: Draft): Evaluation {
  const issues: Issue[] = [];
  const add = (field: string, message: string, kind: Issue["kind"] = "invalid") => issues.push({ field, message, kind });
  const checkQuantity = (quantity: Quantity, field: string, label: string) => {
    if (quantity.amount === null) add(`${field}.amount`, `Enter ${label.toLowerCase()}.`, "missing");
    else if (!Number.isFinite(quantity.amount) || quantity.amount < 0) add(`${field}.amount`, "Enter a finite, non-negative quantity.");
    if (quantity.unit === "unknown") add(`${field}.unit`, "Select the quantity unit.", "missing");
    if (quantity.unit === "crates" && (quantity.kgPerCrate === null || quantity.kgPerCrate <= 0 || !Number.isFinite(quantity.kgPerCrate))) add(`${field}.kgPerCrate`, "Enter the kilograms per crate; this is never guessed.", "missing");
    const value = normalizeQuantity(quantity);
    if (value === null && !issues.some((issue) => issue.field.startsWith(field))) add(field, "This quantity cannot be converted to kilograms.");
    return value;
  };
  const incomingKg = checkQuantity(draft.incoming, "incoming", "Mass entering this stage");
  const affectedKg = checkQuantity(draft.affected, "affected", "Affected or rejected mass");
  if (incomingKg !== null && incomingKg <= 0) add("incoming.amount", "Mass entering this stage must be greater than zero.");
  const equalMass = (a: number, b: number) => Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 1e-9;
  if (incomingKg !== null && affectedKg !== null && affectedKg > incomingKg && !equalMass(incomingKg, affectedKg)) add("affected.amount", "Affected mass cannot exceed mass entering this stage.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.context.date) || Number.isNaN(Date.parse(`${draft.context.date}T00:00:00Z`)) || new Date(`${draft.context.date}T00:00:00Z`).toISOString().slice(0, 10) !== draft.context.date) add("context.date", "Enter a valid observation date.");
  for (const field of ["country", "commodity", "stage"] as const) {
    const detected = draft.detectedContext[field];
    if (detected && detected !== draft.context[field] && !draft.acknowledgedConflicts.includes(field)) add(`context.${field}`, `The observation describes a different ${field}. Resolve this before confirming.`, "conflict");
  }
  if (affectedKg !== null && affectedKg > 0 && draft.allocations.length === 0) add("allocations", "What happened to the affected food? Allocate all of it to a destination.", "missing");
  let allocatedKg = 0;
  let lossKg = 0;
  let completeAllocations = true;
  draft.allocations.forEach((allocation, index) => {
    const kg = checkQuantity(allocation.quantity, `allocations.${index}.quantity`, "Destination quantity");
    if (allocation.destination === "unknown") add(`allocations.${index}.destination`, "Choose what happened to this food.", "missing");
    if (kg === null) completeAllocations = false;
    else {
      allocatedKg += kg;
      if (allocation.destination === "discarded" || allocation.destination === "composted") lossKg += kg;
    }
  });
  if (draft.allocations.length > 0 && affectedKg !== null && completeAllocations && !equalMass(allocatedKg, affectedKg)) add("allocations", `Destination quantities must total ${formatMass(affectedKg)} kg; currently ${formatMass(allocatedKg)} kg.`);
  const ready = issues.length === 0 && incomingKg !== null && incomingKg > 0 && affectedKg !== null;
  return { issues, incomingKg, affectedKg, lossKg: ready ? lossKg : null, lossPercent: ready ? Math.min(100, (lossKg / incomingKg) * 100) : null };
}

export function confirmDraft(draft: Draft, now = new Date().toISOString()): ConfirmedRecord {
  const result = evaluateDraft(draft);
  if (result.issues.length || result.incomingKg === null || result.affectedKg === null || result.lossKg === null || result.lossPercent === null) throw new Error("Resolve all missing or invalid information before confirming.");
  return {
    id: draft.id, context: { ...draft.context }, transcript: draft.transcript,
    incomingKg: result.incomingKg, affectedKg: result.affectedKg, allocations: draft.allocations.map((allocation) => ({ destination: allocation.destination, kg: normalizeQuantity(allocation.quantity)! })),
    lossKg: result.lossKg, lossPercent: result.lossPercent, cause: draft.cause?.trim() || null, measurement: draft.measurement,
    evidence: { ...draft.evidence }, confirmedAt: now, isSample: false,
  };
}

export function formatMass(value: number) { return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 3 }).format(value); }

export function classifyCause(cause: string | null): "bruising" | "heat" | "spoilage" | "other" | "unknown" {
  if (!cause?.trim() || /^unknown$/i.test(cause)) return "unknown";
  if (/bruis|damage|handling|crush|rough/i.test(cause)) return "bruising";
  if (/heat|hot|temperature|cool|sun/i.test(cause)) return "heat";
  if (/spoil|rot|mould|mold|decay/i.test(cause)) return "spoilage";
  return "other";
}

export function nextAction(cause: string | null): { title: string; detail: string } {
  switch (classifyCause(cause)) {
    case "bruising": return { title: "Review packing and handling", detail: "Check packing, stacking and handling with your coordinator before the next delivery. Record the next comparable batch to check for improvement." };
    case "heat": return { title: "Review heat exposure and cooling", detail: "Review exposure time and cooling arrangements with your coordinator. Record the next comparable batch to check for improvement." };
    case "spoilage": return { title: "Review storage conditions", detail: "Review storage conditions and time in storage with your coordinator. Record the next comparable batch to check for improvement." };
    default: return { title: "Review the reported loss", detail: "Discuss the observation with your coordinator and agree on a practical next step. A reported event is a starting point, not proof of prevented loss." };
  }
}
