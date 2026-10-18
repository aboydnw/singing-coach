import { describe, expect, it } from "vitest";
import { authRedirectError, friendlyAuthMessage } from "@/lib/authMessages";

describe("friendlyAuthMessage", () => {
  it("replaces known Supabase codes instead of passing raw messages through", () => {
    const raw = "Invalid login credentials";
    const message = friendlyAuthMessage({ code: "invalid_credentials", message: raw });
    expect(message).not.toBe(raw);
    expect(message).not.toBe(friendlyAuthMessage(null));
  });

  it("falls back for unknown codes and missing errors", () => {
    expect(friendlyAuthMessage({ code: "hook_timeout", message: "x" })).toBe(
      friendlyAuthMessage(undefined),
    );
    expect(friendlyAuthMessage({ message: "no code" })).toBe(friendlyAuthMessage(null));
  });
});

describe("authRedirectError", () => {
  it("returns null for a normal URL", () => {
    expect(authRedirectError("https://app.test/")).toBeNull();
    expect(
      authRedirectError("https://app.test/#access_token=abc&type=recovery"),
    ).toBeNull();
  });

  it("reads errors from the hash", () => {
    const message = authRedirectError(
      "https://app.test/#error=access_denied&error_code=provider_disabled",
    );
    expect(message).toBe(friendlyAuthMessage({ code: "provider_disabled" }));
  });

  it("reads errors from the query string", () => {
    expect(authRedirectError("https://app.test/?error=access_denied")).toBe(
      friendlyAuthMessage({ code: "access_denied" }),
    );
  });
});
