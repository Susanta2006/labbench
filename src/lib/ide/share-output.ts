// Sharing a screenshot of the output. Where the browser can share files (phones and many
// tablets), the native share sheet opens so the student can send it to any app. Elsewhere the PNG
// is downloaded instead. A cancelled share is not treated as an error.

export interface ShareEnvironment {
  canShareFiles: (files: File[]) => boolean;
  share: (data: { files: File[]; title: string; text?: string }) => Promise<void>;
  download: (file: File) => void;
}

export type ShareOutcome = "shared" | "downloaded" | "cancelled";

/** A file name such as "main-output-2026-11-18-1730.png". */
export function pngFileName(folder: string, now: Date): string {
  const stamp = now.toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const base = folder.replace(/[\\/:*?"<>|]+/g, "-").replace(/^-+|-+$/g, "") || "labbench";
  return `${base}-output-${stamp}.png`;
}

export async function shareOrDownload(
  png: Blob,
  fileName: string,
  title: string,
  env: ShareEnvironment,
): Promise<ShareOutcome> {
  const file = new File([png], fileName, { type: "image/png" });
  if (env.canShareFiles([file])) {
    try {
      await env.share({ files: [file], title });
      return "shared";
    } catch (error) {
      // The student closed the share sheet: nothing to report.
      if ((error as { name?: string })?.name === "AbortError") return "cancelled";
      // Any other failure: keep the screenshot by downloading it instead.
    }
  }
  env.download(file);
  return "downloaded";
}
