/** Bounded, abortable fetch, including response body consumption. No retries. */
export function boundedFetch(
  fetcher: typeof fetch = fetch,
  timeoutMs = 45000,
): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const upstream = init?.signal;
    const abort = () => controller.abort();
    if (upstream?.aborted) controller.abort();
    else upstream?.addEventListener("abort", abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("Request timed out. Check recording status before retrying."));
      }, timeoutMs);
    });
    try {
      return await Promise.race([
        (async () => {
          const response = await fetcher(input, { ...init, signal: controller.signal });
          const bytes = await response.arrayBuffer();
          return new Response([204, 205, 304].includes(response.status) ? null : bytes, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        })(),
        expired,
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      upstream?.removeEventListener("abort", abort);
    }
  };
}
