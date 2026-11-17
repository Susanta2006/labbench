import { describe, expect, it } from "vitest";
import { buildTaPrompt, codeExcerpt, fallbackText, TA_SYSTEM } from "./ai-prompt";

const CODE = ["a = 4", "b = 0", "print(a / b)", "print('done')", "x = 1"].join("\n");

describe("TA_SYSTEM teaching contract", () => {
  it("asks for the four labelled parts and forbids corrected code", () => {
    for (const label of ["What went wrong:", "Where:", "Why it happens:", "Try this:"]) {
      expect(TA_SYSTEM).toContain(label);
    }
    expect(TA_SYSTEM).toContain("Never write corrected code");
    expect(TA_SYSTEM).toContain("under 150 words");
  });
});

describe("codeExcerpt", () => {
  it("numbers the lines around the error and marks the reported line", () => {
    expect(codeExcerpt(CODE, 3, 1)).toBe("  2: b = 0\n> 3: print(a / b)\n  4: print('done')");
  });

  it("returns nothing when there is no usable line", () => {
    expect(codeExcerpt(CODE, undefined)).toBe("");
    expect(codeExcerpt(CODE, 99)).toBe("");
  });

  it("clamps at the start and end of the file", () => {
    expect(codeExcerpt(CODE, 1, 2).split("\n")[0]).toBe("> 1: a = 4");
    expect(codeExcerpt(CODE, 5, 2).split("\n").at(-1)).toBe("> 5: x = 1");
  });
});

describe("buildTaPrompt", () => {
  const prompt = buildTaPrompt({
    language: "Python 3",
    code: CODE,
    output: "Traceback...\nZeroDivisionError: division by zero",
    exitCode: 1,
    stdin: "",
    findings: [{ line: 3, title: "Division by zero", detail: "The divisor was 0." }],
  });

  it("gives the tutor the exit code, the input status, findings, the excerpt and the output", () => {
    expect(prompt).toContain("Exit code: 1");
    expect(prompt).toContain("Input given to the program: none (the input panel was empty)");
    expect(prompt).toContain("- Line 3: Division by zero. The divisor was 0.");
    expect(prompt).toContain("> 3: print(a / b)");
    expect(prompt).toContain("ZeroDivisionError: division by zero");
  });

  it("says when input was not recorded rather than inventing it", () => {
    const p = buildTaPrompt({
      language: "C",
      code: "int main(){}",
      output: "",
      exitCode: null,
      findings: [],
    });
    expect(p).toContain("Input given to the program: not applicable or not recorded");
    expect(p).toContain("Exit code: not recorded");
    expect(p).toContain("- none recognised");
  });

  it("caps the input it sends", () => {
    const p = buildTaPrompt({
      language: "Python 3",
      code: "x",
      output: "",
      exitCode: 0,
      stdin: "a".repeat(900),
      findings: [],
    });
    expect(p).toContain("a".repeat(500));
    expect(p).not.toContain("a".repeat(501));
  });
});

describe("fallbackText", () => {
  it("shows the rule-based findings when the AI is unavailable", () => {
    const text = fallbackText([{ line: 2, title: "Syntax error", detail: "Check the colon." }]);
    expect(text).toContain("- Line 2: Syntax error. Check the colon.");
  });

  it("is honest when nothing was recognised", () => {
    expect(fallbackText([])).toContain("found no known error");
  });
});
