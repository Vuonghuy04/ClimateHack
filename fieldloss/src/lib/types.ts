export type Country = "AU" | "FJ";
export type Commodity = "tomatoes" | "bananas" | "taro";
export type Stage = "handling" | "storage" | "transport";
export type Unit = "kg" | "g" | "tonnes" | "crates" | "unknown";
export type Destination = "discarded" | "composted" | "donated" | "resold" | "animal_feed" | "productive_use" | "unknown";
export type Measurement = "weighed" | "estimated" | "unknown";
export type Context = { country: Country; commodity: Commodity; stage: Stage; date: string; location: string };
export type Quantity = { amount: number | null; unit: Unit; kgPerCrate: number | null };
export type Allocation = { destination: Destination; quantity: Quantity };
export type Evidence = Partial<Record<"incoming" | "affected" | "cause" | "allocations" | "commodity" | "stage", string>>;
export type Draft = {
  id: string;
  context: Context;
  transcript: string;
  incoming: Quantity;
  affected: Quantity;
  allocations: Allocation[];
  cause: string | null;
  measurement: Measurement;
  evidence: Evidence;
  detectedContext: { country: Country | null; commodity: Commodity | null; stage: Stage | null };
  acknowledgedConflicts: string[];
};
export type Issue = { field: string; message: string; kind: "missing" | "invalid" | "conflict" };
export type Evaluation = { issues: Issue[]; incomingKg: number | null; affectedKg: number | null; lossKg: number | null; lossPercent: number | null };
export type InputFormat = "voice" | "manual-text" | "csv" | "xlsx" | "image" | "pdf" | "legacy";
export type DataSourceType = "field-observation" | "ministry-survey" | "statistics-survey" | "flapp" | "ngo-project" | "research" | "administrative" | "spreadsheet" | "photo-scan" | "other";
export type DataSource = { id: string; name: string; organisation: string | null; country: string | null; reportingYear: number | null; sourceType: DataSourceType; inputFormat: InputFormat; originalFilename: string | null; sheetName: string | null; importedAt: string; notes: string | null; archivedAt: string | null };
export type FieldProvenance = { field: string; sourceField: string | null; originalValue: unknown; normalizedValue: unknown; transformation: string | null; aiConfidence: number | null; mappingMethod: "ai-suggested-human-confirmed" | "manual" | "ai-extraction" | "direct" | null; manuallyCorrected: boolean; correctedAt: string | null; evidence: string | null };
export type FieldChange = { field: string; previousValue: unknown; newValue: unknown; timestamp: string; origin: "ai-extraction" | "ai-mapping" | "normalization" | "user" | "validation-resolution" | "migration"; reason: string | null };
export type SourceReference = { importBatchId: string | null; originalFilename: string | null; sheetName: string | null; rowNumber: number | null; rawRowReference: string | null; imageId: string | null; extractedObservationIndex: number | null; extractionTimestamp: string | null; extractionMethod: string | null; transcriptionMethod: string | null };
export type ValidationProvenance = { status: "passed" | "needs-review" | "legacy-unknown"; evaluatedAt: string | null; issueCount: number; issues: Issue[] };
export type RecordProvenance = { id: string; sourceId: string; origin: "voice" | "manual-text" | "spreadsheet" | "photo-scan" | "legacy"; inputFormat: InputFormat; source: SourceReference; fields: FieldProvenance[]; audit: FieldChange[]; validation: ValidationProvenance; reviewedAt: string | null };
export type ConfirmedRecord = {
  id: string;
  context: Context;
  transcript: string;
  incomingKg: number;
  affectedKg: number;
  allocations: { destination: Destination; kg: number }[];
  lossKg: number;
  lossPercent: number;
  cause: string | null;
  measurement: Measurement;
  evidence: Evidence; provenance: RecordProvenance | null;
  confirmedAt: string;
  isSample: boolean;
};
export type PhotoCandidate = { draft: Draft; original: Draft; index: number; confidence: Record<string, number>; unresolved: string[] };
export type PhotoSource = { id: string; imageId: string; originalFilename: string; mimeType: string; sourceName: string | null; organisation: string | null; country: string | null; reportingYear: number | null; location: string | null; sourceType: DatasetSourceType; importedAt: string; extractedAt: string | null; extractionMethod: "openai-vision" | "manual-from-photo" | null; detectedCount: number; confirmedRecordIds: string[]; documentWarnings: string[]; pendingCandidates?: PhotoCandidate[] };
export type BenchmarkMode = "manual" | "assisted";
export type BenchmarkTrial = { id: string; scenarioId: string; mode: BenchmarkMode; inputMethod: "voice" | "text" | "manual"; elapsedMs: number; correct: boolean; errors: string[]; completedAt: string };
export type DatasetSourceType = "ministry_survey" | "national_statistics_survey" | "fao_flapp" | "ngo_project" | "research_study" | "administrative_data" | "fieldloss_export" | "other";
export type ImportStatus = "uploaded" | "mapping-required" | "mapped" | "validation-required" | "ready";
export type ImportCellValue = string | number | boolean | null;
export type ImportColumn = { id: string; label: string; originalLabel: string; sourceIndex: number };
export type ImportWarning = { code: string; message: string; rowNumber?: number };
// Raw rows are immutable source evidence. Mapping and normalized records will be stored separately later.
export type ImportedRawRow = { sourceRowNumber: number; values: Record<string, ImportCellValue> };
export type CanonicalField = "commodity" | "foodGroup" | "country" | "region" | "location" | "observationDate" | "reportingYear" | "stage" | "incomingAmount" | "incomingUnit" | "affectedAmount" | "affectedUnit" | "destination" | "cause" | "measurement" | "notes" | "sourceGeography" | "samplingStratum" | "periodFlag";
export type MappingTarget = CanonicalField | "ignored" | "unmapped";
export type MappingMethod = "ai-suggested-human-confirmed" | "manual";
export type ColumnMapping = { sourceColumnId: string; target: MappingTarget; confidence: number | null; reasoning: string | null; suggestedTransformation: string | null; method: MappingMethod | null };
export type MappingDefaults = { applyDatasetCountry: boolean; applyReportingYear: boolean };
export type MappingPlan = { mappings: ColumnMapping[]; defaults: MappingDefaults; confirmedAt: string; method: MappingMethod };
export type TransformationAudit = { sourceColumnId: string | null; sourceLabel: string; originalValue: ImportCellValue; normalizedValue: string | number | boolean | null; transformation: string; source: "row" | "dataset-metadata" };
export type CandidateCanonicalValues = {
  commodity: Commodity | null; foodGroup: string | null; country: Country | null; region: string | null; location: string | null; observationDate: string | null; reportingYear: number | null; stage: Stage | null;
  incoming: Quantity; affected: Quantity; destination: Destination | null; cause: string | null; measurement: Measurement | null; notes: string | null; sourceGeography: string | null; samplingStratum: string | null; periodFlag: string | null;
};
export type CandidateCanonicalRecord = { id: string; sourceRowNumber: number; values: CandidateCanonicalValues; provenance: Partial<Record<CanonicalField, TransformationAudit>>; trace: RecordProvenance | null; unresolvedFields: CanonicalField[]; validationIssues: Issue[]; validationStatus: "ready-for-review" | "needs-information"; mappingStatus: "candidate" };
export type DataQualityCategory = "duplicate" | "conflict" | "unit" | "definition" | "geography" | "time" | "measurement-method" | "source-confidence" | "conversion";
export type DataQualityIssue = { id: string; severity: "info" | "warning" | "error"; category: DataQualityCategory; recordIds: string[]; sourceIds: string[]; title: string; explanation: string; status: "open" | "resolved" | "accepted" };
export type QualityIssueState = { status: DataQualityIssue["status"]; updatedAt: string };
export type RecordQualityStatus = "clean" | "usable-with-warning" | "blocked" | "duplicate-excluded";
export type ReadinessCommodity = Commodity | "coconut" | "tuna";
export type ReadinessRequirement = { id: string; country: Country; commodity: ReadinessCommodity; stage: Stage; requiredRegions: string[]; targetObservations: number; acceptedMeasurementMethods: Measurement[]; baselineRequired: boolean; priorityWeight: 1 | 2 | 3 };
export type ReadinessCellStatus = "missing" | "blocked" | "partial" | "satisfied" | "na";
export type EvidenceGapType = "missing-data" | "geographic-coverage" | "time-coverage" | "missing-field" | "quality-blocker" | "source-confidence" | "measurement-method" | "baseline" | "fragmentation";
export type EvidenceGap = { id: string; country: Country; commodity: ReadinessCommodity | null; stage: Stage | null; region: string | null; type: EvidenceGapType; severity: "high" | "medium" | "low"; title: string; explanation: string; requirementId: string | null; supportingRecordIds: string[]; blockingIssueIds: string[]; sourceIds: string[]; priorityWeight: 1 | 2 | 3 };
export type CollectionTaskStatus = "open" | "in-progress" | "satisfied" | "dismissed";
export type CollectionTask = { id: string; category: "review" | "collect"; status: CollectionTaskStatus; priority: "high" | "medium" | "low"; country: Country; commodity: ReadinessCommodity; stage: Stage; region: string | null; requirementId: string; target: number; usable: number; blockedPotential: number; remaining: number; remainingAfterPotential: number; title: string; explanation: string; recordIds: string[]; issueIds: string[]; sourceIds: string[]; actionHref: string; actionLabel: string };
export type CollectionTaskState = { status: "in-progress" | "dismissed"; updatedAt: string };
export type CompilationCommodityConfig = { id: string; commodity: ReadinessCommodity; foodGroup: string | null; productionWeight: number | null };
export type DraftCompilationConfig = { country: Country; baselineYear: number | null; currentYear: number | null; commodityBasket: CompilationCommodityConfig[]; aggregationMethod: "weighted-production" | "unweighted-demonstration" };
export type CompilationApproval = { commodity: ReadinessCommodity; estimate: number; baselineEstimate: number | null; method: string; evidenceSourceIds: string[]; recordIds: string[]; approvedAt: string; action: "approved-for-draft-compilation" };
export type DraftCompilationState = { config: DraftCompilationConfig; approvals: CompilationApproval[] };
export type ImportBatch = {
  id: string; datasetName: string; originalFilename: string; fileType: "csv" | "xlsx" | "xls"; sheetName: string | null;
  organisation: string | null; country: string | null; reportingYear: number | null; sourceType: DatasetSourceType; notes: string | null;
  importedAt: string; headers: ImportColumn[]; rawRows: ImportedRawRow[]; status: ImportStatus; parseWarnings: ImportWarning[]; mapping: MappingPlan | null; candidates: CandidateCanonicalRecord[];
};
export type StoredState = { schemaVersion: 1; draft: Draft | null; records: ConfirmedRecord[]; trials: BenchmarkTrial[]; imports: ImportBatch[]; photoSources: PhotoSource[]; sources: DataSource[]; qualityIssueStates: Record<string, QualityIssueState>; duplicateExcludedRecordIds: string[]; readinessRequirements: ReadinessRequirement[]; collectionTaskStates?: Record<string, CollectionTaskState>; draftCompilation?: DraftCompilationState };

export const COUNTRIES: Record<Country, string> = { AU: "Australia", FJ: "Fiji" };
export const COMMODITIES: Record<Commodity, string> = { tomatoes: "Tomatoes", bananas: "Bananas", taro: "Taro" };
export const STAGES: Record<Stage, string> = { handling: "Post-harvest handling", storage: "Storage", transport: "Transport" };
export const DESTINATIONS: Record<Destination, string> = { discarded: "Discarded", composted: "Composted", donated: "Donated", resold: "Sold elsewhere", animal_feed: "Animal feed", productive_use: "Other productive use", unknown: "Destination unknown" };
export const DATASET_SOURCE_TYPES: Record<DatasetSourceType, string> = {
  ministry_survey: "Ministry survey", national_statistics_survey: "National statistics survey", fao_flapp: "FAO / FLAPP", ngo_project: "NGO / development project",
  research_study: "Research study", administrative_data: "Administrative data", fieldloss_export: "Previous FieldLoss export", other: "Other",
};
export const CANONICAL_FIELDS: Record<CanonicalField, string> = {
  commodity: "Commodity", foodGroup: "Food group", country: "Country", region: "Region / admin area", location: "Location", observationDate: "Observation date", reportingYear: "Reporting / reference year", stage: "Supply-chain stage", incomingAmount: "Incoming quantity", incomingUnit: "Incoming quantity unit", affectedAmount: "Affected / rejected quantity", affectedUnit: "Affected / rejected quantity unit", destination: "Destination", cause: "Cause", measurement: "Measurement method", notes: "Notes", sourceGeography: "Source geography", samplingStratum: "Sampling stratum", periodFlag: "Baseline / current period flag",
};
