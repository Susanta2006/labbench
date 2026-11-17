// @vitest-environment node
// These tests run the instrumented script with the REAL local bash, not Wandbox. They check the
// read-prompt wrapper's behaviour; whether Wandbox's bash behaves the same is NOT verified.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import { bashNeedsReadPrompt, instrument } from "./wandbox-client";

const MARK = "@@LB_NEED_INPUT@@";
const dir = mkdtempSync(join(tmpdir(), "lb-bash-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const SUM_SCRIPT = `#!/bin/bash
# Prompt the user to enter a positive integer
read -p "Enter a positive integer (n): " n

# Check if the input is a valid positive integer
if ! [[ "$n" =~ ^[1-9][0-9]*$ ]]; then
    echo "Error: Please enter a valid positive integer greater than 0."
    exit 1
fi

sum=0
for (( i=1; i<=n; i++ ))
do
    sum=$((sum + i))
done

echo "The sum of the first $n natural numbers is: $sum"
`;

/** Runs `code` the way the IDE does: instrumented, with `stdin` as the whole program input. */
function runBash(code: string, stdin: string) {
  const { code: final } = instrument("bash", code);
  const file = join(dir, `script-${Math.random().toString(36).slice(2)}.sh`);
  writeFileSync(file, final);
  const r = spawnSync("bash", [file], { input: stdin, encoding: "utf8" });
  return { stdout: r.stdout, stderr: r.stderr, status: r.status };
}

describe("bash read prompting", () => {
  it("asks for input when none was entered, using the prompt and the IDE marker", () => {
    const r = runBash(SUM_SCRIPT, "");
    expect(r.stdout).toBe(`Enter a positive integer (n): ${MARK}`);
    expect(r.status).toBe(0);
  });

  it("completes the program once the input is supplied", () => {
    const r = runBash(SUM_SCRIPT, "5\n");
    expect(r.stdout).toBe(
      "Enter a positive integer (n): The sum of the first 5 natural numbers is: 15\n",
    );
    expect(r.stdout).not.toContain(MARK);
    expect(r.status).toBe(0);
  });

  it("reports the script's own validation error and exits 1 without asking again", () => {
    const r = runBash(SUM_SCRIPT, "abc\n");
    expect(r.stdout).toContain("Error: Please enter a valid positive integer greater than 0.");
    expect(r.stdout).not.toContain(MARK);
    expect(r.status).toBe(1);
  });

  it("keeps the user's line numbers (the wrapper shares line 1)", () => {
    const r = runBash("read -p 'x: ' a\necho line-$LINENO\n", "1\n");
    expect(r.stdout).toBe("x: line-2\n");
  });

  it("prints the prompt once even with combined flags such as -rp", () => {
    const r = runBash('read -rp "Name? " name\necho "Hi $name"\n', "Ada\n");
    expect(r.stdout).toBe("Name? Hi Ada\n");
  });

  it("handles a second read after the first has its input", () => {
    const code = 'read -p "A: " a\nread -p "B: " b\necho "$a+$b"\n';
    expect(runBash(code, "1\n").stdout).toBe(`A: B: ${MARK}`);
    expect(runBash(code, "1\n2\n").stdout).toBe("A: B: 1+2\n");
  });

  it("leaves scripts that read from a file untouched, so end of file is not a prompt", () => {
    const code = 'while read -r line; do echo "got $line"; done < data.txt\necho done\n';
    const data = join(dir, "data.txt");
    writeFileSync(data, "one\ntwo\n");
    expect(bashNeedsReadPrompt(code)).toBe(false);
    const file = join(dir, "file-reader.sh");
    writeFileSync(file, code);
    const r = spawnSync("bash", [file], { cwd: dir, encoding: "utf8" });
    expect(r.stdout).toBe("got one\ngot two\ndone\n");
  });

  it("does not instrument scripts with no read at all", () => {
    expect(instrument("bash", "echo hi\n")).toEqual({ code: "echo hi\n", interactive: false });
  });

  it("does not instrument scripts that pipe into a read loop", () => {
    expect(bashNeedsReadPrompt("printf 'a\\n' | while read x; do echo $x; done\n")).toBe(false);
  });
});
