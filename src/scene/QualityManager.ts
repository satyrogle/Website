/**
 * QualityManager
 *
 * Decides once, at boot, how much machine we are allowed to spend, then
 * keeps watching frame time and steps down if the budget is missed.
 * It never steps back up: oscillating between tiers is far more visible
 * than simply running one notch below peak.
 *
 * A tier currently sets exactly one thing: the ceiling on device pixel ratio.
 * That is not an oversight, it is what THE CORRECTION costs. The simulation is
 * fixed-step in a Worker and cannot be thinned without changing what the
 * system does, and the structure is drawn as untextured lines with no post —
 * so the only thing left that scales with the machine is how many pixels those
 * lines are rasterised into.
 *
 * The presets used to carry six more fields: bloom, geometry detail, vein
 * count, shedding, and two for a reaction-diffusion pass. Every one belonged
 * to the retired entity and none had a reader once it was removed. They are
 * gone rather than left as configuration nothing consults.
 */

export type QualityTier = 'high' | 'medium' | 'low';

export interface QualitySettings {
  tier: QualityTier;
  /** Ceiling on device pixel ratio. */
  maxPixelRatio: number;
}

const PRESETS: Record<QualityTier, Omit<QualitySettings, 'tier'>> = {
  high: { maxPixelRatio: 2 },
  medium: { maxPixelRatio: 1.5 },
  low: { maxPixelRatio: 1.25 },
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
