import { z } from "zod";
import catalogue from "@/prompts/activities.json";
import { DRILL_IDS, findDrill } from "@/lib/pedagogy";

const relativeEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("note"),
    midi_offset: z.number().int(),
    duration_s: z.number().positive(),
    syllable: z.string().min(1),
    phoneme_hint: z.string().min(1).optional(),
    articulation: z.string().min(1).optional(),
    dynamic: z.number().min(0).max(1).optional(),
  }),
  z.object({ kind: z.literal("rest"), duration_s: z.number().positive() }),
]);

const activitySchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  drill_id: z.string().min(1),
  mode: z.enum(["scored", "guided"]),
  vowel: z.string().min(1),
  events: z.array(relativeEventSchema),
  reference_audio: z
    .array(
      z.object({
        semitones: z.number().int(),
        src: z.string().startsWith("/audio/activities/"),
        engine: z.string().min(1),
        model: z.string().min(1),
        voicebank: z.string().min(1),
        dataset: z.string().min(1),
        output_license: z.string().min(1),
        reviewed: z.literal(true),
      }),
    )
    .optional(),
  variety: z.object({
    shape: z.string().min(1),
    rhythm: z.string().min(1),
    direction: z.string().min(1),
    articulation: z.string().min(1),
    dynamics: z.string().min(1),
  }),
});

const parsed = z.object({ activities: z.array(activitySchema) }).parse(catalogue);

export type TechnicalActivity = (typeof parsed.activities)[number] & {
  instructions: string;
};

export const ACTIVITIES: TechnicalActivity[] = parsed.activities.map((activity) => ({
  ...activity,
  instructions: findDrill(activity.drill_id)?.instructions ?? "",
}));

export function newestActivityVersion<T extends { id: string; version: number }>(
  activities: T[],
  id: string,
): T | null {
  return (
    activities
      .filter((activity) => activity.id === id)
      .sort((a, b) => b.version - a.version)[0] ?? null
  );
}

export function findActivity(id: string, version?: number): TechnicalActivity | null {
  if (version !== undefined) {
    return (
      ACTIVITIES.find((activity) => activity.id === id && activity.version === version) ??
      null
    );
  }
  return newestActivityVersion(ACTIVITIES, id);
}

export function activitiesForDrill(drillId: string): TechnicalActivity[] {
  return ACTIVITIES.filter((activity) => activity.drill_id === drillId);
}

export function validateActivityCatalogue(): string[] {
  const errors: string[] = [];
  const keys = new Set<string>();
  for (const activity of ACTIVITIES) {
    const key = `${activity.id}@${activity.version}`;
    if (keys.has(key)) errors.push(`${key}: duplicate id and version`);
    keys.add(key);
    if (!DRILL_IDS.includes(activity.drill_id)) {
      errors.push(`${key}: unknown drill ${activity.drill_id}`);
    }
    if (!activity.instructions) errors.push(`${key}: missing canonical instructions`);
    if (activity.mode === "scored" && activity.events.length === 0) {
      errors.push(`${key}: scored activity has no events`);
    }
    if (activity.mode === "guided" && activity.events.length > 0) {
      errors.push(`${key}: guided activity must not have scored events`);
    }
  }
  for (const drillId of DRILL_IDS) {
    if (!ACTIVITIES.some((activity) => activity.drill_id === drillId)) {
      errors.push(`${drillId}: missing activity`);
    }
  }
  return errors;
}
