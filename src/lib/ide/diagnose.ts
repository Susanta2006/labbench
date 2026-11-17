// Rule-based error diagnosis. Free, instant, and works even when the AI tutor is unavailable.
// It names the line and the most likely cause for common errors in each language. It never
// writes corrected code. Rules are matched against the run's output, so they describe what
// actually happened rather than guessing from the source text.

export interface Finding {
  line?: number | undefined;
  title: string;
  detail: string;
}

export interface DiagnoseInput {
  language: string;
  code: string;
  output: string;
  exitCode: number | null;
  stdin?: string;
}

// Regex helpers. Every group in these patterns always participates when the pattern matches,
// so the captures are typed as strings.
type Match = string[];
const firstMatch = (text: string, re: RegExp): Match | null =>
  text.match(re) as unknown as Match | null;
const LAST = (re: RegExp, text: string): Match | null => {
  let m: Match | null = null;
  const flags = re.flags.includes("g") ? re.flags : re.flags + "g";
  for (const hit of text.matchAll(new RegExp(re.source, flags))) m = hit as unknown as Match;
  return m;
};

function pythonFindings(output: string): Finding[] {
  const out: Finding[] = [];
  const where = LAST(/File "[^"]*", line (\d+)/, output);
  const line = where ? Number(where[1]) : undefined;
  const err = LAST(/^(\w*(?:Error|Exception)): (.*)$/m, output);
  if (!err) return out;
  const [, type = "", message = ""] = err;
  switch (type) {
    case "SyntaxError":
      out.push({
        line,
        title: "Syntax error",
        detail:
          "Python could not read this code. Check the line for a missing colon, bracket, quote, or a misplaced keyword, and the line just before it.",
      });
      break;
    case "IndentationError":
      out.push({
        line,
        title: "Indentation is wrong",
        detail:
          "Lines inside a block (after if, for, def, and similar) must be indented the same amount. Check spaces and tabs.",
      });
      break;
    case "NameError": {
      const name = firstMatch(message, /name '([^']+)'/)?.[1];
      out.push({
        line,
        title: "Name not defined",
        detail: `${name ? `'${name}' is` : "A name is"} used before it is assigned, or the spelling does not match. Check the spelling and that it is set earlier in the program.`,
      });
      break;
    }
    case "TypeError":
      out.push({
        line,
        title: "Wrong type",
        detail: `An operation received a value of a type it cannot use (${message}). Convert with int(), float(), or str() where needed.`,
      });
      break;
    case "ValueError":
      if (/invalid literal for int|could not convert/.test(message)) {
        out.push({
          line,
          title: "Input is not a number",
          detail:
            "int() or float() received text that is not a number, often because the input was empty or contained letters.",
        });
      } else out.push({ line, title: "Bad value", detail: message });
      break;
    case "ZeroDivisionError":
      out.push({
        line,
        title: "Division by zero",
        detail: "The divisor was 0 at this point. Check the value before dividing.",
      });
      break;
    case "ModuleNotFoundError": {
      const mod = firstMatch(message, /No module named '([^'.]+)/)?.[1] ?? "";
      if (mod === "tkinter")
        out.push({
          line,
          title: "tkinter is not available here",
          detail:
            "Desktop GUI libraries cannot run in the browser. Build the GUI in the Web preview with HTML, CSS and JavaScript.",
        });
      else if (mod === "psutil")
        out.push({
          line,
          title: "psutil is not available here",
          detail: "psutil needs direct operating-system access, which the browser does not have.",
        });
      else
        out.push({
          line,
          title: "Module not found",
          detail: `Python cannot find '${mod}'. Check the spelling, or that the file it comes from is in the same folder.`,
        });
      break;
    }
    case "EOFError":
      out.push({
        line,
        title: "No more input",
        detail:
          "input() was called but no input was provided. Type the input in the input panel before running.",
      });
      break;
    case "IndexError":
      out.push({
        line,
        title: "Index out of range",
        detail:
          "The program used a position that does not exist in the list or string. Check the index and the length.",
      });
      break;
    case "KeyError":
      out.push({
        line,
        title: "Key not found",
        detail: `The dictionary has no key ${message}. Check the key's spelling, or use .get() with a default.`,
      });
      break;
    default:
      out.push({ line, title: type, detail: message });
  }
  return out;
}

function cFindings(output: string): Finding[] {
  const out: Finding[] = [];
  const err = LAST(/(?:^|\n)[^\n]*?:(\d+):\d+: (?:fatal )?error: ([^\n]+)/, output);
  if (err) {
    const message = err[2];
    out.push({
      line: Number(err[1]),
      title: "Compile error",
      detail: `${message}. Fix this first: the errors below it are often caused by it.`,
    });
  }
  const undef = firstMatch(output, /undefined reference to [`'"]([^'"`]+)/);
  if (undef) {
    out.push({
      title: "Function or variable not defined",
      detail: `'${undef[1]}' is used but never defined or linked. Check its spelling and that its file is included.`,
    });
  }
  return out;
}

function javaFindings(output: string): Finding[] {
  const out: Finding[] = [];
  const err = LAST(/\.java:(\d+): error: ([^\n]+)/, output);
  if (err)
    out.push({
      line: Number(err[1]),
      title: "Compile error",
      detail: `${err[2]}. Fix this first, because later errors often follow from it.`,
    });
  const ex = LAST(/Exception in thread "main" ([\w.]+)(?::\s*([^\n]*))?/, output);
  if (ex) {
    const name = ex[1] ?? "";
    if (/NoSuchElementException/.test(name))
      out.push({
        title: "Scanner ran out of input",
        detail:
          "The program read more values than were typed. Check the input panel has every value the program asks for.",
      });
    else if (/ArithmeticException/.test(name))
      out.push({
        title: "Division by zero",
        detail: "The divisor was 0. Check the value before dividing.",
      });
    else if (/ArrayIndexOutOfBounds/.test(name))
      out.push({
        title: "Array index out of range",
        detail: `${ex[2] ?? "An index is outside the array"}. Arrays start at 0 and end at length - 1.`,
      });
    else out.push({ title: "Runtime exception", detail: `${name}${ex[2] ? `: ${ex[2]}` : ""}` });
  }
  return out;
}

function bashFindings(output: string): Finding[] {
  const out: Finding[] = [];
  if (/\$'\\r'/.test(output)) {
    out.push({
      title: "Windows line endings",
      detail:
        "The script has Windows (CRLF) line endings. LabBench now converts them before running, so run it again; if it still fails, save the file with LF endings.",
    });
  }
  const syntax = LAST(/line (\d+): syntax error near unexpected token `([^']*)'/, output);
  if (syntax) {
    out.push({
      line: Number(syntax[1]),
      title: "Syntax error",
      detail: `Bash does not expect \`${syntax[2] ?? ""}\` here. Check the line for a missing quote, bracket, or a stray character.`,
    });
  }
  // Bash prints "bash: line 2: name: command not found" (the line part is optional).
  const missing = LAST(
    /(?:^|\n)(?:[^\n]*?: )?(?:line (\d+): )?([\w./-]+): command not found/,
    output,
  );
  if (missing) {
    out.push({
      line: missing[1] ? Number(missing[1]) : undefined,
      title: "Command not found",
      detail: `'${missing[2] ?? ""}' is not a command or program here. Check the spelling, or that the program is installed.`,
    });
  }
  if (/No such file or directory/.test(output)) {
    out.push({
      title: "File not found",
      detail:
        "A file the script uses does not exist at that path. Check the name and the folder it is in.",
    });
  }
  return out;
}

function nodeFindings(output: string): Finding[] {
  const out: Finding[] = [];
  const line = LAST(/\((?:[^()\s]*?):(\d+):\d+\)/, output);
  const missing = firstMatch(output, /Cannot find module '([^']+)'/);
  if (missing)
    out.push({
      title: "Module not found",
      detail: `'${missing[1]}' cannot be loaded. Relative files need ./ or ../ and must be in this project; npm packages are not available here.`,
    });
  const err = LAST(/^(\w*Error): (.*)$/m, output);
  if (err && !missing)
    out.push({
      line: line ? Number(line[1]) : undefined,
      title: err[1] ?? "Error",
      detail: err[2] ?? "",
    });
  return out;
}

function sqlFindings(output: string): Finding[] {
  const out: Finding[] = [];
  const table = firstMatch(output, /no such table: (\w+)/);
  if (table)
    out.push({
      title: "Table does not exist",
      detail: `'${table[1]}' is not created in this script. Check its CREATE TABLE statement and its spelling.`,
    });
  const column = firstMatch(output, /no such column: ([\w.]+)/);
  if (column)
    out.push({
      title: "Column does not exist",
      detail: `'${column[1]}' is not a column of the table in this query. Check the spelling against the CREATE TABLE statement.`,
    });
  const near = firstMatch(output, /near "([^"]*)": syntax error/);
  if (near)
    out.push({
      title: "SQL syntax error",
      detail: `SQL does not understand near "${near[1]}". Check the keyword before it and any missing commas or parentheses.`,
    });
  return out;
}

export function diagnose(input: DiagnoseInput): Finding[] {
  const { language, code, output, exitCode, stdin } = input;
  let findings: Finding[] = [];
  const lang = language.toLowerCase();
  if (lang.includes("python")) findings = pythonFindings(output);
  else if (lang === "c" || lang.includes("c++") || lang === "cpp" || lang.includes("c#"))
    findings = cFindings(output);
  else if (lang.includes("java") && !lang.includes("javascript")) findings = javaFindings(output);
  else if (lang.includes("bash") || lang === "sh") findings = bashFindings(output);
  else if (lang.includes("node") || lang.includes("javascript") || lang.includes("typescript"))
    findings = nodeFindings(output);
  else if (lang.includes("sql")) findings = sqlFindings(output);

  const failed = exitCode !== null && exitCode !== 0;
  // A program that reads input but got none is a common cause of failure. Say so plainly.
  if (
    failed &&
    stdin !== undefined &&
    stdin.trim() === "" &&
    /\b(read|input|scanf|cin|Scanner|readLine)\b/.test(code)
  ) {
    findings.push({
      title: "No input was given",
      detail:
        "This program asks for input, but the input panel was empty. Type the values it needs, then run it again.",
    });
  }
  if (failed && findings.length === 0) {
    findings.push({
      title: "The program stopped with an error",
      detail: `It ended with exit code ${exitCode} and no error message that LabBench recognises. Read the last lines of the output, then the lines just before where it stopped.`,
    });
  }
  return findings;
}

/** Plain-text summary used in prompts and the fallback reply. */
export function summarize(findings: Finding[]): string {
  return findings
    .map((f) => `- ${f.line ? `Line ${f.line}: ` : ""}${f.title}. ${f.detail}`)
    .join("\n");
}
