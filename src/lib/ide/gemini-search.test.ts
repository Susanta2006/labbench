import { describe, expect, it, vi } from "vitest";
import {
  askGemini,
  buildGeminiBody,
  parseGeminiSse,
  removeCodeBlocks,
  streamUrl,
  withSources,
} from "./gemini-search";

const sse = (...chunks: unknown[]) => chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("");
const textChunk = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] });
const groundedChunk = (uris: Array<[string, string]>) => ({
  candidates: [
    {
      content: { parts: [{ text: "" }] },
      groundingMetadata: { groundingChunks: uris.map(([uri, title]) => ({ web: { uri, title } })) },
    },
  ],
});

describe("request building", () => {
  it("adds the Google Search tool only when grounded", () => {
    expect(buildGeminiBody("sys", "q", true)["tools"]).toEqual([{ google_search: {} }]);
    expect(buildGeminiBody("sys", "q", false)).not.toHaveProperty("tools");
  });

  it("sends the teaching rules as the system instruction", () => {
    const body = buildGeminiBody("RULES", "question", true) as {
      systemInstruction: { parts: { text: string }[] };
    };
    expect(body.systemInstruction.parts[0]?.text).toBe("RULES");
  });

  it("uses the streaming native endpoint and encodes the model name", () => {
    expect(streamUrl("https://x/v1beta", "gemini 2.5/flash")).toBe(
      "https://x/v1beta/models/gemini%202.5%2Fflash:streamGenerateContent?alt=sse",
    );
  });
});

describe("parseGeminiSse", () => {
  it("joins text across streamed chunks", () => {
    const raw = sse(textChunk("What went "), textChunk("wrong: a typo."));
    expect(parseGeminiSse(raw).text).toBe("What went wrong: a typo.");
  });

  it("collects the searched sources once each, and keeps at most three", () => {
    const raw = sse(
      groundedChunk([
        ["https://a.test", "A"],
        ["https://b.test", "B"],
        ["https://a.test", "A again"],
      ]),
      groundedChunk([
        ["https://c.test", "C"],
        ["https://d.test", "D"],
      ]),
      textChunk("answer"),
    );
    const { sources, text } = parseGeminiSse(raw);
    expect(text).toBe("answer");
    expect(sources.map((s) => s.uri)).toEqual([
      "https://a.test",
      "https://b.test",
      "https://c.test",
    ]);
  });

  it("ignores malformed lines and falls back to the address when a source has no title", () => {
    const raw = `data: {not json\n: keep-alive\n${sse(textChunk("ok"))}data: ${JSON.stringify(
      groundedChunk([["https://untitled.test", ""]]),
    )}\n`;
    const parsed = parseGeminiSse(raw);
    expect(parsed.text).toBe("ok");
    expect(parsed.sources).toEqual([
      { title: "https://untitled.test", uri: "https://untitled.test" },
    ]);
  });
});

describe("answer formatting", () => {
  it("removes code blocks from the reply", () => {
    expect(removeCodeBlocks("Try this:\n```py\nx=1\n```\nDone")).toContain("[code removed");
    expect(removeCodeBlocks("Try this:\n```py\nx=1\n```\nDone")).not.toContain("x=1");
  });

  it("adds the sources as plain lines, and leaves the text alone when there are none", () => {
    expect(withSources("Hi", [])).toBe("Hi");
    expect(withSources("Hi", [{ title: "Docs", uri: "https://docs.test" }])).toBe(
      "Hi\n\nSources I searched:\n- Docs: https://docs.test",
    );
  });
});

describe("askGemini", () => {
  const options = { apiKey: "k-test", model: "gemini-2.5-flash", system: "SYS", prompt: "P" };

  it("sends the key in a header, enables search, and returns the answer with its sources", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(
          sse(textChunk("Check the colon."), groundedChunk([["https://py.test", "Python docs"]])),
          { status: 200 },
        ),
    );
    const answer = await askGemini(fetchFn as unknown as typeof fetch, options);
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("k-test");
    expect(JSON.parse(String(init.body))).toHaveProperty("tools");
    expect(answer).toEqual({
      text: "Check the colon.",
      sources: [{ title: "Python docs", uri: "https://py.test" }],
    });
  });

  it("answers without search when the model does not accept the search tool", async () => {
    const replies = [
      new Response('{"error":{"message":"Invalid value for tools: google_search not supported"}}', {
        status: 400,
      }),
      new Response(sse(textChunk("Plain answer.")), { status: 200 }),
    ];
    const fetchFn = vi.fn(async () => replies.shift()!);
    const answer = await askGemini(fetchFn as unknown as typeof fetch, options);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(String((fetchFn.mock.calls[1] as unknown as [string, RequestInit])[1].body)),
    ).not.toHaveProperty("tools");
    expect(answer?.text).toBe("Plain answer.");
  });

  it("returns null on a server error, a network failure, or an empty answer", async () => {
    expect(
      await askGemini(
        (async () => new Response("down", { status: 500 })) as unknown as typeof fetch,
        options,
      ),
    ).toBeNull();
    expect(
      await askGemini(
        (async () => {
          throw new TypeError("offline");
        }) as unknown as typeof fetch,
        options,
      ),
    ).toBeNull();
    expect(
      await askGemini(
        (async () =>
          new Response(sse(groundedChunk([])), { status: 200 })) as unknown as typeof fetch,
        options,
      ),
    ).toBeNull();
  });
});
