import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
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
vi.mock("react-native-url-polyfill/auto", () => ({}));
vi.mock("react-native", () => ({
  AppState: { currentState: "inactive", addEventListener: vi.fn() },
}));
vi.mock("expo-web-browser", () => ({ openAuthSessionAsync: mocks.openAuthSessionAsync }));
vi.mock("./secureStorage", () => ({ secureStorage: {} }));
vi.mock("./config", () => ({ getPublicConfig: () => mocks.config }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
  processLock: vi.fn(),
}));
import { signIn, signInWithGoogle, getNativeClient, AUTH_CALLBACK } from "./auth";
beforeEach(() => {
  vi.clearAllMocks();
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
      url: AUTH_CALLBACK + "?code=test-code",
    });
    await signInWithGoogle();
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("test-code");
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
