import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@actions/github", () => ({
  context: {
    payload: {},
  },
}));

import * as github from "@actions/github";

import { getPullRequestContext } from "./context.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getPullRequestContext", () => {
  it("extracts PR context from payload", () => {
    github.context.payload = {
      pull_request: {
        base: { sha: "base-sha-123" },
        body: "PR description",
        draft: false,
        head: { sha: "head-sha-456" },
        number: 42,
        title: "Add feature X",
        user: { login: "testuser" },
      },
    };

    const result = getPullRequestContext();

    expect(result).toEqual({
      author: "testuser",
      baseSha: "base-sha-123",
      body: "PR description",
      headSha: "head-sha-456",
      isDraft: false,
      number: 42,
      title: "Add feature X",
    });
  });

  it("throws when not a pull_request event", () => {
    github.context.payload = {};

    expect(() => getPullRequestContext()).toThrow(
      "must be triggered by a pull_request event",
    );
  });

  it("handles missing optional fields gracefully", () => {
    github.context.payload = {
      pull_request: {
        base: { sha: "base" },
        draft: true,
        head: { sha: "head" },
        number: 1,
        title: "title",
        user: { login: "user" },
      },
    };

    const result = getPullRequestContext();
    expect(result.body).toBe("");
    expect(result.isDraft).toBe(true);
  });

  it("defaults all nullable fields when payload is minimal", () => {
    github.context.payload = {
      pull_request: {
        number: 1,
      },
    };

    const result = getPullRequestContext();
    expect(result.author).toBe("");
    expect(result.baseSha).toBe("");
    expect(result.body).toBe("");
    expect(result.headSha).toBe("");
    expect(result.isDraft).toBe(false);
    expect(result.title).toBe("");
  });
});
