import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { toPng } from "html-to-image";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { createShare } from "@/lib/ide/share.functions";
import {
  Play,
  Square,
  Camera,
  Upload,
  Sun,
  Moon,
  FilePlus,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronRight,
  FileCode2,
  Folder,
  X,
  Globe,
  TerminalSquare,
  Cloud,
  UserRound,
  Download,
  RotateCcw,
  Plus,
  Menu,
  Share2,
  MoreHorizontal,
  LogOut,
  Wand2,
  GraduationCap,
  Loader2,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  CORE_LANGUAGES,
  EXTRA_LANGUAGES,
  langById,
  langForPath,
  monacoLanguage,
  readsInput,
  type Language,
} from "@/lib/ide/languages";
import { useWorkspace } from "@/lib/ide/workspace";
import { runRemote } from "@/lib/ide/run-remote.functions";
import { askAiTa } from "@/lib/ide/ai-ta.functions";
import { formatCode } from "@/lib/ide/format";
import { runShell } from "@/lib/ide/shell";
import { Terminal, type TerminalHandle } from "./Terminal";
import {
  syncWorkspaceWithGoogleDrive,
  uploadWorkspaceToGoogleDrive,
} from "@/lib/ide/google-drive";
import { ProModal } from "./ProModal";
import { WalkthroughTour } from "./WalkthroughTour";

type Status = "idle" | "running" | "done" | "error" | "stopped";
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
const DAILY_CREDITS = 5;
const today = () => new Date().toISOString().slice(0, 10);
const PREVIEW_BRIDGE = `<script>
(() => {
  const format = (value) => {
    if (typeof value === "string") return value;
    try { return JSON.stringify(value); } catch { return String(value); }
  };
  const report = (level, values) => parent.postMessage({
    source: "labbench-preview", level,
    text: values.map(format).join(" ")
  }, "*");
  ["log", "info", "warn", "error"].forEach((level) => {
    const original = console[level].bind(console);
    console[level] = (...values) => {
      original(...values);
      report(level, values);
    };
  });
  addEventListener("error", (event) => report("error", [event.message || "Preview runtime error"]));
  addEventListener("unhandledrejection", (event) => report("error", [event.reason]));
})();
</script>`;

function buildAiCode(lang: Language, path: string, files: Record<string, string>) {
  if (lang.kind === "web" || lang.kind === "react") {
    return Object.entries(files)
      .filter(([file]) => file.startsWith(`${lang.id}/`) && !file.endsWith(".keep"))
      .map(([file, code]) => `// ${file}\n${code}`)
      .join("\n\n");
  }
  return files[path] ?? "";
}

function buildPreview(lang: Language, files: Record<string, string>) {
  const inFolder = (n: string) => files[`${lang.id}/${n}`];
  if (lang.kind === "react") {
    const source = Object.keys(files)
      .filter((p) => p.startsWith("react/") && p.endsWith(".jsx"))
      .map((p) => files[p])
      .join("\n");
    // These files run as one Babel script, so resolve React imports against the UMD globals
    // and remove module boundaries that cannot exist in the combined preview.
    const jsx = source
      .replace(
        /^\s*import\s+(?:([\s\S]*?)\s+from\s+)?(["'])([^"']+)\2\s*;?\s*$/gm,
        (_statement, clause: string | undefined, _quote: string, moduleName: string) => {
          if (moduleName === "react" || moduleName === "react-dom" || moduleName === "react-dom/client") {
            const globalName = moduleName === "react" ? "React" : "ReactDOM";
            const bindings = clause?.trim();
            if (!bindings) return "";
            const defaultBinding = bindings.match(/^([\w$]+)(?=\s*(?:,|$))/)?.[1];
            const namespaceBinding = bindings.match(/\*\s+as\s+([\w$]+)/)?.[1];
            const namedBindings = bindings.match(/\{([\s\S]*?)\}/)?.[1];
            const lines: string[] = [];
            if (defaultBinding) lines.push(`const ${defaultBinding} = window.${globalName};`);
            if (namespaceBinding) lines.push(`const ${namespaceBinding} = window.${globalName};`);
            if (namedBindings) {
              const properties = namedBindings.replace(/\b([\w$]+)\s+as\s+([\w$]+)\b/g, "$1: $2");
              lines.push(`const {${properties}} = window.${globalName};`);
            }
            return lines.join("\n");
          }
          // Local JSX/CSS is combined below; other packages are unavailable in this browser preview.
          return "";
        },
      )
      .replace(/^\s*export\s+\*\s*(?:as\s+[\w$]+\s*)?from\s+["'][^"']+["']\s*;?\s*$/gm, "")
      .replace(/^\s*export\s+default\s+/gm, "")
      .replace(/^\s*export\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)/gm, "")
      .replace(/^\s*export\s*\{[^}]*\}(?:\s+from\s+["'][^"']+["'])?\s*;?\s*$/gm, "");
    const css = Object.keys(files)
      .filter((p) => p.startsWith("react/") && p.endsWith(".css"))
      .map((p) => files[p])
      .join("\n");
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style>
<script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js" crossorigin></script>
<script src="https://cdn.tailwindcss.com"></script>${PREVIEW_BRIDGE}</head><body><div id="root"></div>
<script>window.onerror=(m)=>{document.body.insertAdjacentHTML('beforeend','<pre style="color:#b00020;padding:12px">'+m+'</pre>')}</script>
<script>Babel.registerPreset("labbench-react", {presets: [[Babel.availablePresets.react, {runtime: "classic"}]]});</script>
<script type="text/babel" data-type="module" data-presets="labbench-react">${jsx.replace(/<\/script>/g, "<\\/script>")}</script></body></html>`;
  }
  let html = inFolder(lang.entry) ?? "<h1>No index.html</h1>";
  html = html.replace(/<link[^>]*href=["']([^"']+)["'][^>]*>/g, (m, href) =>
    inFolder(href) !== undefined ? `<style>${inFolder(href)}</style>` : m,
  );
  html = html.replace(/<script([^>]*)src=["']([^"']+)["']([^>]*)><\/script>/g, (m, a, src) =>
    inFolder(src) !== undefined
      ? `<script${a}>${inFolder(src)!.replace(/<\/script>/g, "<\\/script>")}</script>`
      : m,
  );
  if (/<head(?:\s[^>]*)?>/i.test(html)) html = html.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${PREVIEW_BRIDGE}`);
  else html = html.replace(/<body(?:\s[^>]*)?>/i, (body) => `${PREVIEW_BRIDGE}${body}`);
  return html;
}

const NODE_WORKER = `
const fmt = a => a.map(x => typeof x === 'string' ? x : (()=>{try{return JSON.stringify(x,null,2)}catch{return String(x)}})()).join(' ');
console.log = (...a) => postMessage({type:'out', text: fmt(a)+'\\n'});
console.info = console.log;
console.error = console.warn = (...a) => postMessage({type:'err', text: fmt(a)+'\\n'});
onmessage = async e => { try { await (new Function('return (async()=>{'+e.data+'\\n})()'))(); postMessage({type:'done',code:0}); }
 catch(err){ postMessage({type:'err', text: String(err && err.stack || err)+'\\n'}); postMessage({type:'done',code:1}); } };`;

export function IDE() {
  const { files, setFiles, saved, saveNow, loaded, updatedAt, setUpdatedAt } = useWorkspace();
  const [langId, setLangId] = useState("python");
  const [active, setActive] = useState("python/main.py");
  const [tabs, setTabs] = useState<string[]>(["python/main.py"]);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({ python: true });
  const [outTab, setOutTab] = useState<"preview" | "terminal">("terminal");
  const [inkSaver, setInkSaver] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [previewDoc, setPreviewDoc] = useState("");
  const [split, setSplit] = useState(52);
  const [toast, setToast] = useState("");
  const [addedLangs, setAddedLangs] = useState<string[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ai, setAi] = useState<{ open: boolean; loading: boolean; text: string; error: string }>({
    open: false,
    loading: false,
    text: "",
    error: "",
  });
  const [credits, setCredits] = useState({ date: today(), used: 0 });
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [more, setMore] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [sharing, setSharing] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [driveSyncState, setDriveSyncState] = useState<"disconnected" | "syncing" | "synced" | "error">("disconnected");
  const [uploadingDrive, setUploadingDrive] = useState(false);
  const [driveUrl, setDriveUrl] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);

  const term = useRef<TerminalHandle>(null);
  const pyWorker = useRef<Worker | null>(null);
  const sab = useRef<SharedArrayBuffer | null>(null);
  const nodeWorker = useRef<Worker | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const previewFrame = useRef<HTMLIFrameElement>(null);
  const abortRef = useRef(false);
  const doneRef = useRef<(() => void) | null>(null);
  const outputLog = useRef("");
  const driveSyncQueue = useRef<Promise<void>>(Promise.resolve());
  const updatedAtRef = useRef(updatedAt);
  updatedAtRef.current = updatedAt;
  const lastRun = useRef<{ path: string; lang: string; code: string } | null>(null);
  const cwdRef = useRef("python");
  const shellHistory = useRef<string[]>([]);
  const shellWaiting = useRef(false);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const runRemoteFn = useServerFn(runRemote);
  const askAiFn = useServerFn(askAiTa);
  const createShareFn = useServerFn(createShare);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user.email ?? "");
      setDriveToken(data.session?.provider_token ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? "");
      setDriveToken(session?.provider_token ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const installed = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  const filesRef = useRef(files);
  filesRef.current = files;
  const activeRef = useRef(active);
  activeRef.current = active;

  const languages = useMemo(
    () => [...CORE_LANGUAGES, ...EXTRA_LANGUAGES.filter((l) => addedLangs.includes(l.id))],
    [addedLangs],
  );
  const activeLang = langForPath(active) ?? langById(langId) ?? langById("python")!;
  useEffect(() => {
    if (!active) {
      setLangId("");
      cwdRef.current = "";
      return;
    }
    const top = active.split("/")[0];
    const l = (top && langById(top)) || langForPath(active);
    const directory = active.slice(0, active.lastIndexOf("/"));
    if (directory) cwdRef.current = directory;
    if (l) setOpenFolders((folders) => ({ ...folders, [l.id]: true }));
    if (l && l.id !== langId) {
      setLangId(l.id);
    }
    if (shellWaiting.current && term.current?.isReady()) {
      term.current.write(`\r\n${prompt()}`);
    }
    setFailed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  const isWeb = activeLang.kind === "web" || activeLang.kind === "react";
  const creditsLeft = credits.date === today() ? DAILY_CREDITS - credits.used : DAILY_CREDITS;

  const flash = (m: string, folderUrl: string | null = null, duration = 2500) => {
    setToast(m);
    setDriveUrl(folderUrl);
    setTimeout(() => {
      setToast("");
      setDriveUrl(null);
    }, duration);
  };
  const installApp = async () => {
    setMore(false);
    const isInstalled = window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (isInstalled) {
      flash("LabBench is already installed.", null, 5000);
      return;
    }
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      flash(choice.outcome === "accepted" ? "LabBench installed." : "Installation dismissed.", null, 5000);
      return;
    }
    const isAppleMobile = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    flash(
      isAppleMobile
        ? "In Safari, tap Share, then choose Add to Home Screen."
        : "In your browser menu, choose Install LabBench or Add to desktop.",
      null,
      7000,
    );
  };
  const write = (s: string) => {
    outputLog.current += s;
    term.current?.write(s);
  };

  const performDriveSync = useCallback(() => {
    if (!userEmail || !driveToken || !loaded || !saved) return Promise.resolve();
    const task = driveSyncQueue.current.then(async () => {
      setDriveSyncState("syncing");
      const result = await syncWorkspaceWithGoogleDrive(
        driveToken,
        filesRef.current,
        updatedAtRef.current,
      );
      if (!result.ok) {
        setDriveSyncState("error");
        return;
      }
      if (result.updatedAt) {
        updatedAtRef.current = result.updatedAt;
        localStorage.setItem("labbench.workspace.updatedAt", result.updatedAt);
        setUpdatedAt(result.updatedAt);
      }
      if (result.action === "pulled" && result.files) {
        filesRef.current = result.files;
        setFiles(result.files);
      }
      setDriveSyncState("synced");
    });
    driveSyncQueue.current = task.catch(() => {
      setDriveSyncState("error");
    });
    return task;
  }, [userEmail, driveToken, loaded, saved, setFiles, setUpdatedAt]);

  useEffect(() => {
    if (!loaded) return;
    if (!userEmail || !driveToken) {
      setDriveSyncState("disconnected");
      return;
    }
    const timer = setTimeout(() => void performDriveSync(), 1800);
    return () => clearTimeout(timer);
  }, [files, loaded, userEmail, driveToken, updatedAt, performDriveSync]);

  useEffect(() => {
    if (!loaded || !userEmail || !driveToken) return;
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") void performDriveSync();
    };
    window.addEventListener("focus", syncWhenVisible);
    document.addEventListener("visibilitychange", syncWhenVisible);
    const interval = window.setInterval(syncWhenVisible, 30_000);
    return () => {
      window.removeEventListener("focus", syncWhenVisible);
      document.removeEventListener("visibilitychange", syncWhenVisible);
      window.clearInterval(interval);
    };
  }, [loaded, userEmail, driveToken, performDriveSync]);

  useEffect(() => {
    const onPreviewMessage = (event: MessageEvent) => {
      if (event.source !== previewFrame.current?.contentWindow) return;
      const message = event.data as { source?: string; level?: string; text?: string } | null;
      if (message?.source !== "labbench-preview" || typeof message.text !== "string") return;
      const line = `[preview ${message.level ?? "log"}] ${message.text}\n`;
      outputLog.current = (outputLog.current + line).slice(-16_000);
      if (message.level === "error") setFailed(true);
    };
    window.addEventListener("message", onPreviewMessage);
    return () => window.removeEventListener("message", onPreviewMessage);
  }, []);

  // Persisted prefs
  useEffect(() => {
    try {
      const l = localStorage.getItem("labbench.langs");
      if (l) setAddedLangs(JSON.parse(l));
      const c = localStorage.getItem("labbench.aiCredits");
      if (c) setCredits(JSON.parse(c));
      setInkSaver(localStorage.getItem("labbench.ink") === "1");
    } catch {
      /* */
    }
  }, []);
  useEffect(() => {
    localStorage.setItem("labbench.ink", inkSaver ? "1" : "0");
  }, [inkSaver]);

  useEffect(() => {
    if (!isWeb) return;
    const t = setTimeout(() => {
      const path = activeRef.current;
      outputLog.current = "";
      lastRun.current = { path, lang: activeLang.label, code: buildAiCode(activeLang, path, files) };
      setFailed(false);
      setPreviewDoc(buildPreview(activeLang, files));
    }, 400);
    return () => clearTimeout(t);
  }, [files, isWeb, activeLang]);
  useEffect(() => {
    setOutTab(isWeb ? "preview" : "terminal");
  }, [isWeb]);

  const openFile = (p: string) => {
    setDrawer(false);
    setActive(p);
    const directory = p.slice(0, p.lastIndexOf("/"));
    const folder = directory.split("/")[0];
    if (directory) cwdRef.current = directory;
    if (folder) setOpenFolders((folders) => ({ ...folders, [folder]: true }));
    setTabs((t) => (t.includes(p) ? t : [...t, p]));
  };

  const selectLanguage = (l: Language) => {
    setDrawer(false);
    setLangId(l.id);
    cwdRef.current = l.id;
    setOpenFolders((o) => ({ ...o, [l.id]: true }));
    const entry = `${l.id}/${l.entry}`;
    const existing = Object.keys(filesRef.current).find(
      (p) => p.startsWith(l.id + "/") && !p.endsWith(".keep"),
    );
    if (filesRef.current[entry] === undefined && !existing) {
      setFiles((f) => ({
        ...f,
        ...Object.fromEntries(Object.entries(l.files).map(([n, c]) => [`${l.id}/${n}`, c])),
      }));
    }
    openFile(filesRef.current[entry] !== undefined || !existing ? entry : existing);
  };

  const addLanguage = (l: Language) => {
    const next = [...new Set([...addedLangs, l.id])];
    setAddedLangs(next);
    localStorage.setItem("labbench.langs", JSON.stringify(next));
    setShowAdd(false);
    selectLanguage(l);
    flash(`${l.label} added`);
  };
  const removeLanguage = (id: string) => {
    const next = addedLangs.filter((x) => x !== id);
    setAddedLangs(next);
    localStorage.setItem("labbench.langs", JSON.stringify(next));
    if (langId === id) selectLanguage(langById("python")!);
  };

  // ---------- Runners ----------
  const finish = (code: number) => {
    setExitCode(code);
    setStatus(code === 0 ? "done" : code === 130 ? "stopped" : "error");
    const isFail = code !== 0 && code !== 130;
    setFailed(isFail);
    write(`\r\n\x1b[90m[Process finished with exit code ${code}]\x1b[0m\r\n`);
    if (isFail)
      write("\x1b[36mStuck? Click \x1b[1m“Ask AI TA”\x1b[22m above for a hint.\x1b[0m\r\n");
    const d = doneRef.current;
    doneRef.current = null;
    d?.();
  };

  const spawnPython = useCallback(() => {
    pyWorker.current?.terminate();
    const w = new Worker(pyWorkerUrl());
    sab.current =
      typeof SharedArrayBuffer !== "undefined" && self.crossOriginIsolated
        ? new SharedArrayBuffer(8 + 65536)
        : null;
    w.postMessage({ type: "init", sab: sab.current });
    pyWorker.current = w;
    return w;
  }, []);
  useEffect(
    () => () => {
      pyWorker.current?.terminate();
      nodeWorker.current?.terminate();
    },
    [],
  );

  const runPython = (code: string) => {
    const w = pyWorker.current ?? spawnPython();
    const inputs: string[] = [];
    let seen = 0,
      shown = 0,
      attempt = 0;
    const emit = (t: string, err: boolean) => {
      const pos = seen;
      seen += t.length;
      if (seen <= shown) return;
      const s = t.slice(Math.max(0, shown - pos));
      shown = seen;
      write(err ? `\x1b[31m${s}\x1b[0m` : s);
    };
    w.onmessage = async (e) => {
      const m = e.data;
      if (m.type === "out") emit(m.text, false);
      else if (m.type === "err") emit(m.text, true);
      else if (m.type === "status") write(`\x1b[90m${m.text}\x1b[0m\r\n`);
      else if (m.type === "image") setImages((i) => [...i, m.data]);
      else if (m.type === "input") {
        const v = await term.current!.readLine();
        const ctrl = new Int32Array(sab.current!, 0, 2);
        const bytes = new TextEncoder().encode(v ?? "");
        new Uint8Array(sab.current!, 8).set(bytes.slice(0, 65536));
        ctrl[1] = v === null ? -1 : Math.min(bytes.length, 65536);
        Atomics.store(ctrl, 0, 1);
        Atomics.notify(ctrl, 0);
      } else if (m.type === "need-input") {
        const v = await term.current!.readLine();
        if (v === null || abortRef.current) return;
        outputLog.current += v + "\n";
        inputs.push(v);
        seen = 0;
        attempt++;
        w.postMessage({ type: "run", code, inputs, attempt });
      } else if (m.type === "done") finish(m.code);
    };
    w.postMessage({ type: "run", code, inputs: sab.current ? null : inputs, attempt });
  };

  const pip = (pkgs: string[], list = false) =>
    new Promise<void>((resolve) => {
      const w = pyWorker.current ?? spawnPython();
      w.onmessage = (e) => {
        const m = e.data;
        if (m.type === "out") write(m.text);
        else if (m.type === "err") write(`\x1b[31m${m.text}\x1b[0m`);
        else if (m.type === "status") write(`\x1b[90m${m.text}\x1b[0m\r\n`);
        else if (m.type === "pip-done") resolve();
      };
      w.postMessage({ type: "pip", pkgs, list });
    });

  const runNode = (code: string) => {
    nodeWorker.current?.terminate();
    const w = new Worker(URL.createObjectURL(new Blob([NODE_WORKER], { type: "text/javascript" })));
    nodeWorker.current = w;
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === "out") write(m.text);
      else if (m.type === "err") write(`\x1b[31m${m.text}\x1b[0m`);
      else if (m.type === "done") {
        finish(m.code);
        w.terminate();
        nodeWorker.current = null;
      }
    };
    w.postMessage(code);
  };

  const runCompiled = async (l: Language, code: string) => {
    let stdin = "";
    let shown = 0;
    const interactiveCapable = /^(gcc|clang|openjdk|mono|dotnet)/.test(l.compiler ?? "");
    if (!interactiveCapable && readsInput(code, l.id)) {
      write(
        "\x1b[36mThis language takes all input up front. Type each line, then press Ctrl+D to run.\x1b[0m\r\n",
      );
      for (;;) {
        const v = await term.current!.readLine();
        if (abortRef.current) return;
        if (v === null) break;
        stdin += v + "\n";
      }
    }
    write(
      `\x1b[90m${interactiveCapable || /^(rust|swift|go|d|zig|scala|haskell|pascal)/.test(l.id) ? "Compiling" : "Starting"} ${l.label}...\x1b[0m\r\n`,
    );
    for (let round = 0; round < 80; round++) {
      let r: Awaited<ReturnType<typeof runRemoteFn>>;
      try {
        r = await runRemoteFn({ data: { compiler: l.compiler!, language: l.id, code, stdin } });
      } catch (e) {
        write(`\x1b[31m${String(e)}\x1b[0m\r\n`);
        finish(1);
        return;
      }
      if (abortRef.current) return;
      if (round === 0 && r.compileError)
        write(`\x1b[33m${r.compileError}\x1b[0m${r.compileError.endsWith("\n") ? "" : "\r\n"}`);
      if (r.stdout.length > shown) {
        write(r.stdout.slice(shown));
        shown = r.stdout.length;
      }
      if (r.needInput && r.interactive) {
        const v = await term.current!.readLine();
        if (v === null || abortRef.current) return;
        outputLog.current += v + "\n";
        stdin += v + "\n";
        continue;
      }
      if (r.stderr) write(`\x1b[31m${r.stderr}\x1b[0m`);
      finish(Number.parseInt(r.status) || (r.status === "0" ? 0 : r.status ? 1 : 0));
      return;
    }
    write("\x1b[31mToo many input rounds.\x1b[0m\r\n");
    finish(1);
  };

  const stop = useCallback(() => {
    if (!doneRef.current) return;
    abortRef.current = true;
    pyWorker.current?.terminate();
    pyWorker.current = null;
    nodeWorker.current?.terminate();
    nodeWorker.current = null;
    if (!shellWaiting.current) term.current?.cancelRead();
    write("\x1b[90m[Process interrupted]\x1b[0m\r\n");
    finish(130);
  }, []);

  const runFile = (path: string) =>
    new Promise<void>((resolve) => {
      saveNow();
      const fs = filesRef.current;
      const l = langForPath(path);
      const code = fs[path] ?? "";
      if (!l) {
        write(`\x1b[31mDon't know how to run ${path}\x1b[0m\r\n`);
        resolve();
        return;
      }
      if (l.kind === "web" || l.kind === "react") {
        outputLog.current = "";
        lastRun.current = { path, lang: l.label, code: buildAiCode(l, path, fs) };
        setFailed(false);
        setPreviewDoc(buildPreview(l, fs));
        setOutTab("preview");
        write(`\x1b[90mOpened live preview for ${path}\x1b[0m\r\n`);
        resolve();
        return;
      }
      setOutTab("terminal");
      setImages([]);
      setFailed(false);
      setAi((a) => ({ ...a, open: false }));
      abortRef.current = false;
      outputLog.current = "";
      lastRun.current = { path, lang: l.label, code: buildAiCode(l, path, fs) };
      write(
        `\x1b[32m▶ ${path.split("/").pop()}\x1b[0m \x1b[90m(${l.label}${l.kind === "remote" ? ", online compiler" : ", on your PC"})\x1b[0m\r\n`,
      );
      setStatus("running");
      setExitCode(null);
      doneRef.current = resolve;
      if (l.kind === "python") runPython(code);
      else if (l.kind === "node") runNode(code);
      else void runCompiled(l, code);
    });

  // ---------- Shell ----------
  const prompt = () =>
    `\x1b[1;32mstudent@labbench\x1b[0m:\x1b[1;34m~${cwdRef.current ? "/" + cwdRef.current : ""}\x1b[0m$ `;

  const execLine = async (line: string) => {
    const r = runShell(line, filesRef.current, cwdRef.current, shellHistory.current);
    if (r.clear) term.current?.clear();
    if (r.out) term.current?.write(r.out);
    if (r.files) {
      setFiles(r.files);
      filesRef.current = r.files;
    }
    if (r.cwd !== undefined) cwdRef.current = r.cwd;
    if (r.action?.type === "run") await runFile(r.action.arg[0] ?? activeRef.current);
    else if (r.action?.type === "pip") await pip(r.action.arg);
    else if (r.action?.type === "piplist") await pip([], true);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      while (alive && !term.current?.isReady()) await sleep(80);
      if (!alive) return;
      term.current!.write(
        "\x1b[1;36mLabBench terminal\x1b[0m — type \x1b[1mhelp\x1b[0m for Linux commands, or press \x1b[1mRun\x1b[0m (Ctrl+Enter).\r\n",
      );
      while (alive) {
        term.current!.write(prompt());
        shellWaiting.current = true;
        const l = await term.current!.readLine({ history: true });
        shellWaiting.current = false;
        if (l === null || !alive) continue;
        if (l.trim()) shellHistory.current.push(l);
        try {
          await execLine(l.trim());
        } catch (e) {
          term.current!.write(`\x1b[31m${String(e)}\x1b[0m\r\n`);
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = () => {
    if (doneRef.current) return;
    if (isWeb) {
      const path = activeRef.current;
      outputLog.current = "";
      lastRun.current = { path, lang: activeLang.label, code: buildAiCode(activeLang, path, files) };
      setFailed(false);
      setPreviewDoc(buildPreview(activeLang, files));
      setOutTab("preview");
      write(`\x1b[90mOpened live preview for ${path}\x1b[0m\r\n`);
      return;
    }
    setOutTab("terminal");
    const file = activeRef.current;
    if (shellWaiting.current) term.current?.injectLine(`run ~/${file}`);
  };

  // ---------- Format ----------
  const format = async () => {
    const path = activeRef.current;
    const code = filesRef.current[path];
    if (code === undefined) return;
    try {
      const out = await formatCode(path, code);
      if (out === null) {
        await editorRef.current?.getAction("editor.action.formatDocument")?.run();
        flash("Formatted");
        return;
      }
      setFiles((f) => ({ ...f, [path]: out }));
      flash("Code formatted");
    } catch (e) {
      flash("Format failed: " + String(e).split("\n")[0]);
    }
  };

  const runRef = useRef(run);
  runRef.current = run;
  const formatRef = useRef(format);
  formatRef.current = format;
  const stopRef = useRef(stop);
  stopRef.current = stop;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "Enter") {
        e.preventDefault();
        runRef.current();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        void formatRef.current();
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveNow();
        flash("Saved");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveNow]);

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveNow();
      flash("Saved");
    });
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF,
      () => void formatRef.current(),
    );
  };

  // ---------- Files ----------
  const tree = useMemo(() => {
    const t: Record<string, string[]> = {};
    for (const p of Object.keys(files)) {
      if (p.endsWith("/.keep") && p.split("/").length === 2) {
        t[p.split("/")[0]!] ??= [];
        continue;
      }
      const d = p.split("/")[0] ?? "";
      (t[d] ??= []).push(p);
    }
    return Object.keys(t)
      .sort()
      .map((dir) => ({ dir, files: (t[dir] ?? []).filter((p) => !p.endsWith(".keep")).sort() }));
  }, [files]);

  const newFile = () => {
    const name = prompt_(
      `New file in "${langId}/" (e.g. helper.${langById(langId)?.ext[0] ?? "txt"}):`,
    );
    if (!name || /[\\]/.test(name)) return;
    const p = `${langId || "python"}/${name}`;
    if (files[p] !== undefined) return flash("File already exists");
    setFiles((f) => ({ ...f, [p]: "" }));
    setOpenFolders((o) => ({ ...o, [langId]: true }));
    openFile(p);
  };
  const renameFile = (p: string) => {
    const dir = p.slice(0, p.lastIndexOf("/"));
    const n = p.slice(p.lastIndexOf("/") + 1);
    const name = prompt_("Rename to:", n);
    if (!name || name === n || /[\\/]/.test(name)) return;
    const np = `${dir}/${name}`;
    setFiles((f) => {
      const c: Record<string, string> = { ...f, [np]: f[p] ?? "" };
      delete c[p];
      return c;
    });
    setTabs((t) => t.map((x) => (x === p ? np : x)));
    if (active === p) setActive(np);
  };
  const deleteFile = (p: string) => {
    if (!confirm(`Delete ${p}?`)) return;
    setFiles((f) => {
      const c = { ...f };
      delete c[p];
      return c;
    });
    closeTab(p);
  };
  const closeTab = (p: string) => {
    setTabs((t) => {
      const n = t.filter((x) => x !== p);
      if (activeRef.current === p) setActive(n[n.length - 1] ?? "");
      return n;
    });
  };

  // ---------- Capture ----------
  const captureOpts = () => ({
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: inkSaver ? "#ffffff" : "#1e1e1e",
  });
  const currentFolder = () => (activeRef.current || `${langId}/`).split("/")[0] || langId;
  const folderFiles = () => {
    const dir = currentFolder();
    return Object.fromEntries(
      Object.entries(filesRef.current).filter(
        ([p]) => p.startsWith(dir + "/") && !p.endsWith(".keep"),
      ),
    );
  };
  const snapshotPreview = async (ratio: number) => {
    const W = 1280,
      H = 720;
    const doc = buildPreview(activeLang, filesRef.current);
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${W}px;height:${H}px;border:0;background:#fff`;
    document.body.appendChild(frame);
    try {
      await new Promise<void>((res) => {
        frame.onload = () => res();
        frame.srcdoc = doc;
        setTimeout(res, 3000);
      });
      await sleep(600);
      const root = frame.contentDocument?.documentElement;
      if (!root) throw new Error("Preview not ready");
      return await toPng(root, {
        pixelRatio: ratio,
        cacheBust: true,
        backgroundColor: "#ffffff",
        width: W,
        height: H,
        style: { width: `${W}px`, height: `${H}px`, overflow: "hidden" },
      });
    } finally {
      frame.remove();
    }
  };
  const snapshot = async (ratio = 2) => {
    if (isWeb) return snapshotPreview(ratio);
    if (!captureRef.current) throw new Error("Nothing to capture");
    setOutTab("terminal");
    const shot = term.current?.snapshot({ dark: !inkSaver, scale: ratio });
    if (!shot) throw new Error("Nothing to capture");
    return shot;
  };
  const downloadPng = async () => {
    try {
      const png = await snapshot();
      const a = document.createElement("a");
      a.href = png;
      a.download = `${currentFolder() || "labbench"}-output-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.png`;
      a.click();
      flash("Output screenshot downloaded");
    } catch (e) {
      flash("Capture failed: " + String(e));
    }
  };
  const uploadToDrive = async () => {
    setMore(false);
    
    // Check if student is signed in
    if (!userEmail) {
      if (confirm("You need to sign in with Google to upload files to your Google Drive. Sign in now?")) {
        await googleSignIn();
      }
      return;
    }

    setUploadingDrive(true);
    flash("Capturing screenshot and uploading to your Google Drive...");

    try {
      // 1. Capture the 16:9 output snapshot
      let shot: string | null = null;
      try {
        shot = await snapshot(1.5);
      } catch (err) {
        console.warn("Could not capture screenshot:", err);
      }

      // 2. Upload only active folder's code + screenshot to My Drive/labbench/
      const result = await uploadWorkspaceToGoogleDrive({
        files: folderFiles(),
        screenshotDataUrl: shot,
        folderName: currentFolder(),
      });

      if (result.ok && result.folderUrl) {
        flash(`Uploaded ${result.filesCount} files to Google Drive (labbench/ folder)!`, result.folderUrl);
      } else {
        flash(result.error || "Failed to upload to Google Drive");
      }
    } catch (e: any) {
      flash("Drive upload error: " + (e?.message || String(e)));
    } finally {
      setUploadingDrive(false);
    }
  };

  const shareWorkspace = async () => {
    setMore(false);
    setSharing(true);
    try {
      let image: string | null = null;
      try {
        image = await snapshot(1.5);
        if (image.length > 3_900_000) image = await snapshot(1);
      } catch {
        image = null;
      }
      const result = await createShareFn({
        data: { files: folderFiles(), output: stripAnsi(outputLog.current).slice(-40000), image },
      });
      setShareUrl(`${window.location.origin}/claim/${result.id}`);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Sharing failed. Please try again.");
    } finally {
      setSharing(false);
    }
  };
  const deleteFolder = (dir: string) => {
    if (!confirm(`Delete folder "${dir}" and all its files?`)) return;
    setFiles((f) =>
      Object.fromEntries(Object.entries(f).filter(([p]) => !p.startsWith(dir + "/"))),
    );
    filesRef.current = Object.fromEntries(
      Object.entries(filesRef.current).filter(([p]) => !p.startsWith(dir + "/")),
    );
    setTabs((t) => {
      const n = t.filter((x) => !x.startsWith(dir + "/"));
      if (activeRef.current.startsWith(dir + "/")) setActive(n[n.length - 1] ?? "");
      return n;
    });
    if (cwdRef.current === dir || cwdRef.current.startsWith(dir + "/")) cwdRef.current = "";
  };
  const clearScreen = () => {
    setMore(false);
    term.current?.clear();
    if (term.current?.isReading()) term.current.write(prompt());
  };
  const googleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        scopes: "https://www.googleapis.com/auth/drive.file",
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    if (error) flash(error.message);
    setDrawer(false);
  };

  // ---------- AI TA ----------
  const askTa = async () => {
    const c = credits.date === today() ? credits : { date: today(), used: 0 };
    if (c.used >= DAILY_CREDITS) {
      setShowUpgrade(true);
      return;
    }
    const lr = lastRun.current;
    if (!lr) return;
    setAi({ open: true, loading: true, text: "", error: "" });
    try {
      const r = await askAiFn({
        data: {
          language: lr.lang,
          code: lr.code.slice(0, 20000),
          output: stripAnsi(outputLog.current).slice(-8000),
        },
      });
      if (r.ok) {
        if (!r.fallback) {
          const next = { date: today(), used: c.used + 1 };
          setCredits(next);
          localStorage.setItem("labbench.aiCredits", JSON.stringify(next));
        }
        setAi({ open: true, loading: false, text: r.text, error: "" });
      } else setAi({ open: true, loading: false, text: "", error: r.error });
    } catch (e) {
      setAi({ open: true, loading: false, text: "", error: String(e) });
    }
  };

  // ---------- Split drag ----------
  const dragging = useRef(false);
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging.current) return;
      const left = window.innerWidth >= 1024 ? 248 : 0;
      setSplit(Math.min(80, Math.max(25, ((e.clientX - left) / (window.innerWidth - left)) * 100)));
    };
    const up = () => {
      dragging.current = false;
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  return (
    <div className="ide-root flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-rail px-2 lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          title="Open navigation"
          aria-label="Open navigation"
          onClick={() => setDrawer(true)}
        >
          <Menu />
        </Button>
        <span className="flex-1 truncate text-sm font-semibold">
          LabBench <span className="font-normal text-muted-foreground">/ {activeLang.label}</span>
        </span>
        <Button size="sm" onClick={run} disabled={status === "running"}>
          <Play /> Run
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        {drawer && (
          <div
            className="fixed inset-0 z-40 bg-background/70 lg:hidden"
            onClick={() => setDrawer(false)}
          />
        )}
        <aside
          className={`${drawer ? "flex fixed inset-y-0 left-0 z-50 w-[min(85vw,300px)] shadow-2xl" : "hidden"} shrink-0 flex-col border-r bg-rail lg:relative lg:flex lg:w-[248px] lg:shadow-none`}
        >
          <div className="flex justify-end border-b p-1 lg:hidden">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close navigation"
              onClick={() => setDrawer(false)}
            >
              <X />
            </Button>
          </div>
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-primary font-mono text-xs font-bold text-primary-foreground">
              {"</>"}
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">LabBench</div>
              <div className="text-[10px] text-muted-foreground">
                Code anywhere. Submit everywhere.
              </div>
            </div>
          </div>

          <div className="border-b p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Language
              </span>
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-primary hover:bg-muted"
              >
                <Plus size={12} /> Add
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {languages.map((l) => (
                <div key={l.id} className="group relative">
                  <button
                    onClick={() => selectLanguage(l)}
                    title={l.label}
                    className={`w-full rounded-md border px-1 py-1.5 font-mono text-[11px] font-semibold transition-colors ${
                      langId === l.id
                        ? "border-primary bg-accent text-accent-foreground"
                        : "border-transparent bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {l.short}
                  </button>
                  {addedLangs.includes(l.id) && (
                    <button
                      onClick={() => removeLanguage(l.id)}
                      title="Remove"
                      className="absolute -top-1 -right-1 hidden h-4 w-4 place-items-center rounded-full bg-secondary text-muted-foreground group-hover:grid"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setShowAdd(true)}
                title="Add a language"
                className="grid place-items-center rounded-md border border-dashed py-1.5 text-muted-foreground hover:border-primary hover:text-primary"
              >
                <Plus size={13} />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between px-3 pt-3 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Explorer · Workspace
            </span>
            <button
              onClick={newFile}
              title="New file"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <FilePlus size={14} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2 text-[13px]">
            {tree.map((g) => (
              <div key={g.dir}>
                <div className="group flex items-center rounded pr-1 hover:bg-muted">
                  <button
                    onClick={() => setOpenFolders((o) => ({ ...o, [g.dir]: !o[g.dir] }))}
                    className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1 text-left"
                  >
                    {openFolders[g.dir] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <Folder size={14} className="text-warning" />
                    <span className="truncate">{g.dir}</span>
                  </button>
                  <button
                    onClick={() => deleteFolder(g.dir)}
                    aria-label={`Delete folder ${g.dir}`}
                    title="Delete folder"
                    className="rounded p-0.5 text-muted-foreground hover:text-destructive md:hidden md:group-hover:block"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                {openFolders[g.dir] &&
                  g.files.map((p) => (
                    <div
                      key={p}
                      className={`group flex items-center gap-1.5 rounded py-1 pr-1 pl-8 ${active === p ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}
                    >
                      <button
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                        onClick={() => openFile(p)}
                      >
                        <FileCode2 size={13} className="shrink-0 text-primary" />
                        <span className="truncate">{p.slice(g.dir.length + 1)}</span>
                      </button>
                      <button
                        onClick={() => renameFile(p)}
                        className="hidden rounded p-0.5 text-muted-foreground hover:text-foreground group-hover:block"
                        title="Rename"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => deleteFile(p)}
                        className="hidden rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
              </div>
            ))}
          </div>

          <div className="border-t p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <UserRound size={15} />
              <span className="min-w-0 flex-1 truncate">{userEmail || "Guest student"}</span>
              <span>
                {creditsLeft}/{DAILY_CREDITS} hints
              </span>
            </div>
            {userEmail && (
              <div
                className={`mt-2 flex items-center gap-2 text-[11px] ${driveSyncState === "error" ? "text-destructive" : "text-muted-foreground"}`}
                title={driveSyncState === "error" ? "Google Drive sync failed. Check Drive access and reconnect." : "Workspace snapshot is stored in Google Drive/labbench/workspace.json"}
              >
                <Cloud size={13} />
                {driveSyncState === "syncing" ? "Syncing workspace…" : driveSyncState === "synced" ? "Workspace synced to Drive" : driveSyncState === "error" ? "Drive sync failed" : "Drive access needed"}
              </div>
            )}
            {userEmail ? (
              <>
                {(!driveToken || driveSyncState === "error") && (
                  <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => void googleSignIn()}>
                    <Cloud /> {driveToken ? "Reconnect Google Drive" : "Connect Google Drive"}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => {
                    void supabase.auth.signOut();
                    setDrawer(false);
                  }}
                >
                  <LogOut /> Sign out
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={() => void googleSignIn()}
              >
                Sign in with Google
              </Button>
            )}
          </div>
        </aside>

        <div
          className="ide-workspace flex min-w-0 flex-1 flex-col-reverse lg:flex-row"
          style={{ ["--split" as string]: `${split}%` }}
        >
          {/* Editor */}
          <section className="ide-editor-pane flex min-h-0 min-w-0 flex-1 flex-col bg-editor lg:h-auto lg:w-[var(--split)] lg:flex-none lg:shrink-0">
            <div className="flex h-9 items-stretch border-b bg-panel">
              <select
                value={langId}
                onChange={(e) => selectLanguage(langById(e.target.value)!)}
                className="border-r bg-panel px-2 text-xs lg:hidden"
              >
                {languages.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
              <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
                {tabs.map((p) => (
                  <div
                    key={p}
                    onClick={() => setActive(p)}
                    className={`group flex cursor-pointer items-center gap-2 border-r px-3 text-[13px] ${active === p ? "border-t-2 border-t-primary bg-editor text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <FileCode2 size={13} className="text-primary" />
                    <span className="whitespace-nowrap">{p.split("/").pop()}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(p);
                      }}
                      className="rounded p-1 opacity-100 hover:bg-muted md:opacity-0 md:group-hover:opacity-100"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void format()}
                title="Format code (Ctrl+Shift+F)"
                className="m-1 h-7 w-7"
              >
                <Wand2 />
              </Button>
            </div>
            <div className="min-h-0 flex-1">
              {active && files[active] !== undefined ? (
                <Editor
                  path={active}
                  theme="vs-dark"
                  language={monacoLanguage(active)}
                  value={files[active]}
                  onChange={(v) => setFiles((f) => ({ ...f, [active]: v ?? "" }))}
                  onMount={onMount}
                  options={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 14,
                    minimap: { enabled: false },
                    automaticLayout: true,
                    autoClosingBrackets: "always",
                    formatOnPaste: true,
                    bracketPairColorization: { enabled: true },
                    scrollBeyondLastLine: false,
                    padding: { top: 12 },
                    tabSize: 4,
                  }}
                />
              ) : (
                <div className="grid h-full place-items-center text-sm text-muted-foreground">
                  Open a file from the explorer
                </div>
              )}
            </div>
          </section>

          <div
            onMouseDown={() => {
              dragging.current = true;
              document.body.style.cursor = "col-resize";
            }}
            className="hidden w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary lg:block"
          />

          {/* Output */}
          <section className="ide-output-pane flex min-h-0 min-w-0 flex-1 flex-col border-b bg-panel lg:h-auto lg:border-b-0">
            <div className="relative flex h-11 shrink-0 items-center gap-1 border-b px-2">
              <Button
                variant={outTab === "preview" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setOutTab("preview")}
              >
                <Globe /> Preview
              </Button>
              <Button
                variant={outTab === "terminal" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setOutTab("terminal")}
              >
                <TerminalSquare /> Terminal
              </Button>
              <div className="flex-1" />
              {failed && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void askTa()}
                  title="Ask AI Teaching Assistant about the active code and output"
                >
                  <GraduationCap />
                  <span className="hidden sm:inline">Ask AI TA</span>
                </Button>
              )}
              {status === "running" ? (
                <Button variant="destructive" size="sm" onClick={stop}>
                  <Square /> Stop
                </Button>
              ) : (
                <Button size="sm" className="hidden lg:inline-flex" onClick={run}>
                  <Play /> Run
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                title="More output actions"
                aria-label="More output actions"
                onClick={() => setMore((v) => !v)}
              >
                <MoreHorizontal />
              </Button>
                {more && <div className="absolute right-2 top-10 z-30 w-56 rounded-md border bg-popover p-1 shadow-xl">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => void installApp()}
                  >
                    <Download /> Install as app
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="w-full justify-start text-primary" 
                    disabled={uploadingDrive}
                    onClick={() => { void uploadToDrive(); }}
                  >
                    {uploadingDrive ? <Loader2 className="animate-spin" /> : <Cloud />}
                    {uploadingDrive ? "Uploading to Drive..." : "Upload to Google Drive"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => {
                      setMore(false);
                      setShowTour(true);
                    }}
                  >
                    <GraduationCap /> Product Tour
                  </Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => { void shareWorkspace(); }}><Share2 /> Send to phone</Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => { setInkSaver((v) => !v); setMore(false); }}>{inkSaver ? <Moon /> : <Sun />} {inkSaver ? "Dark output" : "Light output"}</Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => { void downloadPng(); setMore(false); }}><Download /> Download PNG</Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start" onClick={clearScreen}><RotateCcw /> Clear terminal</Button>
                </div>}
            </div>

            <div className="relative min-h-0 flex-1">
              <div
                className={`absolute inset-0 bg-paper ${outTab === "preview" ? "" : "invisible"}`}
              >
                {isWeb ? (
                  <iframe
                    title="Live preview"
                    ref={previewFrame}
                    srcDoc={previewDoc}
                    scrolling="yes"
                    sandbox="allow-scripts allow-modals allow-forms"
                    className="h-full w-full overflow-auto border-0 bg-paper"
                  />
                ) : (
                  <div className="grid h-full place-items-center bg-panel text-sm text-muted-foreground">
                    Live preview is for HTML/CSS/JS and React
                  </div>
                )}
              </div>
              <div
                ref={captureRef}
                className={`absolute inset-0 flex flex-col ${outTab === "terminal" ? "" : "invisible"} ${inkSaver ? "bg-paper" : "bg-editor"}`}
                onClick={() => term.current?.focus()}
              >
                <div className="min-h-0 flex-1">
                  <Terminal ref={term} dark={!inkSaver} onInterrupt={() => stopRef.current()} />
                </div>
                {images.length > 0 && (
                  <div className="max-h-[45%] overflow-y-auto border-t p-2">
                    {images.map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt={`Plot ${i + 1}`}
                        className="mx-auto mb-2 max-w-full rounded bg-paper"
                      />
                    ))}
                  </div>
                )}
              </div>

              {ai.open && (
                <div className="absolute right-3 bottom-3 left-3 z-10 max-h-[60%] overflow-y-auto rounded-xl border bg-card p-4 shadow-2xl md:left-auto md:w-[380px]">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground">
                      <GraduationCap size={15} />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold">AI Teaching Assistant</div>
                      <div className="text-[10px] text-muted-foreground">
                        Explains the concept — you write the fix · {creditsLeft} credits left today
                      </div>
                    </div>
                    <button
                      onClick={() => setAi((a) => ({ ...a, open: false }))}
                      className="rounded p-1 text-muted-foreground hover:bg-muted"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {ai.loading ? (
                    <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                      <Loader2 size={14} className="animate-spin" /> Reviewing your code and output…
                    </div>
                  ) : ai.error ? (
                    <p className="text-sm text-destructive">{ai.error}</p>
                  ) : (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap text-card-foreground">
                      {ai.text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
                        part.startsWith("**") ? (
                          <strong key={i}>{part.slice(2, -2)}</strong>
                        ) : part.startsWith("`") ? (
                          <code key={i} className="rounded bg-muted px-1 font-mono text-xs">
                            {part.slice(1, -1)}
                          </code>
                        ) : (
                          part
                        ),
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      <footer className="flex h-6 items-center gap-4 overflow-hidden bg-statusbar px-3 font-mono text-[11px] whitespace-nowrap text-statusbar-foreground">
        <span>{activeLang.label}</span>
        <span className="hidden sm:inline">
          {activeLang.kind === "remote"
            ? "Online compiler"
            : isWeb
              ? "Live preview"
              : "Runs on your PC"}
        </span>
        <span>
          {status === "running" ? "● Running" : status === "idle" ? "Ready" : `Exit ${exitCode}`}
        </span>
        <div className="flex-1" />
        <span className="hidden sm:inline">{saved ? "All changes saved" : "Saving…"}</span>
        <span>Developed by Susanta Banik</span>
      </footer>

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-md bg-foreground px-4 py-2 text-xs font-medium text-background shadow-lg">
          <span>{toast}</span>
          {driveUrl && (
            <a
              href={driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 underline font-semibold hover:opacity-80"
              onClick={() => setDriveUrl(null)}
            >
              Open folder ↗
            </a>
          )}
        </div>
      )}

      {showAdd && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-4 backdrop-blur-sm"
          onClick={() => setShowAdd(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-base font-semibold">Add a language</h2>
              <button
                onClick={() => setShowAdd(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <X size={16} />
              </button>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              These run on the online compiler. Each gets its own folder with starter code.
            </p>
            <div className="grid max-h-[60vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
              {EXTRA_LANGUAGES.map((l) => {
                const added = addedLangs.includes(l.id);
                return (
                  <button
                    key={l.id}
                    onClick={() => addLanguage(l)}
                    className={`flex items-center gap-2 rounded-lg border p-2.5 text-left text-sm transition-colors hover:border-primary ${added ? "border-primary bg-accent" : "bg-muted"}`}
                  >
                    <span className="grid h-7 w-9 shrink-0 place-items-center rounded bg-secondary font-mono text-[10px] font-bold">
                      {l.short}
                    </span>
                    <span className="truncate">{l.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <ProModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        onSuccess={() => flash("Payment successful! Welcome to LabBench Pro.")}
        userEmail={userEmail}
      />
      <WalkthroughTour forceOpen={showTour} onClose={() => setShowTour(false)} />

      {(sharing || shareUrl) && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-4 backdrop-blur-sm"
          onClick={() => {
            if (!sharing) setShareUrl("");
          }}
        >
          <div
            role="dialog"
            aria-label="Send to phone"
            className="w-full max-w-sm rounded-xl border bg-card p-6 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Send to phone</h2>
              <button
                aria-label="Close"
                onClick={() => setShareUrl("")}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <X size={16} />
              </button>
            </div>
            {sharing ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="animate-spin" size={16} /> Creating link…
              </div>
            ) : (
              <>
                <div className="mx-auto w-fit rounded-lg bg-[#ffffff] p-3">
                  <QRCodeSVG value={shareUrl} size={190} bgColor="#ffffff" fgColor="#121212" />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Scan with your phone camera. The link and files are deleted after 24 hours.
                </p>
                <p
                  className="mt-2 break-all rounded bg-muted p-2 font-mono text-[11px]"
                  data-share-url
                >
                  {shareUrl}
                </p>
                <Button
                  className="mt-3 w-full"
                  onClick={() => {
                    void navigator.clipboard.writeText(shareUrl);
                    flash("Link copied");
                  }}
                >
                  Copy link
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

let _pyUrl: string | null = null;
function pyWorkerUrl() {
  if (_pyUrl) return _pyUrl;
  // Load via a blob so the worker inherits the page's isolation (needed for live input)
  const xhr = new XMLHttpRequest();
  xhr.open("GET", "/python-worker.js", false);
  xhr.send();
  _pyUrl = URL.createObjectURL(new Blob([xhr.responseText], { type: "text/javascript" }));
  return _pyUrl;
}

function prompt_(msg: string, def?: string) {
  return window.prompt(msg, def);
}
