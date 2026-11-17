import { isBinaryFile } from "./file-content";

/**
 * The text files of one workspace root (for example "python"), keyed by their path
 * relative to that root ("utils/helpers.py"). Binary blobs and empty-folder markers
 * are skipped, and unsafe paths are dropped so nothing can be written outside the project.
 */
export function projectFilesFor(
  root: string,
  files: Record<string, string>,
): Record<string, string> {
  const prefix = `${root}/`;
  const project: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    if (!path.startsWith(prefix)) continue;
    const rel = path.slice(prefix.length);
    const parts = rel.split("/");
    if (!rel || parts.some((p) => p === "" || p === "." || p === "..")) continue;
    if (parts[parts.length - 1] === ".keep" || isBinaryFile(content)) continue;
    project[rel] = content;
  }
  return project;
}

/** Path of `path` relative to the workspace root it belongs to. */
export function relativeTo(root: string, path: string): string {
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}
