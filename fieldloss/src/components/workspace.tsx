"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { BenchmarkTrial, ConfirmedRecord, Draft, StoredState } from "@/lib/types";
import { createDraft } from "@/lib/domain";
import { decodeState, encodeState, STORAGE_KEY, upsertRecord } from "@/lib/storage";
import { sampleRecords } from "@/lib/samples";

type Workspace = {
  state: StoredState; ready: boolean; storageError: string | null;
  setDraft: (draft: Draft | null) => void;
  saveRecord: (record: ConfirmedRecord) => Promise<void>;
  addTrial: (trial: BenchmarkTrial) => Promise<void>;
};
type Change = { kind: "draft"; draft: Draft | null } | { kind: "record"; record: ConfirmedRecord } | { kind: "trial"; trial: BenchmarkTrial };
const initial: StoredState = { schemaVersion: 1, draft: null, records: [], trials: [] };
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
      next = raw ? decodeState(raw) : { schemaVersion: 1, draft: createDraft(), records: sampleRecords(), trials: [] };
    } catch {
      next = { schemaVersion: 1, draft: createDraft(), records: sampleRecords(), trials: [] };
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
        else next = { ...latest, trials: latest.trials.some((trial) => trial.id === change.trial.id) ? latest.trials : [...latest.trials, change.trial] };
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
  };
  return <WorkspaceContext.Provider value={workspace}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("Workspace provider is missing.");
  return context;
}
