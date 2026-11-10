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
  busy = false,
}: { notice?: AuthNotice; emailFallback?: boolean; busy?: boolean } = {}) {
  return renderToStaticMarkup(
    React.createElement(ChakraProvider, {
      value: system,
      children: React.createElement(SignInPanel, {
        busy,
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
    expect(html).toContain("Singing practice with a clear next step.");
    expect(html).toContain("The Sing Coach combines vocal exercises");
    expect(html).toContain("not audio");
    expect(html).toContain("learning your baseline");
    expect(html).toContain("Stop if singing hurts.");
    expect(html).toContain("cannot replace a voice teacher or medical advice.");
    expect(html).toContain('href="#start-practicing"');
    expect(html).toContain('id="welcome-content"');
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).not.toContain("Free forever");
  });

  it("labels the static illustration without implying a real result or playback", () => {
    const html = renderPanel();
    expect(html).toContain("Illustrated pitch feedback");
    expect(html).toContain('role="img"');
    expect(html).toContain("This is not a recording or result.");
    expect(html).not.toContain("<audio");
    expect(html).not.toContain("<canvas");
  });

  it("keeps the welcome copy concise", () => {
    const text = renderPanel()
      .replace(/<style[^>]*>[\s\S]*?<\/style>/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&#x27;|&#39;|&apos;|&quot;|&amp;/g, " ");
    const words = text.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) ?? [];
    expect(words.length).toBeLessThanOrEqual(150);
  });

  it("offers only Google by default", () => {
    const html = renderPanel();
    expect(html).toContain("Continue with Google");
    expect(html).not.toContain("<form");
    expect(html).not.toContain('name="password"');
    expect(html).toContain('href="/privacy"');
  });

  it("keeps sign-in disabled while busy", () => {
    const html = renderPanel({ busy: true });
    expect(html).toMatch(/<button[^>]*disabled/);
    expect(html).toContain("Continue with Google");
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
    expect(html.indexOf('role="alert"')).toBeLessThan(html.indexOf("<button"));
  });
});
