import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/serverSupabase", () => ({ serviceSupabase: () => ({ rpc }) }));
import { consumeCostOperation, CostLimitError, costLimitResponse } from "./costGuard";
import {
  readBoundedJson,
  MAX_JSON_BYTES,
  assertModelInputBounded,
  RequestSizeError,
} from "./requestLimits";

beforeEach(() =>
  rpc.mockResolvedValue({
    data: { allowed: true, reason: "allowed", retry_after: 0 },
    error: null,
  }),
);
afterEach(() => vi.clearAllMocks());

describe("server cost gate", () => {
  it("uses the verified identity and operation, with no client tier or allowance", async () => {
    await consumeCostOperation("verified-user", "coach");
    expect(rpc).toHaveBeenCalledWith("consume_cost_operation", {
      p_user_id: "verified-user",
      p_operation: "coach",
    });
  });
  it.each([
    null,
    {},
    { allowed: "true" },
    { allowed: true },
    { allowed: true, reason: "unexpected", retry_after: 0 },
    { allowed: false, reason: "unexpected", retry_after: 60 },
  ])("fails closed for malformed response %j", async (data) => {
    rpc.mockResolvedValue({ data, error: null });
    await expect(consumeCostOperation("user", "chat")).rejects.toMatchObject({
      status: 503,
    });
  });
  it("fails closed on database error or unreachable database", async () => {
    rpc.mockResolvedValueOnce({
      data: { allowed: true, reason: "allowed", retry_after: 0 },
      error: { message: "missing function" },
    });
    await expect(consumeCostOperation("user", "chat")).rejects.toMatchObject({
      status: 503,
    });
    rpc.mockRejectedValueOnce(new Error("network error"));
    await expect(consumeCostOperation("user", "chat")).rejects.toMatchObject({
      status: 503,
    });
  });
  it("returns retry information without leaking policy internals", async () => {
    rpc.mockResolvedValue({
      data: { allowed: false, reason: "account_limit", retry_after: 123 },
      error: null,
    });
    const error = await consumeCostOperation("user", "chat").catch((error) => error);
    const response = costLimitResponse(error);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("123");
    expect(await response.json()).toEqual({ error: error.message, code: "usage_limit" });
  });
  it("treats a disabled global gate as unavailable", async () => {
    rpc.mockResolvedValue({
      data: { allowed: false, reason: "unavailable" },
      error: null,
    });
    await expect(consumeCostOperation("user", "chat")).rejects.toEqual(
      new CostLimitError(503),
    );
  });
});

describe("request and provider bounds", () => {
  it("reads ordinary JSON", async () => {
    expect(
      await readBoundedJson(
        new Request("https://test", { method: "POST", body: '{"value":1}' }),
      ),
    ).toEqual({ value: 1 });
  });
  it("rejects oversized actual bytes without Content-Length", async () => {
    await expect(
      readBoundedJson(
        new Request("https://test", {
          method: "POST",
          body: "x".repeat(MAX_JSON_BYTES + 1),
        }),
      ),
    ).rejects.toBeInstanceOf(RequestSizeError);
  });
  it("rejects a misleading or invalid declared length", async () => {
    for (const length of ["-1", String(MAX_JSON_BYTES + 1)]) {
      await expect(
        readBoundedJson(
          new Request("https://test", {
            method: "POST",
            body: "{}",
            headers: { "Content-Length": length },
          }),
        ),
      ).rejects.toBeInstanceOf(RequestSizeError);
    }
  });
  it("rejects oversized Unicode provider context measured in bytes", () => {
    expect(() => assertModelInputBounded("🎵".repeat(25000))).toThrow(RequestSizeError);
  });
});
