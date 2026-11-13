import { afterEach, describe, expect, it, vi } from "vitest";
import { FatalError } from "workflow";
import { analyzeAttempt } from "@/workflows/practiceAttemptSteps";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("analysis configuration failures", () => {
  it.each([400, 401, 403, 404, 413, 429, 503])(
    "does not automatically retry a rejected analysis (%s)",
    async (status) => {
      vi.stubEnv(
        "ATTEMPT_JOB_SIGNING_SECRET",
        "test-only-signing-secret-at-least-32-bytes",
      );
      const fetch = vi.fn(async () =>
        Response.json({ error: "Processing rejected" }, { status }),
      );
      vi.stubGlobal("fetch", fetch);
      await expect(analyzeAttempt("synthetic-job")).rejects.toBeInstanceOf(FatalError);
      expect(fetch).toHaveBeenCalledOnce();
    },
  );
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
