import { describe, it, expect } from "vitest";
import { homedir } from "node:os";
import { normalizePath, looksLikeAbsolutePath } from "../src/paths.js";

describe("normalizePath", () => {
  it("keeps the drive prefix and converts backslashes", () => {
    expect(normalizePath("C:\\Users\\me\\a.txt", false)).toBe("C:/Users/me/a.txt");
  });

  it("collapses . and .. and duplicate slashes", () => {
    expect(normalizePath("/a/b/../c/./d//e", false)).toBe("/a/c/d/e");
    expect(normalizePath("C:/s/allowed/../private/k.txt", false)).toBe("C:/s/private/k.txt");
  });

  it("never climbs above the drive root or /", () => {
    expect(normalizePath("C:/a/../../../x", false)).toBe("C:/x");
    expect(normalizePath("/a/../../../etc", false)).toBe("/etc");
  });

  it("expands ~", () => {
    const home = homedir().replace(/\\/g, "/");
    expect(normalizePath("~/x/../y", false)).toBe(normalizePath(`${home}/y`, false));
  });

  it("lowercases only when caseInsensitive", () => {
    expect(normalizePath("C:/Users/ASUS", true)).toBe("c:/users/asus");
    expect(normalizePath("C:/Users/ASUS", false)).toBe("C:/Users/ASUS");
  });

  it("leaves non-path strings untouched (no normalize, no lowercasing)", () => {
    expect(normalizePath("Hello/../World", true)).toBe("Hello/../World");
    expect(normalizePath("a\\b", true)).toBe("a/b");
  });
});

describe("looksLikeAbsolutePath", () => {
  it("recognises posix and drive paths, rejects multiline/long text", () => {
    expect(looksLikeAbsolutePath("/etc/passwd")).toBe(true);
    expect(looksLikeAbsolutePath("C:\\x")).toBe(true);
    expect(looksLikeAbsolutePath("relative/x")).toBe(false);
    expect(looksLikeAbsolutePath("/a\nb")).toBe(false);
  });
});

describe("normalizePath long paths", () => {
  it("collapses .. even in very long paths (no length cap on matching)", () => {
    const long = "C:/s/allowed/" + "a/".repeat(400) + "../".repeat(400) + "../private/k.txt";
    expect(long.length).toBeGreaterThan(500);
    expect(normalizePath(long, true)).toBe("c:/s/private/k.txt");
  });
});
