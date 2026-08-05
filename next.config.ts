import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["@chakra-ui/react"],
  },
  /** Keep the riffrec session recorder out of production builds for real.
   * DevFeedback already refuses to load it there, but webpack registers a
   * dynamic import as a dependency while parsing, so the guard alone still
   * emits riffrec's chunk. Resolving it to an empty module drops it instead. */
  webpack: (config, { dev }) => {
    const recorderEnabled = dev || process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";
    if (!recorderEnabled) {
      config.resolve.alias = { ...config.resolve.alias, riffrec: false };
    }
    return config;
  },
};

export default nextConfig;
