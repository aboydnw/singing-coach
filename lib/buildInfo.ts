export const SOURCE_URL = "https://github.com/aboydnw/singing-coach";

export type BuildInfo = {
  version: string | null;
  versionUrl: string | null;
  updated: string | null;
};

/** Describe the running build from the commit SHA and build time injected by next.config.ts. */
export function buildInfo(
  commitSha: string | undefined,
  builtAt: string | undefined,
): BuildInfo {
  const sha = commitSha?.trim() || null;
  const date = builtAt ? new Date(builtAt) : null;
  const validDate = date && !Number.isNaN(date.getTime()) ? date : null;
  return {
    version: sha ? sha.slice(0, 7) : null,
    versionUrl: sha ? `${SOURCE_URL}/commit/${sha}` : null,
    updated: validDate
      ? validDate.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })
      : null,
  };
}
