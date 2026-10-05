import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SYSTEM = `You are LabBench AI TA, a patient teaching assistant for college programming students.
Explain the syntax/logic error concept in simple English under 150 words. Do NOT provide or write the corrected code.
You may point to the line number and name the concept (e.g. "missing semicolon", "off-by-one", "type mismatch"), and give a hint about what to check. Never output a code block or a fixed version of the program.`;

export const askAiTa = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ language: z.string().max(40), code: z.string().max(20_000), output: z.string().max(8_000) }).parse(d),
  )
  .handler(async ({ data }) => {
    const key = process.env["GEMINI_API_KEY"];
    if (!key) return { ok: false as const, error: "AI is not configured." };
    
    const model = process.env["GEMINI_MODEL"] || "gemini-3.8-flash";

    // Build the consolidated user prompt for the standalone 'input' parameter
    const userPrompt = `Language: ${data.language}\n\nCode:\n${data.code}\n\nCompiler/terminal output:\n${data.output}`;

    // Target the modern Interactions API endpoint
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/interactions`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "x-goog-api-key": key 
      },
      body: JSON.stringify({
        model,
        // The Interactions API uses system_instruction and input rather than messages array
        system_instruction: SYSTEM,
        input: userPrompt
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`AI TA failed [${res.status}]: ${body}`);
      const msg = res.status === 429 ? "AI is busy right now, please try again in a minute."
        : res.status === 402 ? "AI credits for this app have run out. Please contact the developer."
        : `AI request failed (${res.status}).`;
      return { ok: false as const, error: msg };
    }

    const json = await res.json();
    
    // The Interactions API encapsulates the text response inside the interaction object
    let text = json.interaction?.outputText ?? "";

    // Safety: strip any code blocks the model might still produce
    text = text.replace(/```[\s\(\S\)]*?```/g, "[code removed — try writing the fix yourself!]").trim();
    
    if (!text) return { ok: false as const, error: "The AI TA could not answer this one." };
    
    return { ok: true as const, text };
  });
