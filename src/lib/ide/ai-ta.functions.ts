import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { diagnose, type Finding } from "./diagnose";
import { buildTaPrompt, fallbackText, TA_SYSTEM } from "./ai-prompt";
import { askGemini, withSources } from "./gemini-search";

const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

type Provider = {
  name: string;
  endpoint: string;
  key: string;
  model: string;
};

function configuredProviders(): Provider[] {
  const providers: Provider[] = [];
  const geminiKey = process.env["GEMINI_API_KEY"];
  if (geminiKey) {
    providers.push({
      name: "Gemini",
      endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key: geminiKey,
      model: process.env["GEMINI_MODEL"] || "gemini-2.5-flash",
    });
  }
  const openRouterKey = process.env["OPENROUTER_API_KEY"];
  if (openRouterKey) {
    providers.push({
      name: "OpenRouter",
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      key: openRouterKey,
      model: process.env["OPENROUTER_MODEL"] || "openrouter/auto:free",
    });
  }
  return providers;
}

async function requestCompletion(provider: Provider, prompt: string): Promise<Response | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetch(provider.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.key}` },
        body: JSON.stringify({
          model: provider.model,
          stream: true,
          messages: [
            { role: "system", content: TA_SYSTEM },
            { role: "user", content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      console.error(`AI TA ${provider.name} request failed:`, error);
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        continue;
      }
      return null;
    }

    if (response.ok && response.body) return response;

    const body = await response.text();
    console.error(`AI TA ${provider.name} failed [${response.status}]: ${body}`);
    if (attempt === 0 && (TRANSIENT_STATUSES.has(response.status) || response.status === 200)) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      continue;
    }
    return null;
  }
  return null;
}

async function readStream(response: Response): Promise<string> {
  if (!response.body) throw new Error("AI provider returned no response stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const chunk = JSON.parse(payload);
        text += chunk.choices?.[0]?.delta?.content ?? "";
      } catch {
        // Ignore incomplete SSE chunks; the next network chunk completes them.
      }
    }
  }
  return text.replace(/```[\s\S]*?```/g, "[code removed — try writing the fix yourself!]").trim();
}

export const askAiTa = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        language: z.string().max(40),
        code: z.string().max(20_000),
        output: z.string().max(8_000),
        exitCode: z.number().int().nullable().optional(),
        stdin: z.string().max(2_000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    // Enforce the daily allowance for authenticated accounts on the server.
    // Guests retain the existing browser-only allowance.
    const authorization = getRequest().headers.get("authorization");
    if (authorization?.startsWith("Bearer ")) {
      const token = authorization.slice("Bearer ".length);
      const url = process.env["SUPABASE_URL"];
      const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
      if (!url || !key) throw new Error("Supabase is not configured.");
      const { createClient } = await import("@supabase/supabase-js");
      const authClient = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: claims, error: claimsError } = await authClient.auth.getClaims(token);
      const userId = claims?.claims?.sub;
      if (claimsError || typeof userId !== "string")
        throw new Error("Please sign in again to use the AI assistant.");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as unknown as {
        rpc: (
          name: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      };
      const { data: allowance, error: allowanceError } = await admin.rpc("consume_ai_credit", {
        p_user_id: userId,
      });
      if (allowanceError) {
        console.error("AI allowance check failed:", allowanceError.message);
        throw new Error("Could not verify your AI allowance. Please try again.");
      }
      const result = Array.isArray(allowance) ? allowance[0] : allowance;
      if (!result?.allowed)
        return {
          ok: false as const,
          error: "You’ve used your 5 free AI hints for today. Upgrade to Pro for unlimited hints.",
        };
    }
    const exitCode = data.exitCode ?? null;
    const findings: Finding[] = diagnose({
      language: data.language,
      code: data.code,
      output: data.output,
      exitCode,
      ...(data.stdin !== undefined ? { stdin: data.stdin } : {}),
    });
    const prompt = buildTaPrompt({
      language: data.language,
      code: data.code,
      output: data.output,
      exitCode,
      stdin: data.stdin,
      findings,
    });
    const providers = configuredProviders();
    for (const provider of providers) {
      // Gemini answers with Google Search available; the model searches only when it needs to.
      if (provider.name === "Gemini") {
        const answer = await askGemini(fetch, {
          apiKey: provider.key,
          model: provider.model,
          system: TA_SYSTEM,
          prompt,
        });
        if (answer?.text) {
          return {
            ok: true as const,
            fallback: false as const,
            text: withSources(answer.text, answer.sources),
            findings,
          };
        }
        continue;
      }
      const response = await requestCompletion(provider, prompt);
      if (!response) continue;
      try {
        const text = await readStream(response);
        if (text) return { ok: true as const, fallback: false as const, text, findings };
        console.error(`AI TA ${provider.name} returned an empty response.`);
      } catch (error) {
        console.error(`AI TA ${provider.name} stream failed:`, error);
      }
    }
    return { ok: true as const, fallback: true as const, text: fallbackText(findings), findings };
  });
