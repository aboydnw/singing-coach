import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Singing Coach",
    short_name: "Coach",
    description:
      "Practice with a measurement-backed vocal coach and learn to hear your own singing patterns.",
    start_url: "/practice",
    display: "standalone",
    background_color: "#FFF8EF",
    theme_color: "#FFF8EF",
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
