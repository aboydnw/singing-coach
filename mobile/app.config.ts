import type { ExpoConfig } from "expo/config";

const bundleIdentifier = process.env.IOS_BUNDLE_IDENTIFIER;
const projectId = process.env.EAS_PROJECT_ID;

// Identifiers are deliberately not guessed or provisioned by this repository.
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
