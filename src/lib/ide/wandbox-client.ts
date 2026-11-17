// Wandbox online-compiler client. Used only on the server (see run-remote.functions.ts).
// Takes `fetch` as a dependency so it can be tested against a fake service.
//
// Honesty notes:
// - Multi-file projects are sent as Wandbox's `codes` array ({file, code}). Wandbox's exact
//   handling of extra files per compiler is NOT verified against the live service yet.
// - Compiler IDs are resolved against the live catalog when it can be reached; otherwise the
//   hardcoded ID is used as a last resort.

const MARK = "@@LB_NEED_INPUT@@";
const WANDBOX_LIST = "https://wandbox.org/api/list.json";
const WANDBOX_COMPILE = "https://wandbox.org/api/compile.json";
export const WANDBOX_TIMEOUT_MS = 45_000;
const CATALOG_TTL_MS = 60 * 60 * 1000;
const MAX_EXTRA_FILES = 30;
const MAX_EXTRA_BYTES = 300_000;

type WandboxCompiler = { name: string; language: string };

const WANDBOX_LANGUAGES: Record<string, string[]> = {
  bash: ["bash", "bash script"],
  rust: ["rust"],
  ruby: ["ruby"],
  typescript: ["typescript"],
  scala: ["scala"],
  swift: ["swift"],
  sql: ["sql"],
  r: ["r"],
  haskell: ["haskell"],
  lua: ["lua"],
  perl: ["perl"],
  pascal: ["pascal"],
  julia: ["julia"],
  d: ["d"],
  elixir: ["elixir"],
  zig: ["zig"],
  c: ["c"],
  cpp: ["c++"],
  java: ["java"],
  csharp: ["c#"],
  php: ["php"],
  go: ["go"],
};

export interface CompileInput {
  compiler: string;
  language: string;
  code: string;
  extraFiles?: Record<string, string>;
  stdin: string;
}

export interface CompileOutput {
  interactive: boolean;
  needInput: boolean;
  compileError: string;
  stdout: string;
  stderr: string;
  status: string;
}

let catalogCache: { at: number; entries: WandboxCompiler[] } | null = null;

export function resetWandboxCacheForTests() {
  catalogCache = null;
}

/** Fetches the compiler catalog (cached for an hour). Returns null when it cannot be reached. */
export async function loadCatalog(
  fetchImpl: typeof fetch,
  now = Date.now(),
): Promise<WandboxCompiler[] | null> {
  if (catalogCache && now - catalogCache.at < CATALOG_TTL_MS) return catalogCache.entries;
  try {
    const res = await fetchImpl(WANDBOX_LIST, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const entries = (await res.json()) as unknown;
    if (!Array.isArray(entries)) return null;
    const valid = entries.filter(
      (e): e is WandboxCompiler =>
        !!e && typeof e.name === "string" && typeof e.language === "string",
    );
    catalogCache = { at: now, entries: valid };
    return valid;
  } catch {
    return null;
  }
}

/** The preferred compiler ID if the catalog lists it, else a catalog entry for the same language. */
export function resolveCompiler(
  preferred: string,
  language: string,
  catalog: WandboxCompiler[] | null,
): string | null {
  if (!catalog) return preferred;
  if (catalog.some((c) => c.name === preferred)) return preferred;
  const aliases = WANDBOX_LANGUAGES[language] ?? [language];
  return catalog.find((c) => aliases.includes(c.language.trim().toLowerCase()))?.name ?? null;
}

/** Rejects extra files that could escape the project or collide with the main file. */
export function validateExtraFiles(files: Record<string, string>, entry: string): string | null {
  const names = Object.keys(files);
  if (names.length > MAX_EXTRA_FILES)
    return `Too many project files for the online compiler (limit ${MAX_EXTRA_FILES}).`;
  let bytes = 0;
  for (const name of names) {
    const parts = name.split("/");
    if (!name || name.startsWith("/") || parts.some((p) => p === "" || p === "." || p === "..")) {
      return `Unsafe file path for the online compiler: ${name}`;
    }
    if (name === entry) return `Duplicate entry file: ${name}`;
    bytes += files[name]!.length;
  }
  if (bytes > MAX_EXTRA_BYTES)
    return `Project is too large for the online compiler (limit ${MAX_EXTRA_BYTES} characters).`;
  return null;
}

const C_PRELUDE = `#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
static ssize_t __lb_read(void *c, char *b, size_t n) { (void)c; ssize_t r = read(0, b, n); if (r <= 0) { fflush(stdout); fputs("${MARK}", stdout); fflush(stdout); _exit(0); } return r; }
__attribute__((constructor)) static void __lb_init(void) { cookie_io_functions_t f = { __lb_read, 0, 0, 0 }; FILE *s = fopencookie(0, "r", f); if (s) stdin = s; }
`;

const CPP_PRELUDE = `${C_PRELUDE}#include <iostream>
#include <streambuf>
struct __LbBuf : std::streambuf { char b[4096]; int_type underflow() override { ssize_t r = ::read(0, b, sizeof b); if (r <= 0) { std::cout.flush(); fflush(stdout); fputs("${MARK}", stdout); fflush(stdout); _exit(0); } setg(b, b, b + r); return traits_type::to_int_type(b[0]); } };
static __LbBuf __lb_buf; static struct __LbInit { __LbInit() { std::cin.rdbuf(&__lb_buf); } } __lb_init_obj;
#line 1 "main.cpp"
`;

const JAVA_BLOCK = `static { final java.io.InputStream __o = System.in; System.setIn(new java.io.InputStream() {
 void need() { System.out.print("${MARK}"); System.out.flush(); System.exit(0); }
 public int read() throws java.io.IOException { int c = __o.read(); if (c < 0) need(); return c; }
 public int read(byte[] b, int off, int len) throws java.io.IOException { if (len == 0) return 0; int n = __o.read(b, off, len); if (n < 0) need(); return n; }
 public int available() throws java.io.IOException { return __o.available(); } }); }
`;

const CS_READER = `
class __LbReader : System.IO.TextReader { System.IO.TextReader o; public __LbReader(System.IO.TextReader o) { this.o = o; }
 void Need() { System.Console.Out.Write("${MARK}"); System.Console.Out.Flush(); System.Environment.Exit(0); }
 public override int Read() { int c = o.Read(); if (c < 0) Need(); return c; }
 public override int Peek() { return o.Peek(); }
 public override string ReadLine() { var s = o.ReadLine(); if (s == null) Need(); return s; } }
`;

// Bash `read` prompting. The runner's stdin is not a terminal, so Bash prints no `read -p`
// prompt. This one-line wrapper prints the prompt itself and, at end of input, asks the IDE for
// more input with the same marker the C and Java runners use. It is placed on line 1 with a `;`
// so line numbers in the user's script don't change.
const BASH_PRELUDE =
  'read() { local __lb_pr= __lb_nx= __lb_s; for __lb_s in "$@"; do ' +
  'if [ -n "$__lb_nx" ]; then __lb_pr=$__lb_s; __lb_nx=; continue; fi; ' +
  "case $__lb_s in -*p*) __lb_nx=1 ;; esac; done; " +
  'if [ -n "$__lb_pr" ]; then printf \'%s\' "$__lb_pr"; fi; ' +
  `builtin read "$@" || { printf '%s' '${MARK}'; exit 0; }; }; `;

// Input redirection or heredoc on a line that reads or ends a loop. Such scripts read from a
// file or here-string, so end of input is normal and must not trigger a prompt.
const BASH_INPUT_REDIRECT = /(^|[\s;|&(])(<<|<\s*[\w"'$/~.(])/;

/** True when the script reads from the program's own input, so the prompt wrapper should apply. */
export function bashNeedsReadPrompt(code: string): boolean {
  if (!/\bread\b/.test(code)) return false;
  if (/\|\s*(while|read)\b/.test(code)) return false;
  return !code
    .split("\n")
    .some((line) => /\b(read|done)\b/.test(line) && BASH_INPUT_REDIRECT.test(line));
}

export function instrument(compiler: string, code: string): { code: string; interactive: boolean } {
  if (compiler.endsWith("-c"))
    return { code: C_PRELUDE + '#line 1 "main.c"\n' + code, interactive: true };
  if (/^(gcc|clang)/.test(compiler)) return { code: CPP_PRELUDE + code, interactive: true };
  if (compiler.startsWith("openjdk")) {
    let c = code.replace(/public\s+class\s+/, "class ");
    const m = c.match(/(public\s+)?static\s+void\s+main\s*\(/);
    if (m && m.index !== undefined) c = c.slice(0, m.index) + JAVA_BLOCK + c.slice(m.index);
    return { code: c, interactive: !!m };
  }
  if (compiler.startsWith("mono") || compiler.startsWith("dotnet")) {
    const mainIdx = code.search(/static\s+(async\s+)?\S+\s+Main\s*\(/);
    if (mainIdx < 0) return { code, interactive: false };
    const before = code.slice(0, mainIdx);
    const classes = [...before.matchAll(/class\s+(\w+)[^{]*\{/g)];
    const last = classes[classes.length - 1];
    if (!last || last.index === undefined) return { code, interactive: false };
    const at = last.index + last[0].length;
    const ctor = ` static ${last[1]}() { System.Console.SetIn(new __LbReader(System.Console.In)); } `;
    return { code: code.slice(0, at) + ctor + code.slice(at) + CS_READER, interactive: true };
  }
  if (compiler.startsWith("bash") && bashNeedsReadPrompt(code)) {
    return { code: BASH_PRELUDE + code, interactive: true };
  }
  return { code, interactive: false };
}

function errorOutput(message: string): CompileOutput {
  return {
    interactive: false,
    needInput: false,
    compileError: message,
    stdout: "",
    stderr: "",
    status: "1",
  };
}

function buildPayload(
  compiler: string,
  code: string,
  input: CompileInput,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { compiler, code, stdin: input.stdin };
  const extra = Object.entries(input.extraFiles ?? {})
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([file, content]) => ({ file, code: content }));
  if (extra.length) payload["codes"] = extra;
  return payload;
}

async function post(fetchImpl: typeof fetch, payload: Record<string, unknown>): Promise<Response> {
  return fetchImpl(WANDBOX_COMPILE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(WANDBOX_TIMEOUT_MS),
  });
}

/** Compiles and runs one request. Network, timeout and HTTP failures come back as a result, never a throw. */
export async function compileAndRun(
  input: CompileInput,
  fetchImpl: typeof fetch = fetch,
): Promise<CompileOutput> {
  const catalog = await loadCatalog(fetchImpl);
  const compiler = resolveCompiler(input.compiler, input.language, catalog);
  if (!compiler)
    return errorOutput(
      `No ${input.language} compiler is available on the online compiler service right now.`,
    );

  const instrumented = instrument(compiler, input.code);
  let res: Response;
  try {
    res = await post(fetchImpl, buildPayload(compiler, instrumented.code, input));
  } catch (e) {
    const timedOut =
      (e as { name?: string })?.name === "TimeoutError" ||
      (e as { name?: string })?.name === "AbortError";
    const why = timedOut
      ? `did not respond within ${WANDBOX_TIMEOUT_MS / 1000} seconds`
      : "could not be reached";
    return errorOutput(`The online compiler ${why}. Check your connection and try again.`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ...errorOutput(`Compiler service error [${res.status}]: ${body.slice(0, 500)}`),
      interactive: instrumented.interactive,
    };
  }
  const j = (await res.json()) as Record<string, string>;

  const stdout = j["program_output"] ?? "";
  return {
    interactive: instrumented.interactive,
    needInput: stdout.includes(MARK),
    compileError: j["compiler_error"] ?? "",
    stdout: stdout.replace(MARK, ""),
    stderr: j["program_error"] ?? "",
    status: j["status"] ?? (j["signal"] ? "signal " + j["signal"] : "0"),
  };
}
