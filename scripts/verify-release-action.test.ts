import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";

import { describe, expect, it } from "vitest";

const ACTION_PATH = ".github/actions/verify-release/action.yaml";

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

function withTempDir(
  files: Record<string, string>,
  callback: (cwd: string) => void,
): void {
  const cwd = mkdtempSync(join(tmpdir(), "verify-release-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(cwd, name), content, { encoding: "utf-8" });
    }
    callback(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function runScript(script: string, cwd: string, env: Record<string, string>) {
  return spawnSync("bash", ["-c", script], {
    cwd,
    encoding: "utf-8",
    env: { ...process.env, ...env },
  });
}

function expectFailedAnnotation(result: SpawnSyncReturns<string>, stdoutLines: string[]): void {
  expect(result.status).toBe(1);
  expect(result.stderr).toBe("");
  expect(result.stdout.split("\n").filter((line) => line.length > 0)).toEqual(stdoutLines);
}

describe("verify-release composite - validate version consistency", () => {
  it("succeeds when version matches package.json and CHANGELOG.md", async () => {
    const script = extractStepRunBlock(await readSource(ACTION_PATH), "Validate version consistency");

    withTempDir(
      {
        "package.json": JSON.stringify({ version: "1.2.3" }),
        "CHANGELOG.md": "## [1.2.3]\n\n- Test\n",
      },
      (cwd) => {
        const result = runScript(script, cwd, { VERSION: "1.2.3" });
        expect(result.status).toBe(0);
      },
    );
  });

  it("succeeds with a prerelease version", async () => {
    const script = extractStepRunBlock(await readSource(ACTION_PATH), "Validate version consistency");

    withTempDir(
      {
        "package.json": JSON.stringify({ version: "2.0.0-rc.1" }),
        "CHANGELOG.md": "## [2.0.0-rc.1]\n\n- RC\n",
      },
      (cwd) => {
        const result = runScript(script, cwd, { VERSION: "2.0.0-rc.1" });
        expect(result.status).toBe(0);
      },
    );
  });

  it("rejects an empty version input", async () => {
    const script = extractStepRunBlock(await readSource(ACTION_PATH), "Validate version consistency");

    withTempDir(
      {
        "package.json": JSON.stringify({ version: "1.0.0" }),
        "CHANGELOG.md": "## [1.0.0]\n",
      },
      (cwd) => {
        const result = runScript(script, cwd, { VERSION: "" });
        expectFailedAnnotation(result, [
          "::error::verify-release received an empty version input",
        ]);
      },
    );
  });

  it("rejects a non-semver version input", async () => {
    const script = extractStepRunBlock(await readSource(ACTION_PATH), "Validate version consistency");

    withTempDir(
      {
        "package.json": JSON.stringify({ version: "1.0.0" }),
        "CHANGELOG.md": "## [1.0.0]\n",
      },
      (cwd) => {
        const result = runScript(script, cwd, { VERSION: "not-semver" });
        expect(result.status).toBe(1);
        expect(result.stdout).toContain("::error::verify-release received a non-semver version input:");
      },
    );
  });

  it("rejects a version with a leading v", async () => {
    const script = extractStepRunBlock(await readSource(ACTION_PATH), "Validate version consistency");

    withTempDir(
      {
        "package.json": JSON.stringify({ version: "1.0.0" }),
        "CHANGELOG.md": "## [1.0.0]\n",
      },
      (cwd) => {
        const result = runScript(script, cwd, { VERSION: "v1.0.0" });
        expect(result.status).toBe(1);
        expect(result.stdout).toContain("::error::verify-release received a non-semver version input:");
      },
    );
  });

  it("rejects a version with build metadata", async () => {
    const script = extractStepRunBlock(await readSource(ACTION_PATH), "Validate version consistency");

    withTempDir(
      {
        "package.json": JSON.stringify({ version: "1.0.0" }),
        "CHANGELOG.md": "## [1.0.0]\n",
      },
      (cwd) => {
        const result = runScript(script, cwd, { VERSION: "1.0.0+build.5" });
        expect(result.status).toBe(1);
        expect(result.stdout).toContain("::error::verify-release received a non-semver version input:");
      },
    );
  });

  it("rejects a version with leading zeros in patch", async () => {
    const script = extractStepRunBlock(await readSource(ACTION_PATH), "Validate version consistency");

    withTempDir(
      {
        "package.json": JSON.stringify({ version: "1.0.0" }),
        "CHANGELOG.md": "## [1.0.0]\n",
      },
      (cwd) => {
        const result = runScript(script, cwd, { VERSION: "1.0.01" });
        expect(result.status).toBe(1);
        expect(result.stdout).toContain("::error::verify-release received a non-semver version input:");
      },
    );
  });

  it("rejects a version mismatch with package.json", async () => {
    const script = extractStepRunBlock(await readSource(ACTION_PATH), "Validate version consistency");

    withTempDir(
      {
        "package.json": JSON.stringify({ version: "2.0.0" }),
        "CHANGELOG.md": "## [1.0.0]\n\n- Test\n",
      },
      (cwd) => {
        const result = runScript(script, cwd, { VERSION: "1.0.0" });
        expectFailedAnnotation(result, [
          "::error::input version=1.0.0 but package.json=2.0.0",
        ]);
      },
    );
  });

  it("rejects a version mismatch with CHANGELOG.md", async () => {
    const script = extractStepRunBlock(await readSource(ACTION_PATH), "Validate version consistency");

    withTempDir(
      {
        "package.json": JSON.stringify({ version: "1.0.0" }),
        "CHANGELOG.md": "## [2.0.0]\n\n- Other\n",
      },
      (cwd) => {
        const result = runScript(script, cwd, { VERSION: "1.0.0" });
        expectFailedAnnotation(result, [
          "::error::input version=1.0.0 but top CHANGELOG section=[2.0.0]",
        ]);
      },
    );
  });

  it("rejects when CHANGELOG.md has no version sections", async () => {
    const script = extractStepRunBlock(await readSource(ACTION_PATH), "Validate version consistency");

    withTempDir(
      {
        "package.json": JSON.stringify({ version: "1.0.0" }),
        "CHANGELOG.md": "# Changelog\n\nSome intro text.\n",
      },
      (cwd) => {
        const result = runScript(script, cwd, { VERSION: "1.0.0" });
        expectFailedAnnotation(result, [
          "::error::input version=1.0.0 but top CHANGELOG section=[]",
        ]);
      },
    );
  });

  it("annotates jq failure when package.json is missing", async () => {
    const script = extractStepRunBlock(await readSource(ACTION_PATH), "Validate version consistency");

    withTempDir(
      {
        "CHANGELOG.md": "## [1.0.0]\n",
      },
      (cwd) => {
        const result = runScript(script, cwd, { VERSION: "1.0.0" });
        expect(result.status).toBe(1);
        expect(result.stdout).toContain(
          "::error::Failed to read version from package.json; ensure the file exists and contains valid JSON",
        );
      },
    );
  });

  it("annotates jq failure when package.json is invalid JSON", async () => {
    const script = extractStepRunBlock(await readSource(ACTION_PATH), "Validate version consistency");

    withTempDir(
      {
        "package.json": "not json",
        "CHANGELOG.md": "## [1.0.0]\n",
      },
      (cwd) => {
        const result = runScript(script, cwd, { VERSION: "1.0.0" });
        expect(result.status).toBe(1);
        expect(result.stdout).toContain(
          "::error::Failed to read version from package.json; ensure the file exists and contains valid JSON",
        );
      },
    );
  });

  it("annotates a missing version field in package.json", async () => {
    const script = extractStepRunBlock(await readSource(ACTION_PATH), "Validate version consistency");

    withTempDir(
      {
        "package.json": JSON.stringify({ name: "pkg" }),
        "CHANGELOG.md": "## [1.0.0]\n",
      },
      (cwd) => {
        const result = runScript(script, cwd, { VERSION: "1.0.0" });
        expectFailedAnnotation(result, [
          "::error::package.json is missing the required 'version' field",
        ]);
      },
    );
  });

  it("treats an explicit null version field as missing", async () => {
    const script = extractStepRunBlock(await readSource(ACTION_PATH), "Validate version consistency");

    withTempDir(
      {
        "package.json": JSON.stringify({ version: null }),
        "CHANGELOG.md": "## [1.0.0]\n",
      },
      (cwd) => {
        const result = runScript(script, cwd, { VERSION: "1.0.0" });
        expectFailedAnnotation(result, [
          "::error::package.json is missing the required 'version' field",
        ]);
      },
    );
  });

  it("annotates a missing CHANGELOG.md as a dedicated error", async () => {
    const script = extractStepRunBlock(await readSource(ACTION_PATH), "Validate version consistency");

    withTempDir(
      {
        "package.json": JSON.stringify({ version: "1.0.0" }),
      },
      (cwd) => {
        const result = runScript(script, cwd, { VERSION: "1.0.0" });
        expect(result.status).toBe(1);
        expect(result.stdout).toContain(
          "::error::CHANGELOG.md not found in",
        );
        expect(result.stdout).not.toContain("top CHANGELOG section=[]");
      },
    );
  });

  it("escapes malicious package.json version in error annotation", async () => {
    const script = extractStepRunBlock(await readSource(ACTION_PATH), "Validate version consistency");

    withTempDir(
      {
        "package.json": JSON.stringify({ version: "1.0.0\n::warning::pkg%done\rCR" }),
        "CHANGELOG.md": "## [1.0.0]\n",
      },
      (cwd) => {
        const result = runScript(script, cwd, { VERSION: "1.0.0" });
        expect(result.status).toBe(1);
        expect(result.stdout).toContain("package.json=1.0.0%0A::warning::pkg%25done%0DCR");
        expect(
          result.stdout.split("\n").find((line) => line.startsWith("::warning::")),
        ).toBeUndefined();
      },
    );
  });

  it("escapes malicious CHANGELOG version in error annotation", async () => {
    const script = extractStepRunBlock(await readSource(ACTION_PATH), "Validate version consistency");

    withTempDir(
      {
        "package.json": JSON.stringify({ version: "1.0.0" }),
        "CHANGELOG.md": "## [1.0.0\n::error::leak%done]\n",
      },
      (cwd) => {
        const result = runScript(script, cwd, { VERSION: "2.0.0" });
        expect(result.status).toBe(1);
        const annotation = result.stdout
          .split("\n")
          .find((line) => line.startsWith("::error::"));
        expect(annotation).toBeDefined();
        expect(annotation).not.toContain("::error::leak");
      },
    );
  });

  it("escapes malicious version input in non-semver error annotation", async () => {
    const script = extractStepRunBlock(await readSource(ACTION_PATH), "Validate version consistency");

    withTempDir(
      {
        "package.json": JSON.stringify({ version: "1.0.0" }),
        "CHANGELOG.md": "## [1.0.0]\n",
      },
      (cwd) => {
        const result = runScript(script, cwd, {
          VERSION: "1.0.0\n::warning::inject%done\rCR",
        });
        expect(result.status).toBe(1);
        expect(result.stdout).toContain("1.0.0%0A::warning::inject%25done%0DCR");
        expect(
          result.stdout.split("\n").find((line) => line.startsWith("::warning::")),
        ).toBeUndefined();
      },
    );
  });

  it("picks the first CHANGELOG section when multiple exist", async () => {
    const script = extractStepRunBlock(await readSource(ACTION_PATH), "Validate version consistency");

    withTempDir(
      {
        "package.json": JSON.stringify({ version: "2.0.0" }),
        "CHANGELOG.md": "## [2.0.0]\n\n- New\n\n## [1.0.0]\n\n- Old\n",
      },
      (cwd) => {
        const result = runScript(script, cwd, { VERSION: "2.0.0" });
        expect(result.status).toBe(0);
      },
    );
  });
});
