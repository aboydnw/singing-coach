import { z } from "zod";
import repertoire from "@/prompts/repertoire.json";
import { focusAreaSchema } from "@/lib/schema";

const eventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("note"),
    midi_offset: z.number().int(),
    duration_s: z.number().positive(),
    syllable: z.string().min(1),
  }),
  z.object({ kind: z.literal("rest"), duration_s: z.number().positive() }),
]);

const passageSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  title: z.string().min(1),
  excerpt: z.string().min(1),
  instructions: z.string().min(1),
  primary_cue: z.string().min(1),
  focus_areas: z.array(focusAreaSchema).min(1),
  source: z.object({
    work: z.string().min(1),
    publication_year: z.number().int(),
    public_domain_basis: z.string().min(1),
  }),
  events: z.array(eventSchema).min(1),
});

const parsed = z
  .object({
    passages: z.array(passageSchema),
    render_transpositions: z.array(z.number().int()).length(7),
  })
  .parse(repertoire);

export const PASSAGES = parsed.passages.map((passage) => ({
  ...passage,
  render_transpositions: parsed.render_transpositions,
}));
export type SongPassage = (typeof PASSAGES)[number];

export function passagesForFocus(focus: z.infer<typeof focusAreaSchema> | null) {
  return focus
    ? PASSAGES.filter((passage) => passage.focus_areas.includes(focus))
    : PASSAGES;
}

export function validateRepertoireCatalogue(): string[] {
  const errors: string[] = [];
  const keys = new Set<string>();
  for (const passage of PASSAGES) {
    const key = `${passage.id}@${passage.version}`;
    if (keys.has(key)) errors.push(`${key}: duplicate id and version`);
    keys.add(key);
    const duration = passage.events.reduce((sum, event) => sum + event.duration_s, 0);
    if (duration > 30) errors.push(`${key}: passage exceeds 30 seconds`);
    if (
      passage.source.publication_year >= 1931 &&
      !passage.source.public_domain_basis.includes("traditional")
    ) {
      errors.push(`${key}: public-domain basis requires review`);
    }
    if (passage.render_transpositions.join(",") !== "-6,-4,-2,0,2,4,6") {
      errors.push(`${key}: unexpected render transpositions`);
    }
  }
  return errors;
}
