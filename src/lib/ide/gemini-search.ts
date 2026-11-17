// Gemini with Google Search grounding. The model decides when a question needs a web search; the
// search results it used come back as grounding sources, which are shown under the answer.
// Uses the native generateContent API, because the OpenAI-compatible route does not accept the
// google_search tool. Written as pure functions plus an injectable fetch, so it can be tested.

export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
export const MAX_SOURCES = 3;

export interface GeminiSource {
  title: string;
  uri: string;
}

export interface GeminiAnswer {
  text: string;
  sources: GeminiSource[];
}

export function buildGeminiBody(
  system: string,
  prompt: string,
  grounded: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 700, temperature: 0.4 },
  };
  if (grounded) body["tools"] = [{ google_search: {} }];
  return body;
}

export function streamUrl(base: string, model: string): string {
  return `${base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
}

interface Chunk {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> };
  }>;
}

/** Joins the streamed text and collects the distinct web sources the model searched. */
export function parseGeminiSse(raw: string): GeminiAnswer {
  let text = "";
  const sources: GeminiSource[] = [];
  const seen = new Set<string>();
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    let chunk: Chunk;
    try {
      chunk = JSON.parse(trimmed.slice(5).trim()) as Chunk;
    } catch {
      continue; // an incomplete or non-JSON line is ignored
    }
    const candidate = chunk.candidates?.[0];
    for (const part of candidate?.content?.parts ?? []) {
      if (typeof part.text === "string") text += part.text;
    }
    for (const grounding of candidate?.groundingMetadata?.groundingChunks ?? []) {
      const uri = grounding.web?.uri;
      if (uri && !seen.has(uri)) {
        seen.add(uri);
        sources.push({ title: grounding.web?.title || uri, uri });
      }
    }
  }
  return { text: text.trim(), sources: sources.slice(0, MAX_SOURCES) };
}

/** Same rule as the rest of the tutor: no code blocks in replies. */
export function removeCodeBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "[code removed — try writing the fix yourself!]").trim();
}

/** Appends the searched sources as plain lines the panel can show. */
export function withSources(text: string, sources: GeminiSource[]): string {
  if (sources.length === 0) return text;
  const list = sources.map((s) => `- ${s.title}: ${s.uri}`).join("\n");
  return `${text}\n\nSources I searched:\n${list}`;
}

export interface AskGeminiOptions {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  base?: string;
  timeoutMs?: number;
}

/**
 * Asks Gemini with Google Search available. If the chosen model does not support search, the
 * question is answered without it instead of failing. Returns null when no usable answer arrives.
 */
export async function askGemini(
  fetchImpl: typeof fetch,
  options: AskGeminiOptions,
): Promise<GeminiAnswer | null> {
  const url = streamUrl(options.base ?? GEMINI_BASE, options.model);
  const send = (grounded: boolean) =>
    fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey },
      body: JSON.stringify(buildGeminiBody(options.system, options.prompt, grounded)),
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });

  let res: Response;
  try {
    res = await send(true);
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 400 && /google_search|grounding|tools?\b/i.test(body)) {
        console.error("Gemini model does not accept Google Search; answering without search.");
        res = await send(false);
      } else {
        console.error(`Gemini request failed [${res.status}]: ${body.slice(0, 300)}`);
        return null;
      }
    }
    if (!res.ok) {
      console.error(`Gemini request failed [${res.status}] without search.`);
      return null;
    }
    const parsed = parseGeminiSse(await res.text());
    if (!parsed.text) return null;
    return { text: removeCodeBlocks(parsed.text), sources: parsed.sources };
  } catch (error) {
    console.error("Gemini request failed:", error);
    return null;
  }
}
