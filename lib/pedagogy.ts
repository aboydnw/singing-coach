/** Reads prompts/pedagogy.json, the curated pedagogy asset.
 *
 * The model chooses a state_id and a drill_id from this file; the canonical
 * technique text is resolved here, server-side, from the asset itself. That
 * split is the point: a hallucinated drill is advice about someone's throat,
 * so the model is allowed to select and to phrase, never to invent.
 */

import pedagogy from "@/prompts/pedagogy.json";
import type { Measurements } from "@/lib/schema";

export type Drill = {
  id: string;
  name: string;
  instructions: string;
  duration_s: number;
  exercise_type?: string | null;
};

export type PedagogyState = {
  id: string;
  display_name: string;
  plain_language_description: string;
  remediation_family: string;
  audible_correction: string | null;
  metric_signature: Record<string, string>;
  drills: Drill[];
  cues: string[];
  caution: string | null;
  sources: string[];
};

// The JSON import widens each state's metric_signature into a distinct literal
// type with optional keys, which does not overlap Record<string, string>.
// The shape is pinned by pedagogy.test.ts instead.
export const STATES = pedagogy.states as unknown as PedagogyState[];

export const STATE_IDS = STATES.map((s) => s.id) as [string, ...string[]];

export const DRILLS: Drill[] = STATES.flatMap((s) => s.drills);

export const DRILL_IDS = DRILLS.map((d) => d.id) as [string, ...string[]];

/** Vocal Function Exercises are the safe universal default: they are the
 * standard starting protocol for an unremarkable voice and are contraindicated
 * for nobody, which is what a fallback needs to be. */
const DEFAULT_STATE_ID = "breath_support_deficit";

export function findState(id: string): PedagogyState | null {
  return STATES.find((s) => s.id === id) ?? null;
}

export function findDrill(id: string): Drill | null {
  return DRILLS.find((d) => d.id === id) ?? null;
}

export function stateForDrill(id: string): PedagogyState | null {
  return STATES.find((s) => s.drills.some((d) => d.id === id)) ?? null;
}

/** A compact catalogue for the system prompt: enough for the model to choose
 * between states, not the full instruction text of every drill. The canonical
 * wording is resolved after the call, so sending it twice would only spend
 * tokens on text the singer receives either way. */
export function renderCatalogue(): string {
  return STATES.map((state) => {
    const signature = Object.entries(state.metric_signature)
      .map(([key, value]) => `      ${key}: ${value}`)
      .join("\n");
    const drills = state.drills.map((d) => `      ${d.id} - ${d.name}`).join("\n");
    const caution = state.caution ? `\n    caution: ${state.caution}` : "";
    return (
      `  ${state.id} (${state.display_name}) - family: ${state.remediation_family}\n` +
      `    ${state.plain_language_description}\n` +
      `    signature:\n${signature}\n` +
      `    drills:\n${drills}${caution}`
    );
  }).join("\n\n");
}

/** Deterministic signature match, used when the model returns an id that is not
 * in the asset. Ordered most-specific first: a per-note outlier is a stronger
 * claim than a mean, and both beat the formant signature, which the asset
 * itself warns is the weakest of the seven. */
export function fallbackState(m: Measurements): PedagogyState {
  const jitterHigh = m.jitter_local !== null && m.jitter_local > 0.02;
  const shimmerHigh = m.shimmer_local !== null && m.shimmer_local > 0.1;
  const hnrLow = m.hnr_mean !== null && m.hnr_mean < 15;
  const hnrHealthy = m.hnr_mean !== null && m.hnr_mean >= 20;
  const extent = m.vibrato_extent_cents;
  const rate = m.vibrato_rate_hz;

  if (hasPerNoteOutlier(m)) return state("registration_instability");
  if (jitterHigh && shimmerHigh) return state("breath_support_deficit");
  if (hnrLow && !jitterHigh) return state("hypoadduction");
  if (jitterHigh && hnrHealthy && extent !== null && extent < 20) {
    return state("pressed_phonation");
  }
  if (extent !== null && extent >= 20 && rate !== null) {
    if (rate < 4.5 || rate > 6.5 || extent > 120) return state("vibrato_irregular");
  }
  if (extent !== null && extent < 20 && !jitterHigh && hnrHealthy) {
    return state("vibrato_absent");
  }
  return state(DEFAULT_STATE_ID);
}

/** A single note far worse than its neighbours points at a register break
 * rather than at general pitch inaccuracy, which spreads error evenly. */
function hasPerNoteOutlier(m: Measurements): boolean {
  const offsets = (m.accuracy?.per_note ?? [])
    .map((n) => n.cents_off)
    .filter((c): c is number => c !== null)
    .map(Math.abs);
  if (offsets.length < 3) return false;
  const sorted = [...offsets].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const worst = sorted[sorted.length - 1];
  return worst > 60 && worst > median * 2.5;
}

function state(id: string): PedagogyState {
  const found = findState(id);
  if (!found) throw new Error(`pedagogy.json is missing the '${id}' state`);
  return found;
}

export type ResolvedCoaching = {
  state: PedagogyState;
  drill: Drill;
  /** True when the model's ids did not resolve and the signature match was
   * used instead. Surfaced so the route can log it and the eval can count it. */
  used_fallback: boolean;
};

/** Resolve the model's chosen ids against the asset, failing closed. An
 * unknown id never propagates: a real drill for a plausible state beats an
 * invented one, so a miss falls back to the signature match rather than to
 * whatever the model wrote. */
export function resolveCoaching(
  stateId: string,
  drillId: string,
  measurements: Measurements,
): ResolvedCoaching {
  const chosenState = findState(stateId);
  const chosenDrill = findDrill(drillId);

  if (chosenState && chosenDrill) {
    // A drill from another state is not a miss worth discarding - the families
    // overlap, and a straw drill is a straw drill whichever state named it.
    return { state: chosenState, drill: chosenDrill, used_fallback: false };
  }
  if (!chosenState && chosenDrill) {
    const owner = stateForDrill(drillId);
    if (owner) return { state: owner, drill: chosenDrill, used_fallback: true };
  }

  const fallback = chosenState ?? fallbackState(measurements);
  return { state: fallback, drill: fallback.drills[0], used_fallback: true };
}
