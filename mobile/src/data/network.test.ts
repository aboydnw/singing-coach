import { it, expect, vi } from "vitest";
import { boundedFetch } from "./network";
it("aborts stalled network calls without retrying", async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  const fetcher = vi.fn((_input: any, init: any) => {
    signal = init.signal;
    return new Promise<Response>(() => {});
  });
  const promise = boundedFetch(fetcher, 20)("https://example.test");
  const assertion = expect(promise).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(21);
  await assertion;
  expect(signal?.aborted).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});
it("keeps response-body reads under the same deadline", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async () => ({
    arrayBuffer: () => new Promise(() => {}),
  })) as unknown as typeof fetch;
  const assertion = expect(
    boundedFetch(fetcher, 20)("https://example.test"),
  ).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(21);
  await assertion;
  vi.useRealTimers();
});
