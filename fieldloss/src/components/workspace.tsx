"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { BenchmarkTrial, CollectionTask, CompilationApproval, ConfirmedRecord, DataQualityIssue, DataSource, Draft, DraftCompilationState, ImportBatch, PhotoSource, ReadinessRequirement, StoredState } from "@/lib/types";
import { createDraft } from "@/lib/domain";
import { decodeState, encodeState, STORAGE_KEY, upsertImport, upsertRecord } from "@/lib/storage";
import { sampleRecords } from "@/lib/samples";
import { archiveSource as archive, sourceFromImport, sourceFromPhoto } from "@/lib/provenance";
import { DEFAULT_READINESS_REQUIREMENTS } from "@/lib/readiness";

type Workspace = {
  state: StoredState; ready: boolean; storageError: string | null;
  setDraft: (draft: Draft | null) => void;
  saveRecord: (record: ConfirmedRecord) => Promise<void>;
  addTrial: (trial: BenchmarkTrial) => Promise<void>;
  saveImport: (batch: ImportBatch) => Promise<void>;
  updateImport: (batch: ImportBatch) => Promise<void>;
  savePhotoSource: (source: PhotoSource) => Promise<void>;
  updatePhotoSource: (source: PhotoSource) => Promise<void>;
  saveSource: (source: DataSource) => Promise<void>;
  archiveSource: (id: string) => Promise<void>;
  setQualityIssueStatus: (issue: DataQualityIssue, status: DataQualityIssue["status"]) => Promise<void>;
  excludeDuplicateRecord: (recordId: string, issue: DataQualityIssue) => Promise<void>;
  saveReadinessRequirements: (requirements: ReadinessRequirement[]) => Promise<void>;
  setCollectionTaskStatus: (task: CollectionTask, status: "in-progress" | "dismissed") => Promise<void>;
  saveDraftCompilation: (compilation: DraftCompilationState) => Promise<void>;
  approveCompilationCommodity: (approval: CompilationApproval) => Promise<void>;
};
type Change = { kind: "draft"; draft: Draft | null } | { kind: "record"; record: ConfirmedRecord } | { kind: "trial"; trial: BenchmarkTrial } | { kind: "import"; batch: ImportBatch } | { kind: "import-update"; batch: ImportBatch } | { kind: "photo"; source: PhotoSource } | { kind: "photo-update"; source: PhotoSource } | { kind: "source"; source: DataSource } | { kind: "source-archive"; id: string } | { kind: "quality-status"; issue: DataQualityIssue; status: DataQualityIssue["status"] } | { kind: "duplicate-exclude"; recordId: string; issue: DataQualityIssue } | { kind: "readiness-requirements"; requirements: ReadinessRequirement[] } | { kind: "task-status"; task: CollectionTask; status: "in-progress" | "dismissed" } | { kind: "compilation"; compilation: DraftCompilationState } | { kind: "compilation-approval"; approval: CompilationApproval };
const initial: StoredState = { schemaVersion: 1, draft: null, records: [], trials: [], imports: [], photoSources: [], sources: [], qualityIssueStates: {}, duplicateExcludedRecordIds: [], readinessRequirements: DEFAULT_READINESS_REQUIREMENTS, collectionTaskStates: {} };
const WorkspaceContext = createContext<Workspace | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoredState>(initial);
  const stateRef = useRef(state);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    let next: StoredState;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      next = raw ? decodeState(raw) : { schemaVersion: 1, draft: createDraft(), records: sampleRecords(), trials: [], imports: [], photoSources: [], sources: [], qualityIssueStates: {}, duplicateExcludedRecordIds: [], readinessRequirements: DEFAULT_READINESS_REQUIREMENTS, collectionTaskStates: {} };
    } catch {
      next = { schemaVersion: 1, draft: createDraft(), records: sampleRecords(), trials: [], imports: [], photoSources: [], sources: [], qualityIssueStates: {}, duplicateExcludedRecordIds: [], readinessRequirements: DEFAULT_READINESS_REQUIREMENTS, collectionTaskStates: {} };
      setStorageError("Previous local data could not be read. Export any new records before closing this browser.");
      try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) localStorage.setItem(STORAGE_KEY + ":unreadable-backup", raw); } catch { /* Keep new drafts in memory if storage is disabled. */ }
    }
    stateRef.current = next; setState(next); setReady(true);
    const receive = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const latest = decodeState(event.newValue);
        const updated = { ...latest, draft: stateRef.current.draft };
        stateRef.current = updated; setState(updated);
      } catch { setStorageError("Another tab wrote unreadable data. Your current draft is kept; export your records."); }
    };
    window.addEventListener("storage", receive);
    return () => window.removeEventListener("storage", receive);
  }, []);

  async function commit(change: Change) {
    try {
      if (!navigator.locks) throw new Error("Saving requires a current Chrome or Edge browser with Web Locks support.");
      await navigator.locks.request(STORAGE_KEY + ":write", () => {
        // Read and merge inside an origin-wide lock; a stale tab never rewrites saved records or trials.
        const raw = localStorage.getItem(STORAGE_KEY);
        let latest = stateRef.current;
        if (raw) {
          try { latest = decodeState(raw); }
          catch { localStorage.setItem(STORAGE_KEY + ":unreadable-backup", raw); }
        }
        let next: StoredState;
        if (change.kind === "draft") next = { ...latest, draft: change.draft };
        else if (change.kind === "record") next = { ...latest, records: upsertRecord(latest.records, change.record), draft: latest.draft?.id === change.record.id ? null : latest.draft };
        else if (change.kind === "trial") next = { ...latest, trials: latest.trials.some((trial) => trial.id === change.trial.id) ? latest.trials : [...latest.trials, change.trial] };
        else if (change.kind === "import") next = { ...latest, imports: upsertImport(latest.imports, change.batch), sources: latest.sources.some((source) => source.id === sourceFromImport(change.batch).id) ? latest.sources : [sourceFromImport(change.batch), ...latest.sources] };
        else if (change.kind === "import-update") {
          if (!latest.imports.some((item) => item.id === change.batch.id)) throw new Error("This imported dataset is no longer available. Reload Datasets and try again.");
          next = { ...latest, imports: latest.imports.map((item) => item.id === change.batch.id ? change.batch : item) };
        } else if (change.kind === "photo") next = { ...latest, photoSources: latest.photoSources.some((item) => item.id === change.source.id) ? latest.photoSources : [change.source, ...latest.photoSources], sources: latest.sources.some((item) => item.id === sourceFromPhoto(change.source).id) ? latest.sources : [sourceFromPhoto(change.source), ...latest.sources] };
        else if (change.kind === "photo-update") { if (!latest.photoSources.some((item) => item.id === change.source.id)) throw new Error("This photo source is no longer available. Reload and try again."); next = { ...latest, photoSources: latest.photoSources.map((item) => item.id === change.source.id ? change.source : item), sources: latest.sources.map((item) => item.id === sourceFromPhoto(change.source).id ? { ...sourceFromPhoto(change.source), archivedAt: item.archivedAt } : item) }; }
        else if (change.kind === "source") next = { ...latest, sources: latest.sources.some((item) => item.id === change.source.id) ? latest.sources : [change.source, ...latest.sources] };
        else if (change.kind === "source-archive") { const source = latest.sources.find((item) => item.id === change.id); if (!source) throw new Error("This source is no longer available. Reload and try again."); next = { ...latest, sources: latest.sources.map((item) => item.id === change.id ? archive(item) : item) }; }
        else if (change.kind === "quality-status") next = { ...latest, qualityIssueStates: { ...latest.qualityIssueStates, [change.issue.id]: { status: change.status, updatedAt: new Date().toISOString() } } };
        else if (change.kind === "duplicate-exclude") next = { ...latest, duplicateExcludedRecordIds: latest.duplicateExcludedRecordIds.includes(change.recordId) ? latest.duplicateExcludedRecordIds : [...latest.duplicateExcludedRecordIds, change.recordId], qualityIssueStates: { ...latest.qualityIssueStates, [change.issue.id]: { status: "resolved", updatedAt: new Date().toISOString() } } };
        else if (change.kind === "readiness-requirements") next = { ...latest, readinessRequirements: change.requirements };
        else if (change.kind === "task-status") next = { ...latest, collectionTaskStates: { ...(latest.collectionTaskStates ?? {}), [change.task.id]: { status: change.status, updatedAt: new Date().toISOString() } } };
        else if (change.kind === "compilation") next = { ...latest, draftCompilation: change.compilation };
        else { const previous = latest.draftCompilation ?? { config: { country: "FJ" as const, baselineYear: null, currentYear: null, commodityBasket: [], aggregationMethod: "weighted-production" as const }, approvals: [] }; next = { ...latest, draftCompilation: { ...previous, approvals: [...previous.approvals.filter((item) => item.commodity !== change.approval.commodity), change.approval] } }; }
        localStorage.setItem(STORAGE_KEY, encodeState(next));
        // A queued draft write must not rewind text already edited in this tab.
        const localDraft = change.kind === "record" && stateRef.current.draft?.id === change.record.id ? null : stateRef.current.draft;
        const updated = { ...next, draft: localDraft };
        stateRef.current = updated; setState(updated); setStorageError(null);
      });
    } catch (caught) {
      const message = caught instanceof Error && (caught.message.includes("Web Locks") || caught.message.includes("already confirmed")) ? caught.message : "This browser could not save the record. Your draft is still available; free some browser storage and try again.";
      setStorageError(message); throw new Error(message);
    }
  }

  const workspace: Workspace = {
    state, ready, storageError,
    setDraft: (draft) => {
      const updated = { ...stateRef.current, draft }; stateRef.current = updated; setState(updated);
      void commit({ kind: "draft", draft }).catch(() => { /* Error is displayed; keep the editable draft in memory. */ });
    },
    saveRecord: (record) => commit({ kind: "record", record }),
    addTrial: (trial) => commit({ kind: "trial", trial }),
    saveImport: (batch) => commit({ kind: "import", batch }),
    updateImport: (batch) => commit({ kind: "import-update", batch }),
    savePhotoSource: (source) => commit({ kind: "photo", source }),
    updatePhotoSource: (source) => commit({ kind: "photo-update", source }),
    saveSource: (source) => commit({ kind: "source", source }),
    archiveSource: (id) => commit({ kind: "source-archive", id }),
    setQualityIssueStatus: (issue, status) => commit({ kind: "quality-status", issue, status }),
    excludeDuplicateRecord: (recordId, issue) => commit({ kind: "duplicate-exclude", recordId, issue }),
    saveReadinessRequirements: (requirements) => commit({ kind: "readiness-requirements", requirements }),
    setCollectionTaskStatus: (task, status) => commit({ kind: "task-status", task, status }),
    saveDraftCompilation: (compilation) => commit({ kind: "compilation", compilation }),
    approveCompilationCommodity: (approval) => commit({ kind: "compilation-approval", approval }),
  };
  return <WorkspaceContext.Provider value={workspace}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("Workspace provider is missing.");
  return context;
}
