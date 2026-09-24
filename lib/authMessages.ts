export const MIN_PASSWORD_LENGTH = 8;

const FALLBACK = "Something went wrong. Try again in a moment.";

const MESSAGES: Record<string, string> = {
  invalid_credentials:
    "That email and password don't match. Try again, or reset your password.",
  email_not_confirmed: "Confirm your email first. Check your inbox for the link.",
  user_already_exists: "An account with this email already exists. Sign in instead.",
  email_exists: "An account with this email already exists. Sign in instead.",
  email_address_invalid: "Enter a valid email address.",
  weak_password: `Choose a stronger password with at least ${MIN_PASSWORD_LENGTH} characters.`,
  same_password: "Your new password must be different from your current one.",
  over_email_send_rate_limit:
    "We've sent too many emails recently. Wait a few minutes and try again.",
  over_request_rate_limit: "Too many attempts. Wait a few minutes and try again.",
  otp_expired: "That link has expired. Request a new one.",
  signup_disabled: "New sign-ups are closed right now.",
  provider_disabled: "That sign-in option isn't available yet.",
  session_not_found: "Your session has ended. Sign in again.",
  access_denied: "Sign-in was cancelled or the link is no longer valid. Try again.",
};

/** Translate a Supabase auth error into a sentence a singer can act on. */
export function friendlyAuthMessage(
  error: { code?: string | null; message?: string } | null | undefined,
): string {
  if (!error) return FALLBACK;
  return (error.code && MESSAGES[error.code]) || FALLBACK;
}

/** Read the error Supabase appends to a redirect URL after a failed OAuth or email link. */
export function authRedirectError(url: string): string | null {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  for (const [key, value] of new URLSearchParams(parsed.search)) {
    if (!params.has(key)) params.set(key, value);
  }
  if (!params.has("error") && !params.has("error_code")) return null;
  return friendlyAuthMessage({ code: params.get("error_code") ?? params.get("error") });
}

/** Return a message when a new password is unacceptable, or null when it can be submitted. */
export function newPasswordProblem(
  password: string,
  confirmation: string,
): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirmation) return "The two passwords don't match.";
  return null;
}
