// Prompt construction for the AI Teaching Assistant. Kept free of server imports so it can be
// tested directly. The rules here are the teaching contract: explain the problem, never write
// the fix.
import { summarize, type Finding } from "./diagnose";

export const TA_SYSTEM = `You are LabBench AI, a patient, friendly teaching assistant for college programming students, across all programming languages.
Begin with one short greeting line (20-30 words) that introduces you as LabBench AI, created by Mr. Susanta Banik.
Your job is to say exactly what went wrong, on which line, and why, in plain simple English.
Use the rule-based findings and the program output as evidence. If the findings and the output disagree, trust the output and say so.
Structure the reply with these labels, each followed by one or two sentences: "What went wrong:", "Where:", "Why it happens:", "Try this:".
You may name the exact variable, function, keyword or line to change, and explain the concept behind it.
Never write corrected code, a fixed version of the program, or a code block. Never give the replacement line.
If the code is correct and the output is what it should be, say so and suggest one thing to check.
If the program did not fail, explain briefly what it does.
You can search the web. Search only when the answer depends on facts you may not know well: current library or language versions, official documentation, or the exact meaning of an unfamiliar error message. Do not search for things you already know, do not paste search results word for word, and do not search for the student's own code.
Keep the whole reply under 150 words.`;

/** Numbered lines around the error line, so the tutor can point at exact code. */
export function codeExcerpt(code: string, line: number | undefined, radius = 3): string {
  const lines = code.split("\n");
  if (!line || line < 1 || line > lines.length) return "";
  const from = Math.max(1, line - radius);
  const to = Math.min(lines.length, line + radius);
  const out: string[] = [];
  for (let n = from; n <= to; n++) out.push(`${n === line ? ">" : " "} ${n}: ${lines[n - 1]}`);
  return out.join("\n");
}

function inputDescription(stdin: string | undefined): string {
  if (stdin === undefined) return "not applicable or not recorded";
  if (stdin.trim() === "") return "none (the input panel was empty)";
  return stdin.slice(0, 500);
}

export interface TaPromptInput {
  language: string;
  code: string;
  output: string;
  exitCode: number | null;
  stdin?: string | undefined;
  findings: Finding[];
}

export function buildTaPrompt(input: TaPromptInput): string {
  const firstLine = input.findings.find((f) => f.line)?.line;
  const excerpt = codeExcerpt(input.code, firstLine);
  const parts = [
    `Language: ${input.language}`,
    `Exit code: ${input.exitCode === null ? "not recorded" : input.exitCode}`,
    `Input given to the program: ${inputDescription(input.stdin)}`,
    "",
    `Rule-based findings (LabBench checked the output with fixed rules):\n${
      input.findings.length ? summarize(input.findings) : "- none recognised"
    }`,
  ];
  if (excerpt)
    parts.push(
      "",
      `Code around the error line (the line marked > is the reported line):\n${excerpt}`,
    );
  parts.push("", `Full code:\n${input.code}`, "", `Compiler/terminal output:\n${input.output}`);
  return parts.join("\n");
}

/** Offline reply: the same facts the AI would use, shown when no AI provider answers. */
export function fallbackText(findings: Finding[]): string {
  if (findings.length === 0) {
    return "LabBench could not reach the AI tutor right now, and found no known error in the output. Read the output line by line, check the line where it stopped, and run the program again after each change.";
  }
  return `LabBench could not reach the AI tutor right now, so here is what the output shows:\n${summarize(findings)}`;
}
