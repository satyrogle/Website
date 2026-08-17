/**
 * GATE B — shared deterministic core.
 *
 * Brief section 14 Gate B: static styleframes, judged with bloom DISABLED.
 * Nothing here uses `Math.random`. Every field, every seed point and every
 * perturbation comes from a named stream, so a frame can be reproduced exactly.
 *
 * The one structural rule carried out of Gate A: a form must be ONE SOLUTION
 * SAMPLED AT MANY PLACES, never many instances of a shape. Field lines satisfy
 * that by construction, which is why all three directions are built from them.
 * That is the answer to the visible-primitive failure that killed five carriers.
 */

import * as THREE from 'three';

/* ---------------------------------------------------------------- seeded RNG */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------- palette */

/** Brief section 8. These are the only colours any direction may use. */
export const PALETTE = {
  void: new THREE.Color('#020304'),
  carbon: new THREE.Color('#080B0E'),
  bone: new THREE.Color('#E9EEF2'),
  peak: new THREE.Color('#F8FBFF'),
  cherenkov: new THREE.Color('#56D8FF'),
  deep: new THREE.Color('#1546D8'),
  violation: new THREE.Color('#FF493D'),
};

/* -------------------------------------------------------- streamline tracing */

export type Field = (p: THREE.Vector3, out: THREE.Vector3) => void;

export interface Streamline {
  points: THREE.Vector3[];
  /** 0..1 per point. Drives luminance, so the light is caused by the field. */
  strength: number[];
}

const k1 = new THREE.Vector3();
const k2 = new THREE.Vector3();
const k3 = new THREE.Vector3();
const k4 = new THREE.Vector3();
const tmp = new THREE.Vector3();

/**
 * Fourth-order Runge-Kutta integration of one streamline.
 *
 * RK4 rather than Euler is not fussiness. Euler on a curved field drifts
 * outward every step, so lines that should close or run parallel slowly fan
 * apart, and the fan reads as a radial spoke pattern. The spokes were the
 * concentric-ring failure in a different costume.
 */
export function trace(
  field: Field,
  start: THREE.Vector3,
  steps: number,
  h: number,
  stop?: (p: THREE.Vector3, i: number) => boolean
): Streamline {
  const points: THREE.Vector3[] = [];
  const strength: number[] = [];
  const p = start.clone();

  for (let i = 0; i < steps; i++) {
    field(p, k1);
    const speed = k1.length();
    if (!Number.isFinite(speed) || speed < 1e-6) break;

    points.push(p.clone());
    strength.push(speed);

    if (stop && stop(p, i)) break;

    field(tmp.copy(p).addScaledVector(k1, h * 0.5), k2);
    field(tmp.copy(p).addScaledVector(k2, h * 0.5), k3);
    field(tmp.copy(p).addScaledVector(k3, h), k4);

    p.addScaledVector(k1, h / 6)
      .addScaledVector(k2, h / 3)
      .addScaledVector(k3, h / 3)
      .addScaledVector(k4, h / 6);

    if (!Number.isFinite(p.x) || p.length() > 400) break;
  }

  // Strength is returned RAW, in field units.
  //
  // An earlier version normalised each line against its own maximum, and that
  // one line of arithmetic produced the first dead frame: every streamline,
  // including the ones far out in a nearly dead field, was rescaled until its
  // brightest point was full white. The result was thousands of equally bright
  // parallel fibres, which is hair. Normalisation belongs to the whole field,
  // not to a line, and it happens once in `buildLines`.
  return { points, strength };
}

/* ------------------------------------------------------- hairline line build */

export interface LineBuildOptions {
  /** Colour at full strength. */
  colour: THREE.Color;
  /** Multiplies the normalised field strength. */
  gain?: number;
  /** Fades the last fraction of each line so nothing terminates abruptly. */
  tailFade?: number;
  /** Fades the first fraction, for lines emerging from an occluded core. */
  headFade?: number;
  /**
   * Contrast bias applied after normalisation. Above 1 pushes the bulk of the
   * field toward black and leaves only the genuinely strong regions lit, which
   * is how the frame reaches the brief's 80 to 90 percent negative space
   * WITHOUT dimming the peak. Dimming everything equally produces a grey frame;
   * this produces a black one with light in it.
   */
  gamma?: number;
  /**
   * Field strength that maps to full brightness. Defaults to the 98th
   * percentile across every point in the set, so a handful of near-singular
   * samples beside the core cannot flatten the whole field.
   */
  fullScale?: number;
}

/**
 * Streamlines to one additive `LineSegments`.
 *
 * Hairlines on purpose. WebGL caps line width at one device pixel, and that
 * cap is a gift here: a one-pixel line cannot look like a tube, a ribbon or a
 * strand of hair, which is what every thick-geometry attempt was named as.
 * Luminance comes from DENSITY and additive accumulation, exactly as it does in
 * a long-exposure photograph of a real field. That is also why the frame
 * survives with bloom disabled, which is the Gate B pass condition.
 */
export function buildLines(lines: Streamline[], opts: LineBuildOptions): THREE.LineSegments {
  const gain = opts.gain ?? 1;
  const tailFade = opts.tailFade ?? 0.25;
  const headFade = opts.headFade ?? 0.05;
  const gamma = opts.gamma ?? 1;

  // One normalisation for the whole field, taken at the 98th percentile.
  let fullScale = opts.fullScale ?? 0;
  if (!fullScale) {
    const all: number[] = [];
    for (const l of lines) for (const s of l.strength) all.push(s);
    all.sort((a, b) => a - b);
    fullScale = all.length ? all[Math.floor(all.length * 0.98)] : 1;
  }
  if (!(fullScale > 0)) fullScale = 1;

  const level = (raw: number) => Math.min(1, (raw / fullScale) ** gamma);

  let segments = 0;
  for (const l of lines) segments += Math.max(0, l.points.length - 1);

  const positions = new Float32Array(segments * 6);
  const colours = new Float32Array(segments * 6);
  let v = 0;

  for (const line of lines) {
    const n = line.points.length;
    for (let i = 0; i < n - 1; i++) {
      const a = line.points[i];
      const b = line.points[i + 1];

      const t = i / Math.max(1, n - 1);
      const head = headFade > 0 ? Math.min(1, t / headFade) : 1;
      const tail = tailFade > 0 ? Math.min(1, (1 - t) / tailFade) : 1;
      const envelope = head * tail;

      const sa = level(line.strength[i]) * gain * envelope;
      const sb = level(line.strength[i + 1]) * gain * envelope;

      positions[v] = a.x; positions[v + 1] = a.y; positions[v + 2] = a.z;
      colours[v] = opts.colour.r * sa;
      colours[v + 1] = opts.colour.g * sa;
      colours[v + 2] = opts.colour.b * sa;

      positions[v + 3] = b.x; positions[v + 4] = b.y; positions[v + 5] = b.z;
      colours[v + 3] = opts.colour.r * sb;
      colours[v + 4] = opts.colour.g * sb;
      colours[v + 5] = opts.colour.b * sb;

      v += 6;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });

  return new THREE.LineSegments(geometry, material);
}

/**
 * A solid body of pure void, written into the depth buffer.
 *
 * Gate A: depth comes from occlusion and luminance falloff, never from corridor
 * recession. Additive lines alone cannot occlude anything, so a field of them
 * is depthless no matter how it is lit, and the eye reads a flat texture.
 * This is what gives the far half of a field somewhere to be hidden.
 */
export function makeOccluder(radius: number, seed = 0, segments = 128): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radius, segments, segments / 2);

  // A perfect sphere silhouettes as a perfect circle, and a perfect circle at
  // the centre of a radial field reads as a pupil, or as a portal. Both are
  // nameable objects, which is the failure that killed five earlier carriers.
  // Coprime harmonics on unshared axes, so no view of it is a circle and no
  // two lobes are the same size.
  if (seed) {
    const rng = mulberry32(seed);
    const ax = rng() * 6.283;
    const ay = rng() * 6.283;
    const az = rng() * 6.283;
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = v.clone().normalize();
      const d =
        1 +
        0.17 * Math.cos(3 * Math.atan2(n.y, n.x) + ax) +
        0.11 * Math.cos(5 * Math.acos(n.z) + ay) +
        0.07 * Math.cos(7 * Math.atan2(n.z, n.y) + az);
      v.copy(n).multiplyScalar(radius * d);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: PALETTE.void, depthWrite: true })
  );
  mesh.renderOrder = -1;
  return mesh;
}

/* -------------------------------------------------------------- renderer bed */

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  render: () => void;
}

export function makeStage(canvas: HTMLCanvasElement, fov = 34): Stage {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    // Required, not optional. The capture harness samples the canvas through a
    // 2D context in a later frame; without this the drawing buffer has already
    // been cleared at the swap and every measurement reads pure black while the
    // screenshot looks correct. That mismatch already cost one debugging round.
    preserveDrawingBuffer: true,
  });
  // Brief section 17: cap DPR. Capped at 2 so hairlines stay hairlines on a
  // high-density screen instead of dissolving.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(PALETTE.void, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // No tone mapping. Tone mapping is a global filter, and brief section 8 says
  // halation must be a consequence of luminance rather than a filter over it.
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 1000);

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  return {
    renderer,
    scene,
    camera,
    render: () => {
      resize();
      renderer.render(scene, camera);
    },
  };
}

/**
 * Signals the capture harness that this styleframe has finished drawing.
 * Read by `tools/gate-b-capture.mjs` instead of a fixed timeout, so a slow
 * machine cannot produce a screenshot of a half-built frame.
 */
export function markReady(): void {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      document.documentElement.dataset.styleframe = 'ready';
    })
  );
}
