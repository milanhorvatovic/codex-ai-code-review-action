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
});
