import { describe, expect, it } from "vitest";
import { runShell } from "./shell";
import type { Files } from "./workspace";

// Strip the terminal colour codes so assertions read as plain text.
const ESC = String.fromCharCode(27);
const plain = (s: string | undefined) =>
  (s ?? "").replace(new RegExp(ESC + "\\[[0-9;]*m", "g"), "");
const run = (line: string, files: Files, cwd = "") => plain(runShell(line, files, cwd, []).out);

const files: Files = {
  "a.txt": "pear\napple\napple\nfig\n",
  "nums.txt": "10\n9\n100\n",
  "csv.txt": "name,age,city\nAsha,21,Pune\nRavi,19,Delhi\n",
  "word.txt": "cat\n",
  "f1.txt": "one\ntwo\nthree\n",
  "f2.txt": "one\nTWO\nthree\nfour\n",
  "proj/main.py": "print(1)\n",
  "proj/utils/helpers.py": "x = 1\n",
  "proj/readme.md": "hi\n",
};

describe("shell: text commands", () => {
  it("sort orders lines, supports -r, -n and -u", () => {
    expect(run("sort a.txt", files)).toBe("apple\napple\nfig\npear\n");
    expect(run("sort -r a.txt", files)).toBe("pear\nfig\napple\napple\n");
    expect(run("sort -n nums.txt", files)).toBe("9\n10\n100\n");
    expect(run("sort -u a.txt", files)).toBe("apple\nfig\npear\n");
  });

  it("uniq collapses adjacent duplicates", () => {
    expect(run("uniq a.txt", files)).toBe("pear\napple\nfig\n");
  });

  it("cut selects delimited fields", () => {
    expect(run("cut -d, -f1,3 csv.txt", files)).toBe("name,city\nAsha,Pune\nRavi,Delhi\n");
    expect(run("cut -d, -f2 csv.txt", files)).toBe("age\n21\n19\n");
  });

  it("cut without -f is a clear error", () => {
    expect(run("cut -d, csv.txt", files)).toContain("you must specify a list of fields");
  });

  it("tr maps character sets, including ranges", () => {
    expect(run("tr a-z A-Z word.txt", files)).toBe("CAT\n");
  });

  it("diff prints nothing for identical files and marks differing lines", () => {
    expect(run("diff f1.txt f1.txt", files)).toBe("");
    const out = run("diff f1.txt f2.txt", files);
    expect(out).toContain("< two");
    expect(out).toContain("> TWO");
    expect(out).toContain("> four");
    expect(out).not.toContain("< one");
  });
});

describe("shell: find, paths and head/tail", () => {
  it("find lists matching files under a directory", () => {
    const out = run("find proj -name *.py", files);
    expect(out).toBe("proj/main.py\nproj/utils/helpers.py\n");
  });

  it("find -type d returns only directories", () => {
    expect(run("find proj -type d", files).trim().split("\n").sort()).toEqual([
      "proj",
      "proj/utils",
    ]);
  });

  it("find from the workspace root prefixes results with ./", () => {
    expect(run("find . -name readme.md", files)).toBe("./proj/readme.md\n");
  });

  it("basename and dirname split paths", () => {
    expect(run("basename proj/utils/helpers.py", files)).toBe("helpers.py\n");
    expect(run("basename proj/utils/helpers.py .py", files)).toBe("helpers\n");
    expect(run("dirname proj/utils/helpers.py", files)).toBe("proj/utils\n");
    expect(run("dirname helpers.py", files)).toBe(".\n");
  });

  it("which reports known practice-shell commands only", () => {
    expect(run("which ls", files)).toBe("/usr/bin/ls\n");
    expect(run("which nosuchtool", files)).toBe("");
  });

  it("head and tail honour -n", () => {
    const big = Object.fromEntries([
      ["n.txt", Array.from({ length: 15 }, (_, i) => `row${i + 1}`).join("\n") + "\n"],
    ]) as Files;
    expect(run("head -n 3 n.txt", big)).toBe("row1\nrow2\nrow3\n");
    expect(run("tail -n 2 n.txt", big)).toBe("row14\nrow15\n");
    expect(run("head -2 n.txt", big)).toBe("row1\nrow2\n");
  });

  it("head default is 10 lines and tail adds no phantom blank line", () => {
    const big = {
      "n.txt": Array.from({ length: 12 }, (_, i) => `r${i + 1}`).join("\n") + "\n",
    } as Files;
    expect(run("head n.txt", big).split("\n").filter(Boolean)).toHaveLength(10);
    expect(run("tail n.txt", big)).toBe(
      Array.from({ length: 10 }, (_, i) => `r${i + 3}`).join("\n") + "\n",
    );
  });
});

describe("shell: honesty about unsupported features", () => {
  it("refuses pipes instead of silently misreading them", () => {
    expect(run("cat a.txt | sort", files)).toContain("pipes (|) are not supported");
  });

  it("does not treat a | inside quotes as a pipe", () => {
    expect(run('echo "a|b"', files)).toBe("a|b\n");
  });
});
