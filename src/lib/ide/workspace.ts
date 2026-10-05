import { useEffect, useRef, useState } from "react";
import { CORE_LANGUAGES as LANGUAGES } from "./languages";

export type Files = Record<string, string>; // path "python/main.py" -> content
const KEY = "labbench.workspace.v1";

function seed(): Files {
  const f: Files = {};
  for (const l of LANGUAGES) for (const [n, c] of Object.entries(l.files)) f[`${l.id}/${n}`] = c;
  return f;
}

export function useWorkspace() {
  const [files, setFiles] = useState<Files>(() => seed());
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setFiles({ ...seed(), ...JSON.parse(raw) });
    } catch { /* ignore */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      localStorage.setItem(KEY, JSON.stringify(files));
      setSaved(true);
    }, 1500);
  }, [files, loaded]);

  const saveNow = () => { localStorage.setItem(KEY, JSON.stringify(files)); setSaved(true); };
  return { files, setFiles, saved, saveNow, loaded };
}
