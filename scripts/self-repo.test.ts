import { describe, expect, it } from "vitest";

import { SELF_REPO, SELF_REPO_REGEX_SOURCE } from "./self-repo.js";

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
