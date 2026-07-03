// Pure numeric helpers. Kept dependency-free and unit-tested locally.

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  if (p <= 0) return Math.min(...values);
  if (p >= 100) return Math.max(...values);
  const sorted = [...values].sort((a, b) => a - b);
  // Nearest-rank on a 0-based index; deterministic and conservative for p95
  // on small samples (rounds toward the higher observation).
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(idx, 0), sorted.length - 1)];
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function round1(v: number | null): number | null {
  return v === null ? null : Math.round(v * 10) / 10;
}

// Route-quality improvement of the aggregated best route over the best single
// alternative, in basis points of output. 0 when there is only one route.
export function improvementBps(outputs: number[]): number | null {
  if (outputs.length === 0) return null;
  if (outputs.length === 1) return 0;
  const sorted = [...outputs].sort((a, b) => b - a);
  const [best, second] = [sorted[0], sorted[1]];
  if (second <= 0) return null;
  return ((best - second) / second) * 10_000;
}
