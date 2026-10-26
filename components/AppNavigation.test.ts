import { ChakraProvider } from "@chakra-ui/react";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MobileNavigation, isActiveDestination } from "@/components/AppNavigation";
import { system } from "@/lib/theme";

describe("isActiveDestination", () => {
  it("matches a destination and its nested routes without matching prefixes", () => {
    expect(isActiveDestination("/practice/123", "/practice")).toBe(true);
    expect(isActiveDestination("/progress", "/practice")).toBe(false);
    expect(isActiveDestination("/practice-notes", "/practice")).toBe(false);
  });
});

describe("MobileNavigation", () => {
  it("renders four labeled destinations and marks the current one", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ChakraProvider,
        { value: system },
        React.createElement(MobileNavigation, { pathname: "/progress" }),
      ),
    );
    expect(html.match(/<a /g)).toHaveLength(4);
    expect(html).toContain('aria-label="Primary navigation"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Practice");
    expect(html).toContain("Calibrate");
    expect(html).toContain("Progress");
    expect(html).toContain("Account");
  });
});
