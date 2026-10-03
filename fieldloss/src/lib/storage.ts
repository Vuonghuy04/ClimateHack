import type { ConfirmedRecord, StoredState } from "./types";
import { COMMODITIES, COUNTRIES, STAGES } from "./types";
import { stateSchema, recordSchema } from "./schemas";
export const STORAGE_KEY = "fieldloss:v1";
export function upsertRecord(records: ConfirmedRecord[], record: ConfirmedRecord): ConfirmedRecord[] {
  const existing = records.find((item) => item.id === record.id);
  if (!existing) return [record, ...records];
  const comparable = (item: ConfirmedRecord) => JSON.stringify({ ...recordSchema.parse(item), confirmedAt: "" });
  if (comparable(existing) !== comparable(record)) throw new Error("This draft was already confirmed in another tab. Start a fresh observation for a different event.");
  return records;
}
export function encodeState(state: StoredState): string { return JSON.stringify(stateSchema.parse(state)); }
export function decodeState(json: string): StoredState { return stateSchema.parse(JSON.parse(json)); }

function csvCell(value: string | number) {
  let text = String(value);
  if (typeof value === "string" && /^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function recordsToCsv(records: ConfirmedRecord[]): string {
  const header = ["id", "date", "country", "location", "commodity", "stage", "incoming_kg", "affected_kg", "qualifying_loss_kg", "stage_loss_percent", "destinations", "reported_cause", "measurement", "confirmed_at", "sample_data"];
  const rows = records.map((record) => [
    record.id, record.context.date, COUNTRIES[record.context.country], record.context.location, COMMODITIES[record.context.commodity], STAGES[record.context.stage],
    record.incomingKg, record.affectedKg, record.lossKg, Number(record.lossPercent.toFixed(3)), record.allocations.map((allocation) => `${allocation.destination}: ${allocation.kg} kg`).join("; "),
    record.cause ?? "Unknown", record.measurement, record.confirmedAt, record.isSample ? "yes" : "no",
  ]);
  return "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
