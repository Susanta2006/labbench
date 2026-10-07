import { supabase } from "@/integrations/supabase/client";

export interface DriveUploadResult {
  ok: boolean;
  folderUrl?: string;
  filesCount?: number;
  error?: string;
}

export interface DriveWorkspaceSyncResult {
  ok: boolean;
  action?: "pushed" | "pulled" | "unchanged";
  files?: Record<string, string>;
  updatedAt?: string;
  folderUrl?: string;
  error?: string;
}

/**
 * Converts a base64 Data URL to a Blob.
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/png";
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: mime });
}

/**
 * Uploads a file (text or binary Blob) to a Google Drive folder using multipart upload.
 */
async function uploadFileToDrive(
  token: string,
  fileName: string,
  content: string | Blob,
  folderId: string,
  mimeType: string
): Promise<{ id: string; name: string }> {
  const metadata = {
    name: fileName,
    parents: [folderId],
  };

  const boundary = "-------314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const blob = typeof content === "string" 
    ? new Blob([content], { type: mimeType }) 
    : content;

  // Build multipart/related request body
  const metadataPart = delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${mimeType}\r\n\r\n`;

  const requestBody = new Blob([metadataPart, blob, closeDelimiter]);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: requestBody,
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to upload ${fileName}: ${err}`);
  }

  return await res.json();
}

/**
 * Locates or creates the LabBench folder in the student's root My Drive.
 */
async function getOrCreateLabBenchFolder(token: string): Promise<{ id: string; webViewLink?: string }> {
  const query = encodeURIComponent("name = 'labbench' and mimeType = 'application/vnd.google-apps.folder' and 'root' in parents and trashed = false");
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink)`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!searchRes.ok) {
    const err = await searchRes.text();
    throw new Error(`Drive folder search failed: ${err}`);
  }

  const { files } = await searchRes.json();
  if (files && files.length > 0) {
    return { id: files[0].id, webViewLink: files[0].webViewLink };
  }

  // Create one dedicated folder at the root of My Drive when needed.
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,webViewLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "labbench",
      mimeType: "application/vnd.google-apps.folder",
      parents: ["root"],
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Failed to create LabBench Drive folder: ${err}`);
  }

  return await createRes.json();
}

async function getWorkspaceSnapshot(token: string, folderId: string) {
  const query = encodeURIComponent(`name = 'workspace.json' and '${folderId}' in parents and trashed = false`);
  const search = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,modifiedTime,webViewLink)`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!search.ok) throw new Error(`Drive workspace search failed: ${await search.text()}`);
  const result = (await search.json()) as {
    files?: Array<{ id: string; modifiedTime?: string; webViewLink?: string }>;
  };
  const item = result.files?.[0];
  if (!item) return null;

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${item.id}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Drive workspace download failed: ${await response.text()}`);
  const snapshot = (await response.json()) as {
    version?: number;
    updatedAt?: string;
    files?: unknown;
  };
  if (
    snapshot.version !== 1 ||
    !snapshot.files ||
    typeof snapshot.files !== "object" ||
    Array.isArray(snapshot.files) ||
    !Object.entries(snapshot.files).every(([path, content]) => path.includes("/") && typeof content === "string")
  ) {
    throw new Error("The LabBench Drive workspace file has an unsupported or invalid format.");
  }
  return {
    files: snapshot.files as Record<string, string>,
    updatedAt: snapshot.updatedAt || item.modifiedTime || "",
    webViewLink: item.webViewLink,
  };
}

async function saveWorkspaceSnapshot(token: string, folderId: string, files: Record<string, string>, updatedAt: string) {
  const existing = await getWorkspaceSnapshotMetadata(token, folderId);
  const payload = JSON.stringify({ version: 1, updatedAt, files });
  if (existing) {
    const response = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: payload,
      },
    );
    if (!response.ok) throw new Error(`Drive workspace upload failed: ${await response.text()}`);
    return;
  }
  await uploadFileToDrive(token, "workspace.json", payload, folderId, "application/json");
}

async function getWorkspaceSnapshotMetadata(token: string, folderId: string) {
  const query = encodeURIComponent(`name = 'workspace.json' and '${folderId}' in parents and trashed = false`);
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error(`Drive workspace search failed: ${await response.text()}`);
  const result = (await response.json()) as { files?: Array<{ id: string }> };
  return result.files?.[0] ?? null;
}

/** Keeps the local workspace and its Drive snapshot aligned using last-write-wins timestamps. */
export async function syncWorkspaceWithGoogleDrive(
  token: string,
  localFiles: Record<string, string>,
  localUpdatedAt: string | null,
): Promise<DriveWorkspaceSyncResult> {
  try {
    const folder = await getOrCreateLabBenchFolder(token);
    const remote = await getWorkspaceSnapshot(token, folder.id);
    const localTime = localUpdatedAt ? Date.parse(localUpdatedAt) : 0;
    const remoteTime = remote?.updatedAt ? Date.parse(remote.updatedAt) : 0;
    const localPayload = JSON.stringify(localFiles);
    const remotePayload = remote ? JSON.stringify(remote.files) : "";
    const folderUrl = folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`;

    if (remote && (remoteTime > localTime || (remoteTime === localTime && localTime === 0))) {
      return { ok: true, action: "pulled", files: remote.files, updatedAt: remote.updatedAt, folderUrl };
    }
    if (remote && remoteTime === localTime && localPayload === remotePayload) {
      return { ok: true, action: "unchanged", updatedAt: remote.updatedAt, folderUrl };
    }

    const updatedAt = new Date(Math.max(Date.now(), localTime + 1, remoteTime + 1)).toISOString();
    await saveWorkspaceSnapshot(token, folder.id, localFiles, updatedAt);
    return { ok: true, action: "pushed", updatedAt, folderUrl };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Google Drive sync failed." };
  }
}

/**
 * Uploads the output snapshot and active folder code files to My Drive/labbench/.
 */
export async function uploadWorkspaceToGoogleDrive({
  files,
  screenshotDataUrl,
  folderName = "labbench",
}: {
  files: Record<string, string>;
  screenshotDataUrl?: string | null;
  folderName?: string;
}): Promise<DriveUploadResult> {
  try {
    // 1. Check for active Supabase session & provider token
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.provider_token;

    if (!session) {
      return { ok: false, error: "Please sign in with Google first." };
    }
    if (!token) {
      return {
        ok: false,
        error: "Google Drive permission was not granted. Please sign out and sign in again, approving Drive access.",
      };
    }

    // 2. Find or create the root "labbench" folder
    const outputFolder = await getOrCreateLabBenchFolder(token);

    // 3. Upload code files belonging to the active folder
    let count = 0;
    const fileEntries = Object.entries(files);

    for (const [path, content] of fileEntries) {
      // Use clean filename without the folder prefix (e.g. 'main.py' instead of 'python/main.py')
      const fileName = path.split("/").pop() || path;
      await uploadFileToDrive(token, fileName, content, outputFolder.id, "text/plain; charset=utf-8");
      count++;
    }

    // 4. Upload screenshot if available
    if (screenshotDataUrl) {
      const blob = dataUrlToBlob(screenshotDataUrl);
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const shotName = `${folderName}-output-${timestamp}.png`;
      await uploadFileToDrive(token, shotName, blob, outputFolder.id, "image/png");
      count++;
    }

    return {
      ok: true,
      folderUrl: outputFolder.webViewLink || `https://drive.google.com/drive/folders/${outputFolder.id}`,
      filesCount: count,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "Failed to upload to Google Drive",
    };
  }
}
