import { describe, expect, it } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  authRedirectError,
  friendlyAuthMessage,
  newPasswordProblem,
} from "@/lib/authMessages";

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
      "https://app.test/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid",
    );
    expect(message).toBe(friendlyAuthMessage({ code: "otp_expired" }));
  });

  it("reads errors from the query string", () => {
    expect(authRedirectError("https://app.test/?error=access_denied")).toBe(
      friendlyAuthMessage({ code: "access_denied" }),
    );
  });
});

describe("newPasswordProblem", () => {
  const valid = "a".repeat(MIN_PASSWORD_LENGTH);

  it("accepts a long enough matching password", () => {
    expect(newPasswordProblem(valid, valid)).toBeNull();
  });

  it("rejects short passwords", () => {
    const short = valid.slice(1);
    expect(newPasswordProblem(short, short)).not.toBeNull();
  });

  it("rejects mismatched confirmation", () => {
    expect(newPasswordProblem(valid, `${valid}b`)).not.toBeNull();
  });
});
