import { describe, expect, it } from "vitest";
import { confirmDraft, createDraft } from "../src/lib/domain";
import { collectionPrefill, getCollectionTasks } from "../src/lib/collection-tasks";
import { observationProvenance } from "../src/lib/provenance";
import type { DataSource, PhotoSource, ReadinessRequirement, StoredState } from "../src/lib/types";

function source(id: string, format: DataSource["inputFormat"] = "manual-text"): DataSource { return { id, name: id, organisation: null, country: "Fiji", reportingYear: 2026, sourceType: format === "image" ? "photo-scan" : "field-observation", inputFormat: format, originalFilename: null, sheetName: null, importedAt: "2026-01-01T00:00:00.000Z", notes: null, archivedAt: null }; }
function record(id: string, from: DataSource, date = "2026-09-12") { const draft = createDraft({ country: "FJ", commodity: "taro", stage: "storage", date, location: "Vava'u" }); draft.incoming.amount = 120; draft.affected.amount = 15; draft.allocations = [{ destination: "discarded", quantity: { amount: 15, unit: "kg", kgPerCrate: null } }]; return { ...confirmDraft(draft, "2026-10-04T00:00:00.000Z", observationProvenance(from, draft, formatMethod(from.inputFormat))), id }; }
function formatMethod(format: DataSource["inputFormat"]): "voice" | "text" | "manual" { return format === "voice" ? "voice" : format === "manual-text" ? "manual" : "text"; }
function requirement(overrides: Partial<ReadinessRequirement> = {}): ReadinessRequirement { return { id: "taro-storage", country: "FJ", commodity: "taro", stage: "storage", requiredRegions: ["Vava'u"], targetObservations: 5, acceptedMeasurementMethods: ["weighed", "estimated", "unknown"], baselineRequired: false, priorityWeight: 3, ...overrides }; }
function state(records: StoredState["records"] = [], sources: DataSource[] = [], partial: Partial<StoredState> = {}): StoredState { return { schemaVersion: 1, draft: null, records, trials: [], imports: [], photoSources: [], sources, qualityIssueStates: {}, duplicateExcludedRecordIds: [], readinessRequirements: [requirement()], collectionTaskStates: {}, ...partial }; }

describe("Collection and review tasks", () => {
  it("creates a configured collection task when evidence is missing", () => {
    const task = getCollectionTasks(state(), "FJ").find((item) => item.category === "collect")!; expect(task.status).toBe("open"); expect(task.remaining).toBe(5); expect(task.actionHref).toContain("commodity=taro");
  });

  it("uses manual, voice, and imported-format records through the same canonical count", () => {
    const sources = [source("manual"), source("voice", "voice"), source("xlsx", "xlsx")]; const records = sources.map((item, index) => record(String(index), item, `2026-09-${12 + index}`)); const task = getCollectionTasks(state(records, sources), "FJ").find((item) => item.category === "collect")!; expect(task.usable).toBe(3); expect(task.remaining).toBe(2);
  });

  it("keeps excluded duplicates out of the usable count", () => {
    const one = source("one"); const first = record("first", one); const second = record("second", one); const task = getCollectionTasks(state([first, second], [one], { duplicateExcludedRecordIds: ["second"] }), "FJ").find((item) => item.category === "collect")!; expect(task.usable).toBe(0); expect(task.remaining).toBe(5);
  });

  it("creates a photo review task before additional collection", () => {
    const photo: PhotoSource = { id: "photo", imageId: "image", originalFilename: "notebook.jpg", mimeType: "image/jpeg", sourceName: "Notebook", organisation: null, country: "Fiji", reportingYear: 2026, location: "Vava'u", sourceType: "other", importedAt: "2026-01-01T00:00:00.000Z", extractedAt: "2026-01-01T00:00:00.000Z", extractionMethod: "openai-vision", detectedCount: 1, confirmedRecordIds: [], documentWarnings: [], pendingCandidates: [{ draft: createDraft({ country: "FJ", commodity: "taro", stage: "storage", date: "2026-09-12", location: "Vava'u" }), original: createDraft({ country: "FJ", commodity: "taro", stage: "storage", date: "2026-09-12", location: "Vava'u" }), index: 0, confidence: { affected: .6 }, unresolved: ["affected crate conversion"] }] };
    const tasks = getCollectionTasks(state([], [source("photo:photo", "image")], { photoSources: [photo] }), "FJ"); expect(tasks[0].category).toBe("review"); expect(tasks[0].actionHref).toContain("source=photo"); const collect = tasks.find((task) => task.category === "collect")!; expect(collect.blockedPotential).toBe(1); expect(collect.remainingAfterPotential).toBe(4);
  });

  it("closes the collection task once the configured target is satisfied", () => {
    const sources = Array.from({ length: 5 }, (_, index) => source(String(index))); const records = sources.map((item, index) => record(String(index), item, `2026-09-${12 + index}`)); const task = getCollectionTasks(state(records, sources), "FJ").find((item) => item.category === "collect")!; expect(task.status).toBe("satisfied");
  });

  it("validates and applies task context to the existing observation workflow", () => {
    const prefill = collectionPrefill(new URLSearchParams("collect=1&task=collect%3Ataro&country=FJ&commodity=taro&stage=storage&region=Vava%27u")); expect(prefill?.context).toMatchObject({ country: "FJ", commodity: "taro", stage: "storage", location: "Vava'u" }); expect(collectionPrefill(new URLSearchParams("collect=1&country=FJ"))).toBeNull();
  });
});
