import { describe, expect, it } from "vitest";

import {
  EXCLUDE_PATHS_MAX_ENTRIES,
  ExcludePathsError,
  parseExcludePaths,
} from "./excludePaths.js";

describe("parseExcludePaths", () => {
  describe("empty-input passthrough", () => {
    it("returns [] for an empty string", () => {
      expect(parseExcludePaths("")).toEqual([]);
    });

    it("returns [] for whitespace-only input", () => {
      expect(parseExcludePaths("   \n\t\n  ")).toEqual([]);
    });

    it("returns [] when every line is blank after trimming", () => {
      expect(parseExcludePaths("\n\r\n   \n")).toEqual([]);
    });
  });

  describe("happy-path parsing", () => {
    it("parses a single entry", () => {
      expect(parseExcludePaths("dist/**")).toEqual(["dist/**"]);
    });

    it("parses multiple entries on separate lines", () => {
      expect(parseExcludePaths("dist/**\nvendor/**\n*.lock")).toEqual([
        "dist/**",
        "vendor/**",
        "*.lock",
      ]);
    });

    it("trims surrounding whitespace per line", () => {
      expect(parseExcludePaths("  dist/**  \n\t*.lock\t")).toEqual([
        "dist/**",
        "*.lock",
      ]);
    });

    it("strips CR characters from CRLF line endings", () => {
      expect(parseExcludePaths("dist/**\r\nvendor/**\r\n")).toEqual([
        "dist/**",
        "vendor/**",
      ]);
    });

    it("drops blank lines silently between entries", () => {
      expect(parseExcludePaths("dist/**\n\n\nvendor/**\n   \n*.lock")).toEqual([
        "dist/**",
        "vendor/**",
        "*.lock",
      ]);
    });

    it("accepts patterns with glob wildcards and brackets", () => {
      expect(parseExcludePaths("**/*.log\nfoo/[abc]/**\nfoo?.txt")).toEqual([
        "**/*.log",
        "foo/[abc]/**",
        "foo?.txt",
      ]);
    });

    it("accepts the maximum allowed number of entries", () => {
      const lines = Array.from({ length: EXCLUDE_PATHS_MAX_ENTRIES }, (_, i) => `dir${i}/**`);
      const result = parseExcludePaths(lines.join("\n"));
      expect(result).toHaveLength(EXCLUDE_PATHS_MAX_ENTRIES);
    });
  });

  describe("validation rejections", () => {
    it("rejects an entry containing a NUL byte", () => {
      expect(() => parseExcludePaths("dist/**\nbad\0path"))
        .toThrowError(ExcludePathsError);
      expect(() => parseExcludePaths("bad\0path"))
        .toThrow(/NUL byte/);
    });

    it("rejects an entry containing a backslash", () => {
      expect(() => parseExcludePaths("dist\\foo")).toThrowError(ExcludePathsError);
      expect(() => parseExcludePaths("dist\\foo")).toThrow(/backslash/);
    });

    it("rejects an entry starting with ':' (pathspec magic)", () => {
      expect(() => parseExcludePaths(":(exclude)dist/**")).toThrowError(ExcludePathsError);
      expect(() => parseExcludePaths(":(exclude)dist/**")).toThrow(/pathspec magic/);
    });

    it("rejects an entry starting with '/' (absolute)", () => {
      expect(() => parseExcludePaths("/etc/passwd")).toThrowError(ExcludePathsError);
      expect(() => parseExcludePaths("/etc/passwd")).toThrow(/absolute/);
    });

    it("rejects a leading '..' segment", () => {
      expect(() => parseExcludePaths("../escape/**")).toThrowError(ExcludePathsError);
      expect(() => parseExcludePaths("../escape/**")).toThrow(/'\.\.' segment/);
    });

    it("rejects a non-leading '..' segment", () => {
      expect(() => parseExcludePaths("foo/../escape/**")).toThrowError(ExcludePathsError);
    });

    it("rejects when entry count exceeds the cap", () => {
      const lines = Array.from(
        { length: EXCLUDE_PATHS_MAX_ENTRIES + 1 },
        (_, i) => `dir${i}/**`,
      );
      expect(() => parseExcludePaths(lines.join("\n"))).toThrowError(ExcludePathsError);
      expect(() => parseExcludePaths(lines.join("\n"))).toThrow(
        new RegExp(`exceeds the cap of ${EXCLUDE_PATHS_MAX_ENTRIES}`),
      );
    });

    it("includes the offending line number in the error message", () => {
      expect(() => parseExcludePaths("dist/**\n\nfoo\\bar"))
        .toThrow(/line 3/);
    });
  });
});
