import type { MetadataRoute } from "next";

export const APP_THEME_COLOR = "#FFF8EF";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Singing Coach",
    short_name: "Coach",
    description:
      "Practice with a measurement-backed vocal coach and learn to hear your own singing patterns.",
    start_url: "/practice",
    display: "standalone",
    background_color: APP_THEME_COLOR,
    theme_color: APP_THEME_COLOR,
    icons: [
      {
        src: "/app-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/app-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
