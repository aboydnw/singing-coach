import { describe, expect, it } from "vitest";
import {
  DRILLS,
  DRILL_IDS,
  STATES,
  STATE_IDS,
  fallbackState,
  findDrill,
  findState,
  renderCatalogue,
  resolveCoaching,
  stateForDrill,
} from "@/lib/pedagogy";
import { TYPE_ROTATION } from "@/lib/exercises";
import { measurementsSchema, type Measurements } from "@/lib/schema";
import resynthCorrections from "@/prompts/pedagogy.json";

const EMPTY: Measurements = measurementsSchema.parse({});

function measurements(overrides: Partial<Measurements>): Measurements {
  return { ...EMPTY, ...overrides };
}

describe("the asset itself", () => {
  it("has at least five states", () => {
    expect(STATES.length).toBeGreaterThanOrEqual(5);
  });

  it("gives every state a unique id", () => {
    expect(new Set(STATE_IDS).size).toBe(STATE_IDS.length);
  });

  it("gives every drill a globally unique id", () => {
    expect(new Set(DRILL_IDS).size).toBe(DRILL_IDS.length);
  });

  it("gives every state at least one drill", () => {
    for (const state of STATES) {
      expect(state.drills.length).toBeGreaterThan(0);
    }
  });

  it("gives every state at least one cue", () => {
    for (const state of STATES) {
      expect(state.cues.length).toBeGreaterThan(0);
    }
  });

  it("only names exercise types the generator can build", () => {
    for (const drill of DRILLS) {
      if (drill.exercise_type == null) continue;
      expect(TYPE_ROTATION).toContain(drill.exercise_type);
    }
  });

  it("only names corrections the resynthesis module implements", () => {
    const implemented = ["steady_pitch", "healthy_vibrato"];
    for (const state of STATES) {
      if (state.audible_correction === null) continue;
      expect(implemented).toContain(state.audible_correction);
    }
  });

  it("cites a source for every state", () => {
    for (const state of STATES) {
      expect(state.sources.length).toBeGreaterThan(0);
    }
  });

  // The external-focus rule in _readme was being enforced by review alone, and
  // review missed two cues. Anatomy words are a crude proxy for an internal
  // focus, but they are the part a test can catch. Drill instructions are
  // exempt: naming the jaw while explaining what to do is fine, it is the
  // in-the-moment cue that has to point outward.
  it("keeps anatomy out of the cues", () => {
    const anatomy =
      /\b(jaw|palate|larynx|diaphragm|throat|tongue|vocal folds?|vocal cords?|buzz\w*)\b/i;
    for (const state of STATES) {
      for (const cue of state.cues) {
        expect(cue, `${state.id}: "${cue}"`).not.toMatch(anatomy);
      }
    }
  });

  it("keeps the readme's editorial rule visible in the file", () => {
    expect(JSON.stringify(resynthCorrections._readme)).toContain("EXTERNAL focus");
  });
});

describe("lookups", () => {
  it("finds every state by id", () => {
    for (const id of STATE_IDS) expect(findState(id)?.id).toBe(id);
  });

  it("finds every drill by id", () => {
    for (const id of DRILL_IDS) expect(findDrill(id)?.id).toBe(id);
  });

  it("maps every drill back to the state that owns it", () => {
    for (const drill of DRILLS) {
      expect(stateForDrill(drill.id)?.drills).toContainEqual(drill);
    }
  });

  it("returns null for ids that are not in the asset", () => {
    expect(findState("not_a_state")).toBeNull();
    expect(findDrill("not_a_drill")).toBeNull();
  });
});

describe("the prompt catalogue", () => {
  it("names every state and every drill so the model can pick one", () => {
    const rendered = renderCatalogue();
    for (const id of STATE_IDS) expect(rendered).toContain(id);
    for (const id of DRILL_IDS) expect(rendered).toContain(id);
  });
});

describe("the signature fallback", () => {
  it("reads a breathy tone with steady pitch as hypoadduction", () => {
    const state = fallbackState(
      measurements({ hnr_mean: 11, shimmer_local: 0.12, jitter_local: 0.008 }),
    );
    expect(state.id).toBe("hypoadduction");
  });

  it("reads jitter and shimmer moving together as a support problem", () => {
    const state = fallbackState(
      measurements({ jitter_local: 0.03, shimmer_local: 0.15, hnr_mean: 21 }),
    );
    expect(state.id).toBe("breath_support_deficit");
  });

  it("reads a locked-up tone with elevated jitter as pressed", () => {
    const state = fallbackState(
      measurements({
        jitter_local: 0.03,
        shimmer_local: 0.02,
        hnr_mean: 24,
        vibrato_extent_cents: 8,
      }),
    );
    expect(state.id).toBe("pressed_phonation");
  });

  it("reads a slow wide wobble as irregular vibrato", () => {
    const state = fallbackState(
      measurements({ vibrato_rate_hz: 3.2, vibrato_extent_cents: 90, hnr_mean: 22 }),
    );
    expect(state.id).toBe("vibrato_irregular");
  });

  it("reads a very wide wobble as irregular even when the rate is unknown", () => {
    const state = fallbackState(
      measurements({ vibrato_rate_hz: null, vibrato_extent_cents: 200, hnr_mean: 22 }),
    );
    expect(state.id).toBe("vibrato_irregular");
  });

  it("does not call a healthy-width wobble irregular when the rate is unknown", () => {
    const state = fallbackState(
      measurements({ vibrato_rate_hz: null, vibrato_extent_cents: 70, hnr_mean: 22 }),
    );
    expect(state.id).not.toBe("vibrato_irregular");
  });

  it("reads a healthy straight tone as absent vibrato", () => {
    const state = fallbackState(
      measurements({
        vibrato_extent_cents: 6,
        vibrato_rate_hz: 5.4,
        hnr_mean: 23,
        jitter_local: 0.004,
      }),
    );
    expect(state.id).toBe("vibrato_absent");
  });

  it("reads one badly missed note among good ones as a register break", () => {
    const state = fallbackState(
      measurements({
        hnr_mean: 22,
        accuracy: {
          mean_abs_cents_off: 30,
          per_note: [
            { target_midi: 60, target_name: "C4", cents_off: 8 },
            { target_midi: 62, target_name: "D4", cents_off: -12 },
            { target_midi: 64, target_name: "E4", cents_off: -140 },
            { target_midi: 65, target_name: "F4", cents_off: 10 },
          ],
        },
      }),
    );
    expect(state.id).toBe("registration_instability");
  });

  it("falls back to a drill that is safe for everyone when nothing matches", () => {
    expect(fallbackState(EMPTY).id).toBe("breath_support_deficit");
  });
});

describe("resolving what the model chose", () => {
  it("keeps both ids when the model picks real ones", () => {
    const resolved = resolveCoaching("hypoadduction", "staccato_onsets", EMPTY);
    expect(resolved.state.id).toBe("hypoadduction");
    expect(resolved.drill.id).toBe("staccato_onsets");
    expect(resolved.used_fallback).toBe(false);
  });

  it("never returns an invented drill", () => {
    const resolved = resolveCoaching("hypoadduction", "sing_from_the_diaphragm", EMPTY);
    expect(DRILL_IDS).toContain(resolved.drill.id);
    expect(resolved.used_fallback).toBe(true);
  });

  it("recovers the owning state when only the state id is wrong", () => {
    const resolved = resolveCoaching("vibes", "straw_phonation", EMPTY);
    expect(resolved.state.id).toBe("pressed_phonation");
    expect(resolved.drill.id).toBe("straw_phonation");
    expect(resolved.used_fallback).toBe(true);
  });

  it("falls back on the measurements when both ids are invented", () => {
    const resolved = resolveCoaching("vibes", "vibes", measurements({ hnr_mean: 10 }));
    expect(resolved.state.id).toBe("hypoadduction");
    expect(STATE_IDS).toContain(resolved.state.id);
    expect(resolved.used_fallback).toBe(true);
  });

  it("always returns a drill belonging to the state it returns", () => {
    const resolved = resolveCoaching("nope", "nope", EMPTY);
    expect(resolved.state.drills.map((d) => d.id)).toContain(resolved.drill.id);
  });

  // A provider that ignores the strict schema and omits a field should reach
  // the fallback, not cost the singer their coaching.
  it("falls back when the model omits both ids", () => {
    const resolved = resolveCoaching(
      undefined,
      undefined,
      measurements({ hnr_mean: 10 }),
    );
    expect(resolved.state.id).toBe("hypoadduction");
    expect(resolved.used_fallback).toBe(true);
  });

  it("keeps a named drill when only the state id is missing", () => {
    const resolved = resolveCoaching(undefined, "straw_phonation", EMPTY);
    expect(resolved.state.id).toBe("pressed_phonation");
    expect(resolved.drill.id).toBe("straw_phonation");
  });

  it("keeps a named state when only the drill id is missing", () => {
    const resolved = resolveCoaching("vibrato_absent", undefined, EMPTY);
    expect(resolved.state.id).toBe("vibrato_absent");
    expect(resolved.state.drills.map((d) => d.id)).toContain(resolved.drill.id);
  });
});
