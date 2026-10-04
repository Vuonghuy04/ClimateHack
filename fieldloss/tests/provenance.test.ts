import { describe, expect, it } from "vitest";
import { createDraft, confirmDraft } from "../src/lib/domain";
import { createCandidates } from "../src/lib/mapping";
import { archiveSource, observationProvenance, photoProvenance, sourceFromImport, sourceFromObservation, sourceFromPhoto } from "../src/lib/provenance";
import { recordsToCsv } from "../src/lib/storage";
import type { ColumnMapping, ImportBatch, PhotoSource } from "../src/lib/types";

function completeDraft() { const draft = createDraft({ country: "FJ", commodity: "taro", stage: "transport", date: "2026-10-04", location: "Suva" }); draft.incoming.amount = 100; draft.affected.amount = 21; draft.allocations = [{ destination: "discarded", quantity: { amount: 21, unit: "kg", kgPerCrate: null } }]; return draft; }
const mapping = (...entries: [string, ColumnMapping["target"]][]): ColumnMapping[] => entries.map(([sourceColumnId, target]) => ({ sourceColumnId, target, confidence: .88, reasoning: "Source header", suggestedTransformation: null, method: "ai-suggested-human-confirmed" }));

describe("unified source and provenance model", () => {
  it("keeps voice and typed observations traceable through review and validation", () => {
    const voiceSource = sourceFromObservation("voice", "2026-10-04T00:00:00.000Z");
    const voice = observationProvenance(voiceSource, completeDraft(), "voice", "2026-10-04T00:00:00.000Z");
    expect(voice.origin).toBe("voice"); expect(voice.source.transcriptionMethod).toBe("openai-transcription"); expect(voice.fields.find((item) => item.field === "affected")?.mappingMethod).toBe("ai-extraction");
    const typed = observationProvenance(sourceFromObservation("manual-text", "2026-10-04T00:00:00.000Z"), completeDraft(), "manual", "2026-10-04T00:00:00.000Z");
    expect(typed.origin).toBe("manual-text"); expect(typed.source.extractionMethod).toBeNull();
  });

  it("retains CSV/XLSX filename, sheet, row, original units and mapping method", () => {
    const batch: ImportBatch = { id: "ngo-study", datasetName: "NGO Taro Study", originalFilename: "survey.xlsx", fileType: "xlsx", sheetName: "Results", organisation: "NGO", country: "Fiji", reportingYear: 2026, sourceType: "ngo_project", notes: null, importedAt: "2026-10-04T00:00:00.000Z", headers: [{ id: "crop", label: "crop", originalLabel: "crop", sourceIndex: 0 }, { id: "loss", label: "loss", originalLabel: "loss", sourceIndex: 1 }, { id: "unit", label: "unit", originalLabel: "unit", sourceIndex: 2 }, { id: "stage", label: "stage", originalLabel: "stage", sourceIndex: 3 }, { id: "country", label: "country", originalLabel: "country", sourceIndex: 4 }], rawRows: [{ sourceRowNumber: 28, values: { crop: "taro", loss: 0.021, unit: "tonnes", stage: "transport", country: "Fiji" } }], status: "mapping-required", parseWarnings: [], mapping: { mappings: mapping(["crop", "commodity"], ["loss", "affectedAmount"], ["unit", "affectedUnit"], ["stage", "stage"], ["country", "country"]), defaults: { applyDatasetCountry: false, applyReportingYear: false }, confirmedAt: "2026-10-04T00:00:00.000Z", method: "ai-suggested-human-confirmed" }, candidates: [] };
    const candidate = createCandidates(batch, batch.mapping!.mappings, batch.mapping!.defaults)[0];
    expect(sourceFromImport(batch)).toMatchObject({ name: "NGO Taro Study", inputFormat: "xlsx", originalFilename: "survey.xlsx", sheetName: "Results" });
    expect(candidate.trace?.source).toMatchObject({ importBatchId: "ngo-study", sheetName: "Results", rowNumber: 28 });
    expect(candidate.trace?.fields.find((item) => item.field === "affectedUnit")).toMatchObject({ originalValue: "tonnes", normalizedValue: "kg", transformation: "tonnes_to_kg", mappingMethod: "ai-suggested-human-confirmed" });
  });

  it("tracks photo extraction and field-level human correction without replacing the image reference", () => {
    const source: PhotoSource = { id: "photo-1", imageId: "blob-1", originalFilename: "notebook.jpg", mimeType: "image/jpeg", sourceName: "Sigatoka notebook", organisation: null, country: "Fiji", reportingYear: 2026, location: null, sourceType: "other", importedAt: "2026-10-04T00:00:00.000Z", extractedAt: "2026-10-04T00:01:00.000Z", extractionMethod: "openai-vision", detectedCount: 1, confirmedRecordIds: [], documentWarnings: [], pendingCandidates: [] };
    const original = completeDraft(); const reviewed = { ...original, allocations: [{ destination: "animal_feed" as const, quantity: { amount: 8, unit: "kg" as const, kgPerCrate: null } }, { destination: "discarded" as const, quantity: { amount: 13, unit: "kg" as const, kgPerCrate: null } }] };
    const trace = photoProvenance(source, original, reviewed, 1, { affected: .8 }, "2026-10-04T00:02:00.000Z");
    expect(sourceFromPhoto(source).inputFormat).toBe("image"); expect(trace.source.imageId).toBe("blob-1"); expect(trace.source.extractedObservationIndex).toBe(1); expect(trace.fields.find((item) => item.field === "allocations")?.manuallyCorrected).toBe(true);
  });

  it("adds optional provenance export columns and archives sources without deleting records", () => {
    const source = sourceFromObservation("manual-text", "2026-10-04T00:00:00.000Z"); const trace = observationProvenance(source, completeDraft(), "manual", "2026-10-04T00:00:00.000Z"); const record = confirmDraft(completeDraft(), "2026-10-04T00:00:00.000Z", trace);
    const csv = recordsToCsv([record], { includeProvenance: true, sources: [source] });
    expect(csv).toContain("source_id"); expect(csv).toContain(source.id); expect(archiveSource(source, "2026-10-05T00:00:00.000Z").archivedAt).toBe("2026-10-05T00:00:00.000Z");
  });
});
