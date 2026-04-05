import { describe, expect, it } from "vitest";

import { isAuthorAllowed } from "./allowlist.js";

describe("isAuthorAllowed", () => {
  it("returns true when allowlist is empty", () => {
    expect(isAuthorAllowed("", "anyone")).toBe(true);
  });

  it("returns true when allowlist is only whitespace", () => {
    expect(isAuthorAllowed("   ", "anyone")).toBe(true);
  });

  it("returns true for an exact match", () => {
    expect(isAuthorAllowed("alice", "alice")).toBe(true);
  });

  it("matches case-insensitively with mixed case author", () => {
    expect(isAuthorAllowed("alice", "Alice")).toBe(true);
  });

  it("matches case-insensitively with mixed case list", () => {
    expect(isAuthorAllowed("Alice", "alice")).toBe(true);
  });

  it("matches case-insensitively with both mixed case", () => {
    expect(isAuthorAllowed("ALICE,BOB", "bob")).toBe(true);
  });

  it("handles comma-separated list", () => {
    expect(isAuthorAllowed("alice,bob,charlie", "bob")).toBe(true);
  });

  it("handles newline-separated list", () => {
    expect(isAuthorAllowed("alice\nbob\ncharlie", "charlie")).toBe(true);
  });

  it("handles tab-separated list", () => {
    expect(isAuthorAllowed("alice\tbob\tcharlie", "alice")).toBe(true);
  });

  it("handles mixed separators", () => {
    expect(isAuthorAllowed("alice,bob\ncharlie\tdave", "dave")).toBe(true);
  });

  it("trims whitespace around entries", () => {
    expect(isAuthorAllowed("  alice , bob , charlie  ", "bob")).toBe(true);
  });

  it("returns false when author is not in list", () => {
    expect(isAuthorAllowed("alice,bob", "charlie")).toBe(false);
  });

  it("returns false for partial match", () => {
    expect(isAuthorAllowed("alice", "ali")).toBe(false);
  });
});
