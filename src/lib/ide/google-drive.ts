import { supabase } from "@/integrations/supabase/client";

export interface DriveUploadResult {
  ok: boolean;
  folderUrl?: string;
  filesCount?: number;
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
 * Locates or creates the "output" folder in the student's root My Drive.
 */
async function getOrCreateOutputFolder(token: string): Promise<{ id: string; webViewLink?: string }> {
  // 1. Search if "output" folder already exists in root
  const query = encodeURIComponent("name = 'output' and mimeType = 'application/vnd.google-apps.folder' and 'root' in parents and trashed = false");
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

  // 2. If not found, create "output" folder in root
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,webViewLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "output",
      mimeType: "application/vnd.google-apps.folder",
      parents: ["root"],
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Failed to create output folder: ${err}`);
  }

  return await createRes.json();
}

/**
 * Main function: uploads the output snapshot and active folder code files to My Drive/output/
 */
export async function uploadWorkspaceToGoogleDrive({
  files,
  screenshotDataUrl,
  folderName = "output",
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

    // 2. Find or create the root "output" folder
    const outputFolder = await getOrCreateOutputFolder(token);

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
