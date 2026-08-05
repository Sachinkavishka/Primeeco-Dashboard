/**
 * Validated, colorblind-safe categorical palette (light mode) from the dataviz
 * design system. Assign hues in this FIXED order — never cycled arbitrarily.
 * Beyond 8 categories, fold the rest into "Other".
 */
export const CATEGORICAL = [
  "#2a78d6", // 1 blue
  "#eb6834", // 2 orange
  "#1baf7a", // 3 aqua
  "#eda100", // 4 yellow
  "#e87ba4", // 5 magenta
  "#008300", // 6 green
  "#4a3aa7", // 7 violet
  "#e34948", // 8 red
] as const

export const OTHER_COLOR = "#94a3b8" // slate-400 for the "Other" bucket

/** Sequential blue ramp (light→dark) for single-hue magnitude encoding. */
export const BLUE = {
  100: "#cde2fb",
  200: "#9ec5f4",
  300: "#6da7ec",
  400: "#3987e5",
  500: "#256abf",
  600: "#184f95",
} as const

export function catColor(i: number): string {
  return i < CATEGORICAL.length ? CATEGORICAL[i] : OTHER_COLOR
}
