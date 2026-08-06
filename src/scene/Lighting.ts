
/**
 * Lighting
 *
 * The lattice uses a compact analytic shading model rather than Three's
 * light objects, so "lighting" here means driving that model's uniforms
 * along the narrative. Keeping it in one place makes the emotional arc
 * legible as data: near-darkness and hard rim at the cold open, even and
 * revealing at the foundation, deliberately dimmed and near-monochrome
 * across the evidence boundary, stable at the resolution.
 *
 * Exposure and bloom are pulled DOWN through the middle movements, which
 * is counter-intuitive until you remember the camera is inside the
 * object there, sometimes centimetres from an emissive surface. Carrying
 * the outdoor gain indoors blew half the frame to white and took the
 * copy with it. Fog rises at the same time, which is what gives the
 * corridor its depth.
 */

interface LightKeyframe {
  at: number;
  keyIntensity: number;
  rimIntensity: number;
  fillIntensity: number;
  /** Reaction emissive gain — how hard the chemistry burns. */
  emissive: number;
  /** Ring brightness. */
  ring: number;
  /** Surface displacement from the field. */
  displace: number;
  /** Channel edge hardness. */
  sharp: number;
  /** Prestige accent. Non-zero only at decisive moments. */
  amber: number;
  /**
   * Ferrofluid / psychedelic intensity. Zero outside the corridor so
   * the locked hero stays stone; rises to full while travelling the
   * tunnel, where the patterns ooze out of the surface.
   */
  psy: number;
  fog: number;
  /** Post exposure and bloom. */
  exposure: number;
  bloom: number;
  vignette: number;
}

const ARC: LightKeyframe[] = [
  // 01 — cold open. The iridescent monolith carries itself; the rim
  // carves it out of the void.
  {
    at: 0.0,
    keyIntensity: 0.7, rimIntensity: 1.5, fillIntensity: 0.95,
    emissive: 1.0, ring: 1.3, displace: 0.012, sharp: 0.5, amber: 0, psy: 0,
    // Fog raised so the corridor behind the crown drowns at the hero:
    // the entity hangs in void, not in front of visible machinery.
    fog: 0.058, exposure: 1.1, bloom: 0.62, vignette: 0.9,
  },
  // 02 — premise. The door opens; the trip is visible through it.
  {
    at: 0.2,
    keyIntensity: 0.85, rimIntensity: 1.3, fillIntensity: 1.0,
    emissive: 1.15, ring: 1.1, displace: 0.012, sharp: 0.5, amber: 0, psy: 0.6,
    fog: 0.038, exposure: 1.06, bloom: 0.4, vignette: 0.9,
  },
  // 03a/b/c — the trip. Full pattern, moderate bloom so the colour
  // stays saturated instead of blowing to white.
  {
    at: 0.35,
    keyIntensity: 0.9, rimIntensity: 1.1, fillIntensity: 0.9,
    emissive: 1.3, ring: 1.0, displace: 0.012, sharp: 0.55, amber: 0, psy: 1.0,
    fog: 0.03, exposure: 1.06, bloom: 0.3, vignette: 0.9,
  },
  {
    at: 0.45,
    keyIntensity: 0.9, rimIntensity: 1.15, fillIntensity: 0.9,
    emissive: 1.4, ring: 1.0, displace: 0.014, sharp: 0.5, amber: 0, psy: 1.0,
    fog: 0.03, exposure: 1.06, bloom: 0.3, vignette: 0.92,
  },
  {
    at: 0.55,
    keyIntensity: 0.9, rimIntensity: 1.2, fillIntensity: 0.95,
    emissive: 1.35, ring: 1.0, displace: 0.012, sharp: 0.55, amber: 0, psy: 1.0,
    fog: 0.03, exposure: 1.06, bloom: 0.3, vignette: 0.9,
  },
  // 04 — foundation. Trip eases while the thirds separate.
  {
    at: 0.655,
    keyIntensity: 1.0, rimIntensity: 1.2, fillIntensity: 1.05,
    emissive: 1.2, ring: 0.95, displace: 0.01, sharp: 0.6, amber: 0.1, psy: 0.8,
    fog: 0.028, exposure: 1.06, bloom: 0.48, vignette: 0.86,
  },
  // 05 — accumulation. Calming; the pattern slows its claim.
  {
    at: 0.775,
    keyIntensity: 1.0, rimIntensity: 1.25, fillIntensity: 1.0,
    emissive: 1.05, ring: 0.95, displace: 0.01, sharp: 0.65, amber: 0.08, psy: 0.5,
    fog: 0.026, exposure: 1.05, bloom: 0.46, vignette: 0.84,
  },
  // 06 — evidence. Documentary. The far door, plainly lit.
  {
    at: 0.885,
    keyIntensity: 0.85, rimIntensity: 1.0, fillIntensity: 0.85,
    emissive: 1.0, ring: 0.8, displace: 0.008, sharp: 0.7, amber: 0.05, psy: 0.45,
    fog: 0.022, exposure: 1.0, bloom: 0.36, vignette: 0.8,
  },
  // 07 — resolution. The sealed twin, iridescent and still.
  {
    at: 1.0,
    keyIntensity: 0.95, rimIntensity: 1.35, fillIntensity: 0.95,
    emissive: 1.15, ring: 0.95, displace: 0.01, sharp: 0.6, amber: 0.14, psy: 0.35,
    fog: 0.022, exposure: 1.06, bloom: 0.5, vignette: 0.88,
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

export interface EntityLightState {
  keyDir: [number, number, number];
  emissive: number;
  wake: number;
  fog: number;
  keyIntensity: number;
  rimIntensity: number;
  fillIntensity: number;
  displace: number;
}

export class Lighting {
  private state: LightKeyframe = { ...ARC[0] };
  readonly post: PostState = { exposure: 1.12, bloom: 0.72, vignette: 0.92 };

  /** 0..1 cold-open reveal, driven by the loader hand-off. */
  private wake = 0;

  /**
   * The arc is now pure data. Lighting samples the narrative and
   * publishes a state object; the entity reads it. That inversion is
   * what lets the Blender-authored model own its own uniforms without
   * this class needing to know what parts exist.
   */
  readonly entityState: EntityLightState = {
    keyDir: [0, 0.82, 0.42],
    emissive: 1,
    wake: 0,
    fog: 0.05,
    keyIntensity: 1,
    rimIntensity: 1.35,
    fillIntensity: 1,
    displace: 0.014,
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
      ring: lerp(a.ring, b.ring, t),
      displace: lerp(a.displace, b.displace, t),
      sharp: lerp(a.sharp, b.sharp, t),
      amber: lerp(a.amber, b.amber, t),
      psy: lerp(a.psy, b.psy, t),
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

    // A very slow swing on the key direction — below the threshold of
    // conscious notice, but it stops the entity reading as a static
    // render. Strictly bilateral: the key never leaves the x = 0 plane,
    // because swinging it left-right shades a near-symmetric object
    // unevenly and reads as the geometry being crooked.
    entity.keyDir = [
      0,
      0.82 + Math.cos(time * 0.06) * 0.05,
      0.42 + Math.sin(time * 0.08) * 0.09,
    ];

    this.post.exposure = s.exposure;
    this.post.bloom = s.bloom;
    this.post.vignette = s.vignette;
  }
}
