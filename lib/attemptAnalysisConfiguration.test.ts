import { afterEach, describe, expect, it, vi } from "vitest";
import { FatalError } from "workflow";
import { analyzeAttempt } from "@/workflows/practiceAttemptSteps";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("analysis configuration failures", () => {
  it("fails without retrying or sending an unsigned request", async () => {
    vi.stubEnv("ATTEMPT_JOB_SIGNING_SECRET", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(analyzeAttempt("synthetic-job")).rejects.toBeInstanceOf(FatalError);
    await expect(analyzeAttempt("synthetic-job")).rejects.toThrow(
      "Your recording is saved",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
