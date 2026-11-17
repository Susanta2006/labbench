import { describe, expect, it } from "vitest";
// @ts-expect-error plain ES module script, no type declarations
import { buildIdFromEnv, stampSource } from "../../../scripts/stamp-sw.mjs";

describe("stamp-sw", () => {
  it("replaces the build id and is idempotent", () => {
    const src = 'const BUILD_ID = "dev";\nconst x = 1;\n';
    const once = stampSource(src, "abc123");
    expect(once).toContain('const BUILD_ID = "abc123";');
    expect(stampSource(once, "abc123")).toBe(once);
    expect(stampSource(once, "def456")).toContain('const BUILD_ID = "def456";');
  });

  it("refuses to stamp a file without the marker", () => {
    expect(() => stampSource("console.log(1)", "x")).toThrow(/BUILD_ID/);
  });

  it("uses the deployment commit when available, otherwise a local timestamp", () => {
    expect(buildIdFromEnv({ VERCEL_GIT_COMMIT_SHA: "0123456789abcdef" }, 1)).toBe("0123456789ab");
    expect(buildIdFromEnv({}, 42)).toBe("local-42");
  });
});
