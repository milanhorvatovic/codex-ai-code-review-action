import { describe, expect, it } from "vitest";

import { escapeRegex, SELF_REPO, SELF_REPO_REGEX_SOURCE } from "./self-repo.js";

describe("SELF_REPO", () => {
  it("uses the canonical owner/repo identifier", () => {
    expect(SELF_REPO).toBe("milanhorvatovic/codex-ai-code-review-action");
  });
});

describe("SELF_REPO_REGEX_SOURCE", () => {
  it("escapes forward slashes for safe embedding in a RegExp source string", () => {
    expect(SELF_REPO_REGEX_SOURCE).toBe("milanhorvatovic\\/codex-ai-code-review-action");
  });

  it("produces a RegExp that matches the SELF_REPO literal exactly", () => {
    const re = new RegExp(`^${SELF_REPO_REGEX_SOURCE}$`);
    expect(re.test(SELF_REPO)).toBe(true);
  });

  it("does not match a different owner with the same repo name", () => {
    const re = new RegExp(`^${SELF_REPO_REGEX_SOURCE}$`);
    expect(re.test("someoneelse/codex-ai-code-review-action")).toBe(false);
  });
});

describe("escapeRegex", () => {
  it("escapes every JS regex metacharacter so the result is RegExp-source-safe", () => {
    expect(escapeRegex("a.b*c+d?e^f$g(h)i[j]k{l}m|n\\o/p")).toBe(
      "a\\.b\\*c\\+d\\?e\\^f\\$g\\(h\\)i\\[j\\]k\\{l\\}m\\|n\\\\o\\/p",
    );
  });

  it("escapes a `.` so a literal dot does not behave as a wildcard", () => {
    const source = escapeRegex("forks/my.action");
    const re = new RegExp(`^${source}$`);
    expect(re.test("forks/my.action")).toBe(true);
    // Wildcard interpretation would match "/myXaction" — escaping prevents that.
    expect(re.test("forks/myXaction")).toBe(false);
  });

  it("escapes a backslash without producing an invalid pattern", () => {
    const source = escapeRegex("ab\\cd");
    expect(source).toBe("ab\\\\cd");
    const re = new RegExp(`^${source}$`);
    expect(re.test("ab\\cd")).toBe(true);
  });

  it("leaves non-metacharacter input unchanged", () => {
    expect(escapeRegex("alphanumeric_dash-and_underscore")).toBe(
      "alphanumeric_dash-and_underscore",
    );
  });

  it("returns an empty string for empty input", () => {
    expect(escapeRegex("")).toBe("");
  });
});
