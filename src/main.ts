import * as core from "@actions/core";

async function run(): Promise<void> {
  core.info("Codex Code Review Action");
}

run().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
