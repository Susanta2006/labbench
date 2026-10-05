// Formats code in the browser. Prettier for web languages, a simple brace re-indenter for C-like languages.
export async function formatCode(path: string, code: string): Promise<string | null> {
  const ext = path.split(".").pop() ?? "";
  const prettier = await import("prettier/standalone");
  if (["js", "jsx", "ts"].includes(ext)) {
    const [babel, estree, ts] = await Promise.all([
      import("prettier/plugins/babel"), import("prettier/plugins/estree"), import("prettier/plugins/typescript"),
    ]);
    return prettier.format(code, { parser: ext === "ts" ? "typescript" : "babel", plugins: [babel, estree, ts] });
  }
  if (ext === "css") {
    const css = await import("prettier/plugins/postcss");
    return prettier.format(code, { parser: "css", plugins: [css] });
  }
  if (ext === "html") {
    const [html, babel, estree, css] = await Promise.all([
      import("prettier/plugins/html"), import("prettier/plugins/babel"), import("prettier/plugins/estree"), import("prettier/plugins/postcss"),
    ]);
    return prettier.format(code, { parser: "html", plugins: [html, babel, estree, css] });
  }
  if (["c", "cpp", "cc", "h", "hpp", "java", "cs", "php", "go", "rs", "swift", "scala", "d", "zig"].includes(ext)) {
    return reindentBraces(code);
  }
  return null;
}

function reindentBraces(code: string): string {
  let depth = 0;
  const out: string[] = [];
  for (const raw of code.split("\n")) {
    const line = raw.trim();
    if (!line) { out.push(""); continue; }
    const stripped = line.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/.*$/g, "");
    const leadingClose = /^[}\])]/.test(line) ? 1 : 0;
    out.push("    ".repeat(Math.max(0, depth - leadingClose)) + line);
    for (const ch of stripped) { if (ch === "{") depth++; else if (ch === "}") depth = Math.max(0, depth - 1); }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}
