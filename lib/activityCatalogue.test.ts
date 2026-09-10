import { describe, expect, it } from "vitest";
import { DRILLS, DRILL_IDS } from "@/lib/pedagogy";
import {
  ACTIVITIES,
  activitiesForDrill,
  findActivity,
  validateActivityCatalogue,
} from "@/lib/activityCatalogue";

describe("technical activity catalogue", () => {
  it("has one faithful activity for every canonical drill", () => {
    expect(validateActivityCatalogue()).toEqual([]);
    for (const drill of DRILLS) {
      const activities = activitiesForDrill(drill.id);
      expect(activities.length, drill.id).toBeGreaterThan(0);
      expect(activities[0].instructions).toBe(drill.instructions);
    }
  });

  it("uses unique versioned identifiers", () => {
    const keys = ACTIVITIES.map((activity) => `${activity.id}@${activity.version}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses positive durations and note syllables", () => {
    for (const activity of ACTIVITIES) {
      for (const event of activity.events ?? []) {
        expect(event.duration_s, activity.id).toBeGreaterThan(0);
        if (event.kind === "note") expect(event.syllable, activity.id).not.toBe("");
      }
    }
  });

  it("finds activities by id", () => {
    expect(findActivity(ACTIVITIES[0].id)).toEqual(ACTIVITIES[0]);
    expect(findActivity("missing.activity")).toBeNull();
  });

  it("does not leave unknown or missing drill mappings", () => {
    expect(new Set(ACTIVITIES.map((activity) => activity.drill_id))).toEqual(
      new Set(DRILL_IDS),
    );
  });
});
