export type PublicConfig = {
  supabaseUrl: string;
  supabaseKey: string;
  apiBaseUrl: string;
  googleEnabled: boolean;
};
function isPublicKey(key: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  // Legacy anon JWTs are public credentials. Inspect their role; the server verifies
  // signature/expiry. Never accept service-role JWTs or secret-key formats.
  const parts = key.split(".");
  if (parts.length !== 3 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part)))
    return false;
  try {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let bits = 0,
      value = 0,
      decoded = "";
    for (const char of parts[1].replace(/-/g, "+").replace(/_/g, "/")) {
      const digit = alphabet.indexOf(char);
      if (digit < 0) return false;
      value = (value << 6) | digit;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        decoded += String.fromCharCode((value >> bits) & 255);
      }
    }
    const payload = JSON.parse(decoded);
    return payload.role === "anon" && payload.iss === "supabase";
  } catch {
    return false;
  }
}

export function parsePublicConfig(env: Record<string, string | undefined>): PublicConfig {
  const url = (key: string) => {
    const value = env[key];
    if (!value) throw new Error(`Missing ${key}. Configure this beta before signing in.`);
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== "/"
    )
      throw new Error(`${key} must be an HTTPS origin.`);
    return parsed.origin;
  };
  const supabaseKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!isPublicKey(supabaseKey))
    throw new Error(
      "Configure a Supabase publishable or legacy anon key, never a secret or service-role key.",
    );
  return {
    supabaseUrl: url("EXPO_PUBLIC_SUPABASE_URL"),
    apiBaseUrl: url("EXPO_PUBLIC_API_BASE_URL"),
    supabaseKey,
    googleEnabled: env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED === "true",
  };
}
export function getPublicConfig(): PublicConfig {
  return parsePublicConfig({
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
    EXPO_PUBLIC_GOOGLE_AUTH_ENABLED: process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED,
  });
}
