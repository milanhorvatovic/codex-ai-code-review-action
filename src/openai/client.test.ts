import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();

vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      responses = { create: mockCreate };
    },
  };
});

vi.mock("@actions/core", () => ({
  info: vi.fn(),
}));

import type { ReviewOutput } from "../config/types.js";
import { reviewChunk } from "./client.js";

const validReview: ReviewOutput = {
  changes: ["Added validation"],
  files: [{ description: "Main file", path: "src/main.ts" }],
  findings: [],
  model: "test-model",
  overall_confidence_score: 0.95,
  overall_correctness: "patch is correct",
  summary: "Test summary",
};

beforeEach(() => {
  mockCreate.mockReset();
});

describe("reviewChunk", () => {
  it("parses a valid response", async () => {
    mockCreate.mockResolvedValueOnce({
      output: [
        {
          content: [
            { text: JSON.stringify(validReview), type: "output_text" },
          ],
          type: "message",
        },
      ],
    });

    const result = await reviewChunk("test prompt", {}, "test-model", "key");
    expect(result).toEqual(validReview);
  });

  it("throws on unexpected response structure", async () => {
    mockCreate.mockResolvedValueOnce({ output: [] });

    await expect(reviewChunk("prompt", {}, "model", "key")).rejects.toThrow(
      "Unexpected API response structure",
    );
  });

  it("throws when response does not match ReviewOutput shape", async () => {
    mockCreate.mockResolvedValueOnce({
      output: [
        {
          content: [{ text: '{"invalid": true}', type: "output_text" }],
          type: "message",
        },
      ],
    });

    await expect(reviewChunk("prompt", {}, "model", "key")).rejects.toThrow(
      "does not match ReviewOutput shape",
    );
  });

  it("omits model from API call when empty", async () => {
    mockCreate.mockResolvedValueOnce({
      output: [
        {
          content: [
            { text: JSON.stringify(validReview), type: "output_text" },
          ],
          type: "message",
        },
      ],
    });

    await reviewChunk("prompt", {}, "", "key");

    const callArgs = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.model).toBeUndefined();
  });

  it("passes the provided model to the API", async () => {
    mockCreate.mockResolvedValueOnce({
      output: [
        {
          content: [
            { text: JSON.stringify(validReview), type: "output_text" },
          ],
          type: "message",
        },
      ],
    });

    await reviewChunk("prompt", {}, "o4-mini", "key");

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "o4-mini" }),
    );
  });
});
