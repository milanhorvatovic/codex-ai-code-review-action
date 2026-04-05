const SEPARATORS = /[,\n\r\t]/;

export function isAuthorAllowed(allowlist: string, author: string): boolean {
  if (allowlist.trim() === "") {
    return true;
  }

  const entries = allowlist
    .split(SEPARATORS)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== "");

  return entries.includes(author.toLowerCase());
}
