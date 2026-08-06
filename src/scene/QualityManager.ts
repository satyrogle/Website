/**
 * QualityManager
 *
 * Decides once, at boot, how much machine we are allowed to spend, then
 * keeps watching frame time and steps down if the budget is missed.
 * It never steps back up: oscillating between tiers is far more visible
 * than simply running one notch below peak.
 */

export type QualityTier = 'high' | 'medium' | 'low';

export interface QualitySettings {
  tier: QualityTier;
  /** Ceiling on device pixel ratio. */
  maxPixelRatio: number;
  /** Square resolution of the reaction-diffusion state texture. */
  simResolution: number;
  /** Gray-Scott iterations per rendered frame. */
  simStepsPerFrame: number;
  /** Enable the bright-pass + composite bloom chain. */
  bloom: boolean;
  /** Radial subdivision of the ring and plate bevels. */
  geometryDetail: number;
  /** Number of vein filaments radiating from the core. */
  veinCount: number;
  /** Enable the shed particle system. */
  shedding: boolean;
}

const PRESETS: Record<QualityTier, Omit<QualitySettings, 'tier'>> = {
  high: {
    maxPixelRatio: 2,
    simResolution: 512,
    simStepsPerFrame: 8,
    bloom: true,
    geometryDetail: 1,
    veinCount: 132,
    shedding: true,
  },
  medium: {
    maxPixelRatio: 1.5,
    simResolution: 320,
    simStepsPerFrame: 6,
    bloom: true,
    geometryDetail: 0.7,
    veinCount: 84,
    shedding: true,
  },
  low: {
    maxPixelRatio: 1.25,
    simResolution: 192,
    simStepsPerFrame: 4,
    bloom: false,
    geometryDetail: 0.45,
    veinCount: 44,
    shedding: false,
  },
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
