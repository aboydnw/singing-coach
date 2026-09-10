import { describe, expect, it } from "vitest";
import {
  PASSAGES,
  passagesForFocus,
  passageSchema,
  validateRepertoireCatalogue,
} from "@/lib/repertoireCatalogue";

describe("public-domain repertoire catalogue", () => {
  it("contains twelve short, versioned passages with rights provenance", () => {
    expect(PASSAGES).toHaveLength(12);
    expect(validateRepertoireCatalogue()).toEqual([]);
    expect(
      new Set(PASSAGES.map((passage) => `${passage.id}@${passage.version}`)).size,
    ).toBe(PASSAGES.length);

    for (const passage of PASSAGES) {
      const duration = passage.events.reduce((sum, event) => sum + event.duration_s, 0);
      expect(duration, passage.id).toBeLessThanOrEqual(30);
      expect(passage.source.public_domain_basis, passage.id).not.toBe("");
      expect(passage.focus_areas.length, passage.id).toBeGreaterThan(0);
      expect(passage.render_transpositions).toEqual([-6, -4, -2, 0, 2, 4, 6]);
    }
  });

  it("finds passages that genuinely apply the current focus", () => {
    expect(passagesForFocus("pitch_accuracy").length).toBeGreaterThan(1);
    expect(
      passagesForFocus("breath_support").every((passage) =>
        passage.focus_areas.includes("breath_support"),
      ),
    ).toBe(true);
  });

  it("rejects passages made entirely of rests", () => {
    expect(
      passageSchema.safeParse({
        ...PASSAGES[0],
        events: [{ kind: "rest", duration_s: 1 }],
      }).success,
    ).toBe(false);
  });

  it("does not infer rights approval from free-form text", () => {
    const future = {
      ...PASSAGES[0],
      source: {
        ...PASSAGES[0].source,
        publication_year: 2035,
        public_domain_basis: "traditional",
      },
    };
    expect(validateRepertoireCatalogue([future])).toContain(
      `${future.id}@${future.version}: public-domain basis requires review`,
    );
  });
});
