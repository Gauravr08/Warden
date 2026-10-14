import path from "node:path";
import { expandHome } from "./config/load.js";

export const CASE_INSENSITIVE_FS = process.platform === "win32";

export function looksLikeAbsolutePath(s: string): boolean {
  return /^([A-Za-z]:[\\/]|\/)/.test(s) && !s.includes("\n") && s.length < 500;
}

/** Absolute-path shape with no length cap: used for matching, where a cap would be a bypass. */
export function isAbsolutePathLike(s: string): boolean {
  return /^([A-Za-z]:[\\/]|[\\/])/.test(s);
}

export function normalizePath(p: string, caseInsensitive = CASE_INSENSITIVE_FS): string {
  let s = expandHome(p).replace(/\\/g, "/");
  if (isAbsolutePathLike(s)) {
    // Split off the drive so posix.normalize can't treat "C:" as a segment; a rooted
    // remainder means ".." can never climb above the root.
    const m = /^([A-Za-z]:)(\/.*)$/.exec(s);
    s = m ? m[1] + path.posix.normalize(m[2]) : path.posix.normalize(s);
    if (caseInsensitive) s = s.toLowerCase();
  }
  return s;
}
