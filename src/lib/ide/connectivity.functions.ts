import { createServerFn } from "@tanstack/react-start";

// Lightweight LabBench backend probe. Its only job is to prove the server answers.
export const connectivityPing = createServerFn({ method: "GET" }).handler(async () => ({
  ok: true,
  at: Date.now(),
}));
