// Naming rules for files and folders in the workspace. The workspace is a flat map of paths
// ("python/utils/helpers.py" -> contents), where a folder exists when a file lives under it (folders
// that are empty keep a ".keep" marker). These checks make sure creating or renaming can never
// overwrite a file, put a file and a folder at the same path, or move a folder into itself.

export type EntryKind = "file" | "folder";
export const MAX_NAME_LENGTH = 120;
const FORBIDDEN = /[\\:*?"<>|]/;
const hasControlCharacter = (text: string) => [...text].some((ch) => ch.charCodeAt(0) < 32);

export type PlanResult = { ok: true; path: string } | { ok: false; error: string };

/** Validates one name or a nested relative name such as "utils/helpers.py". */
export function validateName(name: string): string | null {
  if (!name || name.trim() !== name) return "Names cannot be empty or start or end with a space.";
  for (const segment of name.split("/")) {
    if (segment === "" || segment.trim() !== segment)
      return "Names cannot contain empty folder parts.";
    if (segment === "." || segment === "..") return `"${segment}" is not allowed in a name.`;
    if (segment === ".keep") return ".keep is reserved for folders.";
    if (segment.length > MAX_NAME_LENGTH)
      return `Names can be at most ${MAX_NAME_LENGTH} characters.`;
    if (FORBIDDEN.test(segment) || hasControlCharacter(segment))
      return 'Names cannot contain \\ : * ? " < > | or control characters.';
  }
  return null;
}

const isFile = (files: Record<string, string>, p: string) => files[p] !== undefined;
const isFolder = (files: Record<string, string>, p: string) =>
  Object.keys(files).some((k) => k.startsWith(`${p}/`));

/** The file that would block `path` because it is an ancestor of it, if any. */
function blockingAncestor(files: Record<string, string>, path: string): string | null {
  const parts = path.split("/");
  for (let i = 1; i < parts.length; i++) {
    const ancestor = parts.slice(0, i).join("/");
    if (isFile(files, ancestor)) return ancestor;
  }
  return null;
}

/** Checks whether a new file or folder can be created at parent/name. */
export function planCreate(
  files: Record<string, string>,
  parent: string,
  name: string,
  kind: EntryKind,
): PlanResult {
  const problem = validateName(name);
  if (problem) return { ok: false, error: problem };
  const path = parent ? `${parent}/${name}` : name;
  const clash = conflictAt(files, path, kind);
  return clash ? { ok: false, error: clash } : { ok: true, path };
}

/** Checks whether `path` (of the given kind) can be renamed to newName. Folders keep their contents. */
export function planRename(
  files: Record<string, string>,
  path: string,
  kind: EntryKind,
  newName: string,
): PlanResult {
  const problem = validateName(newName);
  if (problem) return { ok: false, error: problem };
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const current = path.slice(path.lastIndexOf("/") + 1);
  if (newName === current) return { ok: false, error: "The name is unchanged." };
  const target = dir ? `${dir}/${newName}` : newName;
  if (kind === "folder" && (target === path || target.startsWith(`${path}/`))) {
    return { ok: false, error: "A folder cannot be moved into itself." };
  }
  // Compare against everything except the entry being renamed, so it can keep its own subtree.
  const others: Record<string, string> = {};
  for (const [key, value] of Object.entries(files)) {
    if (key !== path && !key.startsWith(`${path}/`)) others[key] = value;
  }
  const clash = conflictAt(others, target, kind);
  return clash ? { ok: false, error: clash } : { ok: true, path: target };
}

function conflictAt(files: Record<string, string>, path: string, kind: EntryKind): string | null {
  const ancestor = blockingAncestor(files, path);
  if (ancestor) return `"${ancestor}" is a file, so folders cannot be created inside it.`;
  if (isFile(files, path)) return "A file with that name already exists here.";
  if (kind === "file" && isFolder(files, path))
    return "A folder with that name already exists here.";
  if (kind === "folder" && isFolder(files, path))
    return "A folder with that name already exists here.";
  return null;
}
