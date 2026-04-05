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

  return {
    author: String(pr.user?.login ?? ""),
    baseSha: String(pr.base?.sha ?? ""),
    body: String(pr.body ?? ""),
    headSha: String(pr.head?.sha ?? ""),
    isDraft: Boolean(pr.draft),
    number: Number(pr.number),
    title: String(pr.title ?? ""),
  };
}
