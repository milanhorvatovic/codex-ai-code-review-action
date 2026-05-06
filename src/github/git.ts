import * as core from "@actions/core";
import { getExecOutput } from "@actions/exec";

export async function fetchBaseSha(
  baseSha: string,
  token: string,
): Promise<void> {
  const check = await getExecOutput("git", [
    "cat-file",
    "-e",
    `${baseSha}^{commit}`,
  ], { ignoreReturnCode: true, silent: true });

  if (check.exitCode !== 0) {
    const authArgs: string[] = [];
    if (token) {
      const credentials = Buffer.from(`x-access-token:${token}`).toString("base64");
      core.setSecret(credentials);
      const host = process.env.GITHUB_SERVER_URL ?? "https://github.com";
      const extraHeader = `AUTHORIZATION: basic ${credentials}`;
      authArgs.push("-c", `http.${host}/.extraheader=${extraHeader}`);
    }

    const isShallow = await getExecOutput("git", [
      "rev-parse",
      "--is-shallow-repository",
    ], { ignoreReturnCode: true, silent: true });

    const shallow = isShallow.stdout.trim() === "true";
    const depthArgs = shallow
      ? ["--deepen=50"]
      : ["--depth=50"];

    await getExecOutput("git", [
      ...authArgs,
      "fetch",
      "--no-tags",
      ...depthArgs,
      "origin",
      baseSha,
    ], { silent: true });
  }
}

export async function buildDiff(
  baseSha: string,
  headSha: string,
  excludePaths: readonly string[] = [],
): Promise<string> {
  const args = [
    "diff",
    "--no-color",
    "--unified=3",
    `${baseSha}...${headSha}`,
  ];
  if (excludePaths.length > 0) {
    args.push("--", ".");
    for (const pattern of excludePaths) {
      args.push(`:(exclude)${pattern}`);
    }
  }
  const result = await getExecOutput("git", args, { silent: true });
  return result.stdout;
}

export type TreeEntryType = "blob" | "tree" | "commit";

function isTreeEntryType(value: string): value is TreeEntryType {
  return value === "blob" || value === "tree" || value === "commit";
}

export interface PathAtShaInfo {
  mode: string;
  objectId: string;
  sizeBytes: number;
  type: TreeEntryType;
}

export async function statPathAtSha(sha: string, repoPath: string): Promise<PathAtShaInfo> {
  const lsTree = await getExecOutput(
    "git",
    ["--literal-pathspecs", "ls-tree", "-z", "--full-tree", sha, "--", repoPath],
    { ignoreReturnCode: true, silent: true },
  );
  if (lsTree.exitCode !== 0) {
    const stderr = lsTree.stderr.trim();
    throw new Error(
      stderr === ""
        ? `git ls-tree failed for '${repoPath}' at ${sha} (exit ${lsTree.exitCode})`
        : `git ls-tree failed for '${repoPath}' at ${sha}: ${stderr}`,
    );
  }
  const stdout = lsTree.stdout.replace(/\0$/, "");
  if (stdout === "") {
    throw new Error(`path '${repoPath}' does not exist at ${sha}`);
  }
  const tabIndex = stdout.indexOf("\t");
  const meta = tabIndex === -1 ? stdout : stdout.slice(0, tabIndex);
  const parts = meta.split(" ");
  const mode = parts[0] ?? "";
  const rawType = parts[1] ?? "";
  const objectId = parts[2] ?? "";

  if (!isTreeEntryType(rawType)) {
    throw new Error(
      `git ls-tree returned unexpected entry type '${rawType}' for '${repoPath}' at ${sha}`,
    );
  }
  const type = rawType;

  let sizeBytes = 0;
  if (type === "blob") {
    const catFileSize = await getExecOutput(
      "git",
      ["cat-file", "-s", objectId],
      { ignoreReturnCode: true, silent: true },
    );
    if (catFileSize.exitCode !== 0) {
      const stderr = catFileSize.stderr.trim();
      throw new Error(
        stderr === ""
          ? `git cat-file -s failed for blob ${objectId} (exit ${catFileSize.exitCode})`
          : `git cat-file -s failed for blob ${objectId}: ${stderr}`,
      );
    }
    sizeBytes = Number.parseInt(catFileSize.stdout.trim(), 10);
    if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
      throw new Error(
        `git cat-file -s returned non-numeric size for blob ${objectId}: ${catFileSize.stdout}`,
      );
    }
  }

  return { mode, objectId, sizeBytes, type };
}

export async function readBlobBySha(objectId: string): Promise<string> {
  const catFile = await getExecOutput(
    "git",
    ["cat-file", "blob", objectId],
    { ignoreReturnCode: true, silent: true },
  );
  if (catFile.exitCode !== 0) {
    const stderr = catFile.stderr.trim();
    throw new Error(
      stderr === ""
        ? `git cat-file failed for blob ${objectId} (exit ${catFile.exitCode})`
        : `git cat-file failed for blob ${objectId}: ${stderr}`,
    );
  }
  return catFile.stdout;
}
