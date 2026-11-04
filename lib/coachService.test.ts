import { describe, expect, it } from "vitest";
import { measurementsSchema } from "@/lib/schema";
import { formatCoachUserMessage, isCalibratingSinger } from "@/lib/coachService";

describe("coach service", () => {
  it("keeps the first three saved sessions in calibration", () => {
    expect(isCalibratingSinger(3)).toBe(true);
    expect(isCalibratingSinger(4)).toBe(false);
    expect(isCalibratingSinger(null)).toBe(true);
  });

  it("formats server-owned context and strips null measurement fields", () => {
    const message = formatCoachUserMessage(
      {
        exercise_spec: null,
        measurements: measurementsSchema.parse({
          jitter_local: 0.01,
          accuracy: { per_note: [], mean_abs_cents_off: null },
        }),
        current_practice_session_id: "11111111-1111-1111-1111-111111111101",
        history: [],
      },
      true,
    );
    expect(message).toContain("calibrating: true");
    expect(message).toContain("11111111-1111-1111-1111-111111111101");
    expect(message).toContain('"jitter_local": 0.01');
    expect(message).not.toContain('"shimmer_local"');
    expect(message).not.toContain('"mean_abs_cents_off"');
  });
});
