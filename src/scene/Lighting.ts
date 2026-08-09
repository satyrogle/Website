import type { EntityLightState } from './DarkLatticeMonolithModel';

/**
 * Lighting
 *
 * The monolith uses a compact analytic shading model rather than Three's
 * light objects, so the arc is data: this samples prologue progress and
 * publishes the state the entity reads.
 *
 * Exposure and bloom fall through the tunnel because the camera is
 * inside the building there, sometimes centimetres from an emissive
 * fissure. Fog rises at the same time, which is what gives the corridor
 * its depth.
 */

interface LightKeyframe {
  at: number;
  keyIntensity: number;
  rimIntensity: number;
  fillIntensity: number;
  /** Fissure emissive gain. */
  emissive: number;
  /** Surface displacement from the field. */
  displace: number;
  /** Fissure edge hardness: soft glow early, etched channels late. */
  sharp: number;
  /** Halo brightness. Falls to nothing once the camera is inside. */
  halo: number;
  fog: number;
  exposure: number;
  bloom: number;
  vignette: number;
}

const ARC: LightKeyframe[] = [
  // Full Form — the building carries itself out of the void.
  {
    at: 0.0,
    keyIntensity: 0.75, rimIntensity: 1.35, fillIntensity: 0.9,
    emissive: 1.0, displace: 0.008, sharp: 0.5, halo: 1.0,
    fog: 0.016, exposure: 1.15, bloom: 0.5, vignette: 0.9,
  },
  // Opening — the masses displace; the passage becomes legible.
  {
    at: 0.24,
    keyIntensity: 0.9, rimIntensity: 1.25, fillIntensity: 0.95,
    emissive: 1.15, displace: 0.01, sharp: 0.52, halo: 0.7,
    fog: 0.02, exposure: 1.0, bloom: 0.42, vignette: 0.9,
  },
  // Entry.
  {
    at: 0.44,
    keyIntensity: 0.95, rimIntensity: 1.15, fillIntensity: 0.85,
    emissive: 1.3, displace: 0.012, sharp: 0.58, halo: 0.12,
    fog: 0.046, exposure: 0.9, bloom: 0.3, vignette: 0.94,
  },
  // Tunnel midpoint.
  {
    at: 0.62,
    keyIntensity: 0.95, rimIntensity: 1.2, fillIntensity: 0.85,
    emissive: 1.35, displace: 0.012, sharp: 0.6, halo: 0,
    fog: 0.048, exposure: 0.88, bloom: 0.3, vignette: 0.95,
  },
  // Approach — the travel slows and the chamber opens out.
  {
    at: 0.82,
    keyIntensity: 0.9, rimIntensity: 1.25, fillIntensity: 0.9,
    emissive: 1.2, displace: 0.01, sharp: 0.64, halo: 0,
    fog: 0.038, exposure: 0.94, bloom: 0.34, vignette: 0.92,
  },
  // Latent Form — still, concentrated, carrying what was retained.
  {
    at: 1.0,
    keyIntensity: 0.95, rimIntensity: 1.35, fillIntensity: 0.9,
    emissive: 1.15, displace: 0.008, sharp: 0.68, halo: 0,
    fog: 0.026, exposure: 1.0, bloom: 0.4, vignette: 0.9,
  },
];

export interface PostState {
  exposure: number;
  bloom: number;
  vignette: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export class Lighting {
  private state: LightKeyframe = { ...ARC[0] };
  readonly post: PostState = { exposure: 1.05, bloom: 0.5, vignette: 0.9 };

  /** 0..1 reveal out of near-darkness, driven by the boot hand-off. */
  private wake = 0;

  readonly entityState: EntityLightState = {
    keyDir: [0.28, 0.66, 0.7],
    emissive: 1,
    wake: 0,
    fog: 0.03,
    keyIntensity: 0.75,
    rimIntensity: 1.35,
    fillIntensity: 0.9,
    displace: 0.008,
    sharp: 0.5,
    halo: 1,
  };

  setWake(value: number): void {
    this.wake = Math.min(Math.max(value, 0), 1);
  }

  private sample(progress: number): LightKeyframe {
    let i = 0;
    while (i < ARC.length - 2 && ARC[i + 1].at < progress) i++;
    const a = ARC[i];
    const b = ARC[i + 1] ?? a;
    const span = Math.max(b.at - a.at, 1e-5);
    const t = smoothstep(Math.min(Math.max((progress - a.at) / span, 0), 1));

    return {
      at: progress,
      keyIntensity: lerp(a.keyIntensity, b.keyIntensity, t),
      rimIntensity: lerp(a.rimIntensity, b.rimIntensity, t),
      fillIntensity: lerp(a.fillIntensity, b.fillIntensity, t),
      emissive: lerp(a.emissive, b.emissive, t),
      displace: lerp(a.displace, b.displace, t),
      sharp: lerp(a.sharp, b.sharp, t),
      halo: lerp(a.halo, b.halo, t),
      fog: lerp(a.fog, b.fog, t),
      exposure: lerp(a.exposure, b.exposure, t),
      bloom: lerp(a.bloom, b.bloom, t),
      vignette: lerp(a.vignette, b.vignette, t),
    };
  }

  update(progress: number, time: number, dt: number): void {
    const goal = this.sample(progress);
    // Damped so a fast scroll flick cannot strobe the lighting.
    const ease = 1 - Math.pow(0.002, dt);
    const s = this.state;
    (Object.keys(goal) as (keyof LightKeyframe)[]).forEach((k) => {
      s[k] = lerp(s[k], goal[k], ease);
    });

    const entity = this.entityState;
    entity.emissive = s.emissive;
    entity.wake = this.wake;
    entity.fog = s.fog;
    entity.keyIntensity = s.keyIntensity;
    entity.rimIntensity = s.rimIntensity;
    entity.fillIntensity = s.fillIntensity;
    entity.displace = s.displace;
    entity.sharp = s.sharp;
    entity.halo = s.halo;

    // A very slow swing on the key, below the threshold of notice, so
    // the building does not read as a static render.
    entity.keyDir = [
      0.28,
      0.66 + Math.cos(time * 0.06) * 0.04,
      0.7 + Math.sin(time * 0.08) * 0.06,
    ];

    this.post.exposure = s.exposure;
    this.post.bloom = s.bloom;
    this.post.vignette = s.vignette;
  }
}
