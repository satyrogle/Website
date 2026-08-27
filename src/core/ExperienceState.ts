/** Authoritative seed and accessibility state for the hero world. */
export class ExperienceState {
  readonly seed: number;
  reducedMotion = false;

  constructor(seed: number) {
    this.seed = seed;
  }
}

/** One fixed default seed so every visitor sees the same world. */
export const DEFAULT_SEED = 20260818;

export function seedFromLocation(): number {
  const raw = new URLSearchParams(window.location.search).get('seed');
  if (raw === null) return DEFAULT_SEED;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SEED;
}
