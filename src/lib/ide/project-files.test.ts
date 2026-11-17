import { describe, expect, it } from "vitest";
import { encodeBinaryFile } from "./file-content";
import { projectFilesFor, relativeTo } from "./project-files";

describe("projectFilesFor", () => {
  it("collects only the active root's text files, keyed relative to the root", () => {
    const files = {
      "python/main.py": "print(1)",
      "python/utils/helpers.py": "def f(): pass",
      "python/utils/.keep": "",
      "python/data.bin": encodeBinaryFile("application/octet-stream", "AAAA"),
      "web/index.html": "<h1>x</h1>",
      "pythonish/other.py": "nope",
    };
    expect(projectFilesFor("python", files)).toEqual({
      "main.py": "print(1)",
      "utils/helpers.py": "def f(): pass",
    });
  });

  it("drops paths that could escape the project", () => {
    const files = { "python/../secret.py": "x", "python//a.py": "y", "python/ok.py": "z" };
    expect(projectFilesFor("python", files)).toEqual({ "ok.py": "z" });
  });
});

describe("relativeTo", () => {
  it("makes workspace paths relative to their root", () => {
    expect(relativeTo("python", "python/utils/helpers.py")).toBe("utils/helpers.py");
    expect(relativeTo("python", "other/x.py")).toBe("other/x.py");
  });
});
