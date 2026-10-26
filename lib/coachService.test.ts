import { describe, expect, it } from "vitest";
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
        measurements: { pitch_median_midi: 60, nested: { absent: null } },
        current_practice_session_id: "11111111-1111-1111-1111-111111111101",
        history: [],
      },
      true,
    );
    expect(message).toContain("calibrating: true");
    expect(message).toContain("11111111-1111-1111-1111-111111111101");
    expect(message).not.toContain('"absent"');
  });
});
