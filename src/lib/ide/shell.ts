// A small Linux-like shell over the virtual workspace, for practising commands.
import type { Files } from "./workspace";

export interface ShellResult { out: string; files?: Files; cwd?: string; clear?: boolean; action?: { type: "run" | "pip" | "piplist"; arg: string[] } }

const C = { dir: "\x1b[1;34m", exe: "\x1b[1;32m", err: "\x1b[31m", dim: "\x1b[90m", r: "\x1b[0m", b: "\x1b[1m" };

export function norm(cwd: string, p: string): string {
  const parts = (p.startsWith("/") || p.startsWith("~") ? p.replace(/^~\/?/, "") : `${cwd}/${p}`).split("/");
  const out: string[] = [];
  for (const s of parts) { if (!s || s === ".") continue; if (s === "..") out.pop(); else out.push(s); }
  return out.join("/");
}

function dirs(files: Files): Set<string> {
  const d = new Set<string>([""]);
  for (const p of Object.keys(files)) { const s = p.split("/"); for (let i = 1; i < s.length; i++) d.add(s.slice(0, i).join("/")); }
  return d;
}

function children(files: Files, dir: string) {
  const pre = dir ? dir + "/" : "";
  const set = new Map<string, boolean>();
  for (const p of Object.keys(files)) {
    if (!p.startsWith(pre)) continue;
    const rest = p.slice(pre.length).split("/");
    if (rest.length > 1) set.set(rest[0]!, true); else if (rest[0] !== ".keep") set.set(rest[0]!, false);
  }
  return [...set.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export const HELP = `${C.b}LabBench shell — practice Linux commands${C.r}
  ls [-l] [dir]   cd <dir>   pwd   tree   mkdir <dir>   rmdir <dir>
  touch <file>    cat <file>  head/tail <file>   wc <file>   grep <text> <file>
  echo text [> file | >> file]   cp <a> <b>   mv <a> <b>   rm [-r] <path>
  clear   history   whoami   hostname   date   uname [-a]   help
  ${C.b}Run code:${C.r} run [file] · python file.py · node file.js · gcc/g++ file · java File.java
  ${C.b}Python packages:${C.r} pip install numpy pandas · pip list
  ${C.dim}Tip: for a real Linux shell on a server, add the "Bash" language (+ button).${C.r}
`;

export function runShell(input: string, files: Files, cwd: string, history: string[]): ShellResult {
  const redirect = input.match(/^(.*?)\s*(>>?)\s*(\S+)\s*$/);
  let line = input;
  let target: { path: string; append: boolean } | null = null;
  if (redirect && /^echo|^cat|^ls|^pwd|^date|^whoami/.test(input.trim())) {
    line = redirect[1]!; target = { path: norm(cwd, redirect[3]!), append: redirect[2] === ">>" };
  }
  const args = (line.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((a) => a.replace(/^["']|["']$/g, ""));
  const cmd = args.shift() ?? "";
  const D = dirs(files);
  const res = (out: string, extra: Partial<ShellResult> = {}): ShellResult => {
    if (target) {
      const prev = target.append ? files[target.path] ?? "" : "";
      return { out: "", files: { ...files, [target.path]: prev + out.replace(/\x1b\[[0-9;]*m/g, "") }, ...extra };
    }
    return { out, ...extra };
  };
  const err = (m: string) => ({ out: `${C.err}${m}${C.r}\n` });
  const flags = args.filter((a) => a.startsWith("-")).join("");
  const pos = args.filter((a) => !a.startsWith("-"));

  switch (cmd) {
    case "": return { out: "" };
    case "help": case "man": return { out: HELP };
    case "clear": case "cls": return { out: "", clear: true };
    case "pwd": return res(`/home/student${cwd ? "/" + cwd : ""}\n`);
    case "whoami": return res("student\n");
    case "hostname": return res("labbench\n");
    case "date": return res(new Date().toString() + "\n");
    case "uname": return res(flags.includes("a") ? "LabBench 1.0 browser-vfs x86_64 GNU/Linux\n" : "Linux\n");
    case "history": return { out: history.map((h, i) => `${String(i + 1).padStart(5)}  ${h}`).join("\n") + "\n" };
    case "echo": return res(pos.join(" ") + "\n");
    case "ls": case "dir": {
      const d = norm(cwd, pos[0] ?? ".");
      if (files[d] !== undefined) return res(d.split("/").pop() + "\n");
      if (!D.has(d)) return err(`ls: cannot access '${pos[0]}': No such file or directory`);
      const items = children(files, d);
      if (flags.includes("l")) return res(items.map(([n, isDir]) => isDir
        ? `drwxr-xr-x  student  student  4096  ${C.dir}${n}${C.r}`
        : `-rw-r--r--  student  student  ${String((files[d ? `${d}/${n}` : n] ?? "").length).padStart(4)}  ${n}`).join("\n") + "\n");
      return res(items.map(([n, isDir]) => (isDir ? `${C.dir}${n}${C.r}` : n)).join("  ") + (items.length ? "\n" : ""));
    }
    case "tree": {
      const d = norm(cwd, pos[0] ?? ".");
      const lines: string[] = [d ? d.split("/").pop()! : "~"];
      const walk = (dir: string, pre: string) => children(files, dir).forEach(([n, isDir], i, a) => {
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
      for (const p of pos) { const d = norm(cwd, p); if (D.has(d)) return err(`mkdir: cannot create directory '${p}': File exists`); f[`${d}/.keep`] = ""; }
      return { out: "", files: f };
    }
    case "touch": {
      const f = { ...files };
      for (const p of pos) { const d = norm(cwd, p); if (f[d] === undefined) f[d] = ""; }
      return { out: "", files: f };
    }
    case "cat": case "head": case "tail": case "wc": {
      if (!pos.length) return err(`${cmd}: missing file operand`);
      const p = norm(cwd, pos[pos.length - 1]!);
      const c = files[p];
      if (c === undefined) return err(`${cmd}: ${pos[pos.length - 1]}: No such file or directory`);
      const ls = c.split("\n");
      if (cmd === "cat") return res(c.endsWith("\n") || !c ? c : c + "\n");
      if (cmd === "head") return res(ls.slice(0, 10).join("\n") + "\n");
      if (cmd === "tail") return res(ls.slice(-10).join("\n") + "\n");
      return res(`  ${ls.length - (c.endsWith("\n") ? 1 : 0)}  ${c.split(/\s+/).filter(Boolean).length}  ${c.length} ${pos[pos.length - 1]}\n`);
    }
    case "grep": {
      if (pos.length < 2) return err("usage: grep <pattern> <file>");
      const c = files[norm(cwd, pos[1]!)];
      if (c === undefined) return err(`grep: ${pos[1]}: No such file or directory`);
      const ci = flags.includes("i");
      const m = c.split("\n").filter((l) => (ci ? l.toLowerCase().includes(pos[0]!.toLowerCase()) : l.includes(pos[0]!)));
      return res(m.map((l, i) => (flags.includes("n") ? `${C.exe}${i + 1}${C.r}:` : "") + l).join("\n") + (m.length ? "\n" : ""));
    }
    case "rm": case "rmdir": {
      if (!pos.length) return err(`${cmd}: missing operand`);
      const f = { ...files };
      for (const p of pos) {
        const d = norm(cwd, p);
        if (f[d] !== undefined && cmd === "rm") { delete f[d]; continue; }
        if (D.has(d) && d) {
          const kids = Object.keys(f).filter((k) => k.startsWith(d + "/"));
          if (cmd === "rm" && !flags.includes("r")) return err(`rm: cannot remove '${p}': Is a directory`);
          if (cmd === "rmdir" && kids.some((k) => !k.endsWith("/.keep"))) return err(`rmdir: failed to remove '${p}': Directory not empty`);
          kids.forEach((k) => delete f[k]);
          continue;
        }
        return err(`${cmd}: cannot remove '${p}': No such file or directory`);
      }
      return { out: "", files: f };
    }
    case "cp": case "mv": {
      if (pos.length < 2) return err(`${cmd}: missing file operand`);
      const a = norm(cwd, pos[0]!); let b = norm(cwd, pos[1]!);
      const f = { ...files };
      if (f[a] === undefined) {
        if (!D.has(a)) return err(`${cmd}: cannot stat '${pos[0]}': No such file or directory`);
        for (const k of Object.keys(f)) if (k.startsWith(a + "/")) { f[b + k.slice(a.length)] = f[k]!; if (cmd === "mv") delete f[k]; }
        return { out: "", files: f };
      }
      if (D.has(b)) b = `${b}/${a.split("/").pop()}`;
      f[b] = f[a]!;
      if (cmd === "mv") delete f[a];
      return { out: "", files: f };
    }
    case "pip": case "pip3": {
      if (pos[0] === "install" && pos.length > 1) return { out: "", action: { type: "pip", arg: pos.slice(1) } };
      if (pos[0] === "list" || pos[0] === "freeze") return { out: "", action: { type: "piplist", arg: [] } };
      return { out: "Usage: pip install <package> ... | pip list\n" };
    }
    case "run": case "python": case "python3": case "node": case "gcc": case "g++": case "cc": case "java": case "javac": case "php": case "go": case "dotnet": case "bash": case "sh": {
      const file = cmd === "go" ? pos[1] : pos[0];
      if (!file && cmd !== "run") return err(`${cmd}: please give a file, e.g. ${cmd} main${cmd.startsWith("py") ? ".py" : ""}`);
      if (file) {
        const p = norm(cwd, file);
        if (files[p] === undefined) return err(`${cmd}: can't open file '${file}': No such file or directory`);
        return { out: "", action: { type: "run", arg: [p] } };
      }
      return { out: "", action: { type: "run", arg: [] } };
    }
    default:
      if (cmd.startsWith("./")) return { out: "", action: { type: "run", arg: [norm(cwd, cmd)] } };
      return err(`${cmd}: command not found. Type 'help' for available commands.`);
  }
}
