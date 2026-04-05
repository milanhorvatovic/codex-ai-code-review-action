import { getExecOutput } from "@actions/exec";

export async function fetchBaseSha(
  baseSha: string,
  token: string,
): Promise<void> {
  const check = await getExecOutput("git", [
    "cat-file",
    "-e",
    `${baseSha}^{commit}`,
  ], { ignoreReturnCode: true });

  if (check.exitCode !== 0) {
    const credentials = Buffer.from(`x-access-token:${token}`).toString("base64");
    const extraHeader = `AUTHORIZATION: basic ${credentials}`;
    await getExecOutput("git", [
      "-c", `http.https://github.com/.extraheader=${extraHeader}`,
      "fetch",
      "--no-tags",
      "--depth=1",
      "origin",
      baseSha,
    ]);
  }
}

export async function buildDiff(
  baseSha: string,
  headSha: string,
): Promise<string> {
  const result = await getExecOutput("git", [
    "diff",
    "--no-color",
    "--unified=3",
    `${baseSha}...${headSha}`,
  ]);
  return result.stdout;
}

const DIFF_HEADER = "diff --git ";

export function splitDiff(diff: string, maxChunkBytes: number): string[] {
  if (diff === "") {
    return [""];
  }

  const fileSections: string[] = [];
  const parts = diff.split(DIFF_HEADER);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === "") {
      continue;
    }
    fileSections.push(DIFF_HEADER + part);
  }

  if (fileSections.length === 0) {
    return [""];
  }

  const chunks: string[] = [];
  let currentChunk = "";

  for (const section of fileSections) {
    const sectionBytes = Buffer.byteLength(section, "utf-8");
    const currentBytes = Buffer.byteLength(currentChunk, "utf-8");

    if (currentChunk === "") {
      currentChunk = section;
    } else if (currentBytes + sectionBytes <= maxChunkBytes) {
      currentChunk += section;
    } else {
      chunks.push(currentChunk);
      currentChunk = section;
    }
  }

  if (currentChunk !== "") {
    chunks.push(currentChunk);
  }

  return chunks;
}

export function buildChunkMatrix(chunkCount: number): string {
  const include = Array.from({ length: chunkCount }, (_, i) => ({
    chunk: i,
  }));
  return JSON.stringify({ include });
}
