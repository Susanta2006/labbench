// These tests use a FAKE Wandbox. They check our request shapes and error handling only;
// they do not prove Wandbox's real behaviour, which is verified separately (see Testing docs).
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  compileAndRun,
  instrument,
  resetWandboxCacheForTests,
  resolveCompiler,
  validateExtraFiles,
  WANDBOX_TIMEOUT_MS,
} from "./wandbox-client";

const CATALOG = [
  { name: "gcc-13.2.0", language: "C++" },
  { name: "gcc-13.2.0-c", language: "C" },
  { name: "openjdk-jdk-22+36", language: "Java" },
  { name: "rust-1.82.0", language: "Rust" },
];

type Reply = Response | Error;
interface Call {
  url: string;
  body?: Record<string, unknown>;
}

/** A fake Wandbox: answers the catalog URL and queues compile replies. */
function fakeWandbox(compileReplies: Reply[], catalog: unknown = CATALOG) {
  const calls: Call[] = [];
  const queue = [...compileReplies];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (u.endsWith("/list.json")) return new Response(JSON.stringify(catalog), { status: 200 });
    const next =
      queue.shift() ??
      new Response(JSON.stringify({ program_output: "", status: "0" }), { status: 200 });
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return {
    fetchImpl,
    calls,
    compileCalls: () => calls.filter((c) => c.url.endsWith("/compile.json")),
  };
}

const ok = (body: Record<string, string>) => new Response(JSON.stringify(body), { status: 200 });

beforeEach(() => resetWandboxCacheForTests());

describe("request shape", () => {
  it("sends a single-file request without a codes array (unchanged behaviour)", async () => {
    const w = fakeWandbox([ok({ program_output: "3\n", status: "0" })]);
    const r = await compileAndRun(
      { compiler: "rust-1.82.0", language: "rust", code: "fn main(){}", stdin: "" },
      w.fetchImpl,
    );
    expect(r.stdout).toBe("3\n");
    const body = w.compileCalls()[0]!.body!;
    expect(body["compiler"]).toBe("rust-1.82.0");
    expect(body["code"]).toBe("fn main(){}");
    expect(body).not.toHaveProperty("codes");
  });

  it("sends the other project files as sorted codes entries, never the entry itself", async () => {
    const w = fakeWandbox([ok({ program_output: "", status: "0" })]);
    await compileAndRun(
      {
        compiler: "rust-1.82.0",
        language: "rust",
        code: "mod util;",
        stdin: "",
        extraFiles: { "util.rs": "pub fn f(){}", "a/b.rs": "x" },
      },
      w.fetchImpl,
    );
    const codes = w.compileCalls()[0]!.body!["codes"] as { file: string; code: string }[];
    expect(codes).toEqual([
      { file: "a/b.rs", code: "x" },
      { file: "util.rs", code: "pub fn f(){}" },
    ]);
  });

  it("wraps C with the input-detection prelude and tags the source as main.c", () => {
    const r = instrument("gcc-13.2.0-c", "int main(){}");
    expect(r.interactive).toBe(true);
    expect(r.code).toContain("__lb_read");
    expect(r.code).toContain('#line 1 "main.c"');
  });

  it("renames a public Java class and injects the input guard into main", () => {
    const r = instrument(
      "openjdk-jdk-22+36",
      "public class Main { public static void main(String[] a){} }",
    );
    expect(r.code).toContain("class Main");
    expect(r.code).not.toContain("public class");
    expect(r.interactive).toBe(true);
  });
});

describe("compiler resolution", () => {
  it("uses the preferred compiler when the catalog lists it", async () => {
    const w = fakeWandbox([ok({ program_output: "", status: "0" })]);
    await compileAndRun(
      { compiler: "gcc-13.2.0-c", language: "c", code: "int main(){}", stdin: "" },
      w.fetchImpl,
    );
    expect(w.compileCalls()[0]!.body!["compiler"]).toBe("gcc-13.2.0-c");
  });

  it("picks the catalog entry for the same language when the preferred ID is gone", () => {
    expect(resolveCompiler("rust-old", "rust", CATALOG)).toBe("rust-1.82.0");
    expect(resolveCompiler("cpp-old", "cpp", CATALOG)).toBe("gcc-13.2.0");
  });

  it("falls back to the hardcoded ID when the catalog cannot be reached", async () => {
    const w = fakeWandbox([ok({ program_output: "", status: "0" })]);
    const failingCatalog = vi.fn(async (url: string) => {
      if (url.endsWith("/list.json")) throw new Error("offline");
      return ok({ program_output: "", status: "0" });
    }) as unknown as typeof fetch;
    await compileAndRun(
      { compiler: "rust-1.82.0", language: "rust", code: "x", stdin: "" },
      failingCatalog,
    );
    expect(w).toBeDefined();
    expect(resolveCompiler("rust-1.82.0", "rust", null)).toBe("rust-1.82.0");
  });

  it("reports a clear error and sends no compile when the language has no compiler", async () => {
    const w = fakeWandbox([]);
    const r = await compileAndRun(
      { compiler: "zig-old", language: "zig", code: "x", stdin: "" },
      w.fetchImpl,
    );
    expect(r.compileError).toContain("No zig compiler is available");
    expect(r.status).toBe("1");
    expect(w.compileCalls()).toHaveLength(0);
  });

  it("sends the catalog's current compiler when the caller's ID is stale, without a second request", async () => {
    const w = fakeWandbox([ok({ program_output: "hi\n", status: "0" })], CATALOG);
    const r = await compileAndRun(
      { compiler: "rust-old", language: "rust", code: "x", stdin: "" },
      w.fetchImpl,
    );
    expect(w.compileCalls().map((c) => c.body!["compiler"])).toEqual(["rust-1.82.0"]);
    expect(r.stdout).toBe("hi\n");
  });

  it("reuses the catalog across compiles instead of refetching it", async () => {
    const w = fakeWandbox([
      ok({ program_output: "", status: "0" }),
      ok({ program_output: "", status: "0" }),
    ]);
    await compileAndRun(
      { compiler: "rust-1.82.0", language: "rust", code: "x", stdin: "" },
      w.fetchImpl,
    );
    await compileAndRun(
      { compiler: "rust-1.82.0", language: "rust", code: "x", stdin: "" },
      w.fetchImpl,
    );
    expect(w.calls.filter((c) => c.url.endsWith("/list.json"))).toHaveLength(1);
  });
});

describe("failure handling", () => {
  it("turns a timeout into a readable error, never a hang or a throw", async () => {
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    const w = fakeWandbox([timeout]);
    const r = await compileAndRun(
      { compiler: "rust-1.82.0", language: "rust", code: "x", stdin: "" },
      w.fetchImpl,
    );
    expect(r.compileError).toContain(`did not respond within ${WANDBOX_TIMEOUT_MS / 1000} seconds`);
    expect(r.status).toBe("1");
  });

  it("turns a network failure into a readable error", async () => {
    const w = fakeWandbox([new TypeError("fetch failed")]);
    const r = await compileAndRun(
      { compiler: "rust-1.82.0", language: "rust", code: "x", stdin: "" },
      w.fetchImpl,
    );
    expect(r.compileError).toContain("could not be reached");
  });

  it("reports HTTP errors with the status code", async () => {
    const w = fakeWandbox([new Response("upstream down", { status: 503 })]);
    const r = await compileAndRun(
      { compiler: "rust-1.82.0", language: "rust", code: "x", stdin: "" },
      w.fetchImpl,
    );
    expect(r.compileError).toContain("Compiler service error [503]: upstream down");
  });

  it("reports compile errors separately from program output", async () => {
    const w = fakeWandbox([ok({ compiler_error: "main.rs:1: syntax error", status: "1" })]);
    const r = await compileAndRun(
      { compiler: "rust-1.82.0", language: "rust", code: "x", stdin: "" },
      w.fetchImpl,
    );
    expect(r.compileError).toContain("syntax error");
    expect(r.stdout).toBe("");
  });

  it("detects a request for more input and strips the marker from the output", async () => {
    const w = fakeWandbox([ok({ program_output: "Enter n: @@LB_NEED_INPUT@@", status: "0" })]);
    const r = await compileAndRun(
      { compiler: "gcc-13.2.0-c", language: "c", code: "int main(){}", stdin: "" },
      w.fetchImpl,
    );
    expect(r.needInput).toBe(true);
    expect(r.stdout).toBe("Enter n: ");
  });
});

describe("validateExtraFiles", () => {
  it("accepts ordinary project files, including subfolders", () => {
    expect(validateExtraFiles({ "helper.h": "", "lib/util.c": "" }, "main.c")).toBeNull();
  });

  it("rejects paths that could escape the project", () => {
    expect(validateExtraFiles({ "../x.c": "" }, "main.c")).toMatch(/Unsafe file path/);
    expect(validateExtraFiles({ "/etc/x.c": "" }, "main.c")).toMatch(/Unsafe file path/);
    expect(validateExtraFiles({ "a//b.c": "" }, "main.c")).toMatch(/Unsafe file path/);
  });

  it("rejects a file that would collide with the main file", () => {
    expect(validateExtraFiles({ "main.c": "" }, "main.c")).toMatch(/Duplicate entry file/);
  });

  it("enforces file-count and size limits", () => {
    const many = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`f${i}.c`, ""]));
    expect(validateExtraFiles(many, "main.c")).toMatch(/Too many project files/);
    expect(validateExtraFiles({ "big.c": "x".repeat(300_001) }, "main.c")).toMatch(/too large/);
  });
});
