// Keeps installed copies of LabBench current without interrupting a student.
//  - A new deployment ships a changed service worker. The browser installs it in the background.
//  - The new worker is held until the student chooses "Update now", so work is never lost.
//  - Before reloading, the app waits briefly so the workspace autosave (1.5 s debounce) finishes.
//  - If a lazily loaded file from an older version can no longer be found, the app offers a reload.

export const UPDATE_CHECK_MS = 30 * 60 * 1000;
export const SAVE_GRACE_MS = 2500;

/** True for the errors browsers raise when a lazily loaded module or chunk is missing. */
export function isChunkLoadError(message: string): boolean {
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk [\w-]+ failed/i.test(
    message,
  );
}

export interface UpdateEnvironment {
  register: () => Promise<ServiceWorkerRegistration>;
  hasController: () => boolean;
  addControllerChangeListener: (fn: () => void) => void;
  reload: () => void;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

export interface UpdateHandle {
  /** Asks the waiting worker to take over, then reloads once it has. */
  apply: () => void;
  stop: () => void;
}

/**
 * Registers the service worker and reports when a new version is waiting. Returns null when
 * service workers are unavailable (for example, in private browsing or old browsers).
 */
export async function watchForUpdates(
  env: UpdateEnvironment,
  onUpdateReady: (apply: () => void) => void,
  options: { checkEveryMs?: number; graceMs?: number; wait?: (ms: number) => Promise<void> } = {},
): Promise<UpdateHandle | null> {
  let registration: ServiceWorkerRegistration;
  try {
    registration = await env.register();
  } catch {
    return null;
  }
  const wait =
    options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const graceMs = options.graceMs ?? SAVE_GRACE_MS;
  let applying = false;
  let notified = false;

  const apply = () => {
    if (applying) return;
    applying = true;
    // Give the autosave time to finish, then let the new worker take over.
    void wait(graceMs).then(() => registration.waiting?.postMessage({ type: "SKIP_WAITING" }));
  };

  const notifyIfWaiting = () => {
    // A waiting worker only means "update" when this page is already controlled; a first install
    // is not an update.
    if (!notified && registration.waiting && env.hasController()) {
      notified = true;
      onUpdateReady(apply);
    }
  };

  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    installing?.addEventListener("statechange", () => {
      if (installing.state === "installed") notifyIfWaiting();
    });
  });
  env.addControllerChangeListener(() => {
    if (applying) env.reload();
  });
  notifyIfWaiting();

  const check = () => {
    void registration.update().catch(() => undefined);
  };
  const timer = (env.setInterval ?? ((fn, ms) => setInterval(fn, ms)))(
    check,
    options.checkEveryMs ?? UPDATE_CHECK_MS,
  );
  const stop = () =>
    (env.clearInterval ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>)))(timer);
  return { apply, stop };
}
