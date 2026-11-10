import { serviceSupabase } from "@/lib/serverSupabase";

export type CostOperation = "analyze" | "resynth" | "coach" | "chat" | "job_start";

export class CostLimitError extends Error {
  constructor(
    readonly status: 429 | 503,
    readonly retryAfter: number = 60,
  ) {
    super(
      status === 429
        ? "The usage limit has been reached. Please try again later."
        : "Processing is temporarily unavailable. Please try again later.",
    );
    this.name = "CostLimitError";
  }
}

/** Charge before work. Failures/retries can still cost money, so never refund an
 * uncertain outcome. This is an operation allowance, not dollar accounting. */
export async function consumeCostOperation(userId: string, operation: CostOperation) {
  try {
    const { data, error } = await serviceSupabase().rpc("consume_cost_operation", {
      p_user_id: userId,
      p_operation: operation,
    });
    if (
      error ||
      !data ||
      typeof data.allowed !== "boolean" ||
      !Number.isInteger(data.retry_after) ||
      data.retry_after < 0 ||
      data.retry_after > 366 * 24 * 60 * 60 ||
      typeof data.reason !== "string"
    ) {
      throw new CostLimitError(503);
    }
    if (data.allowed) {
      if (data.reason !== "allowed" || data.retry_after !== 0)
        throw new CostLimitError(503);
    } else {
      if (!["account_limit", "global_limit"].includes(data.reason))
        throw new CostLimitError(503);
      throw new CostLimitError(429, Math.max(1, data.retry_after));
    }
  } catch (error) {
    if (error instanceof CostLimitError) throw error;
    throw new CostLimitError(503);
  }
}

export function costLimitResponse(error: CostLimitError) {
  return Response.json(
    {
      error: error.message,
      code: error.status === 429 ? "usage_limit" : "usage_unavailable",
    },
    { status: error.status, headers: { "Retry-After": String(error.retryAfter) } },
  );
}
