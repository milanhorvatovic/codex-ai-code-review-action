import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";

import { describe, expect, it } from "vitest";

const HELPER_PATHS = [
  ".github/actions/verify-release/action.yaml",
  ".github/actions/verify-lockfile-version/action.yaml",
  ".github/workflows/verify-release.yaml",
] as const;

async function readSource(path: string): Promise<string> {
  return readFile(path, "utf-8");
}

function extractEscapeHelperBody(source: string): string {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line.trim() === "escape_workflow_command() {");
  if (start === -1) throw new Error("escape_workflow_command helper not found");

  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) break;
    if (line.trim() === "}") return body.map((entry) => entry.trim()).join("\n");
    body.push(line);
  }
  throw new Error("escape_workflow_command helper was not closed");
}

function extractSingleRunBlock(source: string): string {
  const lines = source.split("\n");
  const runIndex = lines.findIndex((line) => line.trim() === "run: |");
  if (runIndex === -1) throw new Error("run block not found");

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

function withTempPackage(
  files: { packageJson: unknown; packageLockJson: unknown },
  callback: (cwd: string) => void,
): void {
  const cwd = mkdtempSync(join(tmpdir(), "verify-lockfile-version-"));
  try {
    writeFileSync(join(cwd, "package.json"), JSON.stringify(files.packageJson), {
      encoding: "utf-8",
    });
    writeFileSync(join(cwd, "package-lock.json"), JSON.stringify(files.packageLockJson), {
      encoding: "utf-8",
    });
    callback(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function withTempFiles(
  files: Record<string, string>,
  callback: (cwd: string) => void,
): void {
  const cwd = mkdtempSync(join(tmpdir(), "verify-lockfile-version-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(cwd, name), content, { encoding: "utf-8" });
    }
    callback(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function expectFailedAnnotation(result: SpawnSyncReturns<string>, stdoutLines: string[]): void {
  expect(result.status).toBe(1);
  expect(result.stderr).toBe("");
  expect(result.stdout.split("\n").filter((line) => line.length > 0)).toEqual(stdoutLines);
}

describe("verify-lockfile-version composite", () => {
  it("keeps workflow-command escaping helpers in sync", async () => {
    const bodies = await Promise.all(
      HELPER_PATHS.map(async (path) => extractEscapeHelperBody(await readSource(path))),
    );
    expect(new Set(bodies).size).toBe(1);
  });

  it("escapes jq-extracted versions before writing error annotations", async () => {
    const script = extractSingleRunBlock(
      await readSource(".github/actions/verify-lockfile-version/action.yaml"),
    );

    withTempPackage(
      {
        packageJson: { version: "1.0.0\n::warning::pkg" },
        packageLockJson: {
          version: "2.0.0%done\rCR",
          packages: { "": { version: "3.0.0\n::error::root" } },
        },
      },
      (cwd) => {
        const result = spawnSync("bash", ["-c", script], {
          cwd,
          encoding: "utf-8",
        });

        expectFailedAnnotation(result, [
          "::error::package.json=1.0.0%0A::warning::pkg but package-lock.json reports top=2.0.0%25done%0DCR root-pkg=3.0.0%0A::error::root",
        ]);
      },
    );
  });

  it("escapes jq-extracted top version on the missing-metadata error path", async () => {
    const script = extractSingleRunBlock(
      await readSource(".github/actions/verify-lockfile-version/action.yaml"),
    );

    withTempPackage(
      {
        packageJson: { version: "1.0.0" },
        packageLockJson: { version: "1.0.0\n::warning::leak%done\rCR" },
      },
      (cwd) => {
        const result = spawnSync("bash", ["-c", script], {
          cwd,
          encoding: "utf-8",
        });

        expectFailedAnnotation(result, [
          "::error::package-lock.json is missing required version metadata (top='1.0.0%0A::warning::leak%25done%0DCR' root-pkg=''); lockfileVersion 3 must include both.",
        ]);
      },
    );
  });

  it("escapes jq-extracted root package version on the missing-metadata error path", async () => {
    const script = extractSingleRunBlock(
      await readSource(".github/actions/verify-lockfile-version/action.yaml"),
    );

    withTempPackage(
      {
        packageJson: { version: "1.0.0" },
        packageLockJson: {
          packages: { "": { version: "1.0.0\n::warning::root%done\rCR" } },
        },
      },
      (cwd) => {
        const result = spawnSync("bash", ["-c", script], {
          cwd,
          encoding: "utf-8",
        });

        expectFailedAnnotation(result, [
          "::error::package-lock.json is missing required version metadata (top='' root-pkg='1.0.0%0A::warning::root%25done%0DCR'); lockfileVersion 3 must include both.",
        ]);
      },
    );
  });

  it("annotates jq failure when package.json is missing", async () => {
    const script = extractSingleRunBlock(
      await readSource(".github/actions/verify-lockfile-version/action.yaml"),
    );

    withTempFiles(
      {
        "package-lock.json": JSON.stringify({
          version: "1.0.0",
          packages: { "": { version: "1.0.0" } },
        }),
      },
      (cwd) => {
        const result = spawnSync("bash", ["-c", script], { cwd, encoding: "utf-8" });
        expect(result.status).toBe(1);
        expect(result.stdout).toContain(
          "::error::Failed to read version from package.json; ensure the file exists and contains valid JSON",
        );
      },
    );
  });

  it("annotates jq failure when package.json is invalid JSON", async () => {
    const script = extractSingleRunBlock(
      await readSource(".github/actions/verify-lockfile-version/action.yaml"),
    );

    withTempFiles(
      {
        "package.json": "not json",
        "package-lock.json": JSON.stringify({
          version: "1.0.0",
          packages: { "": { version: "1.0.0" } },
        }),
      },
      (cwd) => {
        const result = spawnSync("bash", ["-c", script], { cwd, encoding: "utf-8" });
        expect(result.status).toBe(1);
        expect(result.stdout).toContain(
          "::error::Failed to read version from package.json; ensure the file exists and contains valid JSON",
        );
      },
    );
  });

  it("annotates a missing version field in package.json", async () => {
    const script = extractSingleRunBlock(
      await readSource(".github/actions/verify-lockfile-version/action.yaml"),
    );

    withTempPackage(
      {
        packageJson: { name: "pkg" },
        packageLockJson: {
          version: "1.0.0",
          packages: { "": { version: "1.0.0" } },
        },
      },
      (cwd) => {
        const result = spawnSync("bash", ["-c", script], { cwd, encoding: "utf-8" });
        expectFailedAnnotation(result, [
          "::error::package.json is missing the required 'version' field",
        ]);
      },
    );
  });

  it("treats an explicit null version field as missing", async () => {
    const script = extractSingleRunBlock(
      await readSource(".github/actions/verify-lockfile-version/action.yaml"),
    );

    withTempPackage(
      {
        packageJson: { version: null },
        packageLockJson: {
          version: "1.0.0",
          packages: { "": { version: "1.0.0" } },
        },
      },
      (cwd) => {
        const result = spawnSync("bash", ["-c", script], { cwd, encoding: "utf-8" });
        expectFailedAnnotation(result, [
          "::error::package.json is missing the required 'version' field",
        ]);
      },
    );
  });

  it("annotates jq failure when package-lock.json is missing", async () => {
    const script = extractSingleRunBlock(
      await readSource(".github/actions/verify-lockfile-version/action.yaml"),
    );

    withTempFiles(
      {
        "package.json": JSON.stringify({ version: "1.0.0" }),
      },
      (cwd) => {
        const result = spawnSync("bash", ["-c", script], { cwd, encoding: "utf-8" });
        expect(result.status).toBe(1);
        expect(result.stdout).toContain(
          "::error::Failed to read version from package-lock.json; ensure the file exists and contains valid JSON",
        );
      },
    );
  });

  it("annotates jq failure when package-lock.json is invalid JSON", async () => {
    const script = extractSingleRunBlock(
      await readSource(".github/actions/verify-lockfile-version/action.yaml"),
    );

    withTempFiles(
      {
        "package.json": JSON.stringify({ version: "1.0.0" }),
        "package-lock.json": "not json",
      },
      (cwd) => {
        const result = spawnSync("bash", ["-c", script], { cwd, encoding: "utf-8" });
        expect(result.status).toBe(1);
        expect(result.stdout).toContain(
          "::error::Failed to read version from package-lock.json; ensure the file exists and contains valid JSON",
        );
      },
    );
  });
});
