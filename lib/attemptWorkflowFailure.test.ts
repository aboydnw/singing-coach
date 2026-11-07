import { describe, expect, it, vi } from "vitest";
import { FatalError } from "workflow";
vi.mock("@/workflows/practiceAttemptSteps", () => ({
  claimAttemptWork: vi.fn(async () => ({ stage: "analysis" })),
  analyzeAttempt: vi.fn(),
  failAttempt: vi.fn(async () => undefined),
  persistAnalysis: vi.fn(),
  claimCoaching: vi.fn(),
  coachAttempt: vi.fn(),
  completeAttempt: vi.fn(),
}));
import { processPracticeAttempt } from "@/workflows/processPracticeAttempt";
import {
  analyzeAttempt,
  failAttempt,
  persistAnalysis,
} from "@/workflows/practiceAttemptSteps";

describe("workflow failure recovery", () => {
  it("persists a failed job for explicit retry after a fatal analysis error", async () => {
    const error = new FatalError("Recording processing is temporarily unavailable.");
    vi.mocked(analyzeAttempt).mockRejectedValueOnce(error);
    await expect(processPracticeAttempt("synthetic-job")).rejects.toBe(error);
    expect(failAttempt).toHaveBeenCalledWith("synthetic-job", {
      code: "analysis_failed",
      message: error.message,
    });
    expect(persistAnalysis).not.toHaveBeenCalled();
  });
});
