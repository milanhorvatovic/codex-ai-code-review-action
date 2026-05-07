import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";

import { describe, expect, it } from "vitest";

const WORKFLOW_PATH = ".github/workflows/verify-release.yaml";

async function readSource(path: string): Promise<string> {
  return readFile(path, "utf-8");
}

function extractStepRunBlock(source: string, stepName: string): string {
  const lines = source.split("\n");
  const nameLine = `- name: ${stepName}`;
  const nameIndex = lines.findIndex((line) => line.trim() === nameLine);
  if (nameIndex === -1) throw new Error(`Step "${stepName}" not found`);

  let runIndex = -1;
  for (let i = nameIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) break;
    if (line.trim() === "run: |") {
      runIndex = i;
      break;
    }
    if (line.trim().startsWith("- name:") || line.trim().startsWith("- uses:")) break;
  }
  if (runIndex === -1) throw new Error(`run block for step "${stepName}" not found`);

  const runIndent = lines[runIndex]?.match(/^\s*/)?.[0].length ?? 0;
  const bodyIndent = runIndent + 2;
  const body: string[] = [];
  for (let i = runIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) break;
    if (line.trim().length === 0) {
      body.push("");
      continue;
    }
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    if (indent <= runIndent) break;
    body.push(line.slice(bodyIndent));
  }
  return `${body.join("\n")}\n`;
}

function withGithubOutput(callback: (outputPath: string) => SpawnSyncReturns<string>): {
  result: SpawnSyncReturns<string>;
  output: string;
} {
  const cwd = mkdtempSync(join(tmpdir(), "verify-release-workflow-"));
  const outputPath = join(cwd, "github-output");
  writeFileSync(outputPath, "", { encoding: "utf-8" });
  try {
    const result = callback(outputPath);
    const output = readFileSync(outputPath, "utf-8");
    return { result, output };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function runValidate(script: string, sha: string): { result: SpawnSyncReturns<string>; output: string } {
  return withGithubOutput((outputPath) =>
    spawnSync("bash", ["-c", script], {
      encoding: "utf-8",
      env: { ...process.env, SHA: sha, GITHUB_OUTPUT: outputPath },
    }),
  );
}

const LOWERCASE_SHA = "0123456789abcdef0123456789abcdef01234567";
const UPPERCASE_SHA = "0123456789ABCDEF0123456789ABCDEF01234567";
const MIXED_CASE_SHA = "0123456789AbCdEf0123456789aBcDeF01234567";

describe("verify-release workflow - validate sha input", () => {
  it("accepts a lowercase SHA and writes it to GITHUB_OUTPUT unchanged", async () => {
    const script = extractStepRunBlock(await readSource(WORKFLOW_PATH), "Validate sha input");
    const { result, output } = runValidate(script, LOWERCASE_SHA);
    expect(result.status).toBe(0);
    expect(output.trim()).toBe(`sha=${LOWERCASE_SHA}`);
  });

  it("accepts an uppercase SHA and normalizes it to lowercase", async () => {
    const script = extractStepRunBlock(await readSource(WORKFLOW_PATH), "Validate sha input");
    const { result, output } = runValidate(script, UPPERCASE_SHA);
    expect(result.status).toBe(0);
    expect(output.trim()).toBe(`sha=${LOWERCASE_SHA}`);
  });

  it("accepts a mixed-case SHA and normalizes it to lowercase", async () => {
    const script = extractStepRunBlock(await readSource(WORKFLOW_PATH), "Validate sha input");
    const { result, output } = runValidate(script, MIXED_CASE_SHA);
    expect(result.status).toBe(0);
    expect(output.trim()).toBe(`sha=${LOWERCASE_SHA}`);
  });

  it("rejects a SHA that is one character too short", async () => {
    const script = extractStepRunBlock(await readSource(WORKFLOW_PATH), "Validate sha input");
    const { result, output } = runValidate(script, LOWERCASE_SHA.slice(0, 39));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("::error::Input 'sha' must be a full SHA-1 commit ID (40 hex chars).");
    expect(output).toBe("");
  });

  it("rejects a SHA that is one character too long", async () => {
    const script = extractStepRunBlock(await readSource(WORKFLOW_PATH), "Validate sha input");
    const { result, output } = runValidate(script, `${LOWERCASE_SHA}f`);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("::error::Input 'sha' must be a full SHA-1 commit ID (40 hex chars).");
    expect(output).toBe("");
  });

  it("rejects a 40-char input that contains a non-hex character", async () => {
    const script = extractStepRunBlock(await readSource(WORKFLOW_PATH), "Validate sha input");
    const { result, output } = runValidate(script, `g${LOWERCASE_SHA.slice(1)}`);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("::error::Input 'sha' must be a full SHA-1 commit ID (40 hex chars).");
    expect(output).toBe("");
  });

  it("rejects a branch ref name", async () => {
    const script = extractStepRunBlock(await readSource(WORKFLOW_PATH), "Validate sha input");
    const { result, output } = runValidate(script, "main");
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("::error::Input 'sha' must be a full SHA-1 commit ID (40 hex chars).");
    expect(result.stdout).toContain("Got: main");
    expect(output).toBe("");
  });

  it("escapes injection payloads in the rejection annotation", async () => {
    const script = extractStepRunBlock(await readSource(WORKFLOW_PATH), "Validate sha input");
    const { result, output } = runValidate(script, "release/v1.0.0\n::warning::leak%done\rCR");
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Got: release/v1.0.0%0A::warning::leak%25done%0DCR");
    expect(
      result.stdout.split("\n").find((line) => line.startsWith("::warning::")),
    ).toBeUndefined();
    expect(output).toBe("");
  });
});
