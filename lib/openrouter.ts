/** The OpenRouter call, split out of the route so its failure modes can be
 * tested without standing up auth and Supabase.
 *
 * The reason this is worth its own module: `fetch` resolves as soon as the
 * response headers arrive, which for a non-streaming completion is long before
 * the model has finished writing. Everything after that point happens while
 * generation is still in flight, so a timeout, a dropped connection, a gateway
 * error page and a genuinely malformed body all surface from the same `await`.
 * Collapsing them into one message - as this code once did - makes a slow model
 * indistinguishable from a broken one, in the UI and in the logs.
 */

export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

const RETRYABLE_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504]);

const MAX_ERROR_TEXT = 200;

/** How much of an unparseable body to quote back. Enough to recognise an HTML
 * error page or a truncated completion, short enough not to fill the panel. */
const BODY_EXCERPT = 120;

/** Capping every message on the way into an OpenRouterError, rather than at
 * each source, is what keeps a stray HTML error page or a verbose provider
 * message out of the UI: the status prefix leads, so it always survives. */
export function truncate(text: string): string {
  return text.length > MAX_ERROR_TEXT ? `${text.slice(0, MAX_ERROR_TEXT)}…` : text;
}

/** OpenRouter reports failures as {"error": {"code", "message"}}, but a bare
 * string or an HTML error page both happen too, hence the raw-body fallback. */
export function describeError(body: string): string {
  try {
    const parsed = JSON.parse(body);
    const message = parsed?.error?.message ?? parsed?.message;
    if (typeof message === "string" && message.length > 0) return message;
  } catch {
    // not JSON; fall through to the raw body
  }
  return body;
}

/** Was this thrown because our own deadline expired rather than because the
 * response was bad? AbortSignal.timeout rejects with a TimeoutError; an
 * explicitly aborted request rejects with an AbortError. */
export function isTimeout(error: unknown): boolean {
  const name = (error as { name?: unknown })?.name;
  return name === "TimeoutError" || name === "AbortError";
}

/** OpenRouter holds long connections open with SSE comment lines
 * (`: OPENROUTER PROCESSING`). Those are documented for streaming responses and
 * this call does not stream, but one reaching JSON.parse is indistinguishable
 * from a genuinely broken body, so they are stripped rather than left to be
 * rediscovered from a support ticket. */
export function stripSseComments(body: string): string {
  return body.replace(/^\s*(?::[^\n]*\n+)+/, "");
}

type OpenRouterPayload = {
  error?: unknown;
  choices?: Array<{ message?: { content?: unknown } }>;
};

export type CallArgs = {
  apiKey: string;
  model: string;
  systemPrompt: string;
  schema: object;
  userMessage: string;
  timeoutMs: number;
};

export async function callOpenRouter(args: CallArgs): Promise<unknown> {
  const response = await fetchCompletion(args);

  if (!response.ok) {
    const detail = describeError(await readBody(response, args.timeoutMs));
    throw new OpenRouterError(
      truncate(`OpenRouter returned ${response.status}${detail ? `: ${detail}` : ""}`),
      RETRYABLE_STATUSES.has(response.status),
    );
  }

  const raw = await readBody(response, args.timeoutMs);
  if (raw.trim() === "") {
    throw new OpenRouterError(
      "OpenRouter closed the connection before sending a response",
      true,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(stripSseComments(raw));
  } catch {
    // A gateway between here and the model can answer 200 with an HTML error
    // page. Quoting the start of it is the only way to tell that from a
    // truncated response without reaching for the platform logs.
    throw new OpenRouterError(
      truncate(
        `OpenRouter returned a body that was not JSON: ${raw.slice(0, BODY_EXCERPT)}`,
      ),
      true,
    );
  }
  if (payload === null || typeof payload !== "object") {
    throw new OpenRouterError("OpenRouter returned an unexpected body", true);
  }

  const body = payload as OpenRouterPayload;
  // An upstream provider failure arrives as HTTP 200 with an error field.
  if (body.error) {
    throw new OpenRouterError(
      truncate(`OpenRouter reported: ${describeError(JSON.stringify(body))}`),
      true,
    );
  }
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new OpenRouterError("OpenRouter response had no message content", true);
  }

  // The model's own output, a separate parse from the envelope above. Strict
  // structured output makes this valid JSON in the happy path, but a reply cut
  // short by a token limit still arrives as HTTP 200 carrying truncated JSON,
  // and an unguarded parse puts a raw SyntaxError in front of the singer.
  try {
    return JSON.parse(content);
  } catch {
    throw new OpenRouterError(
      truncate(`the model's reply was not valid JSON: ${content.slice(0, BODY_EXCERPT)}`),
      true,
    );
  }
}

async function fetchCompletion(args: CallArgs): Promise<Response> {
  try {
    return await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Singing Coach",
      },
      signal: AbortSignal.timeout(args.timeoutMs),
      body: JSON.stringify({
        model: args.model,
        messages: [
          { role: "system", content: args.systemPrompt },
          { role: "user", content: args.userMessage },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "give_coaching",
            strict: true,
            schema: { ...args.schema, additionalProperties: false },
          },
        },
        provider: { require_parameters: true },
      }),
    });
  } catch (error) {
    if (isTimeout(error)) throw timedOut(args.timeoutMs);
    throw new OpenRouterError("could not reach OpenRouter", true);
  }
}

/** Read the body, telling our own expired deadline apart from a broken stream.
 * Both surface here rather than at the call site because fetch has already
 * resolved by this point - the request is only half done. */
async function readBody(response: Response, timeoutMs: number): Promise<string> {
  try {
    return await response.text();
  } catch (error) {
    if (isTimeout(error)) throw timedOut(timeoutMs);
    throw new OpenRouterError("the connection to OpenRouter broke mid-response", true);
  }
}

function timedOut(timeoutMs: number): OpenRouterError {
  return new OpenRouterError(
    `coaching timed out after ${Math.round(timeoutMs / 1000)}s while the model was still replying`,
    true,
  );
}
