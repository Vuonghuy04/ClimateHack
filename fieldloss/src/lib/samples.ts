import type { Commodity, Country, Stage, ConfirmedRecord } from "./types";
import { confirmDraft, createDraft } from "./domain";

export function sampleRecords(): ConfirmedRecord[] {
  const seeds: [Country, Commodity, Stage, number, number, string, string][] = [
    ["FJ", "tomatoes", "transport", 120, 17, "Bruising", "Suva"],
    ["AU", "bananas", "storage", 200, 25, "Heat exposure", "Cairns"],
    ["FJ", "taro", "handling", 150, 10, "Physical damage", "Lautoka"],
    ["AU", "tomatoes", "storage", 100, 7, "Spoilage", "Brisbane"],
    ["FJ", "bananas", "transport", 200, 12, "Bruising", "Nadi"],
    ["AU", "taro", "handling", 180, 9, "Handling damage", "Darwin"],
  ];
  return seeds.map(([country, commodity, stage, incoming, affected, cause, location], index) => {
    const draft = createDraft({ country, commodity, stage, date: "2026-10-03", location });
    draft.id = `sample-${index + 1}`;
    draft.incoming.amount = incoming; draft.affected.amount = affected; draft.cause = cause; draft.measurement = "estimated";
    draft.allocations = [{ destination: index === 2 ? "donated" : "composted", quantity: { amount: affected, unit: "kg", kgPerCrate: null } }];
    draft.transcript = `Illustrative sample: ${incoming} kg ${commodity}; ${affected} kg affected by ${cause.toLowerCase()}.`;
    return { ...confirmDraft(draft, "2026-10-03T01:00:00.000Z"), isSample: true };
  });
}
