import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signJobAssertion, verifyJobAssertion } from "@/lib/jobAssertion";

const SECRET = "0123456789abcdef0123456789abcdef";

describe("job assertions", () => {
  beforeEach(() => vi.stubEnv("ATTEMPT_JOB_SIGNING_SECRET", SECRET));
  afterEach(() => vi.unstubAllEnvs());

  it("round-trips one job id", () => {
    const token = signJobAssertion("11111111-1111-1111-1111-111111111130", 2_000);
    expect(verifyJobAssertion(token, 1_999)).toEqual({
      jobId: "11111111-1111-1111-1111-111111111130",
      expiresAt: 2_000,
    });
  });

  it("rejects tampering", () => {
    const token = signJobAssertion("11111111-1111-1111-1111-111111111130", 2_000);
    expect(() => verifyJobAssertion(`${token}x`, 1_999)).toThrow("invalid job assertion");
  });

  it("rejects an assertion after its expiry", () => {
    const token = signJobAssertion("11111111-1111-1111-1111-111111111130", 1_000);
    expect(() => verifyJobAssertion(token, 1_001)).toThrow("expired job assertion");
  });

  it("requires a strong server secret", () => {
    vi.stubEnv("ATTEMPT_JOB_SIGNING_SECRET", "short");
    expect(() => signJobAssertion("11111111-1111-1111-1111-111111111130")).toThrow(
      "ATTEMPT_JOB_SIGNING_SECRET",
    );
  });
});
