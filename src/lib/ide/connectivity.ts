// Browser-level connectivity status. navigator.onLine alone is not proof of internet access,
// so two independent probes are combined:
//   1. LabBench server: a server function on this site (proves the app's backend is reachable).
//   2. Internet probe: a public no-content endpoint, requested with no-cors (any response, even
//      an opaque one, proves the network path works; a failure means no route or DNS failure).
// Both run in the browser. No paid monitoring service is used.

export const INTERNET_PROBE_URL = "https://www.google.com/generate_204";
export const PROBE_TIMEOUT_MS = 5000;

export type Check = "ok" | "fail";

export interface Connectivity {
  browserOnline: boolean;
  backend: Check;
  internet: Check;
  checkedAt: number;
  label: string;
}

export interface ConnectivityDeps {
  fetch: typeof fetch;
  browserOnline: boolean;
  backendProbe: () => Promise<unknown>;
  internetUrl?: string;
  now?: () => number;
}

/** Human-readable state. Each label says exactly what was and was not proven. */
export function describeConnectivity(
  browserOnline: boolean,
  backend: Check,
  internet: Check,
): string {
  if (!browserOnline) return "Offline: your browser reports no network connection";
  if (internet === "ok") return "Internet: connected";
  if (backend === "ok")
    return "Internet: not reachable (LabBench server responds, the internet check does not)";
  return "Offline: no response from the internet check or the LabBench server";
}

export async function checkConnectivity(deps: ConnectivityDeps): Promise<Connectivity> {
  const now = deps.now ?? Date.now;
  let backend: Check = "fail";
  let internet: Check = "fail";
  if (deps.browserOnline) {
    const [b, i] = await Promise.all([
      deps.backendProbe().then(
        () => "ok" as const,
        () => "fail" as const,
      ),
      deps
        .fetch(deps.internetUrl ?? INTERNET_PROBE_URL, {
          mode: "no-cors",
          cache: "no-store",
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        })
        .then(
          () => "ok" as const,
          () => "fail" as const,
        ),
    ]);
    backend = b;
    internet = i;
  }
  return {
    browserOnline: deps.browserOnline,
    backend,
    internet,
    checkedAt: now(),
    label: describeConnectivity(deps.browserOnline, backend, internet),
  };
}

// Last result, shared with the terminal's `netstatus` command.
let latest: Connectivity | null = null;

export function setLatestConnectivity(c: Connectivity) {
  latest = c;
}

export function getLatestConnectivity(): Connectivity | null {
  return latest;
}

export function connectivityLabel(): string {
  return latest
    ? `${latest.label} (checked ${new Date(latest.checkedAt).toLocaleTimeString()})`
    : "Internet status: not checked yet";
}

/**
 * One fresh internet check, used before each Python run so that `os.system("ping ...")` can
 * report the same answer VS Code gives. Returns false when the browser reports no network.
 */
export async function probeInternetNow(
  fetchImpl: typeof fetch = fetch,
  url: string = INTERNET_PROBE_URL,
): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  try {
    await fetchImpl(url, {
      mode: "no-cors",
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return true;
  } catch {
    return false;
  }
}
