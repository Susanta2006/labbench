export type RunKind = "web" | "react" | "python" | "node" | "remote";

export interface Language {
  id: string;
  label: string;
  short: string;
  kind: RunKind;
  compiler?: string; // remote compiler id
  files: Record<string, string>;
  entry: string;
  ext: string[];
}

export const CORE_LANGUAGES: Language[] = [
  {
    id: "web", ext: ["html","css"], label: "HTML / CSS / JS", short: "WEB", kind: "web", entry: "index.html",
    files: {
      "index.html": `<!DOCTYPE html>\n<html>\n<head>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>Hello, Lab!</h1>\n  <button id="btn">Click me</button>\n  <script src="script.js"></script>\n</body>\n</html>\n`,
      "style.css": `body {\n  font-family: system-ui, sans-serif;\n  padding: 2rem;\n}\nh1 { color: #1565c0; }\n`,
      "script.js": `document.getElementById("btn").onclick = () => {\n  alert("It works!");\n};\n`,
    },
  },
  {
    id: "react", ext: ["jsx"], label: "React", short: "JSX", kind: "react", entry: "App.jsx",
    files: {
      "App.jsx": `function App() {\n  const [count, setCount] = React.useState(0);\n  return (\n    <div style={{ fontFamily: "system-ui", padding: 32 }}>\n      <h1>React Counter</h1>\n      <button onClick={() => setCount(count + 1)}>Clicked {count} times</button>\n    </div>\n  );\n}\n\nReactDOM.createRoot(document.getElementById("root")).render(<App />);\n`,
    },
  },
  {
    id: "python", ext: ["py"], label: "Python 3", short: "PY", kind: "python", entry: "main.py",
    files: {
      "main.py": `name = input("Enter your name: ")\nprint(f"Hello, {name}!")\n\nnums = [int(x) for x in input("Enter numbers: ").split()]\nprint("Sum =", sum(nums))\n`,
    },
  },
  {
    id: "node", ext: ["js"], label: "Node.js", short: "JS", kind: "node", entry: "main.js",
    files: { "main.js": `const fib = n => n < 2 ? n : fib(n - 1) + fib(n - 2);\nfor (let i = 0; i < 10; i++) console.log(i, fib(i));\n` },
  },
  {
    id: "c", ext: ["c"], label: "C", short: "C", kind: "remote", compiler: "gcc-13.2.0-c", entry: "main.c",
    files: { "main.c": `#include <stdio.h>\n\nint main() {\n    int a, b;\n    printf("Enter two numbers: ");\n    scanf("%d %d", &a, &b);\n    printf("Sum = %d\\n", a + b);\n    return 0;\n}\n` },
  },
  {
    id: "cpp", ext: ["cpp","cc","h","hpp"], label: "C++", short: "C++", kind: "remote", compiler: "gcc-13.2.0", entry: "main.cpp",
    files: { "main.cpp": `#include <iostream>\nusing namespace std;\n\nint main() {\n    int n;\n    cout << "Enter n: ";\n    cin >> n;\n    for (int i = 1; i <= n; i++) cout << i << " squared = " << i * i << endl;\n    return 0;\n}\n` },
  },
  {
    id: "java", ext: ["java"], label: "Java", short: "JAVA", kind: "remote", compiler: "openjdk-jdk-22+36", entry: "Main.java",
    files: { "Main.java": `import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        System.out.print("Enter your age: ");\n        int age = sc.nextInt();\n        System.out.println("In 10 years you will be " + (age + 10));\n    }\n}\n` },
  },
  {
    id: "csharp", ext: ["cs"], label: "C#", short: "C#", kind: "remote", compiler: "mono-6.12.0.199", entry: "Program.cs",
    files: { "Program.cs": `using System;\n\nclass Program {\n    static void Main() {\n        Console.Write("Enter a word: ");\n        string w = Console.ReadLine();\n        Console.WriteLine("Reversed: " + new string(w.ToCharArray().Reverse()));\n    }\n}\n\nstatic class Ext {\n    public static char[] Reverse(this char[] a) { Array.Reverse(a); return a; }\n}\n` },
  },
  {
    id: "php", ext: ["php"], label: "PHP", short: "PHP", kind: "remote", compiler: "php-8.3.12", entry: "index.php",
    files: { "index.php": `<?php\n$items = ["apple", "banana", "cherry"];\nforeach ($items as $i => $item) {\n    echo ($i + 1) . ". " . ucfirst($item) . "\\n";\n}\n` },
  },
  {
    id: "go", ext: ["go"], label: "Go", short: "GO", kind: "remote", compiler: "go-1.23.2", entry: "main.go",
    files: { "main.go": `package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello from Go!")\n}\n` },
  },
];

const x = (id: string, label: string, short: string, compiler: string, ext: string, file: string, code: string): Language =>
  ({ id, label, short, kind: "remote", compiler, ext: [ext], entry: file, files: { [file]: code } });

export const EXTRA_LANGUAGES: Language[] = [
  x("bash", "Bash (Linux shell)", "SH", "bash", "sh", "script.sh", `#!/bin/bash\n# Real Linux commands run here\necho "Kernel: $(uname -sr)"\nmkdir -p demo && cd demo\ntouch a.txt b.txt\nls -la\nfor i in 1 2 3; do echo "Loop $i"; done\n`),
  x("rust", "Rust", "RS", "rust-1.82.0", "rs", "main.rs", `fn main() {\n    println!("Hello from Rust!");\n}\n`),
  x("ruby", "Ruby", "RB", "ruby-4.0.2", "rb", "main.rb", `puts "Hello from Ruby!"\n3.times { |i| puts i }\n`),
  x("typescript", "TypeScript", "TS", "typescript-5.6.2", "ts", "main.ts", `const greet = (n: string): string => \`Hello, \${n}!\`;\nconsole.log(greet("TypeScript"));\n`),
  x("scala", "Scala", "SC", "scala-3.5.1", "scala", "Main.scala", `@main def hello() = println("Hello from Scala!")\n`),
  x("swift", "Swift", "SW", "swift-6.0.1", "swift", "main.swift", `print("Hello from Swift!")\n`),
  x("sql", "SQL (SQLite)", "SQL", "sqlite-3.46.1", "sql", "query.sql", `CREATE TABLE students(id INTEGER, name TEXT, marks INTEGER);\nINSERT INTO students VALUES (1,'Asha',91),(2,'Ravi',78);\nSELECT * FROM students ORDER BY marks DESC;\n`),
  x("r", "R", "R", "r-4.4.1", "r", "main.r", `x <- c(4, 8, 15, 16, 23, 42)\ncat("Mean:", mean(x), "\\n")\n`),
  x("haskell", "Haskell", "HS", "ghc-9.10.1", "hs", "Main.hs", `main :: IO ()\nmain = putStrLn "Hello from Haskell!"\n`),
  x("lua", "Lua", "LUA", "lua-5.4.7", "lua", "main.lua", `print("Hello from Lua!")\n`),
  x("perl", "Perl", "PL", "perl-5.44.0", "pl", "main.pl", `print "Hello from Perl!\\n";\n`),
  x("pascal", "Pascal", "PAS", "fpc-3.2.2", "pas", "main.pas", `program Hello;\nbegin\n  writeln('Hello from Pascal!');\nend.\n`),
  x("julia", "Julia", "JL", "julia-1.10.5", "jl", "main.jl", `println("Hello from Julia!")\n`),
  x("d", "D", "D", "dmd-2.109.1", "d", "main.d", `import std.stdio;\nvoid main() { writeln("Hello from D!"); }\n`),
  x("elixir", "Elixir", "EX", "elixir-1.17.3", "exs", "main.exs", `IO.puts "Hello from Elixir!"\n`),
  x("zig", "Zig", "ZIG", "zig-head", "zig", "main.zig", `const std = @import("std");\npub fn main() void { std.debug.print("Hello from Zig!\\n", .{}); }\n`),
];

export const ALL_LANGUAGES = [...CORE_LANGUAGES, ...EXTRA_LANGUAGES];
export const LANGUAGES = CORE_LANGUAGES;
export const langById = (id: string) => ALL_LANGUAGES.find((l) => l.id === id);

export function langForPath(path: string): Language | undefined {
  const top = path.split("/")[0] ?? "";
  const ext = path.split(".").pop() ?? "";
  if (ext === "js" && (top === "web" || top === "react")) return langById("web");
  if ((ext === "css" || ext === "html") && top === "react") return langById("react");
  return ALL_LANGUAGES.find((l) => l.ext.includes(ext)) ?? langById(top);
}

export function monacoLanguage(path: string): string {
  const ext = path.split(".").pop() ?? "";
  return ({
    html: "html", css: "css", js: "javascript", jsx: "javascript", py: "python", c: "c",
    cpp: "cpp", cc: "cpp", h: "cpp", hpp: "cpp", java: "java", cs: "csharp", php: "php", go: "go", ts: "typescript", rs: "rust", rb: "ruby", sh: "shell", sql: "sql", r: "r", swift: "swift", lua: "lua", pl: "perl", scala: "scala", pas: "pascal", jl: "julia", exs: "elixir", json: "json", md: "markdown", txt: "plaintext",
  } as Record<string, string>)[ext] ?? "plaintext";
}

export function readsInput(code: string, languageId?: string) {
  const commonInput = /scanf|getchar|gets\s*\(|cin\s*>>|getline|Scanner|readLine|ReadLine|Console\.Read|fgets|STDIN|fmt\.Scan|bufio/;
  const languageInput: Record<string, RegExp> = {
    bash: /(^|[;&|]\s*)read\s/,
    ruby: /^\s*gets\b/m,
    lua: /io\.read\s*\(/,
    rust: /read_line\s*\(/,
    haskell: /getLine\b/,
    r: /readline\s*\(/,
    julia: /readline\s*\(/,
    pascal: /readln\s*(\(|;)/i,
    d: /readln\s*\(/,
    elixir: /IO\.gets\s*\(/,
    typescript: /process\.stdin/,
  };
  return commonInput.test(code) || !!languageId && (languageInput[languageId]?.test(code) ?? false);
}
