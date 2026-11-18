import { afterEach, describe, expect, it, vi } from "vitest";

const releaseId = "com.anthonynboyd.singingcoach";
async function resolveConfig(identifier: string | undefined, profile?: string) {
  vi.resetModules();
  vi.stubEnv("IOS_BUNDLE_IDENTIFIER", identifier);
  vi.stubEnv("EAS_BUILD_PROFILE", profile);
  return (await import("../app.config")).default;
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("iOS release identity", () => {
  it("uses the App Store Connect name without changing the app identity", async () => {
    const config = await resolveConfig(undefined, "beta");
    expect(config.name).toBe("Voice Up: Singing Coach");
    expect(config.ios?.infoPlist?.CFBundleDisplayName).toBe("Voice Up");
    expect(config.scheme).toBe("singingcoach");
    expect(config.ios?.bundleIdentifier).toBe(releaseId);
  });
  it.each([undefined, ""])("uses the approved default for %s", async (identifier) => {
    expect((await resolveConfig(identifier)).ios?.bundleIdentifier).toBe(releaseId);
  });
  it("allows a separate identifier for isolated checks", async () => {
    expect(
      (await resolveConfig("com.example.check", "simulator")).ios?.bundleIdentifier,
    ).toBe("com.example.check");
  });
  it.each([undefined, "", releaseId])(
    "keeps the beta identity for %s",
    async (identifier) => {
      expect((await resolveConfig(identifier, "beta")).ios?.bundleIdentifier).toBe(
        releaseId,
      );
    },
  );
  it("rejects a conflicting beta identifier instead of silently signing another app", async () => {
    await expect(resolveConfig("com.example.check", "beta")).rejects.toThrow(
      "Unset IOS_BUNDLE_IDENTIFIER",
    );
  });
});
