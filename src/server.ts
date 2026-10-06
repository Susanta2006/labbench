import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// Safely normalize h3 errors without locking/hanging streaming responses
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  try {
    // Timeout safeguard to prevent infinite hanging on unclosed streams
    const bodyTextPromise = response.clone().text();
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error("Stream timeout")), 1500)
    );

    const body = await Promise.race([bodyTextPromise, timeoutPromise]);

    if (isH3SwallowedErrorBody(body)) {
      console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  } catch (err) {
    // If stream reading times out or fails, fall back gracefully instead of hanging Node
    console.warn("Skipped reading SSR error response stream:", err);
  }

  return response;
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const originalResponse = await handler.fetch(request, env, ctx);
      const response = await normalizeCatastrophicSsrResponse(originalResponse);

      // Create a fresh headers object while keeping the original response stream intact
      const headers = new Headers(response.headers);
      headers.set("Cross-Origin-Opener-Policy", "same-origin");
      headers.set("Cross-Origin-Embedder-Policy", "credentialless");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.error("Catastrophic server fetch failure:", error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
