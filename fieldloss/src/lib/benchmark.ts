import type { BenchmarkTrial, ConfirmedRecord, Context, Destination } from "./types";
import { classifyCause, localDate } from "./domain";

type Scenario = {
  id: string; title: string; prompt: string; clarification: string; context: Omit<Context, "date">;
  expected: { incomingKg: number; affectedKg: number; lossKg: number; allocations: { destination: Destination; kg: number }[]; cause: ReturnType<typeof classifyCause> };
};

export const SCENARIOS: Scenario[] = [
  { id: "tomato-transport", title: "A complete transport observation", prompt: "Started with 120 kg of tomatoes. After transport, 17 kg were rejected because of bruising. All 17 kg were composted.", clarification: "All quantities were weighed.", context: { country: "FJ", commodity: "tomatoes", stage: "transport", location: "Suva" }, expected: { incomingKg: 120, affectedKg: 17, lossKg: 17, allocations: [{ destination: "composted", kg: 17 }], cause: "bruising" } },
  { id: "banana-storage", title: "Missing starting quantity", prompt: "During storage, 25 kg of bananas spoiled in the heat and were discarded.", clarification: "The batch started with 200 kg. All quantities were estimated.", context: { country: "AU", commodity: "bananas", stage: "storage", location: "Cairns" }, expected: { incomingKg: 200, affectedKg: 25, lossKg: 25, allocations: [{ destination: "discarded", kg: 25 }], cause: "heat" } },
  { id: "taro-handling", title: "Rejected, then donated", prompt: "We handled 150 kg of taro. 10 kg were rejected for physical damage during handling, then donated to the community.", clarification: "All quantities were weighed.", context: { country: "FJ", commodity: "taro", stage: "handling", location: "Lautoka" }, expected: { incomingKg: 150, affectedKg: 10, lossKg: 0, allocations: [{ destination: "donated", kg: 10 }], cause: "bruising" } },
  { id: "banana-crates", title: "Crates need a conversion", prompt: "Eight crates of bananas went into transport. One crate was bruised and discarded.", clarification: "Each crate weighs 25 kg, an estimated conversion.", context: { country: "FJ", commodity: "bananas", stage: "transport", location: "Nadi" }, expected: { incomingKg: 200, affectedKg: 25, lossKg: 25, allocations: [{ destination: "discarded", kg: 25 }], cause: "bruising" } },
  { id: "tomato-correction", title: "A spoken correction", prompt: "100 kg of tomatoes went into storage. Seventeen kilos were spoiled—sorry, seven kilos. Those seven kilos were composted.", clarification: "All quantities were estimated.", context: { country: "AU", commodity: "tomatoes", stage: "storage", location: "Brisbane" }, expected: { incomingKg: 100, affectedKg: 7, lossKg: 7, allocations: [{ destination: "composted", kg: 7 }], cause: "spoilage" } },
];

export function scenarioContext(scenarioId: string): Context {
  const scenario = SCENARIOS.find((item) => item.id === scenarioId) ?? SCENARIOS[0];
  return { ...scenario.context, date: localDate() };
}

export function gradeRecord(record: ConfirmedRecord, scenarioId: string): string[] {
  const scenario = SCENARIOS.find((item) => item.id === scenarioId);
  if (!scenario) return ["Unknown benchmark scenario"];
  const errors: string[] = [];
  const expectedMeasurement = ["tomato-transport", "taro-handling"].includes(scenario.id) ? "weighed" : "estimated";
  if (record.measurement !== expectedMeasurement) errors.push("Incorrect measurement method");
  if (record.context.location.trim().toLowerCase() !== scenario.context.location.toLowerCase()) errors.push("Incorrect location");
  for (const field of ["country", "commodity", "stage"] as const) if (record.context[field] !== scenario.context[field]) errors.push(`Incorrect ${field}`);
  for (const field of ["incomingKg", "affectedKg", "lossKg"] as const) if (Math.abs(record[field] - scenario.expected[field]) > 1e-6) errors.push(`Incorrect ${field}`);
  const actual = new Map<Destination, number>();
  record.allocations.forEach((allocation) => actual.set(allocation.destination, (actual.get(allocation.destination) ?? 0) + allocation.kg));
  const expected = new Map(scenario.expected.allocations.map((allocation) => [allocation.destination, allocation.kg]));
  const destinationKeys = new Set([...actual.keys(), ...expected.keys()]);
  if ([...destinationKeys].some((key) => Math.abs((actual.get(key) ?? 0) - (expected.get(key) ?? 0)) > 1e-6)) errors.push("Incorrect destination allocations");
  if (classifyCause(record.cause) !== scenario.expected.cause) errors.push("Incorrect reported cause");
  return errors;
}

export function summarizeTrials(trials: BenchmarkTrial[]): Record<"manual" | "assisted", { count: number; correctCount: number; medianMs: number | null }> {
  const summarize = (mode: "manual" | "assisted") => {
    const selected = trials.filter((trial) => trial.mode === mode);
    const times = selected.map((trial) => trial.elapsedMs).sort((a, b) => a - b);
    const midpoint = Math.floor(times.length / 2);
    const medianMs = !times.length ? null : times.length % 2 ? times[midpoint] : (times[midpoint - 1] + times[midpoint]) / 2;
    return { count: selected.length, correctCount: selected.filter((trial) => trial.correct).length, medianMs };
  };
  return { manual: summarize("manual"), assisted: summarize("assisted") };
}
