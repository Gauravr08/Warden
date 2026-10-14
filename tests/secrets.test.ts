import { describe, it, expect } from "vitest";
import { scanArgs, shannonEntropy } from "../src/scanner/secrets.js";

describe("scanArgs secrets", () => {
  it.each([
    [{ key: "AKIAIOSFODNN7EXAMPLE" }, "secret:aws-access-key"],
    [{ tok: "ghp_" + "a1B2".repeat(9) }, "secret:github-token"],
    [{ pem: "-----BEGIN RSA PRIVATE KEY-----\nMIIB..." }, "secret:private-key"],
    [{ jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U" }, "secret:jwt"],
  ])("flags %o as %s", (args, flag) => {
    expect(scanArgs(args)).toContain(flag);
  });

  it("flags long high-entropy strings", () => {
    expect(scanArgs({ v: "9xK2mQ7pL4nR8sT1vW5yZ3aB6cD0eF9gH2jM5" })).toContain("secret:high-entropy");
  });

  it("is quiet on normal args", () => {
    expect(scanArgs({ path: "src/index.ts", message: "hello world, fix the login bug" })).toEqual([]);
  });

  it("flags unserializable args conservatively instead of throwing", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(scanArgs(circular)).toEqual(["secret:unserializable"]);
  });
});

describe("path:outside-roots", () => {
  it("flags absolute paths outside allowed roots", () => {
    expect(scanArgs({ path: "/etc/passwd" }, { allowedRoots: ["/home/me/projects"] }))
      .toContain("path:outside-roots");
    expect(scanArgs({ path: "C:\\Windows\\system32\\config" }, { allowedRoots: ["C:/Users/me/projects"] }))
      .toContain("path:outside-roots");
  });
  it("allows paths inside roots and skips check when roots unset", () => {
    expect(scanArgs({ path: "/home/me/projects/a.txt" }, { allowedRoots: ["/home/me/projects"] })).toEqual([]);
    expect(scanArgs({ path: "/etc/passwd" })).toEqual([]);
  });

  it("flags .. escapes out of the root", () => {
    expect(scanArgs({ path: "/r/allowed/../private/x" }, { allowedRoots: ["/r/allowed"] }))
      .toContain("path:outside-roots");
  });

  it("respects caseInsensitive for root containment", () => {
    expect(scanArgs({ path: "/Home/x" }, { allowedRoots: ["/home"], caseInsensitive: false }))
      .toContain("path:outside-roots");
    expect(scanArgs({ path: "C:/USERS/a" }, { allowedRoots: ["c:/users"], caseInsensitive: true }))
      .toEqual([]);
  });

  it("does not treat sibling dirs sharing a prefix as inside the root", () => {
    expect(scanArgs({ path: "/home/me/projects-leak/id_rsa" }, { allowedRoots: ["/home/me/projects"] }))
      .toContain("path:outside-roots");
  });
});

describe("shannonEntropy", () => {
  it("low for repeats, high for random-looking", () => {
    expect(shannonEntropy("aaaaaaaaaa")).toBeLessThan(1);
    expect(shannonEntropy("9xK2mQ7pL4nR8sT1vW5yZ3aB6cD0eF9g")).toBeGreaterThan(4);
  });
});
