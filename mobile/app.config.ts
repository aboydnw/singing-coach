import type { ExpoConfig } from "expo/config";

const releaseBundleIdentifier = "com.anthonynboyd.singingcoach";
const bundleIdentifier = process.env.IOS_BUNDLE_IDENTIFIER || releaseBundleIdentifier;
if (
  process.env.EAS_BUILD_PROFILE === "beta" &&
  bundleIdentifier !== releaseBundleIdentifier
) {
  throw new Error(
    "The beta profile must use com.anthonynboyd.singingcoach. Unset IOS_BUNDLE_IDENTIFIER.",
  );
}
const projectId = process.env.EAS_PROJECT_ID;

// The default iOS identifier is owner-approved. EAS project ownership remains explicit.
const config: ExpoConfig = {
  name: "Voice Up: Singing Coach",
  slug: "singing-coach-beta",
  version: "0.1.0",
  scheme: "singingcoach",
  orientation: "portrait",
  userInterfaceStyle: "light",
  platforms: ["ios"],
  ios: {
    bundleIdentifier,
    buildNumber: "1",
    supportsTablet: false,
    infoPlist: {
      CFBundleDisplayName: "Voice Up",
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: false,
        NSAllowsLocalNetworking: true,
      },
      NSMicrophoneUsageDescription:
        "Record a singing take for you to review. It is sent for analysis only when you choose Send.",
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  plugins: [
    [
      "expo-audio",
      {
        microphonePermission: "Record a singing take for you to review before sending.",
        enableBackgroundRecording: false,
        enableBackgroundPlayback: false,
      },
    ],
    ["expo-secure-store", { faceIDPermission: false }],
    "expo-web-browser",
    "expo-asset",
  ],
  ...(projectId ? { extra: { eas: { projectId } } } : {}),
};
export default config;
