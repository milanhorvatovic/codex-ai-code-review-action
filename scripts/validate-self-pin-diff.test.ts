import { describe, expect, it } from "vitest";

import { SELF_REPO } from "./self-repo.js";
import { runCli, validateUnifiedDiff } from "./validate-self-pin-diff.js";

const OLD_SHA = "af72a5bd7330432cee97137b04d04edebde80149";
const NEW_SHA = "1111111111111111111111111111111111111111";

function buildDiff(path: string, hunk: string): string {
  return [
    `diff --git a/${path} b/${path}`,
    `index abcdef1..abcdef2 100644`,
    `--- a/${path}`,
    `+++ b/${path}`,
    hunk,
  ].join("\n");
}

describe("validateUnifiedDiff", () => {
  it("accepts a SHA-only self-pin refresh", () => {
    const hunk = [
      `@@ -10,3 +10,3 @@`,
      `       runs-on: ubuntu-latest`,
      `-      uses: ${SELF_REPO}@${OLD_SHA} # v2.0.0`,
      `+      uses: ${SELF_REPO}@${NEW_SHA} # v2.1.0`,
      `       with:`,
    ].join("\n");
    const result = validateUnifiedDiff(buildDiff(".github/workflows/codex-review.yaml", hunk));
    expect(result).toEqual({ ok: true });
  });

  it("accepts a tag-comment-note refresh", () => {
    const hunk = [
      `@@ -1,1 +1,1 @@`,
      `-        # SHA corresponds to tag v2.0.0 — update when adopting a new release.`,
      `+        # SHA corresponds to tag v2.1.0 — update when adopting a new release.`,
    ].join("\n");
    const result = validateUnifiedDiff(buildDiff("README.md", hunk));
    expect(result).toEqual({ ok: true });
  });

  it("accepts multiple SHA refreshes across hunks", () => {
    const hunk = [
      `@@ -10,3 +10,3 @@`,
      `       step-a:`,
      `-      uses: ${SELF_REPO}/prepare@${OLD_SHA} # v2.0.0`,
      `+      uses: ${SELF_REPO}/prepare@${NEW_SHA} # v2.1.0`,
      `       with:`,
      `@@ -42,3 +42,3 @@`,
      `       step-b:`,
      `-      uses: ${SELF_REPO}/review@${OLD_SHA} # v2.0.0`,
      `+      uses: ${SELF_REPO}/review@${NEW_SHA} # v2.1.0`,
      `       with:`,
    ].join("\n");
    const result = validateUnifiedDiff(buildDiff(".github/workflows/codex-review.yaml", hunk));
    expect(result).toEqual({ ok: true });
  });

  it("rejects a non-SHA edit alongside a SHA refresh on the same line", () => {
    const hunk = [
      `@@ -10,3 +10,3 @@`,
      `       runs-on: ubuntu-latest`,
      `-      uses: ${SELF_REPO}@${OLD_SHA} # v2.0.0`,
      `+      uses: ${SELF_REPO}@${NEW_SHA} # v2.1.0 # smuggled comment`,
      `       with:`,
    ].join("\n");
    const result = validateUnifiedDiff(buildDiff(".github/workflows/codex-review.yaml", hunk));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("not a self-pin or sha-tag-note refresh");
  });

  it("rejects a line that contains no self-pin or sha-tag-note", () => {
    const hunk = [
      `@@ -10,3 +10,3 @@`,
      `       runs-on: ubuntu-latest`,
      `-      timeout-minutes: 5`,
      `+      timeout-minutes: 10`,
      `       with:`,
    ].join("\n");
    const result = validateUnifiedDiff(buildDiff(".github/workflows/codex-review.yaml", hunk));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("not a self-pin or sha-tag-note refresh");
  });

  it("rejects a whitespace-only edit that masks to the same string with no pattern match", () => {
    const hunk = [
      `@@ -10,3 +10,3 @@`,
      `       runs-on: ubuntu-latest`,
      `-      timeout-minutes:    5`,
      `+      timeout-minutes:    5`,
      `       with:`,
    ].join("\n");
    const result = validateUnifiedDiff(buildDiff(".github/workflows/codex-review.yaml", hunk));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("matches no expected pattern");
  });

  it("rejects a pure addition (new line not paired with a removal)", () => {
    const hunk = [
      `@@ -10,3 +10,4 @@`,
      `       runs-on: ubuntu-latest`,
      `-      uses: ${SELF_REPO}@${OLD_SHA} # v2.0.0`,
      `+      uses: ${SELF_REPO}@${NEW_SHA} # v2.1.0`,
      `+      env: { SECRET: leak }`,
      `       with:`,
    ].join("\n");
    const result = validateUnifiedDiff(buildDiff(".github/workflows/codex-review.yaml", hunk));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("unbalanced hunk");
  });

  it("rejects a pure addition with no matching removal block", () => {
    const hunk = [
      `@@ -10,2 +10,3 @@`,
      `       runs-on: ubuntu-latest`,
      `+      malicious: payload`,
      `       with:`,
    ].join("\n");
    const result = validateUnifiedDiff(buildDiff(".github/workflows/codex-review.yaml", hunk));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("pure addition is not a SHA-only refresh");
  });

  it("attributes errors to the right file path across multiple files", () => {
    const okHunk = [
      `@@ -10,3 +10,3 @@`,
      `       runs-on: ubuntu-latest`,
      `-      uses: ${SELF_REPO}@${OLD_SHA} # v2.0.0`,
      `+      uses: ${SELF_REPO}@${NEW_SHA} # v2.1.0`,
      `       with:`,
    ].join("\n");
    const badHunk = [
      `@@ -1,3 +1,3 @@`,
      `       header`,
      `-      timeout-minutes: 5`,
      `+      timeout-minutes: 10`,
      `       footer`,
    ].join("\n");
    const combined = [
      buildDiff(".github/workflows/codex-review.yaml", okHunk),
      buildDiff("README.md", badHunk),
    ].join("\n");
    const result = validateUnifiedDiff(combined);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain("README.md:");
    expect(result.errors[0]).not.toContain(".github/workflows/codex-review.yaml:");
  });

  it("rejects swapping the action subpath while bumping the SHA", () => {
    const hunk = [
      `@@ -10,3 +10,3 @@`,
      `       runs-on: ubuntu-latest`,
      `-      uses: ${SELF_REPO}/prepare@${OLD_SHA} # v2.0.0`,
      `+      uses: ${SELF_REPO}/review@${NEW_SHA} # v2.1.0`,
      `       with:`,
    ].join("\n");
    const result = validateUnifiedDiff(buildDiff(".github/workflows/codex-review.yaml", hunk));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("not a self-pin or sha-tag-note refresh");
  });

  it("rejects converting a top-level reference to a subpath one", () => {
    const hunk = [
      `@@ -10,3 +10,3 @@`,
      `       runs-on: ubuntu-latest`,
      `-      uses: ${SELF_REPO}@${OLD_SHA} # v2.0.0`,
      `+      uses: ${SELF_REPO}/publish@${NEW_SHA} # v2.1.0`,
      `       with:`,
    ].join("\n");
    const result = validateUnifiedDiff(buildDiff(".github/workflows/codex-review.yaml", hunk));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("not a self-pin or sha-tag-note refresh");
  });

  it("rejects a non-semver tag comment on the new line", () => {
    const hunk = [
      `@@ -10,3 +10,3 @@`,
      `       runs-on: ubuntu-latest`,
      `-      uses: ${SELF_REPO}@${OLD_SHA} # v2.0.0`,
      `+      uses: ${SELF_REPO}@${NEW_SHA} # malicious-text`,
      `       with:`,
    ].join("\n");
    const result = validateUnifiedDiff(buildDiff(".github/workflows/codex-review.yaml", hunk));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("not a self-pin or sha-tag-note refresh");
  });

  it("accepts adding a v-prefixed tag comment to a previously bare self-pin", () => {
    const hunk = [
      `@@ -10,3 +10,3 @@`,
      `       runs-on: ubuntu-latest`,
      `-      uses: ${SELF_REPO}/prepare@${OLD_SHA}`,
      `+      uses: ${SELF_REPO}/prepare@${NEW_SHA} # v2.1.0`,
      `       with:`,
    ].join("\n");
    const result = validateUnifiedDiff(buildDiff(".github/workflows/codex-review.yaml", hunk));
    expect(result).toEqual({ ok: true });
  });

  it("accepts a placeholder-pin tag-comment refresh (`<full-sha>` form, tag only bumps)", () => {
    const hunk = [
      `@@ -10,3 +10,3 @@`,
      `  Replace \`<full-sha>\` with the resolved commit SHA:`,
      `-  uses: ${SELF_REPO}/prepare@<full-sha> # v2.0.0`,
      `+  uses: ${SELF_REPO}/prepare@<full-sha> # v2.1.0`,
      `  ...`,
    ].join("\n");
    const result = validateUnifiedDiff(buildDiff("docs/consumer-controls.md", hunk));
    expect(result).toEqual({ ok: true });
  });

  it("rejects swapping the action subpath on a placeholder pin while bumping the tag", () => {
    const hunk = [
      `@@ -10,3 +10,3 @@`,
      `  ...`,
      `-  uses: ${SELF_REPO}/prepare@<full-sha> # v2.0.0`,
      `+  uses: ${SELF_REPO}/review@<full-sha> # v2.1.0`,
      `  ...`,
    ].join("\n");
    const result = validateUnifiedDiff(buildDiff("docs/consumer-controls.md", hunk));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("not a self-pin or sha-tag-note refresh");
  });

  it("rejects converting a placeholder pin to a real-SHA pin", () => {
    const hunk = [
      `@@ -10,3 +10,3 @@`,
      `  ...`,
      `-  uses: ${SELF_REPO}/prepare@<full-sha> # v2.0.0`,
      `+  uses: ${SELF_REPO}/prepare@${NEW_SHA} # v2.1.0`,
      `  ...`,
    ].join("\n");
    const result = validateUnifiedDiff(buildDiff("docs/consumer-controls.md", hunk));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("not a self-pin or sha-tag-note refresh");
  });

  it("accepts a pre-release tag comment (v2.1.0-rc.1)", () => {
    const hunk = [
      `@@ -10,3 +10,3 @@`,
      `       runs-on: ubuntu-latest`,
      `-      uses: ${SELF_REPO}@${OLD_SHA} # v2.0.0`,
      `+      uses: ${SELF_REPO}@${NEW_SHA} # v2.1.0-rc.1`,
      `       with:`,
    ].join("\n");
    const result = validateUnifiedDiff(buildDiff(".github/workflows/codex-review.yaml", hunk));
    expect(result).toEqual({ ok: true });
  });

  it("returns ok for an empty diff", () => {
    expect(validateUnifiedDiff("")).toEqual({ ok: true });
  });

  it("accepts a SHA-only refresh whose removed side lacks a trailing newline", () => {
    const hunk = [
      `@@ -10,2 +10,2 @@`,
      `       runs-on: ubuntu-latest`,
      `-      uses: ${SELF_REPO}@${OLD_SHA} # v2.0.0`,
      `\\ No newline at end of file`,
      `+      uses: ${SELF_REPO}@${NEW_SHA} # v2.1.0`,
    ].join("\n");
    const result = validateUnifiedDiff(buildDiff(".github/workflows/codex-review.yaml", hunk));
    expect(result).toEqual({ ok: true });
  });

  it("accepts a SHA-only refresh whose added side lacks a trailing newline", () => {
    const hunk = [
      `@@ -10,2 +10,2 @@`,
      `       runs-on: ubuntu-latest`,
      `-      uses: ${SELF_REPO}@${OLD_SHA} # v2.0.0`,
      `+      uses: ${SELF_REPO}@${NEW_SHA} # v2.1.0`,
      `\\ No newline at end of file`,
    ].join("\n");
    const result = validateUnifiedDiff(buildDiff(".github/workflows/codex-review.yaml", hunk));
    expect(result).toEqual({ ok: true });
  });

  it("accepts a SHA-only refresh where both sides lack a trailing newline", () => {
    const hunk = [
      `@@ -10,2 +10,2 @@`,
      `       runs-on: ubuntu-latest`,
      `-      uses: ${SELF_REPO}@${OLD_SHA} # v2.0.0`,
      `\\ No newline at end of file`,
      `+      uses: ${SELF_REPO}@${NEW_SHA} # v2.1.0`,
      `\\ No newline at end of file`,
    ].join("\n");
    const result = validateUnifiedDiff(buildDiff(".github/workflows/codex-review.yaml", hunk));
    expect(result).toEqual({ ok: true });
  });
});

describe("validateUnifiedDiff diff-section hardening", () => {
  it("rejects a file-mode change (old mode / new mode headers)", () => {
    const text = [
      `diff --git a/.github/workflows/codex-review.yaml b/.github/workflows/codex-review.yaml`,
      `old mode 100644`,
      `new mode 100755`,
      `index abcdef1..abcdef2 100755`,
      `--- a/.github/workflows/codex-review.yaml`,
      `+++ b/.github/workflows/codex-review.yaml`,
      `@@ -10,1 +10,1 @@`,
      `-      uses: ${SELF_REPO}@${OLD_SHA} # v2.0.0`,
      `+      uses: ${SELF_REPO}@${NEW_SHA} # v2.1.0`,
    ].join("\n");
    const result = validateUnifiedDiff(text);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("file mode change is not a SHA-only refresh");
  });

  it("rejects a new-file diff section (new file mode header)", () => {
    const text = [
      `diff --git a/.github/workflows/new.yaml b/.github/workflows/new.yaml`,
      `new file mode 100644`,
      `index 0000000..abcdef1`,
      `--- /dev/null`,
      `+++ b/.github/workflows/new.yaml`,
      `@@ -0,0 +1,1 @@`,
      `+      uses: ${SELF_REPO}@${NEW_SHA} # v2.1.0`,
    ].join("\n");
    const result = validateUnifiedDiff(text);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("file mode change is not a SHA-only refresh");
  });

  it("rejects a file rename diff section", () => {
    const text = [
      `diff --git a/README.md b/RENAMED.md`,
      `similarity index 100%`,
      `rename from README.md`,
      `rename to RENAMED.md`,
    ].join("\n");
    const result = validateUnifiedDiff(text);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("file rename/copy is not a SHA-only refresh");
  });

  it("rejects a binary diff (`Binary files ... differ`)", () => {
    const text = [
      `diff --git a/assets/logo.png b/assets/logo.png`,
      `index abcdef1..abcdef2 100644`,
      `Binary files a/assets/logo.png and b/assets/logo.png differ`,
    ].join("\n");
    const result = validateUnifiedDiff(text);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("binary patch is not a SHA-only refresh");
  });

  it("rejects a GIT binary patch diff section", () => {
    const text = [
      `diff --git a/assets/logo.png b/assets/logo.png`,
      `index abcdef1..abcdef2 100644`,
      `GIT binary patch`,
      `literal 12`,
      `Mc$_NA01R$#mH+?%`,
    ].join("\n");
    const result = validateUnifiedDiff(text);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("binary patch is not a SHA-only refresh");
  });

  it("rejects a header-only diff section that has no hunks at all", () => {
    const text = [
      `diff --git a/.github/workflows/codex-review.yaml b/.github/workflows/codex-review.yaml`,
      `index abcdef1..abcdef2 100644`,
    ].join("\n");
    const result = validateUnifiedDiff(text);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("diff section has no hunks");
  });

  it("rejects when a no-hunk section precedes a valid SHA-only section", () => {
    const text = [
      `diff --git a/assets/logo.png b/assets/logo.png`,
      `index abcdef1..abcdef2 100644`,
      `diff --git a/.github/workflows/codex-review.yaml b/.github/workflows/codex-review.yaml`,
      `index abcdef1..abcdef2 100644`,
      `--- a/.github/workflows/codex-review.yaml`,
      `+++ b/.github/workflows/codex-review.yaml`,
      `@@ -10,1 +10,1 @@`,
      `-      uses: ${SELF_REPO}@${OLD_SHA} # v2.0.0`,
      `+      uses: ${SELF_REPO}@${NEW_SHA} # v2.1.0`,
    ].join("\n");
    const result = validateUnifiedDiff(text);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("diff section has no hunks");
    // The valid second section should not contribute additional errors.
    expect(result.errors.length).toBe(1);
  });
});

describe("validateUnifiedDiff strict mode (expectedSha + expectedVersion)", () => {
  const EXPECTED_VERSION = "2.1.0";

  it("accepts a SHA-only refresh whose added side matches the expected SHA and version", () => {
    const hunk = [
      `@@ -10,1 +10,1 @@`,
      `-      uses: ${SELF_REPO}@${OLD_SHA} # v2.0.0`,
      `+      uses: ${SELF_REPO}@${NEW_SHA} # v${EXPECTED_VERSION}`,
    ].join("\n");
    const result = validateUnifiedDiff(
      buildDiff(".github/workflows/codex-review.yaml", hunk),
      { expectedSha: NEW_SHA, expectedVersion: EXPECTED_VERSION },
    );
    expect(result).toEqual({ ok: true });
  });

  it("rejects a refresh whose added SHA does not match the expected SHA", () => {
    const WRONG_SHA = "2222222222222222222222222222222222222222";
    const hunk = [
      `@@ -10,1 +10,1 @@`,
      `-      uses: ${SELF_REPO}@${OLD_SHA} # v2.0.0`,
      `+      uses: ${SELF_REPO}@${WRONG_SHA} # v${EXPECTED_VERSION}`,
    ].join("\n");
    const result = validateUnifiedDiff(
      buildDiff(".github/workflows/codex-review.yaml", hunk),
      { expectedSha: NEW_SHA, expectedVersion: EXPECTED_VERSION },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("not a self-pin or sha-tag-note refresh");
  });

  it("rejects a refresh whose added tag does not match the expected version", () => {
    const hunk = [
      `@@ -10,1 +10,1 @@`,
      `-      uses: ${SELF_REPO}@${OLD_SHA} # v2.0.0`,
      `+      uses: ${SELF_REPO}@${NEW_SHA} # v9.9.9`,
    ].join("\n");
    const result = validateUnifiedDiff(
      buildDiff(".github/workflows/codex-review.yaml", hunk),
      { expectedSha: NEW_SHA, expectedVersion: EXPECTED_VERSION },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("not a self-pin or sha-tag-note refresh");
  });

  it("accepts a SHA-tag-note refresh whose added version matches the expected version", () => {
    const hunk = [
      `@@ -1,1 +1,1 @@`,
      `-        # SHA corresponds to tag v2.0.0 — update when adopting a new release.`,
      `+        # SHA corresponds to tag v${EXPECTED_VERSION} — update when adopting a new release.`,
    ].join("\n");
    const result = validateUnifiedDiff(buildDiff("README.md", hunk), {
      expectedSha: NEW_SHA,
      expectedVersion: EXPECTED_VERSION,
    });
    expect(result).toEqual({ ok: true });
  });

  it("accepts a placeholder-pin tag refresh whose added version matches the expected version", () => {
    const hunk = [
      `@@ -10,1 +10,1 @@`,
      `-  uses: ${SELF_REPO}/prepare@<full-sha> # v2.0.0`,
      `+  uses: ${SELF_REPO}/prepare@<full-sha> # v${EXPECTED_VERSION}`,
    ].join("\n");
    const result = validateUnifiedDiff(buildDiff("docs/consumer-controls.md", hunk), {
      expectedSha: NEW_SHA,
      expectedVersion: EXPECTED_VERSION,
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects a placeholder-pin refresh whose added side drops the tag comment entirely", () => {
    // Placeholder pins carry no release-specific SHA, so the tag comment is the only
    // value tying a placeholder line to a release. Strict mode must require it; a
    // refresh PR that strips `# vX.Y.Z` must not mask-equal the old line.
    const hunk = [
      `@@ -10,1 +10,1 @@`,
      `-  uses: ${SELF_REPO}/prepare@<full-sha> # v2.0.0`,
      `+  uses: ${SELF_REPO}/prepare@<full-sha>`,
    ].join("\n");
    const result = validateUnifiedDiff(buildDiff("docs/consumer-controls.md", hunk), {
      expectedSha: NEW_SHA,
      expectedVersion: EXPECTED_VERSION,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("not a self-pin or sha-tag-note refresh");
  });

  it("rejects a placeholder-pin tag refresh whose added tag does not match the expected version", () => {
    const hunk = [
      `@@ -10,1 +10,1 @@`,
      `-  uses: ${SELF_REPO}/prepare@<full-sha> # v2.0.0`,
      `+  uses: ${SELF_REPO}/prepare@<full-sha> # v9.9.9`,
    ].join("\n");
    const result = validateUnifiedDiff(buildDiff("docs/consumer-controls.md", hunk), {
      expectedSha: NEW_SHA,
      expectedVersion: EXPECTED_VERSION,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("not a self-pin or sha-tag-note refresh");
  });

  it("rejects a SHA-tag-note refresh whose added version does not match the expected version", () => {
    const hunk = [
      `@@ -1,1 +1,1 @@`,
      `-        # SHA corresponds to tag v2.0.0 — update when adopting a new release.`,
      `+        # SHA corresponds to tag v9.9.9 — update when adopting a new release.`,
    ].join("\n");
    const result = validateUnifiedDiff(buildDiff("README.md", hunk), {
      expectedSha: NEW_SHA,
      expectedVersion: EXPECTED_VERSION,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("not a self-pin or sha-tag-note refresh");
  });

  it("throws when only expectedSha is provided", () => {
    expect(() =>
      validateUnifiedDiff("", { expectedSha: NEW_SHA }),
    ).toThrow(/pass both expectedSha and expectedVersion, or neither/);
  });

  it("throws when only expectedVersion is provided", () => {
    expect(() =>
      validateUnifiedDiff("", { expectedVersion: EXPECTED_VERSION }),
    ).toThrow(/pass both expectedSha and expectedVersion, or neither/);
  });

  it("throws when expectedSha is not a 40-character lowercase hex string", () => {
    const hunk = [
      `@@ -10,1 +10,1 @@`,
      `-      uses: ${SELF_REPO}@${OLD_SHA} # v2.0.0`,
      `+      uses: ${SELF_REPO}@${NEW_SHA} # v${EXPECTED_VERSION}`,
    ].join("\n");
    expect(() =>
      validateUnifiedDiff(buildDiff("README.md", hunk), {
        expectedSha: "not-a-sha",
        expectedVersion: EXPECTED_VERSION,
      }),
    ).toThrow(/40-character lowercase hex string/);
  });

  it("throws when expectedVersion is not a semver string", () => {
    const hunk = [
      `@@ -10,1 +10,1 @@`,
      `-      uses: ${SELF_REPO}@${OLD_SHA} # v2.0.0`,
      `+      uses: ${SELF_REPO}@${NEW_SHA} # v${EXPECTED_VERSION}`,
    ].join("\n");
    expect(() =>
      validateUnifiedDiff(buildDiff("README.md", hunk), {
        expectedSha: NEW_SHA,
        expectedVersion: "vNOT.semver",
      }),
    ).toThrow(/MAJOR\.MINOR\.PATCH/);
  });
});

describe("runCli", () => {
  it("returns 0 for a SHA-only diff", () => {
    const stderr: string[] = [];
    const text = [
      `diff --git a/README.md b/README.md`,
      `--- a/README.md`,
      `+++ b/README.md`,
      `@@ -1,1 +1,1 @@`,
      `-      uses: ${SELF_REPO}@${OLD_SHA} # v2.0.0`,
      `+      uses: ${SELF_REPO}@${NEW_SHA} # v2.1.0`,
    ].join("\n");
    const exit = runCli({
      readInput: () => text,
      stderrWrite: (chunk) => stderr.push(chunk),
    });
    expect(exit).toBe(0);
    expect(stderr.join("")).toBe("");
  });

  it("returns 1 and writes errors to stderr for a non-SHA edit", () => {
    const stderr: string[] = [];
    const text = [
      `diff --git a/README.md b/README.md`,
      `--- a/README.md`,
      `+++ b/README.md`,
      `@@ -1,1 +1,1 @@`,
      `-      timeout: 5`,
      `+      timeout: 10`,
    ].join("\n");
    const exit = runCli({
      readInput: () => text,
      stderrWrite: (chunk) => stderr.push(chunk),
    });
    expect(exit).toBe(1);
    expect(stderr.join("")).toContain("not a self-pin or sha-tag-note refresh");
  });

  it("returns 0 when strict-mode argv matches the diff's added SHA and version", () => {
    const stderr: string[] = [];
    const text = [
      `diff --git a/README.md b/README.md`,
      `--- a/README.md`,
      `+++ b/README.md`,
      `@@ -1,1 +1,1 @@`,
      `-      uses: ${SELF_REPO}@${OLD_SHA} # v2.0.0`,
      `+      uses: ${SELF_REPO}@${NEW_SHA} # v2.1.0`,
    ].join("\n");
    const exit = runCli({
      argv: [NEW_SHA, "2.1.0"],
      readInput: () => text,
      stderrWrite: (chunk) => stderr.push(chunk),
    });
    expect(exit).toBe(0);
    expect(stderr.join("")).toBe("");
  });

  it("returns 1 when strict-mode argv disagrees with the diff's added SHA", () => {
    const WRONG_SHA = "2222222222222222222222222222222222222222";
    const stderr: string[] = [];
    const text = [
      `diff --git a/README.md b/README.md`,
      `--- a/README.md`,
      `+++ b/README.md`,
      `@@ -1,1 +1,1 @@`,
      `-      uses: ${SELF_REPO}@${OLD_SHA} # v2.0.0`,
      `+      uses: ${SELF_REPO}@${WRONG_SHA} # v2.1.0`,
    ].join("\n");
    const exit = runCli({
      argv: [NEW_SHA, "2.1.0"],
      readInput: () => text,
      stderrWrite: (chunk) => stderr.push(chunk),
    });
    expect(exit).toBe(1);
    expect(stderr.join("")).toContain("not a self-pin or sha-tag-note refresh");
  });

  it("returns 1 and prints usage when argv has exactly one argument", () => {
    const stderr: string[] = [];
    const exit = runCli({
      argv: [NEW_SHA],
      readInput: () => "",
      stderrWrite: (chunk) => stderr.push(chunk),
    });
    expect(exit).toBe(1);
    expect(stderr.join("")).toContain("Usage:");
  });

  it("returns 1 and surfaces validateUnifiedDiff's error for an invalid expected-sha argv", () => {
    const stderr: string[] = [];
    const text = [
      `diff --git a/README.md b/README.md`,
      `--- a/README.md`,
      `+++ b/README.md`,
      `@@ -1,1 +1,1 @@`,
      `-      uses: ${SELF_REPO}@${OLD_SHA} # v2.0.0`,
      `+      uses: ${SELF_REPO}@${NEW_SHA} # v2.1.0`,
    ].join("\n");
    const exit = runCli({
      argv: ["not-a-sha", "2.1.0"],
      readInput: () => text,
      stderrWrite: (chunk) => stderr.push(chunk),
    });
    expect(exit).toBe(1);
    expect(stderr.join("")).toContain("40-character lowercase hex string");
  });
});
