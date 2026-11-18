import { describe, expect, it } from "vitest";
import { htmlPagesIn, pickPreviewPage } from "./preview-page";

const FILES = {
  "web/index.html": "<h1>home</h1>",
  "web/index2.html": "<h1>second</h1>",
  "web/style.css": "h1{}",
  "web/pages/about.html": "<p>about</p>",
  "python/main.py": "print(1)",
};

describe("pickPreviewPage", () => {
  it("shows the active HTML file, so index2.html is shown when it is open", () => {
    expect(pickPreviewPage(FILES, "web", "web/index2.html", "index.html")).toBe("index2.html");
  });

  it("shows nested HTML pages as well", () => {
    expect(pickPreviewPage(FILES, "web", "web/pages/about.html", undefined)).toBe(
      "pages/about.html",
    );
  });

  it("keeps the page last opened when a CSS or JS file is active", () => {
    expect(pickPreviewPage(FILES, "web", "web/style.css", "index2.html")).toBe("index2.html");
  });

  it("falls back to index.html when nothing else is known", () => {
    expect(pickPreviewPage(FILES, "web", "web/style.css", undefined)).toBe("index.html");
  });

  it("ignores a remembered page that was deleted", () => {
    const { "web/index2.html": _gone, ...rest } = FILES;
    expect(pickPreviewPage(rest, "web", "web/style.css", "index2.html")).toBe("index.html");
  });

  it("uses the first HTML page when there is no index.html", () => {
    const { "web/index.html": _gone, ...rest } = FILES;
    expect(pickPreviewPage(rest, "web", undefined, undefined)).toBe("index2.html");
  });

  it("ignores an active file from a different folder", () => {
    expect(pickPreviewPage(FILES, "web", "python/main.py", undefined)).toBe("index.html");
  });
});

describe("htmlPagesIn", () => {
  it("lists only HTML pages of the folder, sorted", () => {
    expect(htmlPagesIn(FILES, "web")).toEqual(["index.html", "index2.html", "pages/about.html"]);
  });
});
