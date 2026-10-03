import type { Draft, Evidence } from "./types";
import { extractionSchema } from "./schemas";
import { emptyQuantity } from "./domain";

export function applyExtraction(draft: Draft, extraction: unknown): Draft {
  const parsed = extractionSchema.parse(extraction);
  const evidence: Evidence = {};
  for (const [field, quote] of Object.entries(parsed.evidence)) {
    if (quote && draft.transcript.toLowerCase().includes(quote.toLowerCase())) evidence[field as keyof Evidence] = quote;
  }
  return {
    ...draft, incoming: parsed.incoming ?? emptyQuantity(), affected: parsed.affected ?? emptyQuantity(), allocations: parsed.allocations,
    cause: parsed.cause, measurement: parsed.measurement, evidence, detectedContext: parsed.detectedContext, acknowledgedConflicts: [],
  };
}
