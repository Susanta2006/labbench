import { describe, expect, it } from "vitest";
import { planCreate, planRename, validateName } from "./workspace-paths";

const FILES = {
  "python/main.py": "print(1)",
  "python/utils/helpers.py": "def f(): pass",
  "python/empty/.keep": "",
  "bash/script.sh": "echo hi",
};

describe("validateName", () => {
  it("accepts ordinary and nested names", () => {
    expect(validateName("helper.py")).toBeNull();
    expect(validateName("utils/helpers.py")).toBeNull();
    expect(validateName("my file (2).txt")).toBeNull();
  });

  it("rejects empty, dot, reserved and unsafe names", () => {
    expect(validateName("")).toMatch(/cannot be empty/);
    expect(validateName(" spaced ")).toMatch(/start or end with a space/);
    expect(validateName("..")).toMatch(/not allowed/);
    expect(validateName("a//b")).toMatch(/empty folder parts/);
    expect(validateName(".keep")).toMatch(/reserved/);
    expect(validateName("bad:name")).toMatch(/cannot contain/);
    expect(validateName("x".repeat(121))).toMatch(/at most 120/);
  });
});

describe("planCreate", () => {
  it("creates a new file and folder where nothing exists", () => {
    expect(planCreate(FILES, "python", "new.py", "file")).toEqual({
      ok: true,
      path: "python/new.py",
    });
    expect(planCreate(FILES, "python", "data", "folder")).toEqual({
      ok: true,
      path: "python/data",
    });
  });

  it("never overwrites an existing file", () => {
    expect(planCreate(FILES, "python", "main.py", "file")).toEqual({
      ok: false,
      error: "A file with that name already exists here.",
    });
  });

  it("refuses a file where a folder already exists, and a folder where a file exists", () => {
    expect(planCreate(FILES, "python", "utils", "file")).toEqual({
      ok: false,
      error: "A folder with that name already exists here.",
    });
    expect(planCreate(FILES, "python", "main.py", "folder")).toEqual({
      ok: false,
      error: "A file with that name already exists here.",
    });
  });

  it("refuses to create anything inside a file", () => {
    expect(planCreate(FILES, "python/main.py", "x", "file")).toEqual({
      ok: false,
      error: '"python/main.py" is a file, so folders cannot be created inside it.',
    });
  });

  it("refuses to create an existing empty folder again", () => {
    expect(planCreate(FILES, "python", "empty", "folder").ok).toBe(false);
  });
});

describe("planRename", () => {
  it("cannot overwrite another file", () => {
    expect(planRename(FILES, "python/main.py", "file", "helper.py")).toEqual({
      ok: true,
      path: "python/helper.py",
    });
    expect(
      planRename({ ...FILES, "python/helper.py": "x" }, "python/main.py", "file", "helper.py"),
    ).toEqual({
      ok: false,
      error: "A file with that name already exists here.",
    });
  });

  it("cannot rename a folder onto an existing folder or file", () => {
    expect(planRename(FILES, "python/empty", "folder", "utils").ok).toBe(false);
    expect(planRename(FILES, "python/empty", "folder", "main.py").ok).toBe(false);
  });

  it("refuses to move a folder into itself", () => {
    expect(planRename(FILES, "python/utils", "folder", "utils/inside").ok).toBe(false);
  });

  it("allows a folder to be renamed while keeping its own contents", () => {
    expect(planRename(FILES, "python/utils", "folder", "tools")).toEqual({
      ok: true,
      path: "python/tools",
    });
  });

  it("reports an unchanged name", () => {
    expect(planRename(FILES, "python/main.py", "file", "main.py")).toEqual({
      ok: false,
      error: "The name is unchanged.",
    });
  });
});
