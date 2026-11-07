import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/serverAuth", () => ({
  authenticateRequest: vi.fn(async () => ({ userId: "user", token: "test" })),
}));
vi.mock("@/lib/serverSupabase", () => ({ serviceSupabase: vi.fn() }));
vi.mock("workflow/api", () => ({ start: vi.fn() }));
vi.mock("@/workflows/processPracticeAttempt", () => ({
  processPracticeAttempt: vi.fn(),
}));

import { POST as create } from "@/app/api/practice/attempt-jobs/route";
import { POST as retry } from "@/app/api/practice/attempt-jobs/[id]/retry/route";
import { serviceSupabase } from "@/lib/serverSupabase";
import { authenticateRequest } from "@/lib/serverAuth";
import { start } from "workflow/api";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("attempt configuration preflight", () => {
  for (const secret of ["", "too-short"]) {
    it("rejects new work before persistence with invalid secret: " + secret, async () => {
      vi.stubEnv("ATTEMPT_JOB_SIGNING_SECRET", secret);
      const response = await create(
        new Request("https://example.test", { method: "POST" }),
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: "Recording processing is temporarily unavailable. Please try again later.",
      });
      expect(serviceSupabase).not.toHaveBeenCalled();
      expect(start).not.toHaveBeenCalled();
    });
    it("leaves failed jobs untouched when retry cannot run: " + secret, async () => {
      vi.stubEnv("ATTEMPT_JOB_SIGNING_SECRET", secret);
      const response = await retry(
        new Request("https://example.test", { method: "POST" }),
        { params: Promise.resolve({ id: "job" }) },
      );
      expect(response.status).toBe(503);
      expect(serviceSupabase).not.toHaveBeenCalled();
      expect(start).not.toHaveBeenCalled();
    });
  }
  it("keeps authentication ahead of configuration errors", async () => {
    vi.mocked(authenticateRequest).mockResolvedValueOnce(null);
    const response = await create(
      new Request("https://example.test", { method: "POST" }),
    );
    expect(response.status).toBe(401);
  });
});
