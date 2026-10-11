import { useEffect, useRef, useState } from "react";
import { CORE_LANGUAGES as LANGUAGES } from "./languages";

export type Files = Record<string, string>; // path "python/main.py" -> content
const KEY = "labbench.workspace.v1";
const UPDATED_KEY = "labbench.workspace.updatedAt";
const DB_NAME = "labbench-workspace";
const DB_STORE = "workspace";

function openWorkspaceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open workspace storage"));
  });
}

async function readWorkspace(): Promise<Files | null> {
  const db = await openWorkspaceDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get("files");
    request.onsuccess = () => { db.close(); resolve((request.result as Files | undefined) ?? null); };
    request.onerror = () => { db.close(); reject(request.error ?? new Error("Could not read workspace")); };
  });
}

async function writeWorkspace(files: Files): Promise<void> {
  const db = await openWorkspaceDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, "readwrite");
    transaction.objectStore(DB_STORE).put(files, "files");
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("Could not save workspace")); };
  });
}

async function persistWorkspace(files: Files): Promise<void> {
  try {
    await writeWorkspace(files);
    localStorage.removeItem(KEY);
  } catch {
    localStorage.setItem(KEY, JSON.stringify(files));
  }
}

function seed(): Files {
  return {};
}

export function removeUnusedStarterFiles(files: Files): Files {
  const next = { ...files };
  for (const language of LANGUAGES) {
    for (const [name, content] of Object.entries(language.files)) {
      const path = `${language.id}/${name}`;
      // Remove the untouched starter files that older versions pre-created in every folder.
      if (next[path] === content) delete next[path];
    }
  }
  return next;
}

export function useWorkspace() {
  const [files, setFiles] = useState<Files>(() => seed());
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const initialLoadComplete = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      let stored: Files | null = null;
      try { stored = await readWorkspace(); } catch { /* use legacy storage below */ }
      if (!stored) {
        try {
          const raw = localStorage.getItem(KEY);
          if (raw) {
            stored = JSON.parse(raw) as Files;
            try { await writeWorkspace(stored); localStorage.removeItem(KEY); } catch { /* retain the legacy copy */ }
          }
        } catch { /* ignore invalid legacy data */ }
      }
      if (!live) return;
      if (stored) setFiles(removeUnusedStarterFiles(stored));
      try { setUpdatedAt(localStorage.getItem(UPDATED_KEY)); } catch { /* ignore */ }
      setLoaded(true);
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (!initialLoadComplete.current) {
      initialLoadComplete.current = true;
      return;
    }
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const timestamp = new Date().toISOString();
      void persistWorkspace(files).then(() => {
        localStorage.setItem(UPDATED_KEY, timestamp);
        setUpdatedAt(timestamp);
        setSaved(true);
      }).catch(() => setSaved(false));
    }, 1500);
  }, [files, loaded]);

  const saveNow = () => {
    const timestamp = new Date().toISOString();
    void persistWorkspace(files).then(() => {
      localStorage.setItem(UPDATED_KEY, timestamp);
      setUpdatedAt(timestamp);
      setSaved(true);
    }).catch(() => setSaved(false));
  };
  return { files, setFiles, saved, saveNow, loaded, updatedAt, setUpdatedAt };
}
