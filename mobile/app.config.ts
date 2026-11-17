import type { ExpoConfig } from "expo/config";

const bundleIdentifier =
  process.env.IOS_BUNDLE_IDENTIFIER || "com.anthonynboyd.singingcoach";
const projectId = process.env.EAS_PROJECT_ID;

// The default iOS identifier is owner-approved. EAS project ownership remains explicit.
const config: ExpoConfig = {
  name: "Singing Coach",
  slug: "singing-coach-beta",
  version: "0.1.0",
  scheme: "singingcoach",
  orientation: "portrait",
  userInterfaceStyle: "light",
  platforms: ["ios"],
  ios: {
    ...(bundleIdentifier ? { bundleIdentifier } : {}),
    buildNumber: "1",
    supportsTablet: false,
    infoPlist: {
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
