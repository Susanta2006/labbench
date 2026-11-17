import { useEffect, useState } from "react";
import {
  checkConnectivity,
  setLatestConnectivity,
  type Connectivity,
} from "@/lib/ide/connectivity";
import { connectivityPing } from "@/lib/ide/connectivity.functions";

const REFRESH_MS = 30_000;

/** Shows whether the student is online. Visible in the browser terminal at all times. */
export function NetworkStatus() {
  const [status, setStatus] = useState<Connectivity | null>(null);
  const [checking, setChecking] = useState(false);

  const run = async () => {
    setChecking(true);
    const result = await checkConnectivity({
      fetch: window.fetch.bind(window),
      browserOnline: navigator.onLine,
      backendProbe: () => connectivityPing(),
    });
    setLatestConnectivity(result);
    setStatus(result);
    setChecking(false);
  };

  useEffect(() => {
    void run();
    const timer = window.setInterval(() => void run(), REFRESH_MS);
    const onChange = () => void run();
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
    };
  }, []);

  const connected = status?.internet === "ok";
  const color = !status
    ? "#8a8a8a"
    : connected
      ? "#23d18b"
      : status.backend === "ok"
        ? "#f5c542"
        : "#f14c4c";

  return (
    <button
      type="button"
      onClick={() => void run()}
      title="Click to check again"
      aria-live="polite"
      className="flex w-full items-center gap-2 border-b border-border bg-background px-3 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
    >
      <span
        aria-hidden
        style={{ background: color }}
        className="inline-block h-2 w-2 rounded-full"
      />
      <span className="truncate">
        {status ? status.label : "Checking internet connection..."}
        {checking && status ? " (checking...)" : ""}
      </span>
    </button>
  );
}
