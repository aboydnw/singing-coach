import "react-native-url-polyfill/auto";
import {
  createClient,
  processLock,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { AppState } from "react-native";
import { randomUUID } from "expo-crypto";
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
const pendingGoogleKey = "voice-up-google-started";
let googleFlow: Promise<Session | null> | undefined;
let completedCallback: { url: string; result: Promise<Session | null> } | undefined;

function isGoogleCallback(url: URL) {
  return (
    `${url.protocol}//${url.host}${url.pathname}` === AUTH_CALLBACK &&
    !url.username &&
    !url.password &&
    !url.port &&
    !url.hash
  );
}

// Shared by the browser result and native deep-link recovery. PKCE's verifier is
// persisted in Keychain by Supabase; never accept access tokens from a URL.
export function completeGoogleCallback(raw: string): Promise<Session | null> {
  let callback: URL;
  try {
    callback = new URL(raw);
  } catch {
    return Promise.resolve(null);
  }
  if (!isGoogleCallback(callback)) return Promise.resolve(null);
  if (!getPublicConfig().googleEnabled) return Promise.resolve(null);
  if (completedCallback?.url === raw) return completedCallback.result;
  const result = (async () => {
    const pending = JSON.parse(
      (await secureStorage.getItem(pendingGoogleKey)) ?? "null",
    ) as { started: number; nonce: string } | null;
    if (!pending || Date.now() - pending.started > 10 * 60_000) {
      await secureStorage.removeItem(pendingGoogleKey);
      throw new Error("This sign-in expired. Tap Continue with Google to try again.");
    }
    if (
      callback.searchParams.getAll("flow").length !== 1 ||
      callback.searchParams.get("flow") !== pending.nonce
    )
      return null;
    const codes = callback.searchParams.getAll("code");
    if (callback.searchParams.has("error") || codes.length !== 1 || !codes[0]) {
      await secureStorage.removeItem(pendingGoogleKey);
      throw new Error("Google sign-in did not finish. Please try again.");
    }
    let exchange;
    try {
      const flowId = callback.searchParams.get("sb_flow_id");
      exchange = await getNativeClient().auth.exchangeCodeForSession(
        codes[0],
        flowId ? { flowId } : undefined,
      );
    } finally {
      await secureStorage.removeItem(pendingGoogleKey);
    }
    if (exchange.error || !exchange.data.session) {
      throw new Error(
        "Could not finish Google sign-in. Tap Continue with Google to try again.",
      );
    }
    await secureStorage.removeItem(pendingGoogleKey);
    return exchange.data.session;
  })();
  completedCallback = { url: raw, result };
  // Keep only a consumed marker, never a reusable session from an old link.
  void result.then(
    () => {
      if (completedCallback?.url === raw)
        completedCallback.result = Promise.resolve(null);
    },
    () => {
      if (completedCallback?.url === raw)
        completedCallback.result = Promise.resolve(null);
    },
  );
  return result;
}

export function signInWithGoogle(): Promise<Session | null> {
  // Protect the PKCE verifier even when two taps arrive before React rerenders.
  if (googleFlow) return googleFlow;
  googleFlow = startGoogleSignIn().finally(() => {
    googleFlow = undefined;
  });
  return googleFlow;
}
async function startGoogleSignIn(): Promise<Session | null> {
  if (!getPublicConfig().googleEnabled)
    throw new Error("Google sign-in is not enabled in this build yet.");
  completedCallback = undefined;
  const auth = getNativeClient().auth;
  const nonce = randomUUID();
  await secureStorage.setItem(
    pendingGoogleKey,
    JSON.stringify({ started: Date.now(), nonce }),
  );
  try {
    const { data, error } = await auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${AUTH_CALLBACK}?flow=${nonce}`,
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) throw error;
    const result = await WebBrowser.openAuthSessionAsync(data.url, AUTH_CALLBACK);
    if (result.type !== "success") return null;
    if (!isGoogleCallback(new URL(result.url)))
      throw new Error("Unexpected sign-in callback.");
    return await completeGoogleCallback(result.url);
  } finally {
    await secureStorage.removeItem(pendingGoogleKey);
  }
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
