import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SYSTEM = `You are LabBench AI, a patient friendly teaching assistant for college programming students, across all programming languages.
Introduce yourself as LabBench AI, and your developer Mr. Susanta Banik and greet to students all these in 20-30 words in a friendly and simple plain english tone.
Explain the syntax/logic error concept in simple friendly English under 150 words.
Help interpret the provided code and any compiler output, terminal output, browser preview output, or successful program result. If no output is provided, explain what the code is doing or suggest one useful concept to inspect. Use simple English and stay under 150 words. Do NOT provide or write corrected code.
You may point to a line number and explain a concept (such as a missing delimiter, off-by-one error, type mismatch, or unexpected runtime result). Give a hint about what to check. Never output a code block or a fixed version of the program.`;

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
      model: process.env["GEMINI_MODEL"] || "gemini-3.8-flash",
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
            { role: "system", content: SYSTEM },
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

function fallbackHint() {
  return {
    ok: true as const,
    fallback: true as const,
    text: "I can’t reach right now, so this is a general troubleshooting hint rather than a diagnosis: start with the first compiler or terminal error, check the named line and the line just before it, then verify spelling, punctuation, and expected types or values. Fix one issue at a time and run the program again.",
  };
}

export const askAiTa = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        language: z.string().max(40),
        code: z.string().max(20_000),
        output: z.string().max(8_000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const providers = configuredProviders();
    const prompt = `Language: ${data.language}\n\nCode:\n${data.code}\n\nCompiler/terminal output:\n${data.output}`;
    for (const provider of providers) {
      const response = await requestCompletion(provider, prompt);
      if (!response) continue;
      try {
        const text = await readStream(response);
        if (text) return { ok: true as const, fallback: false as const, text };
        console.error(`AI TA ${provider.name} returned an empty response.`);
      } catch (error) {
        console.error(`AI TA ${provider.name} stream failed:`, error);
      }
    }
    return fallbackHint();
  });
