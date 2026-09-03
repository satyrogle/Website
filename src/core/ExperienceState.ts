/** Authoritative seed and accessibility state for the hero world. */
export class ExperienceState {
  readonly seed: number;
  reducedMotion = false;

  constructor(seed: number) {
    this.seed = seed;
  }
}

/**
 * One fixed default seed so every visitor sees the same world.
 *
 * Chosen 2026-09-02 from a million-world sweep under the damage rule
 * (docs/SEED_SEARCH.md). The previous seed, 20260818, is INELIGIBLE once
 * a yield leaves a permanent set: its consequence covers six sections
 * and delta-verify fails it. This world's amplifier fires twice - two
 * sections yield in one future and never in the other - and the
 * consequence reaches 23 sections.
 */
export const DEFAULT_SEED = 20569487;

export function seedFromLocation(): number {
  const raw = new URLSearchParams(window.location.search).get('seed');
  if (raw === null) return DEFAULT_SEED;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SEED;
}
