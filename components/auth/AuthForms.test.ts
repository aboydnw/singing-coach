import { ChakraProvider } from "@chakra-ui/react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type AuthMode, SetPasswordForm, SignInPanel } from "@/components/auth/AuthForms";
import { system } from "@/lib/theme";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const noOp = () => undefined;

function render(element: React.ReactElement) {
  return renderToStaticMarkup(
    React.createElement(ChakraProvider, { value: system, children: element }),
  );
}

function renderPanel(mode: AuthMode) {
  return render(
    React.createElement(SignInPanel, {
      mode,
      busy: false,
      notice: null,
      onModeChange: noOp,
      onSubmit: noOp,
      onGoogle: noOp,
    }),
  );
}

describe("SignInPanel", () => {
  it("offers Google and a submittable email form when signing in", () => {
    const html = renderPanel("sign-in");
    expect(html).toContain("Continue with Google");
    expect(html).toContain("<form");
    expect(html).toContain('type="submit"');
    expect(html).toContain('autoComplete="username"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain("<label");
    expect(html).toContain('href="/privacy"');
  });

  it("asks password managers for a new password when signing up", () => {
    const html = renderPanel("sign-up");
    expect(html).toContain('autoComplete="new-password"');
    expect(html).not.toContain('autoComplete="current-password"');
  });

  it("asks only for an email when requesting a reset", () => {
    const html = renderPanel("forgot");
    expect(html).not.toContain('name="password"');
    expect(html).not.toContain("Continue with Google");
  });

  it("shows the notice it is given", () => {
    const html = render(
      React.createElement(SignInPanel, {
        mode: "sign-in",
        busy: false,
        notice: { tone: "danger", title: "Couldn't sign in", body: "Try again." },
        onModeChange: noOp,
        onSubmit: noOp,
        onGoogle: noOp,
      }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Try again.");
  });
});

describe("SetPasswordForm", () => {
  it("asks for a new password twice", () => {
    const html = render(
      React.createElement(SetPasswordForm, {
        busy: false,
        notice: null,
        submitLabel: "Save password",
        onSubmit: noOp,
      }),
    );
    expect(html.match(/autoComplete="new-password"/g)).toHaveLength(2);
    expect(html).toContain("Save password");
  });
});
