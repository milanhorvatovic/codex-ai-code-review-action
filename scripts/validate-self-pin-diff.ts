import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { SELF_REPO_REGEX_SOURCE } from "./self-repo.js";

// Capture group 1 (`owner + optional /sub`) is preserved verbatim in the masked output
// so changes to the action subpath (e.g. `.../prepare@SHA` → `.../review@SHA`) produce
// different masked strings and fail validation. Only the SHA and the optional `# vSEMVER`
// tag comment are absorbed by the placeholder. The tag comment is restricted to a
// semver-shaped vX.Y.Z[-PRE] form so an attacker can't smuggle arbitrary trailing text
// past the masker by formatting it as a `#`-prefixed comment.
const SELF_PIN_PATTERN = new RegExp(
  `(${SELF_REPO_REGEX_SOURCE}(?:\\/[\\w./-]+?)?)@[0-9a-f]{40}(?:[ \\t]*#[ \\t]*v\\d+\\.\\d+\\.\\d+(?:-[\\w.-]+)?)?`,
  "g",
);

const SHA_TAG_NOTE_PATTERN =
  /# SHA corresponds to tag v\d+\.\d+\.\d+(?:-[\w.-]+)? — update when adopting a new release\./g;

const SHA_TAG_NOTE_MASK = "<sha-tag-note>";

export type ValidateResult = { ok: true } | { ok: false; errors: string[] };

function maskLine(line: string): { masked: string; matched: boolean } {
  let matched = false;
  let masked = line.replace(SELF_PIN_PATTERN, (_match, ownerSub: string) => {
    matched = true;
    return `${ownerSub}@<sha-and-tag>`;
  });
  masked = masked.replace(SHA_TAG_NOTE_PATTERN, () => {
    matched = true;
    return SHA_TAG_NOTE_MASK;
  });
  return { masked, matched };
}

export function validateUnifiedDiff(text: string): ValidateResult {
  const errors: string[] = [];
  const lines = text.split("\n");
  let inHunk = false;
  let currentPath = "<unknown>";
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) break;
    if (line.startsWith("diff --git ")) {
      const match = /^diff --git a\/(.+?) b\//.exec(line);
      currentPath = match?.[1] ?? "<unknown>";
      inHunk = false;
      i++;
      continue;
    }
    if (line.startsWith("@@")) {
      inHunk = true;
      i++;
      continue;
    }
    if (
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
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
        const oldMask = maskLine(oldLine);
        const newMask = maskLine(newLine);
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
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true };
}

export type RunCliDeps = {
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
  const readInput = deps.readInput ?? defaultReadInput;
  const stderrWrite = deps.stderrWrite ?? defaultStderrWrite;
  const text = readInput();
  const result = validateUnifiedDiff(text);
  if (result.ok) return 0;
  for (const err of result.errors) stderrWrite(`${err}\n`);
  return 1;
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
