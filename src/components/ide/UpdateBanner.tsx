import { useEffect, useState } from "react";
import { isChunkLoadError, watchForUpdates } from "@/lib/ide/app-update";

type Notice = { kind: "update"; apply: () => void } | { kind: "chunk" } | null;

/**
 * Tells the student when a new LabBench version is ready, or when part of the app failed to load
 * because it was just updated. Never reloads on its own: the student chooses the moment.
 */
export function UpdateBanner() {
  const [notice, setNotice] = useState<Notice>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let stopped = false;
    let handle: Awaited<ReturnType<typeof watchForUpdates>> = null;
    const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
    if (sw) {
      void watchForUpdates(
        {
          register: () => sw.register("/sw.js"),
          hasController: () => !!sw.controller,
          addControllerChangeListener: (fn) => sw.addEventListener("controllerchange", fn),
          reload: () => window.location.reload(),
        },
        (apply) => setNotice({ kind: "update", apply }),
      ).then((h) => {
        if (stopped) h?.stop();
        else handle = h;
      });
    }

    const onError = (event: ErrorEvent) => {
      if (isChunkLoadError(event.message ?? "")) setNotice({ kind: "chunk" });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as { message?: string } | string | undefined;
      const message = typeof reason === "string" ? reason : (reason?.message ?? "");
      if (isChunkLoadError(message)) setNotice({ kind: "chunk" });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      stopped = true;
      handle?.stop();
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  if (!notice) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-center gap-3 border-t border-border bg-card px-4 py-2 text-sm text-card-foreground shadow-lg"
    >
      {notice.kind === "update" ? (
        <>
          <span>A new version of LabBench is ready. Your work is saved automatically.</span>
          <button
            type="button"
            disabled={applying}
            onClick={() => {
              setApplying(true);
              notice.apply();
            }}
            className="rounded-md bg-primary px-3 py-1 font-medium text-primary-foreground disabled:opacity-60"
          >
            {applying ? "Updating…" : "Update now"}
          </button>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="rounded-md px-3 py-1 text-muted-foreground hover:bg-muted"
          >
            Later
          </button>
        </>
      ) : (
        <>
          <span>
            Part of LabBench could not load, usually because it was just updated. Your saved work is
            kept.
          </span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-primary px-3 py-1 font-medium text-primary-foreground"
          >
            Reload
          </button>
        </>
      )}
    </div>
  );
}
