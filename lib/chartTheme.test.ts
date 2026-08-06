import { describe, expect, it } from "vitest";
import { CHART_THEME } from "@/lib/chartTheme";

describe("chart theme", () => {
  it("keeps target and measured series visually distinct", () => {
    expect(CHART_THEME.target).not.toBe(CHART_THEME.measured);
  });

  it("keeps every Recharts value concrete", () => {
    expect(
      Object.values(CHART_THEME).every((value) => /^#[0-9A-F]{6}$/i.test(value)),
    ).toBe(true);
  });
});
