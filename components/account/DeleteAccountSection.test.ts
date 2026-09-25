import { ChakraProvider } from "@chakra-ui/react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DeleteAccountSection } from "@/components/account/DeleteAccountSection";
import { system } from "@/lib/theme";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

describe("DeleteAccountSection", () => {
  it("explains the consequence and keeps the confirmation closed until asked", () => {
    const html = renderToStaticMarkup(
      React.createElement(ChakraProvider, {
        value: system,
        children: React.createElement(DeleteAccountSection, {
          busy: false,
          error: null,
          onDelete: () => undefined,
        }),
      }),
    );
    expect(html).toContain("cannot be undone");
    expect(html).toContain("Delete account…");
    expect(html).not.toContain("Delete forever");
  });
});
