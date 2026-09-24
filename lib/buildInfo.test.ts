import { describe, expect, it } from "vitest";
import { SOURCE_URL, buildInfo } from "@/lib/buildInfo";

describe("buildInfo", () => {
  it("shortens the commit and links to it", () => {
    const sha = "7e19041fbd92a62000c71abaa890867154757063";
    const info = buildInfo(sha, "2026-09-24T03:15:00.000Z");
    expect(info.version).toBe("7e19041");
    expect(info.versionUrl).toBe(`${SOURCE_URL}/commit/${sha}`);
    expect(info.updated).toBe("Sep 24, 2026");
  });

  it("formats the date in UTC so server and browser agree", () => {
    expect(buildInfo(undefined, "2026-09-24T23:59:00.000Z").updated).toBe("Sep 24, 2026");
  });

  it("omits what the build did not provide", () => {
    expect(buildInfo("", "not a date")).toEqual({
      version: null,
      versionUrl: null,
      updated: null,
    });
    expect(buildInfo(undefined, undefined).version).toBeNull();
  });
});
