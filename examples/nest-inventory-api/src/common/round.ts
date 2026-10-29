/** Rounds to two decimals. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Average rounded to two decimals, or `null` for an empty list. */
export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return round2(values.reduce((sum, value) => sum + value, 0) / values.length);
}
