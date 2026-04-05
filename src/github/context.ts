import * as github from "@actions/github";

import type { PrContext } from "../config/types.js";

export function getPullRequestContext(): PrContext {
  const { payload } = github.context;
  const pr = payload.pull_request;

  if (!pr) {
    throw new Error(
      "This action must be triggered by a pull_request event. No pull request payload found.",
    );
  }

  const baseSha = String(pr.base?.sha ?? "");
  if (!baseSha) {
    throw new Error("Pull request payload is missing base SHA.");
  }

  const headSha = String(pr.head?.sha ?? "");
  if (!headSha) {
    throw new Error("Pull request payload is missing head SHA.");
  }

  const number = Number(pr.number);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`Pull request payload has invalid number: ${String(pr.number)}`);
  }

  return {
    author: String(pr.user?.login ?? ""),
    baseSha,
    body: String(pr.body ?? ""),
    headSha,
    isDraft: Boolean(pr.draft),
    number,
    title: String(pr.title ?? ""),
  };
}
