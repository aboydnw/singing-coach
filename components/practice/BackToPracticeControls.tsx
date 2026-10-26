"use client";

import { Button } from "@chakra-ui/react";
import { useEffect, useState } from "react";

export function BackToPracticeControls({ visible }: { visible?: boolean }) {
  const [observedVisible, setObservedVisible] = useState(false);

  useEffect(() => {
    if (visible !== undefined) return;
    const target = document.getElementById("practice-controls");
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) =>
        setObservedVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0.15 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [visible]);

  const show = visible ?? observedVisible;
  if (!show) return null;

  return (
    <Button
      asChild
      position="fixed"
      right={{ base: 4, md: 8 }}
      bottom={{
        base: "calc(var(--chakra-sizes-mobile-nav) + env(safe-area-inset-bottom) + 1rem)",
        md: 6,
      }}
      zIndex="sticky"
      minH="12"
      colorPalette="coral"
      boxShadow="active"
    >
      <a
        href="#practice-controls"
        onClick={(event) => {
          event.preventDefault();
          const target = document.getElementById("practice-controls");
          target?.scrollIntoView({
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "auto"
              : "smooth",
            block: "start",
          });
          document.getElementById("practice-controls-heading")?.focus();
        }}
      >
        ↑ Back to practice controls
      </a>
    </Button>
  );
}
