// @vitest-environment node
// Runs the real public/sw.js with fake browser APIs and checks its caching rules.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

type Handler = (event: FakeEvent) => void;
interface FakeEvent {
  request?: { url: string; method: string; mode: string; destination: string };
  data?: unknown;
  waitUntil?: (p: Promise<unknown>) => void;
  respondWith?: (p: Promise<Response>) => void;
}

function loadWorker(
  opts: { cacheKeys?: string[]; network?: (url: string) => Response | Promise<Response> } = {},
) {
  const handlers: Record<string, Handler> = {};
  const store = new Map<string, Map<string, Response>>();
  for (const k of opts.cacheKeys ?? []) store.set(k, new Map());
  const skipWaiting = vi.fn();
  const fetchFn = vi.fn(async (req: { url?: string } | string) => {
    const url = typeof req === "string" ? req : (req.url ?? "");
    if (!opts.network) throw new TypeError("offline");
    return opts.network(url);
  });
  const caches = {
    open: async (name: string) => {
      if (!store.has(name)) store.set(name, new Map());
      const c = store.get(name)!;
      return {
        addAll: async () => undefined,
        put: async (req: { url: string }, res: Response) => void c.set(req.url, res),
      };
    },
    match: async (req: { url: string } | string) => {
      const url = typeof req === "string" ? req : req.url;
      for (const c of store.values()) if (c.has(url)) return c.get(url)!.clone();
      return undefined;
    },
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
  };
  const sandbox = {
    self: {
      location: { origin: "https://labbench.test" },
      addEventListener: (type: string, fn: Handler) => (handlers[type] = fn),
      skipWaiting,
      clients: { claim: async () => undefined },
    },
    caches,
    fetch: fetchFn,
    URL,
    Response,
    console,
  };
  const source = readFileSync("public/sw.js", "utf8");
  new Function(...Object.keys(sandbox), source)(...Object.values(sandbox));
  const run = async (type: string, event: FakeEvent) => {
    const waits: Promise<unknown>[] = [];
    let responded: Promise<Response> | undefined;
    handlers[type]!({
      ...event,
      waitUntil: (p) => void waits.push(p),
      respondWith: (p) => void (responded = p),
    });
    await Promise.all(waits);
    return responded ? await responded : undefined;
  };
  const get = (url: string, destination = "script", mode = "no-cors") => ({
    request: { url, method: "GET", mode, destination },
  });
  return { run, get, store, skipWaiting, fetchFn };
}

const ok = (body: string) => new Response(body, { status: 200 });

describe("service worker update behaviour", () => {
  it("does not take over on install, so the running app decides when to switch", async () => {
    const w = loadWorker();
    await w.run("install", {});
    expect(w.skipWaiting).not.toHaveBeenCalled();
  });

  it("takes over only when the page asks it to", async () => {
    const w = loadWorker();
    await w.run("message", { data: { type: "SKIP_WAITING" } });
    expect(w.skipWaiting).toHaveBeenCalledTimes(1);
    await w.run("message", { data: { type: "SOMETHING_ELSE" } });
    expect(w.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it("removes only old LabBench caches on activate", async () => {
    const w = loadWorker({
      cacheKeys: ["labbench-shell-old", "labbench-shell-dev", "other-app-cache"],
    });
    await w.run("activate", {});
    const keys = [...w.store.keys()];
    expect(keys).toContain("other-app-cache");
    expect(keys).not.toContain("labbench-shell-old");
  });

  it("serves a changed public file from the network, never a stale cached copy", async () => {
    const w = loadWorker({ network: () => ok("new worker code") });
    const res = await w.run("fetch", w.get("https://labbench.test/python-worker.js", "worker"));
    expect(await res!.text()).toBe("new worker code");
  });

  it("falls back to the cached copy of a public file only when offline", async () => {
    let online = true;
    const w = loadWorker({
      network: () => {
        if (!online) throw new TypeError("offline");
        return ok("cached copy");
      },
    });
    // First a successful request, which the worker stores.
    const first = await w.run("fetch", w.get("https://labbench.test/sql-wasm.js", "script"));
    expect(await first!.text()).toBe("cached copy");
    // Then the network disappears: the stored copy must be served.
    online = false;
    const offline = await w.run("fetch", w.get("https://labbench.test/sql-wasm.js", "script"));
    expect(offline!.status).toBe(200);
    expect(await offline!.text()).toBe("cached copy");
  });

  it("serves hashed build assets cache-first without a network request", async () => {
    const w = loadWorker({ cacheKeys: ["labbench-shell-dev"], network: () => ok("network") });
    w.store
      .get("labbench-shell-dev")!
      .set("https://labbench.test/assets/app-abc123.js", ok("cached asset"));
    const res = await w.run("fetch", w.get("https://labbench.test/assets/app-abc123.js", "script"));
    expect(await res!.text()).toBe("cached asset");
    expect(w.fetchFn).not.toHaveBeenCalled();
  });

  it("leaves cross-origin requests (Pyodide, Wandbox) alone", async () => {
    const w = loadWorker({ network: () => ok("x") });
    const res = await w.run(
      "fetch",
      w.get("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js", "script"),
    );
    expect(res).toBeUndefined();
  });
});
