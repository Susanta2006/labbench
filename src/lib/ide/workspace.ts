import { useEffect, useRef, useState } from "react";
import { CORE_LANGUAGES as LANGUAGES } from "./languages";

export type Files = Record<string, string>; // path "python/main.py" -> content
const KEY = "labbench.workspace.v1";
const UPDATED_KEY = "labbench.workspace.updatedAt";

function seed(): Files {
  const f: Files = {};
  for (const l of LANGUAGES) for (const [n, c] of Object.entries(l.files)) f[`${l.id}/${n}`] = c;
  return f;
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
      if (raw) setFiles({ ...seed(), ...JSON.parse(raw) });
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
