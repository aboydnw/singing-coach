import { describe, expect, it } from "vitest";
import { jobRefreshDelay } from "@/components/practice/usePracticeJobRefresh";

describe("jobRefreshDelay", () => {
  it("polls active work only while visible", () => {
    expect(jobRefreshDelay(true, "visible")).toBe(5_000);
    expect(jobRefreshDelay(true, "hidden")).toBeNull();
    expect(jobRefreshDelay(false, "visible")).toBeNull();
  });
});
