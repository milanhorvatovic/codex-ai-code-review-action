// Canonical identity of this repository. Centralized so a fork or rename only needs to
// update one line — every consumer (refresh-self-pins, validate-self-pin-diff,
// verify-doc-pins, prepare-release) imports from here.

export const SELF_REPO = "milanhorvatovic/codex-ai-code-review-action";

// Regex-escape every JS regex metacharacter (and `/` for regex-literal compatibility) so
// the result is safe to embed inside a `new RegExp(...)` source string regardless of
// which valid GitHub-repo characters appear in the input. Standard `escapeRegExp`-style
// transformation; exported for direct testing.
export function escapeRegex(input: string): string {
  return input.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");
}

export const SELF_REPO_REGEX_SOURCE = escapeRegex(SELF_REPO);
