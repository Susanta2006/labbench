import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkConnectivity,
  connectivityLabel,
  describeConnectivity,
  setLatestConnectivity,
} from "./connectivity";
import { runShell } from "./shell";

const okFetch = (async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
const failFetch = (async () => {
  throw new TypeError("Failed to fetch");
}) as unknown as typeof fetch;
const okBackend = async () => ({ ok: true });
const failBackend = async () => {
  throw new Error("server down");
};

describe("checkConnectivity", () => {
  it("reports connected only when the internet probe succeeds", async () => {
    const c = await checkConnectivity({
      fetch: okFetch,
      browserOnline: true,
      backendProbe: okBackend,
    });
    expect(c.internet).toBe("ok");
    expect(c.label).toBe("Internet: connected");
  });

  it("says the LabBench server answers but the internet does not", async () => {
    const c = await checkConnectivity({
      fetch: failFetch,
      browserOnline: true,
      backendProbe: okBackend,
    });
    expect(c.label).toBe(
      "Internet: not reachable (LabBench server responds, the internet check does not)",
    );
  });

  it("reports offline when neither probe answers", async () => {
    const c = await checkConnectivity({
      fetch: failFetch,
      browserOnline: true,
      backendProbe: failBackend,
    });
    expect(c.label).toBe("Offline: no response from the internet check or the LabBench server");
  });

  it("reports the browser's offline state without making any network request", async () => {
    const spy = vi.fn(okFetch);
    const c = await checkConnectivity({
      fetch: spy as unknown as typeof fetch,
      browserOnline: false,
      backendProbe: okBackend,
    });
    expect(c.label).toBe("Offline: your browser reports no network connection");
    expect(spy).not.toHaveBeenCalled();
  });

  it("uses a no-cors, uncached probe so opaque responses still count as reachable", async () => {
    const spy = vi.fn(okFetch);
    await checkConnectivity({
      fetch: spy as unknown as typeof fetch,
      browserOnline: true,
      backendProbe: okBackend,
      internetUrl: "https://probe.test/x",
    });
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://probe.test/x");
    expect(init.mode).toBe("no-cors");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeDefined();
  });

  it("stamps the result with the current time", async () => {
    const c = await checkConnectivity({
      fetch: okFetch,
      browserOnline: true,
      backendProbe: okBackend,
      now: () => 1234,
    });
    expect(c.checkedAt).toBe(1234);
  });

  it("labels every state with a distinct message", () => {
    const labels = new Set([
      describeConnectivity(false, "fail", "fail"),
      describeConnectivity(true, "ok", "ok"),
      describeConnectivity(true, "ok", "fail"),
      describeConnectivity(true, "fail", "fail"),
    ]);
    expect(labels.size).toBe(4);
  });
});

describe("terminal netstatus command", () => {
  beforeEach(() => setLatestConnectivity(undefined as never));

  it("says it has not checked yet before the first check", () => {
    expect(runShell("netstatus", {}, "", []).out).toContain("Internet status: not checked yet");
  });

  it("prints the latest result inside the browser terminal", async () => {
    const c = await checkConnectivity({
      fetch: okFetch,
      browserOnline: true,
      backendProbe: okBackend,
    });
    setLatestConnectivity(c);
    expect(runShell("netstatus", {}, "", []).out).toContain("Internet: connected");
    expect(connectivityLabel()).toContain("Internet: connected");
  });
});
