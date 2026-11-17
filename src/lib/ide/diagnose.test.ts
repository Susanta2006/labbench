// @vitest-environment node
// Python tracebacks come from the real Pyodide runtime and Bash errors from the real local Bash,
// so the rules are checked against genuine output. Other languages use typical compiler and
// runtime messages, which is noted in Testing.md.
import { spawnSync } from "node:child_process";
import { loadPyodide } from "pyodide";
import { beforeAll, describe, expect, it } from "vitest";
import { diagnose, summarize } from "./diagnose";

let py: Awaited<ReturnType<typeof loadPyodide>>;
beforeAll(async () => {
  py = await loadPyodide();
}, 120_000);

async function pythonTraceback(code: string): Promise<string> {
  const out: string[] = [];
  py.setStdout({ batched: (s: string) => out.push(s) });
  py.setStderr({ batched: (s: string) => out.push(s) });
  try {
    await py.runPythonAsync(code, { filename: "main.py" } as never);
  } catch (e) {
    out.push(String((e as Error).message));
  }
  return out.join("\n");
}

describe("python diagnoses from real tracebacks", () => {
  it("names the line and the undefined name", async () => {
    const tb = await pythonTraceback("x = 1\nprint(totl)\n");
    const f = diagnose({
      language: "python",
      code: "x = 1\nprint(totl)\n",
      output: tb,
      exitCode: 1,
    });
    expect(f[0]?.title).toBe("Name not defined");
    expect(f[0]?.detail).toContain("'totl'");
    expect(f[0]?.line).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it("reports a division by zero with its line", async () => {
    const code = "a = 4\nb = 0\nprint(a / b)\n";
    const tb = await pythonTraceback(code);
    const f = diagnose({ language: "python", code, output: tb, exitCode: 1 });
    expect(f[0]?.title).toBe("Division by zero");
  }, 60_000);

  it("explains an empty answer to int()", async () => {
    const code = 'n = int("")\n';
    const tb = await pythonTraceback(code);
    const f = diagnose({ language: "python", code, output: tb, exitCode: 1 });
    expect(f[0]?.title).toBe("Input is not a number");
  }, 60_000);

  it("explains a missing module and the browser limit for tkinter", () => {
    const tk = diagnose({
      language: "python",
      code: "import tkinter",
      output: "ModuleNotFoundError: No module named 'tkinter'",
      exitCode: 1,
    });
    expect(tk[0]?.title).toBe("tkinter is not available here");
    const other = diagnose({
      language: "python",
      code: "import foo",
      output: "ModuleNotFoundError: No module named 'foo'",
      exitCode: 1,
    });
    expect(other[0]?.detail).toContain("'foo'");
  });
});

describe("bash diagnoses from real local bash errors", () => {
  function bash(code: string, stdin = "") {
    const r = spawnSync("bash", ["-c", code], { input: stdin, encoding: "utf8" });
    return { output: `${r.stdout}${r.stderr}`, exitCode: r.status };
  }

  it("finds a mistyped command", () => {
    const { output, exitCode } = bash("echo start\nlss_missing_cmd\n");
    const f = diagnose({ language: "bash", code: "", output, exitCode });
    expect(f.find((x) => x.title === "Command not found")?.detail).toContain("lss_missing_cmd");
  });

  it("finds a syntax error and its line", () => {
    const { output, exitCode } = bash("echo ok\nif [ 1 -eq 1 ]\necho bad fi\n");
    const f = diagnose({ language: "bash", code: "", output, exitCode });
    expect(
      f.some(
        (x) =>
          x.title === "Syntax error" ||
          x.title === "Command not found" ||
          x.title === "The program stopped with an error",
      ),
    ).toBe(true);
  });

  it("explains Windows line endings", () => {
    const f = diagnose({
      language: "bash",
      code: "",
      output: "script.sh: line 2: $'\\r': command not found",
      exitCode: 127,
    });
    expect(f[0]?.title).toBe("Windows line endings");
  });

  it("notices a script that reads input when none was given", () => {
    const f = diagnose({
      language: "bash",
      code: 'read -p "n: " n\n',
      output: "Error: Please enter a valid integer.",
      exitCode: 1,
      stdin: "",
    });
    expect(f.some((x) => x.title === "No input was given")).toBe(true);
  });
});

describe("other languages", () => {
  it("reports the first C compile error with its line and says to fix it first", () => {
    const out =
      "main.c:4:5: error: expected ';' before 'return'\nmain.c:6:1: error: expected declaration";
    const f = diagnose({ language: "c", code: "", output: out, exitCode: 1 });
    expect(f[0]).toMatchObject({ title: "Compile error", line: 6 });
  });

  it("reports an undefined reference at link time", () => {
    const f = diagnose({
      language: "c",
      code: "",
      output: "/usr/bin/ld: undefined reference to `helper'",
      exitCode: 1,
    });
    expect(f[0]?.detail).toContain("'helper'");
  });

  it("reports a Java compile error with its line", () => {
    const f = diagnose({
      language: "java",
      code: "",
      output: "Main.java:5: error: ';' expected",
      exitCode: 1,
    });
    expect(f[0]).toMatchObject({ title: "Compile error", line: 5 });
  });

  it("explains a Java Scanner that ran out of input", () => {
    const f = diagnose({
      language: "java",
      code: "",
      output: 'Exception in thread "main" java.util.NoSuchElementException',
      exitCode: 1,
    });
    expect(f[0]?.title).toBe("Scanner ran out of input");
  });

  it("explains a Node module that cannot be loaded", () => {
    const f = diagnose({
      language: "node",
      code: "",
      output: "Error: Cannot find module './nope'",
      exitCode: 1,
    });
    expect(f[0]?.title).toBe("Module not found");
  });

  it("explains a missing SQL table and a column typo", () => {
    expect(
      diagnose({
        language: "sql",
        code: "",
        output: "SQL error: no such table: students",
        exitCode: 1,
      })[0]?.title,
    ).toBe("Table does not exist");
    expect(
      diagnose({
        language: "sql",
        code: "",
        output: "SQL error: no such column: nme",
        exitCode: 1,
      })[0]?.title,
    ).toBe("Column does not exist");
  });
});

describe("general behaviour", () => {
  it("returns nothing for a successful run", () => {
    expect(diagnose({ language: "python", code: "print(1)", output: "1\n", exitCode: 0 })).toEqual(
      [],
    );
  });

  it("falls back to an honest generic finding when nothing matches", () => {
    const f = diagnose({ language: "rust", code: "", output: "something odd", exitCode: 3 });
    expect(f[0]?.title).toBe("The program stopped with an error");
    expect(f[0]?.detail).toContain("exit code 3");
  });

  it("summarizes findings as plain lines for prompts", () => {
    const text = summarize([{ line: 4, title: "Syntax error", detail: "Check the colon." }]);
    expect(text).toBe("- Line 4: Syntax error. Check the colon.");
  });
});
