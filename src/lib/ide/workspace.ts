import { useEffect, useRef, useState } from "react";
import { CORE_LANGUAGES as LANGUAGES } from "./languages";

export type Files = Record<string, string>; // path "python/main.py" -> content
const KEY = "labbench.workspace.v1";
const UPDATED_KEY = "labbench.workspace.updatedAt";

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
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setFiles(removeUnusedStarterFiles(JSON.parse(raw)));
      setUpdatedAt(localStorage.getItem(UPDATED_KEY));
    } catch { /* ignore */ }
    setLoaded(true);
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
      localStorage.setItem(KEY, JSON.stringify(files));
      localStorage.setItem(UPDATED_KEY, timestamp);
      setUpdatedAt(timestamp);
      setSaved(true);
    }, 1500);
  }, [files, loaded]);

  const saveNow = () => {
    const timestamp = new Date().toISOString();
    localStorage.setItem(KEY, JSON.stringify(files));
    localStorage.setItem(UPDATED_KEY, timestamp);
    setUpdatedAt(timestamp);
    setSaved(true);
  };
  return { files, setFiles, saved, saveNow, loaded, updatedAt, setUpdatedAt };
}
