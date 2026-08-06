/** Recharts requires concrete color strings. Keep measurement visualization
 * separate from product action semantics while retaining the shared palette. */
export const CHART_THEME = {
  grid: "#EADFCE",
  axis: "#8A7566",
  target: "#00917C",
  measured: "#D64B2A",
  healthy: "#4C9A70",
  ghost: "#8A7566",
} as const;
