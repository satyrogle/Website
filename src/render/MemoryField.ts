import * as THREE from 'three';
import { mulberry32 } from '../core/rng';

/**
 * Z: the engine's memory at full density. Past the blade of light the
 * monument holds every record the world has ever kept, stratified by
 * age: newest at the ceiling, where the light still lays them down,
 * tick zero at the floor. The fall through the field IS the journey's
 * second act, and depth is literally the time axis: fixed-step time
 * made spatial.
 *
 * This is not a starfield and the authoring rules below are what keep
 * it from becoming one, on pain of the kill list:
 * - STRATA. Records deposit in horizontal beds with strongly varying
 *   density: busy epochs, thin epochs, and dead bands where the cull
 *   struck. A starfield has no geology.
 * - LIGHT FROM ABOVE. Grains brighten toward the ceiling's glow, so
 *   the field has a TOP and reads as sediment under light, not space.
 * - LOBES, NOT SYMMETRY. Radial density is modulated by three seeded
 *   angular lobes, so no shell or ring ever forms.
 * - VOIDS WITH SIGHTLINES. Culled eras carve real holes the eye can
 *   travel down (the choir lesson: a void needs an empty sightline).
 * - STILLNESS. Grains do not shimmer, drift or pulse. The only motion
 *   is the visitor's own fall, expressed as streak. The world stopped
 *   pretending to be alive on 2026-08-22 and this field obeys.
 *
 * The whole field derives from the world seed through its own rng
 * stream. Same seed, same memory, every visit: the field is the claim
 * it decorates.
 */

const CEILING_Y = -2770;
const FLOOR_Y = -5000;
const RADIUS = 520;
const COUNT = 150000;

const GRAIN_VERT = /* glsl */ `
uniform float uStretch;
attribute float aSize;
attribute float aKind;
varying float vKind;
varying float vDepthFade;
varying float vTop;
void main() {
  vKind = aKind;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = length(mv.xyz);
  // deposition light: grains near the ceiling sit in the glow
  float top = clamp((position.y - (-5000.0)) / 2230.0, 0.0, 1.0);
  vTop = top;
  // deposition light: the beds near the ceiling burn, the deep ones
  // barely remember it. This gradient is what makes it sediment under
  // a light instead of space.
  vDepthFade = (0.24 + 1.7 * pow(top, 1.6)) * smoothstep(2300.0, 280.0, dist);
  gl_PointSize = aSize * (320.0 / dist) * (1.0 + uStretch * 2.2);
  gl_Position = projectionMatrix * mv;
}
`;

const GRAIN_FRAG = /* glsl */ `
uniform float uStretch;
varying float vKind;
varying float vDepthFade;
varying float vTop;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  // the fall stretches the grain into a vertical streak; at rest it
  // is a soft round point. The mask NARROWS in x rather than growing
  // in y - growing in y escapes the sprite square and renders as
  // blown rectangles, photographed at the entry burst 2026-08-29.
  c.x *= (1.0 + uStretch * 2.2);
  float d = length(c) * 2.0;
  float body = smoothstep(1.0, 0.15, d);
  if (body < 0.01) discard;
  // THE CORRUPTION GRADIENT, Jacob's triptych, 2026-08-29: holy at
  // the top, and the deeper the older, the older the redder. The
  // young beds lie pale gold under the ceiling's light; the oldest
  // burn ember. Nothing transforms - the same records, further from
  // grace. Violation red proper is reserved for the eyes at the floor.
  float sink = pow(1.0 - vTop, 1.25);
  vec3 gold = mix(vec3(0.784, 0.643, 0.361), vec3(0.62, 0.23, 0.12), sink * 0.85);
  vec3 pale = mix(vec3(0.910, 0.800, 0.549), vec3(0.75, 0.32, 0.16), sink * 0.8);
  vec3 bone = mix(vec3(0.914, 0.933, 0.949), vec3(1.0, 0.286, 0.24), sink * 0.9);
  vec3 col = gold;
  float amp = 0.72;
  if (vKind > 2.5) { col = gold; amp = 0.07; }
  else if (vKind > 1.5) { col = bone; amp = 1.25; }
  else if (vKind > 0.5) { col = pale; amp = 0.95; }
  gl_FragColor = vec4(col * amp * vDepthFade * body, 1.0);
}
`;

const CEILING_FRAG = /* glsl */ `
uniform float uBurst;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float core = smoothstep(0.9, 0.0, r);
  vec3 col = mix(vec3(0.784, 0.643, 0.361), vec3(0.973, 0.910, 0.727), core * core);
  // the light just fallen through flares at the moment of arrival,
  // then settles into being the interior's sky
  gl_FragColor = vec4(col * core * (1.6 + uBurst * 1.8), core);
}
`;

export class MemoryField {
  readonly group = new THREE.Group();
  private readonly mat: THREE.ShaderMaterial;
  private eyeMat!: THREE.PointsMaterial;
  private ceilMat!: THREE.ShaderMaterial;
  private stretch = 0;
  private prevP = 0;

  constructor(seed: number) {
    const rng = mulberry32((seed ^ 0x51ab3e) | 0);

    // the epochs: ~70 beds between floor and ceiling, each with its
    // own deposition rate. A run of near-zero beds is a famine; a
    // zeroed bed is a cull.
    const BEDS = 72;
    // the great year: one stratum near the deep end laid down six
    // times the records - a shining bed the fall passes, the deep
    // stretch's landmark (inspection fault 4, 2026-08-29)
    // bed 8, not 16: the camera passes bed 16 at ~73% of the page,
    // which left the true deep stretch empty. Bed 8 crosses the fall
    // line at ~86%, where the emptiness lived.
    const GREAT_BED = 8;
    const bedDensity: number[] = [];
    for (let i = 0; i < BEDS; i++) {
      const base = 0.15 + rng() * 0.85;
      const famine = rng() < 0.14 ? 0.04 : 1;
      const cull = rng() < 0.08 ? 0 : 1;
      // macro clustering: geology has AGES, not just beds. Runs of
      // rich strata separated by starved ones - the banding the eye
      // needs to stop reading stars (inspection fault 3)
      const age = 0.22 + 0.78 * Math.pow(0.5 + 0.5 * Math.sin(i * 0.55 + rng() * 0.3), 2);
      bedDensity.push(i === GREAT_BED ? 1 : base * famine * cull * age);
    }
    // three angular lobes so the mass is never a ring or a shell
    const lobes = [0, 0, 0].map(() => ({
      ang: rng() * Math.PI * 2,
      width: 0.6 + rng() * 1.2,
      amp: 0.5 + rng() * 0.5
    }));
    // shaft voids: two clean sightlines the eye can fall down
    // the first shaft is PLACED, not rolled: it runs beside the
    // camera's own fall line, so the ride skirts a sheer dense wall
    // on one side and a clean drop on the other
    const voids: Array<{ x: number; z: number; r: number }> = [
      { x: 62, z: 44, r: 92 },
      { x: (rng() - 0.5) * 300, z: (rng() - 0.5) * 300, r: 70 + rng() * 60 }
    ];

    const pos = new Float32Array(COUNT * 3);
    const size = new Float32Array(COUNT);
    const kind = new Float32Array(COUNT);
    let n = 0;
    let guard = 0;
    while (n < COUNT && guard < COUNT * 8) {
      guard++;
      const bed = Math.floor(rng() * BEDS);
      if (rng() > bedDensity[bed]!) continue;
      const bedY = FLOOR_Y + ((bed + rng()) / BEDS) * (CEILING_Y - FLOOR_Y);
      const ang = rng() * Math.PI * 2;
      // radial falloff, then the lobes decide what survives at radius
      const r = Math.pow(rng(), 0.62) * RADIUS;
      let lobe = 0.35;
      for (const l of lobes) {
        const d = Math.atan2(Math.sin(ang - l.ang), Math.cos(ang - l.ang));
        lobe += l.amp * Math.exp(-(d * d) / (l.width * l.width));
      }
      if (rng() > lobe * (1.1 - (r / RADIUS) * 0.75)) continue;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      let inVoid = false;
      for (const v of voids) {
        const dx = x - v.x;
        const dz = z - v.z;
        if (dx * dx + dz * dz < v.r * v.r) { inVoid = true; break; }
      }
      if (inVoid) continue;
      pos[n * 3] = x;
      pos[n * 3 + 1] = bedY + (rng() - 0.5) * 8;
      pos[n * 3 + 2] = z;
      // size hierarchy: dust, grains, the rare large record, and a
      // thin population of huge soft motes that read as haze - the
      // atmosphere the frames have always lacked
      const u = rng();
      if (u < 0.855) { size[n] = 1.3 + rng() * 1.6; kind[n] = 0; }
      else if (u < 0.982) { size[n] = 3.0 + rng() * 2.4; kind[n] = 1; }
      else if (u < 0.996) { size[n] = 6 + rng() * 4; kind[n] = 2; }
      else { size[n] = 70 + rng() * 130; kind[n] = 3; }
      if (bed === GREAT_BED && kind[n]! < 2) {
        size[n] = size[n]! * 1.7;
        kind[n] = 1;
      }
      n++;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, n * 3), 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size.subarray(0, n), 1));
    geo.setAttribute('aKind', new THREE.BufferAttribute(kind.subarray(0, n), 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, (CEILING_Y + FLOOR_Y) / 2, 0), 2600);

    this.mat = new THREE.ShaderMaterial({
      vertexShader: GRAIN_VERT,
      fragmentShader: GRAIN_FRAG,
      uniforms: { uStretch: { value: 0 } },
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      transparent: true
    });
    const points = new THREE.Points(geo, this.mat);
    points.frustumCulled = true;
    this.group.add(points);

    // the interior night: a shell that owns the background so the
    // exterior sky never leaks into the memory
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(2400, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0x020304, side: THREE.BackSide })
    );
    shell.position.y = (CEILING_Y + FLOOR_Y) / 2;
    this.group.add(shell);

    // the ceiling: the blade's far side, still laying the newest bed.
    // The one lit surface in here; everything else is its debt.
    this.ceilMat = new THREE.ShaderMaterial({
      vertexShader:
        'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: CEILING_FRAG,
      uniforms: { uBurst: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), this.ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = CEILING_Y + 40;
    this.group.add(ceil);

    // tick zero: one bright record alone at the floor, first cause.
    // The latent form's ground. Everything else down here is reserved.
    const seedGeo = new THREE.BufferGeometry();
    seedGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, FLOOR_Y - 30, -14]), 3));
    seedGeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array([10]), 1));
    seedGeo.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array([2]), 1));
    this.group.add(new THREE.Points(seedGeo, this.mat));

    // THE EYES AT THE FLOOR: the watcher lost at the seam, arrived
    // first, wearing violation red. Two small points beside the
    // reserve, lit only as the visitor settles. Not a monster - the
    // same attention as the hero's, recoloured by where it lives.
    const eyeGeo = new THREE.BufferGeometry();
    eyeGeo.setAttribute(
      'position',
      // ONE point, not two: a pair of red dots reads as a face (or
      // worse - Jacob, 2026-08-29), and this site's watcher was never
      // a face. A single node of attention, just off the look axis,
      // standing in the dark that the visitor is peering into.
      new THREE.BufferAttribute(new Float32Array([8, FLOOR_Y - 16, -90]), 3)
    );
    // a soft round falloff, painted once: a hard square point is a
    // sprite bug, not an eye
    const eyeCanvas = document.createElement('canvas');
    eyeCanvas.width = 64;
    eyeCanvas.height = 64;
    const ectx = eyeCanvas.getContext('2d')!;
    const eg = ectx.createRadialGradient(32, 32, 0, 32, 32, 32);
    eg.addColorStop(0, 'rgba(255,255,255,1)');
    eg.addColorStop(0.25, 'rgba(255,255,255,0.85)');
    eg.addColorStop(1, 'rgba(255,255,255,0)');
    ectx.fillStyle = eg;
    ectx.fillRect(0, 0, 64, 64);
    const eyeTex = new THREE.CanvasTexture(eyeCanvas);
    this.eyeMat = new THREE.PointsMaterial({
      color: 0xff493d,
      map: eyeTex,
      size: 11,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      sizeAttenuation: true
    });
    this.group.add(new THREE.Points(eyeGeo, this.eyeMat));

    this.group.visible = false;
  }

  /** Streak follows the fall's real velocity; stillness when held. */
  update(dt: number, progress: number, camera: THREE.PerspectiveCamera): void {
    const vel = Math.abs(progress - this.prevP) / Math.max(dt, 1e-3);
    this.prevP = progress;
    // the entry burst: the first second past the light arrives at
    // terminal velocity - streak spikes, the ceiling flares, and both
    // settle as the fall becomes the world
    const burst =
      progress > 0.32 && progress < 0.42
        ? 1 - Math.abs((progress - 0.355) / 0.035)
        : 0;
    const b = Math.max(0, Math.min(1, burst));
    const want = Math.min(1, vel * 26 + b * 0.9);
    this.stretch += (want - this.stretch) * (1 - Math.exp(-dt * 5));
    this.mat.uniforms.uStretch!.value = this.stretch;
    this.ceilMat.uniforms.uBurst!.value = b;
    // the eyes open only once the visitor has settled at the floor
    const settle = Math.min(1, Math.max(0, (progress - 0.955) / 0.04));
    this.eyeMat.opacity = settle * settle * 0.95;
    // the field only exists once the visitor is past the light
    this.group.visible = camera.position.y < -1000;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        o.geometry.dispose();
        const m = o.material as THREE.Material;
        m.dispose();
      }
    });
  }
}
