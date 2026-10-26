import { describe, expect, it, vi } from "vitest";
import { practiceResumeSummary, replaceActivePractice } from "@/lib/practiceHome";

describe("practiceResumeSummary", () => {
  it("prefers the next direction, then cue, then focus", () => {
    expect(
      practiceResumeSummary({
        compass: {
          overallTrend: "Trend",
          currentSession: "Now",
          nextDirection: "Use the clean onset.",
        },
        tryCue: "Cue",
        focus: "Focus",
      }),
    ).toBe("Use the clean onset.");
    expect(practiceResumeSummary({ tryCue: "Cue", focus: "Focus" })).toBe("Cue");
  });

  it("does not expose raw diagnostic markdown", () => {
    const summary = practiceResumeSummary({
      focus:
        "**What the numbers tell you** - **jitter_0.004** — stable. More detail follows.",
    });
    expect(summary).toBe("What the numbers tell you — jitter 0.004 — stable.");
    expect(summary).not.toMatch(/\*\*|_/);
  });

  it("caps long prose at 140 characters without splitting a word", () => {
    const summary = practiceResumeSummary({ focus: "word ".repeat(50) });
    expect(summary.length).toBeLessThanOrEqual(140);
    expect(summary.endsWith("…")).toBe(true);
  });
});

describe("replaceActivePractice", () => {
  it("ends the current practice before creating its replacement", async () => {
    const order: string[] = [];
    const end = vi.fn(async () => {
      order.push("end");
    });
    const create = vi.fn(async () => {
      order.push("create");
      return { id: "new" };
    });
    await replaceActivePractice("old", "pitch", {
      load: async () => ({ attempts: [], contract: {} }),
      end,
      create,
    });
    expect(order).toEqual(["end", "create"]);
  });

  it("does not create when ending fails", async () => {
    const create = vi.fn();
    await expect(
      replaceActivePractice("old", "pitch", {
        load: async () => ({ attempts: [], contract: {} }),
        end: async () => {
          throw new Error("end failed");
        },
        create,
      }),
    ).rejects.toThrow("end failed");
    expect(create).not.toHaveBeenCalled();
  });
});
