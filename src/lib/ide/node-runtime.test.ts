import { afterEach, describe, expect, it, vi } from "vitest";
import { buildNodeWorkerSource, NODE_RUNTIME_SOURCE } from "./node-runtime";

// Load the runtime exactly as the worker does, without a browser.
const runProject = new Function(`${NODE_RUNTIME_SOURCE}\nreturn __lbRunProject;`)() as (
  files: Record<string, string>,
  entry: string,
) => Promise<unknown>;

afterEach(() => vi.restoreAllMocks());

describe("node runtime: CommonJS project execution", () => {
  it("resolves relative requires across folders, index files and JSON", async () => {
    const files = {
      "main.js": `const { add } = require("./lib/math");\nconst greet = require("./utils");\nconst data = require("./data.json");\nconsole.log(greet("Student"), add(2, 3), data.items.length);\nmodule.exports = { ok: true };`,
      "lib/math.js": `exports.add = (a, b) => a + b;`,
      "utils/index.js": `module.exports = (name) => "Hello, " + name + "!";`,
      "data.json": `{"items": [1, 2, 3]}`,
    };
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await runProject(files, "main.js");
    expect(log).toHaveBeenCalledWith("Hello, Student!", 5, 3);
    expect(result).toEqual({ ok: true });
  });

  it("resolves '../' from a subfolder entry and the entry's own folder", async () => {
    const files = {
      "app/run.js": `const shared = require("../shared/config");\nconst helper = require("./helper");\nconsole.log(shared.name, helper());`,
      "shared/config.js": `module.exports = { name: "lab" };`,
      "app/helper.js": `module.exports = () => "ok";`,
    };
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await runProject(files, "app/run.js");
    expect(log).toHaveBeenCalledWith("lab", "ok");
  });

  it("runs each module once and supports circular requires like Node", async () => {
    const files = {
      "main.js": `const a = require("./a");\nconsole.log(a.name, a.sawB);`,
      "a.js": `exports.name = "A";\nconst b = require("./b");\nexports.sawB = b.name;`,
      "b.js": `exports.name = "B";\nconst a = require("./a");\nexports.sawA = a.name;\nconsole.log("b loaded", a.name);`,
    };
    const logged: unknown[][] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });
    await runProject(files, "main.js");
    expect(logged).toEqual([
      ["b loaded", "A"],
      ["A", "B"],
    ]);
  });

  it("gives a Node-style error for a missing relative module", async () => {
    await expect(runProject({ "main.js": `require("./nope");` }, "main.js")).rejects.toThrow(
      "Cannot find module './nope'",
    );
  });

  it("refuses bare package names with Node's missing-module message", async () => {
    await expect(runProject({ "main.js": `require("lodash");` }, "main.js")).rejects.toThrow(
      "Cannot find module 'lodash'",
    );
  });

  it("explains ES import syntax instead of failing obscurely", async () => {
    await expect(
      runProject({ "main.js": `import x from "./a";\nconsole.log(x);`, "a.js": "" }, "main.js"),
    ).rejects.toThrow("Cannot use import statement outside a module");
  });

  it("surfaces an error thrown inside a required module", async () => {
    await expect(
      runProject(
        { "main.js": `require("./bad");`, "bad.js": `throw new Error("boom in bad");` },
        "main.js",
      ),
    ).rejects.toThrow("boom in bad");
  });

  it("supports top-level await in the entry file, as the previous single-file runner did", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await runProject(
      { "main.js": `const v = await Promise.resolve(42);\nconsole.log("v", v);` },
      "main.js",
    );
    expect(log).toHaveBeenCalledWith("v", 42);
  });

  it("starts with a fresh module cache on every run", async () => {
    const files = {
      "main.js": `const c = require("./counter");\nconsole.log("count", c.next());`,
      "counter.js": `let n = 0;\nexports.next = () => ++n;`,
    };
    const logged: unknown[][] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });
    await runProject(files, "main.js");
    await runProject(files, "main.js");
    expect(logged).toEqual([
      ["count", 1],
      ["count", 1],
    ]);
  });

  it("reports a missing entry file", async () => {
    await expect(runProject({ "a.js": "" }, "main.js")).rejects.toThrow(
      "Cannot find entry file 'main.js'",
    );
  });
});

describe("node worker source (what the browser actually runs)", () => {
  // Evaluate the real worker source with a stub postMessage, as the Worker would.
  function startWorker() {
    const messages: { type: string; text?: string; code?: number }[] = [];
    const holder: { onmessage?: (e: { data: unknown }) => Promise<void> } = {};
    const source = buildNodeWorkerSource().replace(
      "onmessage = async e",
      "holder.onmessage = async e",
    );
    new Function("postMessage", "holder", source)(
      (m: unknown) => messages.push(m as never),
      holder,
    );
    return { messages, send: (data: unknown) => holder.onmessage!({ data }) };
  }

  it("streams console output and reports success with exit code 0", async () => {
    const { messages, send } = startWorker();
    await send({
      files: { "main.js": `console.log("hi", 1);\nconsole.error("bad");` },
      entry: "main.js",
    });
    expect(messages).toContainEqual({ type: "out", text: "hi 1\n" });
    expect(messages).toContainEqual({ type: "err", text: "bad\n" });
    expect(messages.at(-1)).toEqual({ type: "done", code: 0 });
  });

  it("runs multi-file projects and reports failures with a stack and exit code 1", async () => {
    const { messages, send } = startWorker();
    await send({
      files: { "main.js": `require("./bad");`, "bad.js": `throw new Error("broken module");` },
      entry: "main.js",
    });
    const err = messages.find((m) => m.type === "err");
    expect(err?.text).toContain("broken module");
    expect(messages.at(-1)).toEqual({ type: "done", code: 1 });
  });
});
