import { describe, expect, it } from "vitest";

import { buildChunkMatrix, splitDiff } from "./diff.js";

describe("splitDiff", () => {
  it("returns a single empty string for an empty diff", () => {
    expect(splitDiff("", 1024)).toEqual([""]);
  });

  it("keeps a single small file in one chunk", () => {
    const diff = "diff --git a/file.ts b/file.ts\n+hello\n";
    const result = splitDiff(diff, 1024);
    expect(result).toEqual([diff]);
  });

  it("keeps multiple files within budget in one chunk", () => {
    const file1 = "diff --git a/a.ts b/a.ts\n+line1\n";
    const file2 = "diff --git a/b.ts b/b.ts\n+line2\n";
    const diff = file1 + file2;
    const result = splitDiff(diff, 1024);
    expect(result).toEqual([diff]);
  });

  it("gives a file exceeding budget its own chunk", () => {
    const small = "diff --git a/small.ts b/small.ts\n+ok\n";
    const large = "diff --git a/large.ts b/large.ts\n" + "+".repeat(200) + "\n";
    const diff = small + large;

    const budget = Buffer.byteLength(small, "utf-8") + 10;
    const result = splitDiff(diff, budget);

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(small);
    expect(result[1]).toBe(large);
  });

  it("splits multiple files across chunks when budget exceeded", () => {
    const file1 = "diff --git a/a.ts b/a.ts\n+aaaa\n";
    const file2 = "diff --git a/b.ts b/b.ts\n+bbbb\n";
    const file3 = "diff --git a/c.ts b/c.ts\n+cccc\n";
    const diff = file1 + file2 + file3;

    const singleFileBytes = Buffer.byteLength(file1, "utf-8");
    const budget = singleFileBytes * 2 - 1;
    const result = splitDiff(diff, budget);

    expect(result).toHaveLength(3);
    expect(result[0]).toBe(file1);
    expect(result[1]).toBe(file2);
    expect(result[2]).toBe(file3);
  });

  it("handles diff that starts with header prefix only", () => {
    const diff = "diff --git a/file.ts b/file.ts\n";
    const result = splitDiff(diff, 1024);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("diff --git ");
  });

  it("counts bytes accurately with multi-byte characters", () => {
    const file1 = "diff --git a/a.ts b/a.ts\n+hello\n";
    const file2 = "diff --git a/b.ts b/b.ts\n+héllo wörld 🎉\n";
    const diff = file1 + file2;

    const file1Bytes = Buffer.byteLength(file1, "utf-8");
    const file2Bytes = Buffer.byteLength(file2, "utf-8");

    expect(file2Bytes).toBeGreaterThan(file2.length);

    const budget = file1Bytes + file2Bytes;
    const combined = splitDiff(diff, budget);
    expect(combined).toHaveLength(1);

    const tight = splitDiff(diff, budget - 1);
    expect(tight).toHaveLength(2);
  });
});

describe("buildChunkMatrix", () => {
  it("produces correct JSON for a single chunk", () => {
    const result = buildChunkMatrix(1);
    expect(JSON.parse(result)).toEqual({ include: [{ chunk: 0 }] });
  });

  it("produces correct JSON for multiple chunks", () => {
    const result = buildChunkMatrix(3);
    expect(JSON.parse(result)).toEqual({
      include: [{ chunk: 0 }, { chunk: 1 }, { chunk: 2 }],
    });
  });

  it("matches the expected format string", () => {
    const result = buildChunkMatrix(2);
    expect(result).toBe('{"include":[{"chunk":0},{"chunk":1}]}');
  });
});
