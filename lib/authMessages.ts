const FALLBACK = "Something went wrong. Try again in a moment.";

const MESSAGES: Record<string, string> = {
  invalid_credentials: "That email and password don't match. Try again.",
  email_not_confirmed: "Confirm your email first. Check your inbox for the link.",
  over_request_rate_limit: "Too many attempts. Wait a few minutes and try again.",
  signup_disabled: "New sign-ups are closed right now.",
  provider_disabled: "That sign-in option isn't available yet.",
  session_not_found: "Your session has ended. Sign in again.",
  access_denied: "Sign-in was cancelled. Try again.",
};

/** Translate a Supabase auth error into a sentence a singer can act on. */
export function friendlyAuthMessage(
  error: { code?: string | null; message?: string } | null | undefined,
): string {
  if (!error) return FALLBACK;
  return (error.code && MESSAGES[error.code]) || FALLBACK;
}

/** Read the error Supabase appends to a redirect URL after a failed OAuth sign-in. */
export function authRedirectError(url: string): string | null {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  for (const [key, value] of new URLSearchParams(parsed.search)) {
    if (!params.has(key)) params.set(key, value);
  }
  if (!params.has("error") && !params.has("error_code")) return null;
  return friendlyAuthMessage({ code: params.get("error_code") ?? params.get("error") });
}
