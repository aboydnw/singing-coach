export const MAX_JSON_BYTES = 128 * 1024;
export const MAX_MODEL_INPUT_BYTES = 96 * 1024;
export const MAX_COACH_OUTPUT_TOKENS = 2048;
export const MAX_CHAT_OUTPUT_TOKENS = 1024;

export class RequestSizeError extends Error {}

export function assertModelInputBounded(value: unknown) {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_MODEL_INPUT_BYTES) {
    throw new RequestSizeError(
      "Coaching context is too large. Please start a new practice.",
    );
  }
}

/** Content-Length is optional/untrusted. Count actual bytes before JSON parsing. */
export async function readBoundedJson(request: Request): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) || Number(declared) > MAX_JSON_BYTES)
  ) {
    throw new RequestSizeError("Request body is too large.");
  }
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_JSON_BYTES) {
        await reader.cancel();
        throw new RequestSizeError("Request body is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
