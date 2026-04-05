import * as fs from "node:fs";

import * as core from "@actions/core";

import { getPublishInputs } from "../config/inputs.js";
import type { ReviewOutput } from "../config/types.js";
import { publishReview } from "../github/review.js";

const REVIEW_OUTPUT_FILE = ".codex/review-output.json";
const DIFF_FILE = ".codex/pr.diff";

async function run(): Promise<void> {
  const inputs = getPublishInputs();

  if (!fs.existsSync(REVIEW_OUTPUT_FILE)) {
    core.setFailed(
      "Merged review output is missing. Did the review action run and upload artifacts?",
    );
    return;
  }

  const rawReview = fs.readFileSync(REVIEW_OUTPUT_FILE, "utf8");
  let reviewOutput: ReviewOutput;
  try {
    reviewOutput = JSON.parse(rawReview) as ReviewOutput;
  } catch {
    core.setFailed("Merged review output is not valid JSON.");
    return;
  }

  core.setOutput("review-file", REVIEW_OUTPUT_FILE);

  const diffText = fs.existsSync(DIFF_FILE)
    ? fs.readFileSync(DIFF_FILE, "utf8")
    : "";

  const runUrl = `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${process.env.GITHUB_REPOSITORY ?? ""}/actions/runs/${process.env.GITHUB_RUN_ID ?? ""}`;

  await publishReview({
    diffText,
    githubToken: inputs.githubToken,
    maxComments: inputs.maxComments,
    minConfidence: inputs.minConfidence,
    model: inputs.model,
    reviewEffort: inputs.reviewEffort,
    reviewOutput,
    runUrl,
  });

  core.setOutput("published", "true");
}

run().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
