// @vitest-environment node
// Runs the real public/python-worker.js against the real Pyodide 0.26.4 runtime (no CDN, no browser).
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { loadPyodide } from "pyodide";
import { beforeAll, describe, expect, it } from "vitest";

type Msg = { type: string; text?: string; code?: number };

const messages: Msg[] = [];
let send: (data: Record<string, unknown>) => Promise<void>;

beforeAll(async () => {
  const sandbox: Record<string, unknown> = {
    TextDecoder,
    Atomics,
    Int32Array,
    Uint8Array,
    console,
    importScripts: () => {},
    loadPyodide,
    postMessage: (m: Msg) => {
      messages.push(m);
    },
  };
  sandbox["self"] = sandbox;
  createContext(sandbox);
  runInContext(readFileSync("public/python-worker.js", "utf8"), sandbox);
  const onmessage = sandbox["onmessage"] as (e: { data: unknown }) => Promise<void>;
  send = (data) => onmessage({ data });
  await send({ type: "init" });
}, 180_000);

async function run(opts: {
  code: string;
  files?: Record<string, string>;
  entry?: string;
  inputs?: string[];
  internet?: boolean;
}) {
  const start = messages.length;
  await send({ type: "run", attempt: 0, ...opts });
  const result = messages.slice(start);
  return {
    text: result
      .filter((m) => m.type === "out" || m.type === "err")
      .map((m) => m.text)
      .join(""),
    code: result.find((m) => m.type === "done")?.code,
    needInput: result.some((m) => m.type === "need-input"),
  };
}

describe("python worker project execution", () => {
  it("runs the multi-file example from the spec with nested packages", async () => {
    const files = {
      "main.py": `from calculator import add\nfrom operations import multiply\nfrom utils.helpers import greet\n\nprint(greet("Student"))\nprint(add(10, 20))\nprint(multiply(5, 6))\n`,
      "calculator.py": "def add(a, b):\n    return a + b\n",
      "operations.py": "def multiply(a, b):\n    return a * b\n",
      "utils/__init__.py": "",
      "utils/helpers.py": 'def greet(name):\n    return f"Hello, {name}!"\n',
    };
    const r = await run({ code: files["main.py"], files, entry: "main.py" });
    expect(r.text).toBe("Hello, Student!\n30\n30\n");
    expect(r.code).toBe(0);
  }, 60_000);

  it("picks up edited and removed modules on repeated runs (no stale imports)", async () => {
    const main = "from calculator import add\nprint(add(10, 20))\n";
    const first = await run({
      code: main,
      entry: "main.py",
      files: { "main.py": main, "calculator.py": "def add(a, b):\n    return a + b\n" },
    });
    expect(first.text).toBe("30\n");
    const second = await run({
      code: main,
      entry: "main.py",
      files: { "main.py": main, "calculator.py": "def add(a, b):\n    return a - b\n" },
    });
    expect(second.text).toBe("-10\n");
  }, 60_000);

  it("reports a missing module as a ModuleNotFoundError with exit code 1", async () => {
    const r = await run({
      code: "import nothere\n",
      files: { "main.py": "import nothere\n" },
      entry: "main.py",
    });
    expect(r.text).toContain("ModuleNotFoundError");
    expect(r.code).toBe(1);
  }, 60_000);

  it("imports siblings of an entry file that lives in a subfolder", async () => {
    const files = { "app/run.py": "import helper\nprint(helper.X)\n", "app/helper.py": "X = 7\n" };
    const r = await run({ code: files["app/run.py"], files, entry: "app/run.py" });
    expect(r.text).toBe("7\n");
    expect(r.code).toBe(0);
  }, 60_000);

  it("lets the program read a sibling data file from the project folder", async () => {
    const files = {
      "main.py": 'print(open("data.txt").read().strip())\n',
      "data.txt": "hello file\n",
    };
    const r = await run({ code: files["main.py"], files, entry: "main.py" });
    expect(r.text).toBe("hello file\n");
  }, 60_000);

  it("surfaces exceptions raised inside an imported module", async () => {
    const files = {
      "main.py": "from bad import boom\nboom()\n",
      "bad.py": "def boom():\n    return 1 / 0\n",
    };
    const r = await run({ code: files["main.py"], files, entry: "main.py" });
    expect(r.text).toContain("ZeroDivisionError");
    expect(r.code).toBe(1);
  }, 60_000);

  it("feeds pre-entered input to input() calls", async () => {
    const code = 'name = input("Name: ")\nprint("Hi", name)\n';
    const r = await run({ code, entry: "main.py", inputs: ["Ada"] });
    expect(r.text).toContain("Hi Ada");
    expect(r.code).toBe(0);
  }, 60_000);
});

describe("python worker: honest messages for browser limits", () => {
  it("explains that tkinter is unavailable and points to the Web preview", async () => {
    const r = await run({ code: "import tkinter\n", entry: "main.py" });
    expect(r.text).toContain(
      "tkinter (desktop GUI library) is not available in the browser Python runtime",
    );
    expect(r.code).toBe(1);
  }, 60_000);

  it("explains that psutil needs operating-system access", async () => {
    const r = await run({ code: "import psutil\n", entry: "main.py" });
    expect(r.text).toContain("psutil needs direct operating-system access");
    expect(r.code).toBe(1);
  }, 60_000);
});

// The exact script from the student's screenshot.
const PING_SCRIPT = `import os
import platform

def check_internet(host="8.8.8.8"):
    param = "-n" if platform.system().lower() == "windows" else "-c"
    redirect = "> nul 2>&1" if platform.system().lower() == "windows" else "> /dev/null 2>&1"
    command = f"ping {param} 1 {host} {redirect}"
    response = os.system(command)
    if response == 0:
        print(f"Internet connection is WORKING (Successfully pinged {host}).")
    else:
        print(f"Internet connection is DOWN (Could not reach {host}).")

if __name__ == "__main__":
    check_internet()
`;

describe("python worker: ping matches the desktop result", () => {
  it("prints WORKING for the screenshot script when the internet check passes", async () => {
    const r = await run({ code: PING_SCRIPT, entry: "main.py", internet: true });
    expect(r.text).toBe("Internet connection is WORKING (Successfully pinged 8.8.8.8).\n");
    expect(r.code).toBe(0);
  }, 60_000);

  it("prints DOWN for the same script when the internet check fails", async () => {
    const r = await run({ code: PING_SCRIPT, entry: "main.py", internet: false });
    expect(r.text).toBe("Internet connection is DOWN (Could not reach 8.8.8.8).\n");
    expect(r.text).not.toContain("LabBench note");
    expect(r.code).toBe(0);
  }, 60_000);

  it("handles the Windows form of ping (-n and nul redirection)", async () => {
    const r = await run({
      code: 'import os\nprint("rc", os.system("ping -n 1 example.com > nul 2>&1"))\n',
      entry: "main.py",
      internet: true,
    });
    expect(r.text).toBe("rc 0\n");
  }, 60_000);

  it("explains that private addresses cannot be pinged from the browser", async () => {
    const r = await run({
      code: 'import os\nprint("rc", os.system("ping -c 1 192.168.1.1 > /dev/null 2>&1"))\n',
      entry: "main.py",
      internet: true,
    });
    expect(r.text).toContain("the browser cannot ping private or local address 192.168.1.1");
    expect(r.text).toContain("rc 1");
  }, 60_000);

  it("keeps the command-not-found note for other shell commands", async () => {
    const r = await run({
      code: 'import os\nprint("rc", os.system("nosuchtool --x"))\n',
      entry: "main.py",
      internet: true,
    });
    expect(r.text).toContain("LabBench note: os.system() cannot run programs");
    expect(r.text).toContain("rc 32512");
  }, 60_000);
});
