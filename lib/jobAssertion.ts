import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_LIFETIME_MS = 5 * 60_000;

export type VerifiedJobAssertion = { jobId: string; expiresAt: number };

export function signJobAssertion(
  jobId: string,
  expiresAt = Date.now() + DEFAULT_LIFETIME_MS,
): string {
  const payload = Buffer.from(JSON.stringify({ jobId, expiresAt })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyJobAssertion(
  token: string,
  now = Date.now(),
): VerifiedJobAssertion {
  const [payload, supplied, extra] = token.split(".");
  if (!payload || !supplied || extra) throw new Error("invalid job assertion");
  const expected = signature(payload);
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  if (
    suppliedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(suppliedBytes, expectedBytes)
  ) {
    throw new Error("invalid job assertion");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("invalid job assertion");
  }
  if (
    decoded === null ||
    typeof decoded !== "object" ||
    typeof (decoded as { jobId?: unknown }).jobId !== "string" ||
    typeof (decoded as { expiresAt?: unknown }).expiresAt !== "number"
  ) {
    throw new Error("invalid job assertion");
  }
  const result = decoded as VerifiedJobAssertion;
  if (result.expiresAt < now) throw new Error("expired job assertion");
  return result;
}

function signature(payload: string): string {
  const secret = process.env.ATTEMPT_JOB_SIGNING_SECRET ?? "";
  if (Buffer.byteLength(secret) < 32) {
    throw new Error("ATTEMPT_JOB_SIGNING_SECRET must be at least 32 bytes");
  }
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
