"use client";

import { useEffect } from "react";

const CONTAINER_ID = "riffrec-root";

/** Mounts the riffrec session recorder in its own React root, so the app tree
 * never re-renders on its account and nothing in `app/` has to know it exists.
 * riffrec captures screen, clicks, network and console through global browser
 * APIs, so it has no need to wrap the tree. */
export function DevFeedback() {
  useEffect(() => {
    // Dev servers and Vercel preview deployments get the recorder; production
    // never does. Both reads are replaced with literals by Next at build time,
    // and the comparison sits directly in the `if` on purpose: via an
    // intermediate const, webpack keeps the dynamic import below and emits the
    // whole riffrec chunk anyway. NEXT_PUBLIC_VERCEL_ENV is a Vercel system
    // variable, present only while the project has "Automatically expose System
    // Environment Variables" enabled — the default.
    if (
      process.env.NODE_ENV === "production" &&
      process.env.NEXT_PUBLIC_VERCEL_ENV !== "preview"
    ) {
      return;
    }

    let cancelled = false;
    let teardown: (() => void) | undefined;

    void (async () => {
      try {
        const [{ createRoot }, { RiffrecProvider, RiffrecRecorder }] = await Promise.all([
          import("react-dom/client"),
          import("riffrec"),
        ]);
        // StrictMode runs effects twice in dev; a second root would mean two buttons.
        if (cancelled || document.getElementById(CONTAINER_ID)) return;

        const container = document.createElement("div");
        container.id = CONTAINER_ID;
        document.body.appendChild(container);

        const root = createRoot(container);
        // A preview deployment is a production build, so riffrec would otherwise
        // disable itself and render a button that does nothing.
        root.render(
          <RiffrecProvider forceEnable>
            <RiffrecRecorder />
          </RiffrecProvider>,
        );

        teardown = () => {
          // Unmounting another root synchronously inside this cleanup would land
          // mid-render of the app's root, which React warns about.
          setTimeout(() => {
            root.unmount();
            container.remove();
          }, 0);
        };
      } catch (error) {
        console.warn("[DevFeedback] recorder unavailable", error);
      }
    })();

    return () => {
      cancelled = true;
      teardown?.();
    };
  }, []);

  return null;
}
