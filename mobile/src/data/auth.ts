import "react-native-url-polyfill/auto";
import { createClient, processLock, type SupabaseClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { getPublicConfig } from "./config";
import { boundedFetch } from "./network";
import { secureStorage } from "./secureStorage";
export const AUTH_CALLBACK = "singingcoach://auth/callback";
let client: SupabaseClient | undefined;
export function getNativeClient(): SupabaseClient {
  if (!client) {
    const config = getPublicConfig();
    client = createClient(config.supabaseUrl, config.supabaseKey, {
      global: { fetch: boundedFetch() },
      auth: {
        storage: secureStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: "pkce",
        lock: processLock,
      },
    });
    AppState.addEventListener("change", (state) => {
      if (state === "active") client?.auth.startAutoRefresh();
      else client?.auth.stopAutoRefresh();
    });
    if (AppState.currentState === "active") client.auth.startAutoRefresh();
  }
  return client;
}
export async function signIn(email: string, password: string) {
  const result = await getNativeClient().auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (result.error) throw result.error;
  return result.data.session;
}
export async function signInWithGoogle() {
  if (!getPublicConfig().googleEnabled)
    throw new Error(
      "Google sign-in is not enabled for this beta yet. Use your existing email account.",
    );
  const auth = getNativeClient().auth;
  const { data, error } = await auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: AUTH_CALLBACK, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, AUTH_CALLBACK);
  if (result.type !== "success") return null;
  const callback = new URL(result.url);
  if (`${callback.protocol}//${callback.host}${callback.pathname}` !== AUTH_CALLBACK)
    throw new Error("Unexpected sign-in callback.");
  const code = callback.searchParams.get("code");
  if (!code || callback.searchParams.has("error"))
    throw new Error("Sign-in did not finish. Try again.");
  const exchange = await auth.exchangeCodeForSession(code);
  if (exchange.error) throw exchange.error;
  return exchange.data.session;
}
export async function signOut() {
  const { error } = await getNativeClient().auth.signOut({ scope: "local" });
  if (error) throw error;
}
export async function deleteAccount() {
  const client = getNativeClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw error ?? new Error("Sign in first.");
  const bucket = client.storage.from("recordings");
  for (;;) {
    const listed = await bucket.list(data.user.id, { limit: 100 });
    if (listed.error) throw listed.error;
    if (!listed.data.length) break;
    const removed = await bucket.remove(
      listed.data.map((file) => `${data.user!.id}/${file.name}`),
    );
    if (removed.error || !removed.data.length)
      throw removed.error ?? new Error("Could not remove recordings.");
  }
  const deleted = await client.rpc("delete_own_account");
  if (deleted.error) throw deleted.error;
  await signOut();
}
