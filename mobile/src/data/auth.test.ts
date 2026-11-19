import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  createClient: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  openAuthSessionAsync: vi.fn(),
  config: {
    supabaseUrl: "https://project.example",
    supabaseKey: "sb_publishable_test",
    apiBaseUrl: "https://api.example",
    googleEnabled: true,
  },
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "test-flow" }));
vi.mock("react-native-url-polyfill/auto", () => ({}));
vi.mock("react-native", () => ({
  AppState: { currentState: "inactive", addEventListener: vi.fn() },
}));
vi.mock("expo-web-browser", () => ({ openAuthSessionAsync: mocks.openAuthSessionAsync }));
vi.mock("./secureStorage", () => ({
  secureStorage: {
    getItem: async (k: string) => mocks.storage.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      mocks.storage.set(k, v);
    },
    removeItem: async (k: string) => {
      mocks.storage.delete(k);
    },
  },
}));
vi.mock("./config", () => ({ getPublicConfig: () => mocks.config }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
  processLock: vi.fn(),
}));
import {
  signIn,
  signInWithGoogle,
  getNativeClient,
  completeGoogleCallback,
  AUTH_CALLBACK,
} from "./auth";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.storage.clear();
  mocks.config.googleEnabled = true;
  mocks.createClient.mockReturnValue({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signInWithOAuth: mocks.signInWithOAuth,
      exchangeCodeForSession: mocks.exchangeCodeForSession,
    },
  });
  mocks.signInWithOAuth.mockResolvedValue({
    data: { url: "https://provider.example" },
    error: null,
  });
  mocks.exchangeCodeForSession.mockResolvedValue({
    data: { session: { user: { id: "test" } } },
    error: null,
  });
});
describe("native authentication", () => {
  it("initializes secure PKCE without browser URL session detection", () => {
    getNativeClient();
    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://project.example",
      "sb_publishable_test",
      expect.objectContaining({
        auth: expect.objectContaining({
          flowType: "pkce",
          persistSession: true,
          detectSessionInUrl: false,
        }),
      }),
    );
  });
  it("uses existing password sign-in, never sign-up", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: { user: { id: "test" } } },
      error: null,
    });
    await signIn(" test@example.test ", "password");
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "test@example.test",
      password: "password",
    });
  });
  it("exchanges only a code from the exact native callback", async () => {
    mocks.openAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: AUTH_CALLBACK + "?flow=test-flow&code=test-code",
    });
    await signInWithGoogle();
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("test-code", undefined);
  });
  it("rejects callback origins other than the registered app callback", async () => {
    mocks.openAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: "https://attacker.example/auth/callback?code=test-code",
    });
    await expect(signInWithGoogle()).rejects.toThrow("Unexpected");
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });
  it("does not start unconfigured Google sign-in", async () => {
    mocks.config.googleEnabled = false;
    await expect(signInWithGoogle()).rejects.toThrow("not enabled");
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });
  it("cancellation never creates a session", async () => {
    mocks.openAuthSessionAsync.mockResolvedValue({ type: "cancel" });
    expect(await signInWithGoogle()).toBeNull();
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});

describe("Google callback recovery", () => {
  it("recovers a cold-launch code using the persisted pending flow", async () => {
    mocks.storage.set(
      "voice-up-google-started",
      JSON.stringify({ started: Date.now(), nonce: "test-flow" }),
    );
    const url = AUTH_CALLBACK + "?flow=test-flow&code=cold-code";
    const [one, two] = await Promise.all([
      completeGoogleCallback(url),
      completeGoogleCallback(url),
    ]);
    expect(one).toEqual(two);
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(mocks.storage.size).toBe(0);
    expect(await completeGoogleCallback(url)).toBeNull();
  });
  it("rejects expired and unsolicited callbacks", async () => {
    await expect(
      completeGoogleCallback(AUTH_CALLBACK + "?code=unsolicited"),
    ).rejects.toThrow("expired");
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });
  it("does not accept fragment tokens, credentials or wrong paths", async () => {
    for (const url of [
      AUTH_CALLBACK + "#access_token=no",
      "singingcoach://user@auth/callback?code=no",
      AUTH_CALLBACK + "/extra?code=no",
    ])
      expect(await completeGoogleCallback(url)).toBeNull();
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });
  it("rejects provider errors without exposing their contents", async () => {
    mocks.storage.set(
      "voice-up-google-started",
      JSON.stringify({ started: Date.now(), nonce: "test-flow" }),
    );
    await expect(
      completeGoogleCallback(
        AUTH_CALLBACK + "?flow=test-flow&error=denied&error_description=private",
      ),
    ).rejects.toThrow("did not finish");
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });
  it("serializes rapid starts so they cannot overwrite the PKCE verifier", async () => {
    mocks.openAuthSessionAsync.mockResolvedValue({ type: "cancel" });
    await Promise.all([signInWithGoogle(), signInWithGoogle()]);
    expect(mocks.signInWithOAuth).toHaveBeenCalledTimes(1);
    expect(mocks.storage.size).toBe(0);
  });
});

it("ignores callbacks for a different flow without consuming the verifier", async () => {
  mocks.storage.set(
    "voice-up-google-started",
    JSON.stringify({ started: Date.now(), nonce: "expected" }),
  );
  expect(
    await completeGoogleCallback(AUTH_CALLBACK + "?flow=wrong&code=stray"),
  ).toBeNull();
  expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  expect(mocks.storage.has("voice-up-google-started")).toBe(true);
});

it("clears a failed cold-launch flow and forwards Supabase's verifier slot", async () => {
  mocks.storage.set(
    "voice-up-google-started",
    JSON.stringify({ started: Date.now(), nonce: "test-flow" }),
  );
  mocks.exchangeCodeForSession.mockResolvedValueOnce({
    data: { session: null },
    error: new Error("expired"),
  });
  await expect(
    completeGoogleCallback(
      AUTH_CALLBACK + "?flow=test-flow&code=expired&sb_flow_id=abcdefgh",
    ),
  ).rejects.toThrow("Could not finish");
  expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("expired", {
    flowId: "abcdefgh",
  });
  expect(mocks.storage.size).toBe(0);
});
