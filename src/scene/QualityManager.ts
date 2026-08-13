/**
 * QualityManager
 *
 * Decides once, at boot, how much machine we are allowed to spend, then
 * keeps watching frame time and steps down if the budget is missed.
 * It never steps back up: oscillating between tiers is far more visible
 * than simply running one notch below peak.
 *
 * A tier sets two things: the ceiling on device pixel ratio, and whether the
 * hero's emissives are allowed their bloom pass. The simulation is fixed-step
 * in a Worker and cannot be thinned without changing what the system does, so
 * pixels and post are the only knobs that scale with the machine.
 *
 * Bloom is back after being removed with the retired entity — the ruptured
 * world's hot surfaces are light sources now, and a light source without
 * halation reads as paint. It is the first thing a struggling machine gives
 * up, before resolution: dropping glow is less visible than dropping pixels.
 */

export type QualityTier = 'high' | 'medium' | 'low';

export interface QualitySettings {
  tier: QualityTier;
  /** Ceiling on device pixel ratio. */
  maxPixelRatio: number;
  /** Whether the hero's emissives get their halation pass. */
  bloom: boolean;
}

const PRESETS: Record<QualityTier, Omit<QualitySettings, 'tier'>> = {
  high: { maxPixelRatio: 2, bloom: true },
  medium: { maxPixelRatio: 1.5, bloom: true },
  low: { maxPixelRatio: 1.25, bloom: false },
};

const ORDER: QualityTier[] = ['high', 'medium', 'low'];

function detectTier(): QualityTier {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const narrow = window.innerWidth < 820;
  const cores = navigator.hardwareConcurrency ?? 4;
  // Reported by Chromium; absent elsewhere, so only used as a demotion signal.
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;

  if (memory !== undefined && memory <= 4) return 'low';
  if (cores <= 4) return coarse || narrow ? 'low' : 'medium';
  if (coarse || narrow) return 'medium';
  if (cores <= 8) return 'medium';
  return 'high';
}

export class QualityManager {
  settings: QualitySettings;

  private frameTimes: number[] = [];
  private lastDemotion = 0;
  private listeners = new Set<(s: QualitySettings) => void>();

  constructor(forcedTier?: QualityTier) {
    const tier = forcedTier ?? detectTier();
    this.settings = { tier, ...PRESETS[tier] };
  }

  onChange(fn: (s: QualitySettings) => void): void {
    this.listeners.add(fn);
  }

  /**
   * Samples frame duration. If the running median sits above ~22ms
   * (roughly 45fps) across a full second of frames, drop a tier.
   */
  sample(deltaMs: number, nowMs: number): void {
    // Ignore tab-return spikes and the first frames after a resize.
    if (deltaMs > 250) return;

    this.frameTimes.push(deltaMs);
    if (this.frameTimes.length < 60) return;

    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    this.frameTimes.length = 0;

    if (median <= 22) return;
    // Leave three seconds between demotions so a step-down gets a fair
    // chance to take effect before we consider another.
    if (nowMs - this.lastDemotion < 3000) return;

    const index = ORDER.indexOf(this.settings.tier);
    if (index >= ORDER.length - 1) return;

    const next = ORDER[index + 1];
    this.settings = { tier: next, ...PRESETS[next] };
    this.lastDemotion = nowMs;
    this.listeners.forEach((fn) => fn(this.settings));
  }

  pixelRatio(): number {
    return Math.min(window.devicePixelRatio || 1, this.settings.maxPixelRatio);
  }
}
