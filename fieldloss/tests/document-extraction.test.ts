import { describe, expect, it } from "vitest";
import { confirmDraft, evaluateDraft } from "../src/lib/domain";
import { documentObservationToDraft, type ExtractedDocumentObservation } from "../src/lib/document-extraction";
import { decodeState, encodeState } from "../src/lib/storage";
import type { PhotoSource } from "../src/lib/types";

const empty: ExtractedDocumentObservation = { commodity: null, country: null, region: null, location: null, date: null, stage: null, incoming: null, affected: null, allocations: [], cause: null, measurement: null, notes: null, confidenceByField: {}, unresolvedFields: [] };

describe("photo and scan extraction candidates", () => {
  it("turns one supported observation into the existing review draft and validation pipeline", () => {
    const draft = documentObservationToDraft({ ...empty, commodity: "tomatoes", country: "FJ", location: "Sigatoka", date: "2026-09-12", stage: "transport", incoming: { amount: 180, unit: "kg", kgPerCrate: null }, affected: { amount: 22, unit: "kg", kgPerCrate: null }, allocations: [{ destination: "animal_feed", quantity: { amount: 8, unit: "kg", kgPerCrate: null } }, { destination: "discarded", quantity: { amount: 14, unit: "kg", kgPerCrate: null } }], cause: "bruised", measurement: "unknown", notes: "Sigatoka tomato shipment" }, { country: null, location: null });
    expect(evaluateDraft(draft).issues).toEqual([]);
    expect(confirmDraft(draft, "2026-10-04T00:00:00.000Z").lossKg).toBe(14);
  });

  it("keeps an absent destination absent so existing validation requests it", () => {
    const draft = documentObservationToDraft({ ...empty, incoming: { amount: 120, unit: "kg", kgPerCrate: null }, affected: { amount: 17, unit: "kg", kgPerCrate: null } }, { country: "FJ", location: null });
    expect(draft.allocations).toEqual([]);
    expect(evaluateDraft(draft).issues.some((issue) => issue.field === "allocations")).toBe(true);
  });

  it("does not invent a kilogram conversion for crates", () => {
    const draft = documentObservationToDraft({ ...empty, commodity: "taro", incoming: { amount: 20, unit: "crates", kgPerCrate: null }, affected: { amount: 4, unit: "crates", kgPerCrate: null } }, { country: "FJ", location: null });
    expect(draft.affected).toEqual({ amount: 4, unit: "crates", kgPerCrate: null });
    expect(evaluateDraft(draft).issues.some((issue) => issue.field === "affected.kgPerCrate")).toBe(true);
  });

  it("creates independently reviewable drafts for multiple document observations", () => {
    const observations = ["tomatoes", "taro", "bananas"].map((commodity) => documentObservationToDraft({ ...empty, commodity: commodity as "tomatoes" | "taro" | "bananas" }, { country: "FJ", location: null }));
    expect(observations.map((draft) => draft.context.commodity)).toEqual(["tomatoes", "taro", "bananas"]);
  });

  it("persists structured photo provenance while image blobs stay outside localStorage", () => {
    const source: PhotoSource = { id: "source-1", imageId: "indexeddb-image-1", originalFilename: "notebook.jpg", mimeType: "image/jpeg", sourceName: "Field notebook", organisation: null, country: "Fiji", reportingYear: 2026, location: null, sourceType: "ministry_survey", importedAt: "2026-10-04T00:00:00.000Z", extractedAt: "2026-10-04T00:01:00.000Z", extractionMethod: "openai-vision", detectedCount: 1, confirmedRecordIds: [], documentWarnings: [], pendingCandidates: [] };
    const encoded = encodeState({ schemaVersion: 1, draft: null, records: [], trials: [], imports: [], photoSources: [source], sources: [], qualityIssueStates: {}, duplicateExcludedRecordIds: [], readinessRequirements: [] });
    expect(encoded).not.toContain("data:image");
    expect(decodeState(encoded).photoSources).toEqual([source]);
  });
});
