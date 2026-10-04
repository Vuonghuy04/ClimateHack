import type { Draft, Quantity } from "./types";
import { createDraft, emptyQuantity } from "./domain";

export type ExtractedDocumentObservation = { commodity: "tomatoes" | "bananas" | "taro" | null; country: "AU" | "FJ" | null; region: string | null; location: string | null; date: string | null; stage: "handling" | "storage" | "transport" | null; incoming: Quantity | null; affected: Quantity | null; allocations: { destination: "discarded" | "composted" | "donated" | "resold" | "animal_feed" | "productive_use" | "unknown" | null; quantity: Quantity }[]; cause: string | null; measurement: "weighed" | "estimated" | "unknown" | null; notes: string | null; confidenceByField: Record<string, number>; unresolvedFields: string[] };

export function documentObservationToDraft(observation: ExtractedDocumentObservation, defaults: { country: "AU" | "FJ" | null; location: string | null }): Draft {
  const draft = createDraft({ country: observation.country ?? defaults.country ?? "FJ", commodity: observation.commodity ?? "tomatoes", stage: observation.stage ?? "transport", date: observation.date && /^\d{4}-\d{2}-\d{2}$/.test(observation.date) ? observation.date : createDraft().context.date, location: observation.location ?? defaults.location ?? "" });
  return { ...draft, transcript: observation.notes ?? "Extracted from photographed or scanned source.", incoming: observation.incoming ?? emptyQuantity(), affected: observation.affected ?? emptyQuantity(), allocations: observation.allocations.filter((item): item is { destination: NonNullable<typeof item.destination>; quantity: Quantity } => item.destination !== null).map((item) => ({ destination: item.destination, quantity: item.quantity })), cause: observation.cause, measurement: observation.measurement ?? "unknown" };
}
