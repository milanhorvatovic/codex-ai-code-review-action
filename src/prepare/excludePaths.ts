export const EXCLUDE_PATHS_MAX_ENTRIES = 64;

export class ExcludePathsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExcludePathsError";
  }
}

export function parseExcludePaths(raw: string): string[] {
  if (raw.trim() === "") {
    return [];
  }

  const entries: string[] = [];
  const lines = raw.split("\n");
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex] ?? "";
    const cleaned = line.replace(/\r$/, "").trim();
    if (cleaned === "") {
      continue;
    }
    validateEntry(cleaned, lineIndex + 1);
    entries.push(cleaned);
  }

  if (entries.length > EXCLUDE_PATHS_MAX_ENTRIES) {
    throw new ExcludePathsError(
      `received ${entries.length} entries, exceeds the cap of ${EXCLUDE_PATHS_MAX_ENTRIES}`,
    );
  }

  return entries;
}

function validateEntry(entry: string, lineNumber: number): void {
  if (entry.includes("\0")) {
    throw new ExcludePathsError(
      `entry on line ${lineNumber} contains a NUL byte`,
    );
  }
  if (entry.includes("\\")) {
    throw new ExcludePathsError(
      `entry '${entry}' on line ${lineNumber} contains a backslash; use POSIX separators`,
    );
  }
  if (entry.startsWith(":")) {
    throw new ExcludePathsError(
      `entry '${entry}' on line ${lineNumber} starts with ':'; pathspec magic prefixes are reserved`,
    );
  }
  if (entry.startsWith("/")) {
    throw new ExcludePathsError(
      `entry '${entry}' on line ${lineNumber} is absolute; use a workspace-relative pattern`,
    );
  }
  const segments = entry.split("/");
  for (const segment of segments) {
    if (segment === "..") {
      throw new ExcludePathsError(
        `entry '${entry}' on line ${lineNumber} contains a '..' segment`,
      );
    }
  }
}
