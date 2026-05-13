import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { escapeRegex, SELF_REPO_REGEX_SOURCE } from "./self-repo.js";

// Capture group 1 (`owner + optional /sub`) is preserved verbatim in the masked output
// so changes to the action subpath (e.g. `.../prepare@SHA` → `.../review@SHA`) produce
// different masked strings and fail validation. Only the SHA and the optional `# vSEMVER`
// tag comment are absorbed by the placeholder. The tag comment is restricted to a
// semver-shaped vX.Y.Z[-PRE] form so an attacker can't smuggle arbitrary trailing text
// past the masker by formatting it as a `#`-prefixed comment.
//
// Loose patterns match any 40-hex SHA and any semver-shaped tag. They're used to mask
// the removed (`-`) side of each diff pair, where the prior SHA / version is whatever
// the file had before the refresh. Strict patterns (built per-call from
// `expectedSha` + `expectedVersion`) are used to mask the added (`+`) side, so a refresh
// PR that updates to the *wrong* SHA or *wrong* version doesn't mask cleanly and the
// resulting masked-old vs masked-new comparison rejects it.
const SELF_PIN_PATTERN_LOOSE = new RegExp(
  `(${SELF_REPO_REGEX_SOURCE}(?:\\/[\\w./-]+?)?)@[0-9a-f]{40}(?:[ \\t]*#[ \\t]*v\\d+\\.\\d+\\.\\d+(?:-[\\w.-]+)?)?`,
  "g",
);

// Placeholder-pin form used in instructional examples: `@<full-sha> # vX.Y.Z`. The SHA
// is the literal token `<full-sha>` and stays verbatim across refreshes; only the
// trailing version label bumps. Capture group 1 (`owner + optional /sub`) is preserved
// verbatim in the masked output for the same subpath-stability reason as
// `SELF_PIN_PATTERN_LOOSE`.
const SELF_PIN_PLACEHOLDER_PATTERN_LOOSE = new RegExp(
  `(${SELF_REPO_REGEX_SOURCE}(?:\\/[\\w./-]+?)?)@<full-sha>(?:[ \\t]*#[ \\t]*v\\d+\\.\\d+\\.\\d+(?:-[\\w.-]+)?)?`,
  "g",
);

const SHA_TAG_NOTE_PATTERN_LOOSE =
  /# SHA corresponds to tag v\d+\.\d+\.\d+(?:-[\w.-]+)? — update when adopting a new release\./g;

const SELF_PIN_MASK = "<sha-and-tag>";
const SELF_PIN_PLACEHOLDER_MASK = "<placeholder-and-tag>";
const SHA_TAG_NOTE_MASK = "<sha-tag-note>";

export type ValidateOptions = {
  expectedSha?: string;
  expectedVersion?: string;
};

export type ValidateResult = { ok: true } | { ok: false; errors: string[] };

type Patterns = { selfPin: RegExp; placeholderPin: RegExp; note: RegExp };

function buildStrictPatterns(sha: string, version: string): Patterns {
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(
      `expectedSha must be a 40-character lowercase hex string; got: ${sha}`,
    );
  }
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) {
    throw new Error(
      `expectedVersion must be MAJOR.MINOR.PATCH[-PRE]; got: ${version}`,
    );
  }
  const shaEsc = escapeRegex(sha);
  const verEsc = escapeRegex(version);
  return {
    // Strict mode requires the trailing `# v${verEsc}` tag on every added self-pin —
    // both real-SHA and placeholder forms. The post-tag auto-approval body asserts
    // this guarantee verbatim, and the release-engineered refresh script always
    // emits the tag, so a refresh PR that strips it indicates a regression worth
    // surfacing for manual review rather than silently auto-approving. Loose mode
    // (used to mask the removed/old side and for non-strict callers) keeps the tag
    // optional so a bare pin in older history still parses cleanly.
    selfPin: new RegExp(
      `(${SELF_REPO_REGEX_SOURCE}(?:\\/[\\w./-]+?)?)@${shaEsc}[ \\t]*#[ \\t]*v${verEsc}`,
      "g",
    ),
    // Placeholder pins carry no release-specific SHA — the `<full-sha>` token is
    // literal on both sides — so the tag comment is the only value that must match
    // the expected release. Mandatory for the same reason as the real-SHA pattern
    // above, but here it is also the only release-tied check.
    placeholderPin: new RegExp(
      `(${SELF_REPO_REGEX_SOURCE}(?:\\/[\\w./-]+?)?)@<full-sha>[ \\t]*#[ \\t]*v${verEsc}`,
      "g",
    ),
    note: new RegExp(
      `# SHA corresponds to tag v${verEsc} — update when adopting a new release\\.`,
      "g",
    ),
  };
}

function maskLine(line: string, patterns: Patterns): { masked: string; matched: boolean } {
  let matched = false;
  let masked = line.replace(patterns.selfPin, (_match, ownerSub: string) => {
    matched = true;
    return `${ownerSub}@${SELF_PIN_MASK}`;
  });
  masked = masked.replace(patterns.placeholderPin, (_match, ownerSub: string) => {
    matched = true;
    return `${ownerSub}@${SELF_PIN_PLACEHOLDER_MASK}`;
  });
  masked = masked.replace(patterns.note, () => {
    matched = true;
    return SHA_TAG_NOTE_MASK;
  });
  return { masked, matched };
}

export function validateUnifiedDiff(text: string, opts: ValidateOptions = {}): ValidateResult {
  if (
    (opts.expectedSha === undefined) !== (opts.expectedVersion === undefined)
  ) {
    throw new Error(
      "validateUnifiedDiff: pass both expectedSha and expectedVersion, or neither.",
    );
  }
  const loosePatterns: Patterns = {
    selfPin: SELF_PIN_PATTERN_LOOSE,
    placeholderPin: SELF_PIN_PLACEHOLDER_PATTERN_LOOSE,
    note: SHA_TAG_NOTE_PATTERN_LOOSE,
  };
  const strictPatterns =
    opts.expectedSha !== undefined && opts.expectedVersion !== undefined
      ? buildStrictPatterns(opts.expectedSha, opts.expectedVersion)
      : undefined;
  const oldPatterns = loosePatterns;
  const newPatterns = strictPatterns ?? loosePatterns;
  const errors: string[] = [];
  const lines = text.split("\n");
  let inHunk = false;
  let currentPath = "<unknown>";
  let inDiffSection = false;
  let sectionHasHunk = false;
  let i = 0;

  const flushSectionWithoutHunk = () => {
    if (inDiffSection && !sectionHasHunk) {
      errors.push(
        `${currentPath}: diff section has no hunks (binary patch or header-only change is not a SHA-only refresh)`,
      );
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) break;
    if (line.startsWith("diff --git ")) {
      flushSectionWithoutHunk();
      const match = /^diff --git a\/(.+?) b\//.exec(line);
      currentPath = match?.[1] ?? "<unknown>";
      inHunk = false;
      inDiffSection = true;
      sectionHasHunk = false;
      i++;
      continue;
    }
    if (line.startsWith("@@")) {
      inHunk = true;
      sectionHasHunk = true;
      i++;
      continue;
    }
    // Reject any header indicating that the diff section carries something other than a
    // line-level content edit: file-mode changes (which alter executability of a
    // workflow file), file creations / deletions, renames / copies, and binary patches.
    if (
      line.startsWith("old mode ") ||
      line.startsWith("new mode ") ||
      line.startsWith("new file mode ") ||
      line.startsWith("deleted file mode ")
    ) {
      errors.push(
        `${currentPath}: file mode change is not a SHA-only refresh: ${line}`,
      );
      i++;
      continue;
    }
    if (
      line.startsWith("rename from ") ||
      line.startsWith("rename to ") ||
      line.startsWith("copy from ") ||
      line.startsWith("copy to ")
    ) {
      errors.push(
        `${currentPath}: file rename/copy is not a SHA-only refresh: ${line}`,
      );
      i++;
      continue;
    }
    if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) {
      errors.push(
        `${currentPath}: binary patch is not a SHA-only refresh: ${line}`,
      );
      i++;
      continue;
    }
    if (
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("similarity index ") ||
      line.startsWith("dissimilarity index ") ||
      line.startsWith("\\")
    ) {
      i++;
      continue;
    }
    if (!inHunk) {
      i++;
      continue;
    }
    if (line.startsWith("-")) {
      const minusBlock: string[] = [];
      while (i < lines.length) {
        const next = lines[i];
        if (next === undefined) break;
        // Skip `\ No newline at end of file` markers so an EOF SHA refresh whose removed
        // or added side lacks a trailing newline still pairs minus/plus blocks 1:1.
        if (next.startsWith("\\")) {
          i++;
          continue;
        }
        if (!next.startsWith("-") || next.startsWith("--- ")) break;
        minusBlock.push(next.slice(1));
        i++;
      }
      const plusBlock: string[] = [];
      while (i < lines.length) {
        const next = lines[i];
        if (next === undefined) break;
        if (next.startsWith("\\")) {
          i++;
          continue;
        }
        if (!next.startsWith("+") || next.startsWith("+++ ")) break;
        plusBlock.push(next.slice(1));
        i++;
      }
      if (minusBlock.length !== plusBlock.length) {
        errors.push(
          `${currentPath}: unbalanced hunk (${minusBlock.length} removed, ${plusBlock.length} added)`,
        );
        continue;
      }
      for (let k = 0; k < minusBlock.length; k++) {
        const oldLine = minusBlock[k] ?? "";
        const newLine = plusBlock[k] ?? "";
        const oldMask = maskLine(oldLine, oldPatterns);
        const newMask = maskLine(newLine, newPatterns);
        if (oldMask.masked !== newMask.masked) {
          errors.push(
            `${currentPath}: changed line is not a self-pin or sha-tag-note refresh:\n  -${oldLine}\n  +${newLine}`,
          );
          continue;
        }
        if (!oldMask.matched && !newMask.matched) {
          errors.push(
            `${currentPath}: changed line matches no expected pattern:\n  -${oldLine}\n  +${newLine}`,
          );
        }
      }
      continue;
    }
    if (line.startsWith("+")) {
      errors.push(`${currentPath}: pure addition is not a SHA-only refresh:\n  +${line.slice(1)}`);
      i++;
      continue;
    }
    i++;
  }
  flushSectionWithoutHunk();
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true };
}

export type RunCliDeps = {
  argv?: string[];
  readInput?: () => string;
  stderrWrite?: (chunk: string) => void;
};

function defaultReadInput(): string {
  return readFileSync(0, "utf-8");
}

function defaultStderrWrite(chunk: string): void {
  process.stderr.write(chunk);
}

export function runCli(deps: RunCliDeps = {}): number {
  const argv = deps.argv ?? process.argv.slice(2);
  const readInput = deps.readInput ?? defaultReadInput;
  const stderrWrite = deps.stderrWrite ?? defaultStderrWrite;

  if (argv.length !== 0 && argv.length !== 2) {
    stderrWrite(
      [
        "Usage:",
        "  validate-self-pin-diff [<expected-sha> <expected-version>]",
        "",
        "Pass both arguments to enable strict validation (added self-pins and",
        "SHA-tag notes must match the given SHA / version), or pass neither for",
        "loose shape-only validation.",
        "",
      ].join("\n"),
    );
    return 1;
  }

  const expectedSha = argv[0];
  const expectedVersion = argv[1];
  const text = readInput();
  try {
    const result = validateUnifiedDiff(text, { expectedSha, expectedVersion });
    if (result.ok) return 0;
    for (const err of result.errors) stderrWrite(`${err}\n`);
    return 1;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stderrWrite(`${message}\n`);
    return 1;
  }
}

function isInvokedDirectly(): boolean {
  const argv1 = process.argv[1];
  if (argv1 === undefined) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isInvokedDirectly()) {
  process.exit(runCli());
}
