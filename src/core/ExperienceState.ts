/**
 * Coarse authoritative experience state. The scroll position, the
 * narrative phase, and the seed live here. Renderers observe it; nothing
 * renders its own version of the truth.
 */
export type Phase =
  | 'enter'
  | 'travel'
  | 'desk42'
  | 'rule'
  | 'brawler'
  | 'technology'
  | 'studio'
  | 'return';

export class ExperienceState {
  readonly seed: number;
  /** 0..1 document scroll progress, set by ScrollDirector only. */
  progress = 0;
  phase: Phase = 'enter';
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
