import { ChakraProvider } from "@chakra-ui/react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MobileTabBar } from "@/components/MobileTabBar";
import { system } from "@/lib/theme";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

function renderTabs(currentPath: string): string {
  return renderToStaticMarkup(
    React.createElement(
      ChakraProvider,
      { value: system },
      React.createElement(MobileTabBar, { currentPath }),
    ),
  );
}

function currentAnchor(markup: string): string {
  return markup.match(/<a[^>]*aria-current="page"[^>]*>/)?.[0] ?? "";
}

describe("MobileTabBar", () => {
  it("marks nested practice routes as the current tab", () => {
    const markup = renderTabs("/practice/example");
    expect(markup.match(/href="\/(practice|calibrate|progress|account)"/g)).toHaveLength(
      4,
    );
    expect(currentAnchor(markup)).toContain('href="/practice"');
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
    expect(markup).toContain("data-active-marker");
    expect(markup).toContain("Practice");
    expect(markup).toContain("Calibrate");
    expect(markup).toContain("Progress");
    expect(markup).toContain("Account");
  });

  it("marks Account current without selecting another tab", () => {
    const markup = renderTabs("/account");
    expect(currentAnchor(markup)).toContain('href="/account"');
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
  });
});
