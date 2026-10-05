import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MARK = "@@LB_NEED_INPUT@@";

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

function instrument(compiler: string, code: string): { code: string; interactive: boolean } {
  if (compiler.endsWith("-c")) return { code: C_PRELUDE + '#line 1 "main.c"\n' + code, interactive: true };
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
  return { code, interactive: false };
}

export const runRemote = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ compiler: z.string().max(60), code: z.string().max(200_000), stdin: z.string().max(100_000) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { code, interactive } = instrument(data.compiler, data.code);
    const res = await fetch("https://wandbox.org/api/compile.json", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ compiler: data.compiler, code, stdin: data.stdin }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { interactive, needInput: false, compileError: `Compiler service error [${res.status}]: ${body.slice(0, 500)}`, stdout: "", stderr: "", status: "1" };
    }
    const j = (await res.json()) as Record<string, string>;
    const stdout = j["program_output"] ?? "";
    const needInput = stdout.includes(MARK);
    return {
      interactive,
      needInput,
      compileError: j["compiler_error"] ?? "",
      stdout: stdout.replace(MARK, ""),
      stderr: j["program_error"] ?? "",
      status: j["status"] ?? (j["signal"] ? "signal " + j["signal"] : "0"),
    };
  });
