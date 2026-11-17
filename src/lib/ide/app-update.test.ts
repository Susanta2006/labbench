import { describe, expect, it, vi } from "vitest";
import { isChunkLoadError, watchForUpdates, type UpdateEnvironment } from "./app-update";

type Listener = (e?: unknown) => void;

/** A fake service worker registration with the events the update logic uses. */
function fakeRegistration() {
  const listeners: Record<string, Listener[]> = {};
  const reg = {
    waiting: null as null | { postMessage: ReturnType<typeof vi.fn>; state?: string },
    installing: null as null | {
      state: string;
      addEventListener: (t: string, f: Listener) => void;
    },
    update: vi.fn(async () => undefined),
    addEventListener: (type: string, fn: Listener) => {
      (listeners[type] ??= []).push(fn);
    },
    emit: (type: string) => (listeners[type] ?? []).forEach((f) => f()),
  };
  return reg;
}

function env(reg: ReturnType<typeof fakeRegistration>, overrides: Partial<UpdateEnvironment> = {}) {
  const controllerListeners: Listener[] = [];
  const reload = vi.fn();
  const intervals: Array<() => void> = [];
  const clearInterval = vi.fn();
  const e: UpdateEnvironment = {
    register: async () => reg as unknown as ServiceWorkerRegistration,
    hasController: () => true,
    addControllerChangeListener: (fn) => controllerListeners.push(fn as Listener),
    reload,
    setInterval: (fn) => {
      intervals.push(fn);
      return intervals.length;
    },
    clearInterval,
    ...overrides,
  };
  return { e, reload, controllerListeners, intervals, clearInterval };
}

const instantWait = async () => undefined;

describe("isChunkLoadError", () => {
  it("recognises the messages browsers use when a lazy file is missing after an update", () => {
    expect(
      isChunkLoadError("Failed to fetch dynamically imported module: https://x/assets/a.js"),
    ).toBe(true);
    expect(isChunkLoadError("Importing a module script failed.")).toBe(true);
    expect(isChunkLoadError("ChunkLoadError: Loading chunk 12 failed.")).toBe(true);
  });

  it("does not treat ordinary errors as update problems", () => {
    expect(isChunkLoadError("Cannot read properties of undefined")).toBe(false);
    expect(isChunkLoadError("")).toBe(false);
  });
});

describe("watchForUpdates", () => {
  it("does not announce a first install, only a replacement of a running version", async () => {
    const reg = fakeRegistration();
    reg.waiting = { postMessage: vi.fn() };
    const { e } = env(reg, { hasController: () => false });
    const onReady = vi.fn();
    await watchForUpdates(e, onReady, { wait: instantWait });
    expect(onReady).not.toHaveBeenCalled();
  });

  it("announces a waiting update once and applies it after the save grace period", async () => {
    const reg = fakeRegistration();
    reg.waiting = { postMessage: vi.fn() };
    const { e, reload, controllerListeners } = env(reg);
    const onReady = vi.fn();
    const wait = vi.fn(async () => undefined);
    await watchForUpdates(e, onReady, { wait });
    expect(onReady).toHaveBeenCalledTimes(1);

    const apply = onReady.mock.calls[0]![0] as () => void;
    apply();
    apply(); // a second click must not queue a second switch
    await new Promise((r) => setTimeout(r, 0));
    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledWith(2500);
    expect(reg.waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });

    // Reload only once the new worker has actually taken control.
    expect(reload).not.toHaveBeenCalled();
    controllerListeners.forEach((fn) => fn());
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload when the worker changes without the student asking", async () => {
    const reg = fakeRegistration();
    reg.waiting = { postMessage: vi.fn() };
    const { e, reload, controllerListeners } = env(reg);
    await watchForUpdates(e, vi.fn(), { wait: instantWait });
    controllerListeners.forEach((fn) => fn());
    expect(reload).not.toHaveBeenCalled();
  });

  it("announces an update when a new worker finishes installing", async () => {
    const reg = fakeRegistration();
    const onReady = vi.fn();
    const { e } = env(reg);
    await watchForUpdates(e, onReady, { wait: instantWait });
    expect(onReady).not.toHaveBeenCalled();

    let stateFn: Listener = () => undefined;
    reg.installing = { state: "installed", addEventListener: (_t, f) => (stateFn = f) };
    reg.waiting = { postMessage: vi.fn() };
    reg.emit("updatefound");
    stateFn();
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("checks for new versions on a timer and can stop", async () => {
    const reg = fakeRegistration();
    const { e, intervals, clearInterval } = env(reg);
    const handle = await watchForUpdates(e, vi.fn(), { wait: instantWait, checkEveryMs: 1000 });
    intervals[0]!();
    expect(reg.update).toHaveBeenCalledTimes(1);
    handle?.stop();
    expect(clearInterval).toHaveBeenCalledTimes(1);
  });

  it("returns null when service workers cannot be registered", async () => {
    const reg = fakeRegistration();
    const { e } = env(reg, { register: async () => Promise.reject(new Error("blocked")) });
    expect(await watchForUpdates(e, vi.fn(), { wait: instantWait })).toBeNull();
  });
});
