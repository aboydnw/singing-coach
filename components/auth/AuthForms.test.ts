import { ChakraProvider } from "@chakra-ui/react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type AuthNotice, SignInPanel } from "@/components/auth/AuthForms";
import { system } from "@/lib/theme";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const noOp = () => undefined;

function renderPanel({
  notice = null,
  emailFallback = false,
}: { notice?: AuthNotice; emailFallback?: boolean } = {}) {
  return renderToStaticMarkup(
    React.createElement(ChakraProvider, {
      value: system,
      children: React.createElement(SignInPanel, {
        busy: false,
        notice,
        onGoogle: noOp,
        onEmailSignIn: emailFallback ? noOp : undefined,
      }),
    }),
  );
}

describe("SignInPanel", () => {
  it("offers only Google by default", () => {
    const html = renderPanel();
    expect(html).toContain("Continue with Google");
    expect(html).not.toContain("<form");
    expect(html).not.toContain('name="password"');
    expect(html).toContain('href="/privacy"');
  });

  it("adds a password manager friendly email form for the fallback", () => {
    const html = renderPanel({ emailFallback: true });
    expect(html).toContain("<form");
    expect(html).toContain('autoComplete="username"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain("<label");
  });

  it("shows the notice it is given", () => {
    const html = renderPanel({
      notice: { tone: "danger", title: "Couldn't sign in", body: "Try again." },
    });
    expect(html).toContain('role="alert"');
    expect(html).toContain("Try again.");
  });
});
