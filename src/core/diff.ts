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
  let currentBytes = 0;

  for (const section of fileSections) {
    const sectionBytes = Buffer.byteLength(section, "utf-8");

    if (currentChunk === "") {
      currentChunk = section;
      currentBytes = sectionBytes;
    } else if (currentBytes + sectionBytes <= maxChunkBytes) {
      currentChunk += section;
      currentBytes += sectionBytes;
    } else {
      chunks.push(currentChunk);
      currentChunk = section;
      currentBytes = sectionBytes;
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
