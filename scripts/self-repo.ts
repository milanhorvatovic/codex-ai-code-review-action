// Canonical identity of this repository. Centralized so a fork or rename only needs to
// update one line — every consumer (refresh-self-pins, validate-self-pin-diff,
// verify-doc-pins, prepare-release) imports from here.

export const SELF_REPO = "milanhorvatovic/codex-ai-code-review-action";

// Regex-escaped form of `SELF_REPO` for embedding inside a RegExp source string.
// Only `/` needs escaping — the repo identifier contains no other regex metacharacters,
// but the guard below catches any future drift that would silently produce an
// unanchored or malformed pattern.
function regexEscape(input: string): string {
  if (/[.*+?^${}()|[\]\\]/.test(input)) {
    throw new Error(
      `SELF_REPO contains regex metacharacters that need explicit escaping: ${input}`,
    );
  }
  return input.replace(/\//g, "\\/");
}

export const SELF_REPO_REGEX_SOURCE = regexEscape(SELF_REPO);
