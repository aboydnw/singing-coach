import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OpenRouterError,
  callOpenRouter,
  isTimeout,
  stripSseComments,
} from "@/lib/openrouter";

const ARGS = {
  apiKey: "key",
  model: "test/model",
  systemPrompt: "you are a coach",
  schema: { type: "object" },
  userMessage: "coach me",
  timeoutMs: 50_000,
};

/** A Response whose body read fails the way the real one does for each case.
 * fetch resolving is not the same as the body having arrived, which is the
 * whole reason these cases were indistinguishable before. */
function respondWith(body: string | Error, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => (body instanceof Error ? Promise.reject(body) : Promise.resolve(body)),
  } as unknown as Response;
}

function completion(content: string): string {
  return JSON.stringify({ choices: [{ message: { content } }] });
}

function timeoutError(): Error {
  const error = new Error("The operation was aborted due to timeout");
  error.name = "TimeoutError";
  return error;
}

function stubFetch(result: Response | Error) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the happy path", () => {
  it("returns the model's parsed reply", async () => {
    stubFetch(respondWith(completion('{"focus_area":"vibrato"}')));
    await expect(callOpenRouter(ARGS)).resolves.toEqual({ focus_area: "vibrato" });
  });
});

describe("failures that used to share one message", () => {
  it("names a timeout during the body read as a timeout", async () => {
    stubFetch(respondWith(timeoutError()));
    await expect(callOpenRouter(ARGS)).rejects.toThrow(/timed out after 50s/);
  });

  it("names a timeout before the headers arrive as a timeout", async () => {
    stubFetch(timeoutError());
    await expect(callOpenRouter(ARGS)).rejects.toThrow(/timed out after 50s/);
  });

  it("reports the timeout in seconds so the number matches the wait", async () => {
    stubFetch(respondWith(timeoutError()));
    await expect(callOpenRouter({ ...ARGS, timeoutMs: 70_000 })).rejects.toThrow(
      /timed out after 70s/,
    );
  });

  it("names an empty body as a dropped connection, not bad JSON", async () => {
    stubFetch(respondWith(""));
    await expect(callOpenRouter(ARGS)).rejects.toThrow(/closed the connection/);
  });

  it("names a broken stream separately from a timeout", async () => {
    stubFetch(respondWith(new TypeError("terminated")));
    await expect(callOpenRouter(ARGS)).rejects.toThrow(/broke mid-response/);
  });

  it("quotes the body when a gateway answers 200 with HTML", async () => {
    stubFetch(respondWith("<html><head><title>502 Bad Gateway</title></head>"));
    await expect(callOpenRouter(ARGS)).rejects.toThrow(/502 Bad Gateway/);
  });

  it("names a truncated model reply as the model's, not the envelope's", async () => {
    stubFetch(respondWith(completion('{"focus_area":"vib')));
    await expect(callOpenRouter(ARGS)).rejects.toThrow(
      /model's reply was not valid JSON/,
    );
  });
});

describe("SSE keep-alive comments", () => {
  it("parses a body prefixed with a processing comment", async () => {
    stubFetch(
      respondWith(`: OPENROUTER PROCESSING\n\n${completion('{"focus_area":"range"}')}`),
    );
    await expect(callOpenRouter(ARGS)).resolves.toEqual({ focus_area: "range" });
  });

  it("strips repeated comment lines", () => {
    expect(stripSseComments(": one\n: two\n\n{}")).toBe("{}");
  });

  it("leaves a normal body alone", () => {
    expect(stripSseComments('{"a":1}')).toBe('{"a":1}');
  });

  it("does not eat a colon inside the JSON", () => {
    expect(stripSseComments('{"a":"b"}')).toBe('{"a":"b"}');
  });
});

describe("errors that are already well reported", () => {
  it("surfaces a provider error delivered as HTTP 200", async () => {
    stubFetch(respondWith(JSON.stringify({ error: { message: "no credit" } })));
    await expect(callOpenRouter(ARGS)).rejects.toThrow(/no credit/);
  });

  it("surfaces the status and detail of a non-2xx", async () => {
    stubFetch(respondWith(JSON.stringify({ error: { message: "bad key" } }), 401));
    await expect(callOpenRouter(ARGS)).rejects.toThrow(/401.*bad key/);
  });

  it("says so when there are no choices", async () => {
    stubFetch(respondWith(JSON.stringify({ choices: [] })));
    await expect(callOpenRouter(ARGS)).rejects.toThrow(/no message content/);
  });
});

describe("retryability", () => {
  it("marks a settled failure as not worth retrying", async () => {
    stubFetch(respondWith("nope", 402));
    await expect(callOpenRouter(ARGS)).rejects.toMatchObject({ retryable: false });
  });

  it("marks a transient failure as retryable", async () => {
    stubFetch(respondWith("busy", 503));
    await expect(callOpenRouter(ARGS)).rejects.toMatchObject({ retryable: true });
  });

  it("marks a timeout as retryable so a faster provider gets a turn", async () => {
    stubFetch(respondWith(timeoutError()));
    await expect(callOpenRouter(ARGS)).rejects.toMatchObject({ retryable: true });
  });

  it("throws OpenRouterError rather than a raw SyntaxError", async () => {
    stubFetch(respondWith("not json at all"));
    await expect(callOpenRouter(ARGS)).rejects.toBeInstanceOf(OpenRouterError);
  });
});

describe("isTimeout", () => {
  it("recognises a timeout", () => {
    expect(isTimeout(timeoutError())).toBe(true);
  });

  it("recognises an explicit abort", () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    expect(isTimeout(error)).toBe(true);
  });

  it("does not mistake a syntax error for a timeout", () => {
    expect(isTimeout(new SyntaxError("bad"))).toBe(false);
  });

  it("tolerates a non-error being thrown", () => {
    expect(isTimeout(undefined)).toBe(false);
  });
});
