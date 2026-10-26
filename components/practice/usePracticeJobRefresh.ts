"use client";

import { useEffect, useRef } from "react";

export function jobRefreshDelay(
  active: boolean,
  visibility: DocumentVisibilityState,
): number | null {
  return active && visibility === "visible" ? 5_000 : null;
}

export function usePracticeJobRefresh(
  active: boolean,
  refresh: () => Promise<unknown>,
) {
  const inFlight = useRef<Promise<unknown> | null>(null);

  useEffect(() => {
    if (!active) return;
    const run = () => {
      if (document.visibilityState !== "visible" || inFlight.current) return;
      inFlight.current = refresh().finally(() => {
        inFlight.current = null;
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") run();
    };
    run();
    const timer = window.setInterval(run, 5_000);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, refresh]);
}
