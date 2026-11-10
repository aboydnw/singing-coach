import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/costGuard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/costGuard")>()),
  consumeCostOperation: vi.fn(),
}));
vi.mock("@/lib/openrouter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/openrouter")>()),
  callOpenRouter: vi.fn(),
}));
import { generateCoaching, type CoachRequest } from "./coachService";
import { consumeCostOperation, CostLimitError } from "./costGuard";
import { callOpenRouter } from "./openrouter";
import { measurementsSchema } from "./schema";

const body: CoachRequest = {
  exercise_spec: null,
  measurements: measurementsSchema.parse({}),
  current_practice_session_id: null,
  history: [],
};
beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "synthetic");
  vi.stubEnv("COACH_MODEL", "synthetic");
  vi.mocked(consumeCostOperation).mockResolvedValue(undefined);
  vi.mocked(callOpenRouter).mockResolvedValue({});
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
describe("coaching dispatch cost protection", () => {
  it("does not contact provider when budget is exhausted", async () => {
    vi.mocked(consumeCostOperation).mockRejectedValue(new CostLimitError(429));
    await expect(generateCoaching(body, 0, "owner")).rejects.toMatchObject({
      status: 429,
    });
    expect(callOpenRouter).not.toHaveBeenCalled();
    expect(consumeCostOperation).toHaveBeenCalledOnce();
  });
  it("charges both provider attempts, including malformed paid output", async () => {
    await expect(generateCoaching(body, 0, "owner")).rejects.toThrow("malformed");
    expect(consumeCostOperation).toHaveBeenCalledTimes(2);
    expect(consumeCostOperation).toHaveBeenNthCalledWith(1, "owner", "coach");
    expect(callOpenRouter).toHaveBeenCalledTimes(2);
    expect(vi.mocked(consumeCostOperation).mock.invocationCallOrder[1]).toBeLessThan(
      vi.mocked(callOpenRouter).mock.invocationCallOrder[1],
    );
  });
  it("stops retry when the remaining allowance is exhausted", async () => {
    vi.mocked(consumeCostOperation)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new CostLimitError(429));
    await expect(generateCoaching(body, 0, "owner")).rejects.toMatchObject({
      status: 429,
    });
    expect(callOpenRouter).toHaveBeenCalledOnce();
  });
  it("bounds provider context before consuming or calling", async () => {
    const huge = {
      ...body,
      history: [
        {
          ts: "x".repeat(100000),
          practice_session_id: null,
          exercise_type: null,
          measurements: null,
        },
      ],
    };
    await expect(generateCoaching(huge, 0, "owner")).rejects.toThrow("too large");
    expect(consumeCostOperation).not.toHaveBeenCalled();
    expect(callOpenRouter).not.toHaveBeenCalled();
  });
});
