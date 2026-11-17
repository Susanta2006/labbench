import { connectivityLabel } from "./connectivity";
// A small Linux-like shell over the virtual workspace, for practising commands.
import type { Files } from "./workspace";

export interface ShellResult {
  out: string;
  files?: Files;
  cwd?: string;
  clear?: boolean;
  action?: { type: "run" | "pip" | "piplist"; arg: string[] };
}

const C = {
  dir: "\x1b[1;34m",
  exe: "\x1b[1;32m",
  err: "\x1b[31m",
  dim: "\x1b[90m",
  r: "\x1b[0m",
  b: "\x1b[1m",
};

export function norm(cwd: string, p: string): string {
  const parts = (
    p.startsWith("/") || p.startsWith("~") ? p.replace(/^~\/?/, "") : `${cwd}/${p}`
  ).split("/");
  const out: string[] = [];
  for (const s of parts) {
    if (!s || s === ".") continue;
    if (s === "..") out.pop();
    else out.push(s);
  }
  return out.join("/");
}

function dirs(files: Files): Set<string> {
  const d = new Set<string>([""]);
  for (const p of Object.keys(files)) {
    const s = p.split("/");
    for (let i = 1; i < s.length; i++) d.add(s.slice(0, i).join("/"));
  }
  return d;
}

function children(files: Files, dir: string) {
  const pre = dir ? dir + "/" : "";
  const set = new Map<string, boolean>();
  for (const p of Object.keys(files)) {
    if (!p.startsWith(pre)) continue;
    const rest = p.slice(pre.length).split("/");
    if (rest.length > 1) set.set(rest[0]!, true);
    else if (rest[0] !== ".keep") set.set(rest[0]!, false);
  }
  return [...set.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** Lines of a file's text, without the phantom empty line after a trailing newline. */
function linesOf(c: string): string[] {
  if (c === "") return [];
  return (c.endsWith("\n") ? c.slice(0, -1) : c).split("\n");
}

/** Expands a tr-style set such as "a-z0-9" into its characters. */
function expandSet(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    if (i + 2 < s.length && s[i + 1] === "-") {
      for (let c = s.charCodeAt(i); c <= s.charCodeAt(i + 2); c++) out.push(String.fromCharCode(c));
      i += 2;
    } else out.push(s[i]!);
  }
  return out;
}

/** Number of lines for head/tail: "-n N" or "-N", defaulting to 10. */
function countArg(args: string[]): number {
  const i = args.indexOf("-n");
  if (i >= 0 && /^\d+$/.test(args[i + 1] ?? "")) return Number(args[i + 1]);
  const m = args.find((a) => /^-\d+$/.test(a));
  return m ? Number(m.slice(1)) : 10;
}

/** Simple glob for find -name: * and ? wildcards. */
function globToRegex(glob: string): RegExp {
  const esc = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${esc}$`);
}

const BUILTINS = [
  "netstatus",
  "ls",
  "cd",
  "pwd",
  "tree",
  "mkdir",
  "rmdir",
  "touch",
  "cat",
  "head",
  "tail",
  "wc",
  "grep",
  "echo",
  "cp",
  "mv",
  "rm",
  "sort",
  "uniq",
  "cut",
  "tr",
  "diff",
  "find",
  "basename",
  "dirname",
  "which",
  "clear",
  "history",
  "whoami",
  "hostname",
  "date",
  "uname",
  "help",
  "pip",
  "run",
  "python",
  "node",
];

export const HELP = `${C.b}LabBench shell — practice Linux commands${C.r}
  ls [-l] [dir]   cd <dir>   pwd   tree   mkdir <dir>   rmdir <dir>
  touch <file>    cat <file>  head/tail <file>   wc <file>   grep <text> <file>
  echo text [> file | >> file]   cp <a> <b>   mv <a> <b>   rm [-r] <path>
  sort [-rnu] file   uniq file   cut -d<delim> -f<list> file   tr <set1> <set2> file
  diff a b   find [dir] [-name <glob>] [-type f|d]   basename p [suffix]   dirname p
  which <cmd>   head/tail [-n N] file
  netstatus   show whether you are online (browser, LabBench server, internet)
  clear   history   whoami   hostname   date   uname [-a]   help
  ${C.b}Run code:${C.r} run [file] · python file.py · node file.js · gcc/g++ file · java File.java
  ${C.b}Python packages:${C.r} pip install numpy pandas · pip list
  ${C.dim}Not supported here: pipes (|), tee, editors, and most flags beyond those listed.${C.r}
  ${C.dim}Tip: for a real Linux shell on a server, add the "Bash" language (+ button).${C.r}
`;

export function runShell(input: string, files: Files, cwd: string, history: string[]): ShellResult {
  if (input.replace(/"[^"]*"|'[^']*'/g, "").includes("|")) {
    return {
      out: `${C.err}pipes (|) are not supported in this practice shell; run one command at a time${C.r}\n`,
    };
  }
  const redirect = input.match(/^(.*?)\s*(>>?)\s*(\S+)\s*$/);
  let line = input;
  let target: { path: string; append: boolean } | null = null;
  if (redirect && /^echo|^cat|^ls|^pwd|^date|^whoami/.test(input.trim())) {
    line = redirect[1]!;
    target = { path: norm(cwd, redirect[3]!), append: redirect[2] === ">>" };
  }
  const args = (line.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((a) => a.replace(/^["']|["']$/g, ""));
  const cmd = args.shift() ?? "";
  const D = dirs(files);
  const res = (out: string, extra: Partial<ShellResult> = {}): ShellResult => {
    if (target) {
      const prev = target.append ? (files[target.path] ?? "") : "";
      return {
        out: "",
        files: { ...files, [target.path]: prev + out.replace(/\x1b\[[0-9;]*m/g, "") },
        ...extra,
      };
    }
    return { out, ...extra };
  };
  const err = (m: string) => ({ out: `${C.err}${m}${C.r}\n` });
  const flags = args.filter((a) => a.startsWith("-")).join("");
  const pos = args.filter((a) => !a.startsWith("-"));

  switch (cmd) {
    case "":
      return { out: "" };
    case "help":
    case "man":
      return { out: HELP };
    case "clear":
    case "cls":
      return { out: "", clear: true };
    case "pwd":
      return res(`/home/student${cwd ? "/" + cwd : ""}\n`);
    case "whoami":
      return res("student\n");
    case "hostname":
      return res("labbench\n");
    case "date":
      return res(new Date().toString() + "\n");
    case "uname":
      return res(flags.includes("a") ? "LabBench 1.0 browser-vfs x86_64 GNU/Linux\n" : "Linux\n");
    case "history":
      return { out: history.map((h, i) => `${String(i + 1).padStart(5)}  ${h}`).join("\n") + "\n" };
    case "echo":
      return res(pos.join(" ") + "\n");
    case "ls":
    case "dir": {
      const d = norm(cwd, pos[0] ?? ".");
      if (files[d] !== undefined) return res(d.split("/").pop() + "\n");
      if (!D.has(d)) return err(`ls: cannot access '${pos[0]}': No such file or directory`);
      const items = children(files, d);
      if (flags.includes("l"))
        return res(
          items
            .map(([n, isDir]) =>
              isDir
                ? `drwxr-xr-x  student  student  4096  ${C.dir}${n}${C.r}`
                : `-rw-r--r--  student  student  ${String((files[d ? `${d}/${n}` : n] ?? "").length).padStart(4)}  ${n}`,
            )
            .join("\n") + "\n",
        );
      return res(
        items.map(([n, isDir]) => (isDir ? `${C.dir}${n}${C.r}` : n)).join("  ") +
          (items.length ? "\n" : ""),
      );
    }
    case "tree": {
      const d = norm(cwd, pos[0] ?? ".");
      const lines: string[] = [d ? d.split("/").pop()! : "~"];
      const walk = (dir: string, pre: string) =>
        children(files, dir).forEach(([n, isDir], i, a) => {
          const last = i === a.length - 1;
          lines.push(`${pre}${last ? "└── " : "├── "}${isDir ? C.dir + n + C.r : n}`);
          if (isDir) walk(dir ? `${dir}/${n}` : n, pre + (last ? "    " : "│   "));
        });
      walk(d, "");
      return { out: lines.join("\n") + "\n" };
    }
    case "cd": {
      const d = norm(cwd, pos[0] ?? "~");
      if (!D.has(d)) return err(`cd: ${pos[0]}: No such file or directory`);
      return { out: "", cwd: d };
    }
    case "mkdir": {
      if (!pos.length) return err("mkdir: missing operand");
      const f = { ...files };
      for (const p of pos) {
        const d = norm(cwd, p);
        if (D.has(d)) return err(`mkdir: cannot create directory '${p}': File exists`);
        f[`${d}/.keep`] = "";
      }
      return { out: "", files: f };
    }
    case "touch": {
      const f = { ...files };
      for (const p of pos) {
        const d = norm(cwd, p);
        if (f[d] === undefined) f[d] = "";
      }
      return { out: "", files: f };
    }
    case "cat":
    case "head":
    case "tail":
    case "wc": {
      if (!pos.length) return err(`${cmd}: missing file operand`);
      const p = norm(cwd, pos[pos.length - 1]!);
      const c = files[p];
      if (c === undefined) return err(`${cmd}: ${pos[pos.length - 1]}: No such file or directory`);
      const ls = c.split("\n");
      if (cmd === "cat") return res(c.endsWith("\n") || !c ? c : c + "\n");
      if (cmd === "head")
        return res(
          linesOf(c)
            .slice(0, countArg(args))
            .map((l) => l + "\n")
            .join(""),
        );
      if (cmd === "tail")
        return res(
          linesOf(c)
            .slice(-countArg(args))
            .map((l) => l + "\n")
            .join(""),
        );
      return res(
        `  ${ls.length - (c.endsWith("\n") ? 1 : 0)}  ${c.split(/\s+/).filter(Boolean).length}  ${c.length} ${pos[pos.length - 1]}\n`,
      );
    }
    case "grep": {
      if (pos.length < 2) return err("usage: grep <pattern> <file>");
      const c = files[norm(cwd, pos[1]!)];
      if (c === undefined) return err(`grep: ${pos[1]}: No such file or directory`);
      const ci = flags.includes("i");
      const m = c
        .split("\n")
        .filter((l) =>
          ci ? l.toLowerCase().includes(pos[0]!.toLowerCase()) : l.includes(pos[0]!),
        );
      return res(
        m.map((l, i) => (flags.includes("n") ? `${C.exe}${i + 1}${C.r}:` : "") + l).join("\n") +
          (m.length ? "\n" : ""),
      );
    }
    case "rm":
    case "rmdir": {
      if (!pos.length) return err(`${cmd}: missing operand`);
      const f = { ...files };
      for (const p of pos) {
        const d = norm(cwd, p);
        if (f[d] !== undefined && cmd === "rm") {
          delete f[d];
          continue;
        }
        if (D.has(d) && d) {
          const kids = Object.keys(f).filter((k) => k.startsWith(d + "/"));
          if (cmd === "rm" && !flags.includes("r"))
            return err(`rm: cannot remove '${p}': Is a directory`);
          if (cmd === "rmdir" && kids.some((k) => !k.endsWith("/.keep")))
            return err(`rmdir: failed to remove '${p}': Directory not empty`);
          kids.forEach((k) => delete f[k]);
          continue;
        }
        return err(`${cmd}: cannot remove '${p}': No such file or directory`);
      }
      return { out: "", files: f };
    }
    case "cp":
    case "mv": {
      if (pos.length < 2) return err(`${cmd}: missing file operand`);
      const a = norm(cwd, pos[0]!);
      let b = norm(cwd, pos[1]!);
      const f = { ...files };
      if (f[a] === undefined) {
        if (!D.has(a)) return err(`${cmd}: cannot stat '${pos[0]}': No such file or directory`);
        for (const k of Object.keys(f))
          if (k.startsWith(a + "/")) {
            f[b + k.slice(a.length)] = f[k]!;
            if (cmd === "mv") delete f[k];
          }
        return { out: "", files: f };
      }
      if (D.has(b)) b = `${b}/${a.split("/").pop()}`;
      f[b] = f[a]!;
      if (cmd === "mv") delete f[a];
      return { out: "", files: f };
    }
    case "pip":
    case "pip3": {
      if (pos[0] === "install" && pos.length > 1)
        return { out: "", action: { type: "pip", arg: pos.slice(1) } };
      if (pos[0] === "list" || pos[0] === "freeze")
        return { out: "", action: { type: "piplist", arg: [] } };
      return { out: "Usage: pip install <package> ... | pip list\n" };
    }
    case "run":
    case "python":
    case "python3":
    case "node":
    case "gcc":
    case "g++":
    case "cc":
    case "java":
    case "javac":
    case "php":
    case "go":
    case "dotnet":
    case "bash":
    case "sh": {
      const file = cmd === "go" ? pos[1] : pos[0];
      if (!file && cmd !== "run")
        return err(
          `${cmd}: please give a file, e.g. ${cmd} main${cmd.startsWith("py") ? ".py" : ""}`,
        );
      if (file) {
        const p = norm(cwd, file);
        if (files[p] === undefined)
          return err(`${cmd}: can't open file '${file}': No such file or directory`);
        return { out: "", action: { type: "run", arg: [p] } };
      }
      return { out: "", action: { type: "run", arg: [] } };
    }
    case "netstatus":
      return { out: connectivityLabel() + "\n" };
    case "sort": {
      if (!pos.length) return err("sort: missing file operand");
      const name = pos[pos.length - 1]!;
      const c = files[norm(cwd, name)];
      if (c === undefined) return err(`sort: ${name}: No such file or directory`);
      const numeric = flags.includes("n");
      let lines = [...linesOf(c)].sort((a, b) => {
        if (numeric)
          return (parseFloat(a) || 0) - (parseFloat(b) || 0) || (a < b ? -1 : a > b ? 1 : 0);
        return a < b ? -1 : a > b ? 1 : 0;
      });
      if (flags.includes("r")) lines.reverse();
      if (flags.includes("u")) lines = lines.filter((l, i) => i === 0 || l !== lines[i - 1]);
      return res(lines.map((l) => l + "\n").join(""));
    }
    case "uniq": {
      if (!pos.length) return err("uniq: missing file operand");
      const name = pos[pos.length - 1]!;
      const c = files[norm(cwd, name)];
      if (c === undefined) return err(`uniq: ${name}: No such file or directory`);
      const lines = linesOf(c).filter((l, i, a) => i === 0 || l !== a[i - 1]);
      return res(lines.map((l) => l + "\n").join(""));
    }
    case "cut": {
      const dIdx = args.findIndex((a) => a === "-d" || a.startsWith("-d"));
      const fIdx = args.findIndex((a) => a === "-f" || a.startsWith("-f"));
      const delim =
        dIdx < 0 ? "\t" : args[dIdx] === "-d" ? (args[dIdx + 1] ?? "\t") : args[dIdx]!.slice(2);
      const spec =
        fIdx < 0 ? "" : args[fIdx] === "-f" ? (args[fIdx + 1] ?? "") : args[fIdx]!.slice(2);
      if (!spec) return err("cut: you must specify a list of fields with -f");
      if (!pos.length) return err("cut: missing file operand");
      const name = pos[pos.length - 1]!;
      const c = files[norm(cwd, name)];
      if (c === undefined) return err(`cut: ${name}: No such file or directory`);
      const wanted: number[] = [];
      for (const part of spec.split(",")) {
        const [a, b] = part.split("-");
        const lo = Number(a),
          hi = b === undefined ? lo : Number(b);
        for (let k = lo; k <= hi; k++) if (k >= 1) wanted.push(k);
      }
      const lines = linesOf(c).map((l) => {
        const parts = l.split(delim);
        return wanted
          .filter((k) => k <= parts.length)
          .map((k) => parts[k - 1])
          .join(delim);
      });
      return res(lines.map((l) => l + "\n").join(""));
    }
    case "tr": {
      if (pos.length < 3)
        return err("usage: tr <set1> <set2> <file>   (tr reads a file here, not a pipe)");
      const from = expandSet(pos[0]!),
        to = expandSet(pos[1]!);
      if (!to.length) return err("tr: set2 must not be empty");
      const c = files[norm(cwd, pos[2]!)];
      if (c === undefined) return err(`tr: ${pos[2]}: No such file or directory`);
      const map = new Map<string, string>();
      from.forEach((ch, i) => map.set(ch, to[Math.min(i, to.length - 1)]!));
      return res([...c].map((ch) => map.get(ch) ?? ch).join(""));
    }
    case "diff": {
      if (pos.length < 2) return err("usage: diff <file1> <file2>");
      const a = files[norm(cwd, pos[0]!)],
        b = files[norm(cwd, pos[1]!)];
      if (a === undefined) return err(`diff: ${pos[0]}: No such file or directory`);
      if (b === undefined) return err(`diff: ${pos[1]}: No such file or directory`);
      const A = linesOf(a),
        B = linesOf(b);
      const n = A.length,
        m = B.length;
      const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
      for (let i = n - 1; i >= 0; i--)
        for (let j = m - 1; j >= 0; j--)
          dp[i]![j] =
            A[i] === B[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
      const changes: string[] = [];
      let i = 0,
        j = 0;
      while (i < n && j < m) {
        if (A[i] === B[j]) {
          i++;
          j++;
        } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) changes.push(`${C.err}< ${A[i++]}${C.r}`);
        else changes.push(`${C.exe}> ${B[j++]}${C.r}`);
      }
      while (i < n) changes.push(`${C.err}< ${A[i++]}${C.r}`);
      while (j < m) changes.push(`${C.exe}> ${B[j++]}${C.r}`);
      if (!changes.length) return { out: "" };
      return { out: `${C.dim}--- ${pos[0]}\n+++ ${pos[1]}${C.r}\n${changes.join("\n")}\n` };
    }
    case "find": {
      const startArg = pos[0] && !pos[0].startsWith("-") ? pos[0] : ".";
      const base = norm(cwd, startArg);
      const isDir = D.has(base);
      if (base && !isDir && files[base] === undefined)
        return err(`find: '${startArg}': No such file or directory`);
      const nameIdx = args.indexOf("-name");
      const globRe = nameIdx >= 0 && args[nameIdx + 1] ? globToRegex(args[nameIdx + 1]!) : null;
      const typeIdx = args.indexOf("-type");
      const typeWanted = typeIdx >= 0 ? args[typeIdx + 1] : undefined;
      const entries = new Map<string, "f" | "d">();
      for (const d of D) if (d) entries.set(d, "d");
      for (const k of Object.keys(files)) if (!k.endsWith("/.keep")) entries.set(k, "f");
      const root = startArg.replace(/\/+$/, "") || ".";
      const display = (p: string) => {
        if (!base) return `./${p}`;
        return p === base ? root : root + p.slice(base.length);
      };
      const hits: string[] = [];
      if (base === "") {
        if ((!globRe || globRe.test(".")) && (!typeWanted || typeWanted === "d")) hits.push(".");
      } else if (
        (!globRe || globRe.test(base.split("/").pop()!)) &&
        (!typeWanted || typeWanted === (isDir ? "d" : "f"))
      ) {
        hits.push(root);
      }
      for (const p of [...entries.keys()].sort()) {
        if (base && !p.startsWith(base + "/")) continue;
        const t = entries.get(p)!;
        const name = p.split("/").pop()!;
        if (globRe && !globRe.test(name)) continue;
        if (typeWanted && typeWanted !== t) continue;
        hits.push(display(p));
      }
      return { out: hits.map((h) => h + "\n").join("") };
    }
    case "basename": {
      if (!pos.length) return err("basename: missing operand");
      let b = pos[0]!.replace(/\/+$/, "").split("/").pop() ?? "";
      if (pos[1] && b.endsWith(pos[1]) && b !== pos[1]) b = b.slice(0, -pos[1].length);
      return { out: b + "\n" };
    }
    case "dirname": {
      if (!pos.length) return err("dirname: missing operand");
      const p = pos[0]!.replace(/\/+$/, "");
      const k = p.lastIndexOf("/");
      return { out: (k < 0 ? "." : k === 0 ? "/" : p.slice(0, k)) + "\n" };
    }
    case "which": {
      if (!pos.length) return err("which: missing argument");
      return {
        out: pos
          .filter((p) => BUILTINS.includes(p))
          .map((p) => `/usr/bin/${p}\n`)
          .join(""),
      };
    }
    default:
      if (cmd.startsWith("./")) return { out: "", action: { type: "run", arg: [norm(cwd, cmd)] } };
      return err(`${cmd}: command not found. Type 'help' for available commands.`);
  }
}
