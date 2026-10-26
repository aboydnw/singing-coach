import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { metadata, viewport } from "@/app/layout";

describe("mobile application metadata", () => {
  it("opens the installed application at Practice in standalone mode", () => {
    const value = manifest();
    expect(value.display).toBe("standalone");
    expect(value.start_url).toBe("/practice");
    expect(value.theme_color).toBe("#FFF8EF");
    expect(value.background_color).toBe("#FFF8EF");
    expect(value.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: "/app-icon.svg",
          purpose: "maskable",
        }),
      ]),
    );
  });

  it("configures the iphone viewport and Apple web app metadata", () => {
    expect(viewport.viewportFit).toBe("cover");
    expect(viewport.themeColor).toBe("#FFF8EF");
    expect(metadata.manifest).toBe("/manifest.webmanifest");
    expect(metadata.appleWebApp).toEqual(
      expect.objectContaining({ capable: true, title: "Singing Coach" }),
    );
  });

  it("includes maskable and Apple icon sources", () => {
    expect(existsSync(resolve("public/app-icon.svg"))).toBe(true);
    expect(existsSync(resolve("app/apple-icon.tsx"))).toBe(true);
  });
});
