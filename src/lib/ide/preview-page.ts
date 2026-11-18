// Which HTML page the live preview shows for a web project folder.
// Rule: the active file if it is an HTML page; otherwise the page last opened in this folder;
// otherwise index.html; otherwise the first HTML page in the folder.

const isHtml = (path: string) => /\.html?$/i.test(path);

/** The relative names (e.g. "index2.html", "pages/about.html") of the HTML pages in a web folder. */
export function htmlPagesIn(files: Record<string, string>, root: string): string[] {
  const prefix = `${root}/`;
  return Object.keys(files)
    .filter((path) => path.startsWith(prefix) && isHtml(path))
    .map((path) => path.slice(prefix.length))
    .sort();
}

export function pickPreviewPage(
  files: Record<string, string>,
  root: string,
  activePath: string | undefined,
  remembered: string | undefined,
): string {
  const exists = (rel: string) => files[`${root}/${rel}`] !== undefined;
  if (activePath && activePath.startsWith(`${root}/`) && isHtml(activePath)) {
    const rel = activePath.slice(root.length + 1);
    if (exists(rel)) return rel;
  }
  if (remembered && exists(remembered)) return remembered;
  if (exists("index.html")) return "index.html";
  return htmlPagesIn(files, root)[0] ?? "index.html";
}
