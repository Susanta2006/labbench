const BINARY_PREFIX = "__LABBENCH_BINARY_V1__|";
const TEMP_UPLOAD_PREFIX = "__LABBENCH_TEMP_UPLOAD_V1__|";

export function encodeTemporaryUpload(id: string, mimeType: string): string {
  return `${TEMP_UPLOAD_PREFIX}${id}|${encodeURIComponent(mimeType || "application/octet-stream")}`;
}

export function decodeTemporaryUpload(content: string): { id: string; mimeType: string } | null {
  if (!content.startsWith(TEMP_UPLOAD_PREFIX)) return null;
  const [id, mimeType] = content.slice(TEMP_UPLOAD_PREFIX.length).split("|");
  if (!id || !mimeType) return null;
  return { id, mimeType: decodeURIComponent(mimeType) || "application/octet-stream" };
}

export function encodeBinaryFile(mimeType: string, base64: string): string {
  return `${BINARY_PREFIX}${encodeURIComponent(mimeType || "application/octet-stream")}|${base64}`;
}

export function decodeBinaryFile(content: string): { mimeType: string; base64: string } | null {
  if (!content.startsWith(BINARY_PREFIX)) return null;
  const splitAt = content.indexOf("|", BINARY_PREFIX.length);
  if (splitAt < 0) return null;
  return {
    mimeType: decodeURIComponent(content.slice(BINARY_PREFIX.length, splitAt)) || "application/octet-stream",
    base64: content.slice(splitAt + 1),
  };
}

export function binaryFileToBlob(content: string): Blob | null {
  const binary = decodeBinaryFile(content);
  if (!binary) return null;
  const raw = atob(binary.base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type: binary.mimeType });
}

export function isBinaryFile(content: string): boolean {
  return content.startsWith(BINARY_PREFIX) || content.startsWith(TEMP_UPLOAD_PREFIX);
}

export async function fileToWorkspaceContent(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!text.includes("\0")) return text;
  } catch { /* store non-text files as base64 */ }
  const data = new Uint8Array(bytes);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    binary += String.fromCharCode(...data.subarray(offset, offset + chunkSize));
  }
  return encodeBinaryFile(file.type || "application/octet-stream", btoa(binary));
}
