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
  it("introduces the practice journey without overstating privacy or pricing", () => {
    const html = renderPanel();
    expect(html).toContain("Your voice is worth practicing.");
    expect(html).toContain("One attempt at a time.");
    expect(html).toContain("not your audio");
    expect(html).toContain("learning your baseline");
    expect(html).toContain('href="#start-practicing"');
    expect(html).toContain('href="#how-it-works"');
    expect(html).toContain('id="welcome-content"');
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).not.toContain("Free forever");
  });

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
