import { detectDataQualityIssues, getRecordQualityStatus, qualityRecords, type QualityRecord } from "./quality";
import type { Country, ReadinessCellStatus, ReadinessRequirement, StoredState } from "./types";

export const DEFAULT_READINESS_REQUIREMENTS: ReadinessRequirement[] = [
  { id: "fj-tomatoes-transport", country: "FJ", commodity: "tomatoes", stage: "transport", requiredRegions: [], targetObservations: 1, acceptedMeasurementMethods: ["weighed", "estimated", "unknown"], baselineRequired: false, priorityWeight: 3 },
  { id: "fj-taro-handling", country: "FJ", commodity: "taro", stage: "handling", requiredRegions: [], targetObservations: 1, acceptedMeasurementMethods: ["weighed", "estimated", "unknown"], baselineRequired: false, priorityWeight: 2 },
  { id: "fj-bananas-storage", country: "FJ", commodity: "bananas", stage: "storage", requiredRegions: [], targetObservations: 1, acceptedMeasurementMethods: ["weighed", "estimated", "unknown"], baselineRequired: false, priorityWeight: 2 },
];

export type ReadinessCell = { requirement: ReadinessRequirement; status: ReadinessCellStatus; usable: QualityRecord[]; accepted: QualityRecord[]; partial: QualityRecord[]; blocked: QualityRecord[]; excluded: QualityRecord[]; representedRegions: string[]; missingRegions: string[]; baselinePresent: boolean; sourceIds: string[]; explanation: string };
export type ReadinessSummary = { country: Country; cells: ReadinessCell[]; score: number; counts: Record<ReadinessCellStatus, number> };
const normalized = (value: string | null) => value?.trim().toLowerCase().replace(/\s+/g, " ") || "";
const value = (status: ReadinessCellStatus) => status === "satisfied" ? 1 : status === "partial" ? .5 : 0;

export function evaluateReadiness(state: StoredState, country: Country): ReadinessSummary {
  const requirements = state.readinessRequirements.filter((item) => item.country === country); const records = qualityRecords(state); const issues = detectDataQualityIssues(state);
  const cells = requirements.map((requirement): ReadinessCell => {
    const evidence = records.filter((record) => record.country === country && record.commodity === requirement.commodity && record.stage === requirement.stage);
    const buckets = { usable: [] as QualityRecord[], partial: [] as QualityRecord[], blocked: [] as QualityRecord[], excluded: [] as QualityRecord[] };
    evidence.forEach((record) => { const status = getRecordQualityStatus(record.id, issues, state.duplicateExcludedRecordIds); if (status === "clean") buckets.usable.push(record); else if (status === "usable-with-warning") buckets.partial.push(record); else if (status === "blocked") buckets.blocked.push(record); else buckets.excluded.push(record); });
    const accepted = buckets.usable.filter((record) => requirement.acceptedMeasurementMethods.includes((record.measurement ?? "unknown") as "weighed" | "estimated" | "unknown"));
    const representedRegions = [...new Set([...accepted, ...buckets.partial].map((record) => record.region || record.location).filter((item): item is string => Boolean(item)))];
    const missingRegions = requirement.requiredRegions.filter((region) => !representedRegions.some((found) => normalized(found) === normalized(region)));
    const baselinePresent = !requirement.baselineRequired || [...accepted, ...buckets.partial].some((record) => /baseline/i.test(record.period ?? ""));
    let status: ReadinessCellStatus; let explanation: string;
    if (!evidence.length || (!buckets.usable.length && !buckets.partial.length && !buckets.blocked.length)) { status = "missing"; explanation = "No counted normalized evidence matches this configured collection requirement."; }
    else if (!accepted.length && !buckets.partial.length && buckets.blocked.length) { status = "blocked"; explanation = `${buckets.blocked.length} matching record${buckets.blocked.length === 1 ? " is" : "s are"} blocked by Data Quality.`; }
    else if (accepted.length < requirement.targetObservations || missingRegions.length || !baselinePresent || buckets.partial.length || buckets.blocked.length) { status = "partial"; explanation = `${accepted.length}/${requirement.targetObservations} clean observations${missingRegions.length ? ` · missing regions: ${missingRegions.join(", ")}` : ""}${!baselinePresent ? " · baseline evidence missing" : ""}${buckets.blocked.length ? ` · ${buckets.blocked.length} blocked` : ""}.`; }
    else { status = "satisfied"; explanation = `${accepted.length}/${requirement.targetObservations} configured observations and all configured coverage requirements are present.`; }
    return { requirement, status, ...buckets, accepted, representedRegions, missingRegions, baselinePresent, sourceIds: [...new Set(evidence.map((record) => record.sourceId))], explanation };
  });
  const totalWeight = cells.reduce((sum, cell) => sum + cell.requirement.priorityWeight, 0); const weighted = cells.reduce((sum, cell) => sum + value(cell.status) * cell.requirement.priorityWeight, 0); const counts: Record<ReadinessCellStatus, number> = { missing: 0, blocked: 0, partial: 0, satisfied: 0, na: 0 }; cells.forEach((cell) => { counts[cell.status] += 1; });
  return { country, cells, score: totalWeight ? Math.round(weighted / totalWeight * 100) : 0, counts };
}
