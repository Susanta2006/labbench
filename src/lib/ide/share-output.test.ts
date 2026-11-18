import { describe, expect, it, vi } from "vitest";
import { pngFileName, shareOrDownload, type ShareEnvironment } from "./share-output";

const png = new Blob(["png-bytes"], { type: "image/png" });

function env(overrides: Partial<ShareEnvironment> = {}) {
  const e: ShareEnvironment = {
    canShareFiles: () => true,
    share: vi.fn(async () => undefined),
    download: vi.fn(),
    ...overrides,
  };
  return e;
}

describe("pngFileName", () => {
  it("builds a readable, filesystem-safe name from the folder and time", () => {
    expect(pngFileName("python", new Date("2026-11-18T17:30:00Z"))).toBe(
      "python-output-2026-11-18-17-30.png",
    );
    expect(pngFileName("my:bad/folder*", new Date("2026-11-18T17:30:00Z"))).toBe(
      "my-bad-folder-output-2026-11-18-17-30.png",
    );
    expect(pngFileName("", new Date("2026-11-18T17:30:00Z"))).toBe(
      "labbench-output-2026-11-18-17-30.png",
    );
  });
});

describe("shareOrDownload", () => {
  it("opens the share sheet with the PNG when files can be shared", async () => {
    const e = env();
    const outcome = await shareOrDownload(png, "out.png", "LabBench output", e);
    expect(outcome).toBe("shared");
    const data = (e.share as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      files: File[];
      title: string;
    };
    expect(data.files[0]!.name).toBe("out.png");
    expect(data.files[0]!.type).toBe("image/png");
    expect(data.title).toBe("LabBench output");
    expect(e.download).not.toHaveBeenCalled();
  });

  it("downloads instead when the browser cannot share files", async () => {
    const e = env({ canShareFiles: () => false });
    expect(await shareOrDownload(png, "out.png", "t", e)).toBe("downloaded");
    expect(e.share).not.toHaveBeenCalled();
    expect((e.download as ReturnType<typeof vi.fn>).mock.calls[0]![0].name).toBe("out.png");
  });

  it("treats a closed share sheet as cancelled, not as a download", async () => {
    const abort = Object.assign(new Error("cancelled"), { name: "AbortError" });
    const e = env({ share: vi.fn(async () => Promise.reject(abort)) });
    expect(await shareOrDownload(png, "out.png", "t", e)).toBe("cancelled");
    expect(e.download).not.toHaveBeenCalled();
  });

  it("keeps the screenshot by downloading when sharing fails for another reason", async () => {
    const e = env({ share: vi.fn(async () => Promise.reject(new Error("not allowed"))) });
    expect(await shareOrDownload(png, "out.png", "t", e)).toBe("downloaded");
    expect(e.download).toHaveBeenCalledTimes(1);
  });
});
