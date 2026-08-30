import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LatticeWorld, CELL, HALF, TOWER_TOP, SEA_Y } from '../world/LatticeWorld';
import { TIP_T, prongCentre, surfacePoint } from '../world/monumentForm';
import { ChoirGroup } from '../world/ChoirGroup';
import { CameraPath } from './CameraPath';
import { DeltaAct } from './DeltaAct';
import { journeyAt } from '../core/Journey';
import type { Detent } from '../core/Delta';

const UP = new THREE.Vector3(0, 1, 0);

/** Independent controls for the compact crest mounted behind the Spire. */
/**
 * How far each half of the Spire travels, in world units, at a full
 * opening. ONE NUMBER, because three systems have to agree about where
 * the stone is: the geometry offset, the width of the gap's light, and
 * the ridges carved on the interior walls. They were three separate
 * 3.5 literals and could have drifted apart on any edit.
 *
 * Raised from 3.5 on Jacob's 2026-08-29 note that the opening "feels
 * like camera switch rather than actual event". At 3.5 the halves moved
 * seven units apart while the camera closed from 120 to 70, so the two
 * changed the on-screen gap by almost exactly the same factor and the
 * eye could not separate them. The stone has to be the larger event by
 * a clear margin, not a tie.
 */
const PART_TRAVEL = 6;

export const HERO_CREST_TUNING = {
  scale: 1.12,
  width: 1.23,
  opacity: 0.9,
  runeDensity: 0.0,
  rearOffset: -7,
  /** how far each wing shifts outward, in asset units (asset
   * half-width is 0.95), PER SIDE: the spire's cleft is off-axis, so
   * a symmetric split read off-centre. A global left shift fixed the
   * left wing and broke the right one, Jacob 2026-08-26 - so the left
   * wing sits closer in and the right keeps the original 0.19 */
  wingSplitL: 0.172,
  wingSplitR: 0.209,
  /** world-unit x shift of the whole crest; per-side splits replaced
   * the global shift, keep 0 */
  offsetX: 0,
  /** degrees each wing leans toward the centre, rotated about its own
   * middle, PER SIDE: the ring tops draw in over the apex while the
   * blades spread wider at the bottom. 12 made the tips touch; Jacob
   * keeps a deliberate gap, and tunes the sides independently */
  wingTiltL: 7,
  wingTiltR: 8,
  /** degrees the whole crest pitches forward about its own centre -
   * positive leans the top toward the camera */
  pitch: 5,
  /** per-side vertical shift in asset units, positive is up. The
   * right wing sat visibly higher than the left - Jacob 2026-08-26,
   * "right feels it is a bit top" - so it drops slightly */
  wingLiftL: -0.016,
  wingLiftR: -0.016,
  /** Jacob's Meshy parenthesis insert, mirrored into the two upper
   * semicircular pockets immediately beside the Spire. These values
   * stay in the authored crest's local asset space. */
  pocketScale: 0.22,
  pocketOffsetXL: -0.3,
  pocketOffsetXR: 0.32,
  pocketLiftL: 0.43,
  pocketLiftR: 0.43,
  pocketDepth: 0.0,
  pocketTurnL: 10,
  pocketTurnR: -8
} as const;

/** The opening's hardware, Jacob's Meshy assets, 2026-08-29: the lock
 * collar around the seam and the jamb pair at the threshold. Mounted
 * closed and dark for now; the refusal and the parting animate them
 * in a later gate. All knobs in world units unless noted. */
export const OPENING_HARDWARE_TUNING = {
  /** NOTHING IS EVER MOUNTED ON THE FACE. The mechanism is interior.
   * The twin-rod asset is the core's ARMOUR, clamped around a light
   * column that runs the full height of the slit - Jacob's frames:
   * the light blazes crown to base, the armour holds its middle. */
  /** the armour runs the height of the gate at its TRUE proportions:
   * uniform scale, no stretching. At 130 tall the pair spans ~68 wide,
   * so its outer thirds bury themselves in the parted blades - the
   * mechanism reads as continuous with the stone, not a trinket
   * standing in a doorway. Jacob, 2026-08-29: bigger, whole, coherent. */
  /** 130 made the armour a black wall that swallowed the reveal -
   * probed and photographed 2026-08-29. It backs the column now:
   * machinery BEHIND the light, the frame-1 layering. */
  coreHeight: 96,
  coreY: 6,
  coreZ: -2.6,
  /** armour sits this far behind the column's plane: far enough
   * that the column is never occluded by the rails' own corridor -
   * the light in FRONT of the machinery, frame-1 layering. Probed
   * 2026-08-29: at 6 the rails still swallowed the column below
   * their crown line. */
  armourSetback: 14,
  /** the light column itself: nearly the whole slit */
  columnHeight: 168
} as const;;

/** X and Y made visible, per STRESS + PATH = FORM (Jacob's spec,
 * 2026-08-29). X: the interior skin behind the incision carries the
 * stress ridges the engine computed - four seeded paths, one
 * dominant, carrying the gold. Y: the shadow road - the authored
 * route crossing the natural fracture at the wrong angle, a spatial
 * constraint made briefly visible as darkness, never a UI line. */
function buildStressStage(seed: number): {
  group: THREE.Group;
  skin: THREE.ShaderMaterial;
  mesh: THREE.Mesh;
} {
  const group = new THREE.Group();
  const rng = mulberry32ish((seed ^ 0x7ac3) | 0);
  // four stress paths as quadratics x(t) over the slot's height,
  // t = y/184. Coefficients in slot-local units, |x| < 5.
  // coefficients bounded to the slit the visitor can actually see
  // through: a 14-wide pattern behind a one-unit incision was
  // invisible by construction (recheck, 2026-08-29)
  // stride 4: a, b, c, side. THE CUT DIVIDES THE FIELD, and which
  // wall a ridge ends up carved into is decided by which side of that
  // cut it sits on - not by the sign of its offset, which is only the
  // sign of an arbitrary origin. This seed put three of the four left
  // of zero (measured 2026-08-29), so a sign test would have sent
  // three ridges travelling together and left one straggler instead of
  // the halves separating. The stone splits through the MIDDLE of its
  // own stress field, so the median is the cut and the sides come out
  // two and two whatever the seed does.
  const raw: Array<[number, number, number]> = [];
  for (let i = 0; i < 4; i++) {
    raw.push([(rng() - 0.5) * 2.4, (rng() - 0.5) * 2.0, (rng() - 0.5) * 3.5]);
  }
  const order = raw.map((r, i) => [r[0], i] as const).sort((p, q) => p[0] - q[0]);
  const sideOf = new Array<number>(4);
  order.forEach(([, i], rank) => {
    sideOf[i] = rank < 2 ? -1 : 1;
  });
  const ridges: number[] = [];
  for (let i = 0; i < 4; i++) {
    ridges.push(raw[i]![0], raw[i]![1], raw[i]![2], sideOf[i]!);
  }
  const skin = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uX: { value: 0 },
      uRidge: { value: ridges },
      // half-separation of the stones, in the skin's own units. THE
      // RIDGES RIDE THE HALVES - Jacob, 2026-08-29: "should not the 3
      // white lines spread move opposite each other instead of going
      // poof". They are carved into the interior wall of one half or
      // the other, so parting the stones carries each ridge with its
      // own wall. Fading them out was the rigid-body law broken in the
      // one place the visitor is looking straight at.
      uSpread: { value: 0 }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uX;
      uniform float uRidge[16];
      uniform float uSpread;
      varying vec2 vUv;
      void main() {
        float t = vUv.y;
        float x = (vUv.x - 0.5) * 14.0;
        // THE RIDGES DRAW; THE PLATE DOES NOT. This carried a 55
        // percent opaque grey sheet across the whole gap so the ridges
        // would have a surface to stand proud of - and measured against
        // the void behind it that sheet was the L26-to-58 band sitting
        // between the black and the white line. Jacob, 2026-08-29:
        // "the black should be pitch black nothing on it".
        //
        // The interior already has a surface: the void backdrop behind
        // this plane. A second dark sheet in front of it added no read
        // and cost the black. Base alpha is zero now, so only the
        // ridges themselves ever mark the gap.
        vec3 col = vec3(0.045, 0.052, 0.06);
        float alpha = 0.0;
        for (int i = 0; i < 4; i++) {
          float a = uRidge[i * 4];
          float b = uRidge[i * 4 + 1];
          float c = uRidge[i * 4 + 2];
          // which wall this ridge is carved into, decided at seeding
          // by the cut through the middle of the field. Constant along
          // the ridge, so parting can never tear one in half.
          float side = uRidge[i * 4 + 3];
          float rx = a + b * t + c * t * (1.0 - t) * 2.0 + side * uSpread;
          float d = abs(x - rx);
          // emergence is staggered: each ridge arrives on its own
          float own = clamp(uX * 4.0 - float(i) * 0.55, 0.0, 1.0);
          // A TIGHT CORE IN A WIDER HALO. A single soft exponential is
          // a smear, and read through the gap's own glow it vanished -
          // red-paint capture, 2026-08-29, confirmed the ridges were
          // spreading correctly the whole time and simply could not be
          // seen. The core is what makes it a LINE; the halo is what
          // makes it sit in the wall instead of floating on it.
          float core = exp(-d * 7.0);
          float halo = exp(-d * 2.8);
          float line = (core + halo * 0.36) * own;
          if (i == 0) {
            // the dominant path carries the gold, and it wears the
            // seam's own chromaticity like everything else warm here
            col += vec3(1.0, 0.64, 0.233) * line * 0.95;
          } else {
            // The others hold a cold silver edge-light - and they are
            // the ONLY thing in the gap allowed to be cold, which is
            // why they have to stay quiet. At 1.05 they measured
            // rgb(196,195,191), 88 percent whitish: two blazing bars
            // that set the colour of the whole gate and overrode the
            // seam's gold entirely (blue-paint capture, 2026-08-29).
            // Dropped to a level where they read as fine cold lines
            // INSIDE a gold doorway rather than as the doorway's
            // colour. Cool but no longer blue-white, so they separate
            // from the gold by temperature instead of by force.
            col += vec3(0.90, 0.93, 0.97) * line * 0.42;
          }
          alpha = max(alpha, clamp(line, 0.0, 1.0));
        }
        gl_FragColor = vec4(col, alpha * uX);
      }`
  });
  const skinMesh = new THREE.Mesh(new THREE.PlaneGeometry(14, 184), skin);
  skinMesh.position.set(0, 90, -3.1);
  skinMesh.frustumCulled = false;
  group.add(skinMesh);

  // Y: the shadow road. A dark blade of space from the visitor's
  // side of the world into the opening, oblique against the
  // near-vertical stress paths: both systems readable at once.
  return { group, skin, mesh: skinMesh };
}

function buildOpeningHardware(coreParts: {
  holder: THREE.Group | null;
  column: THREE.ShaderMaterial | null;
  columnMesh: THREE.Mesh | null;
  pool: THREE.MeshBasicMaterial | null;
}): { group: THREE.Group; mats: THREE.MeshStandardMaterial[] } {
  const tuning = OPENING_HARDWARE_TUNING;
  const group = new THREE.Group();
  group.name = 'openingHardware';
  const mats: THREE.MeshStandardMaterial[] = [];

  // Meshy's part-segmentation export ships NO textures - the parts
  // arrive in flat ID colours (the beige slabs of the first mount).
  // The hardware wears the monument's own material instead, one dark
  // stone per part so the channel parts stay individually addressable
  // when the refusal's light drain is built.
  const dress = (root: THREE.Object3D): void => {
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const m = new THREE.MeshStandardMaterial({
          // machined dark metal: near-black body, and the gold lives
          // ONLY on the rims - a fresnel mask below turns the flat
          // emissive into edge light, which is what Jacob's frame 1
          // armour actually does. Flat gold paint photographed as
          // "idk if they suck", 2026-08-29. They sucked.
          color: 0x14181d,
          metalness: 0.82,
          roughness: 0.42,
          envMapIntensity: 1.1,
          emissive: 0xb98a3c,
          emissiveIntensity: 0.0,
          side: THREE.FrontSide,
          transparent: true,
          opacity: 0
        });
        m.onBeforeCompile = (sh) => {
          sh.fragmentShader = sh.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
{
  float rimF = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.2);
  totalEmissiveRadiance *= rimF * 3.2;
}`
          );
        };
        o.material = m;
        mats.push(m);
      }
    });
  };

  // scale a loaded scene to a target world size along one axis,
  // recentre on x/z and floor it at y=0. Box3 sees through the
  // quantization; raw accessor units never touch this.
  const normalise = (model: THREE.Object3D, target: number, axis: 'x' | 'y'): number => {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = target / (axis === 'x' ? size.x : size.y);
    const c = box.getCenter(new THREE.Vector3());
    model.position.set(-c.x * scale, -box.min.y * scale, -c.z * scale);
    model.scale.setScalar(scale);
    return size.y * scale;
  };

  new GLTFLoader().load(
    '/models/jamb.glb',
    (gltf) => {
      const model = gltf.scene;
      dress(model);
      normalise(model, tuning.coreHeight, 'y');
      model.position.z -= tuning.armourSetback;
      // THE ARMOUR IS PARKED, 2026-08-29. Untextured it renders as a
      // black slab that occludes the entire reveal - it cost an hour
      // of debugging to find because it was invisible BECAUSE it was
      // everywhere. It returns when Jacob's textured export lands,
      // smaller and behind the light. Until then the column carries
      // the reveal alone, and it carries it well.
      model.visible = false;
      const holder = new THREE.Group();
      holder.name = 'core';
      holder.add(model);
      // the light column between the rails: the drained seam,
      // gathered. MeshBasic at near-white so ACES and bloom carry it.
      const columnMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uWake: { value: 0 },
          uRoad: { value: 0 },
          // how hard the seal is grinding RIGHT NOW: 0 while the stone
          // is held, 1 through a slip. Drives the dust the seam has
          // been holding for however long it has been shut.
          uGrind: { value: 0 },
          // how far the stone has parted, 0 to 1. The LIT FRACTION of
          // the gap rides this: the light has to widen inside the
          // opening, not just be stretched with it.
          uOpen: { value: 0 }
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          varying vec3 vN;
          void main() {
            vUv = uv;
            vN = normalMatrix * normal;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uWake;
          uniform float uRoad;
          uniform float uGrind;
          uniform float uOpen;
          varying vec2 vUv;
          varying vec3 vN;
          float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float n2(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x),
                       mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
          }
          void main() {
            // THE SEAM SPLITS WITH THE STONE. This plane always spans
            // lip to lip, so uv.x 0 and 1 ARE the blades' moving
            // edges: each carries its half of the light by
            // construction. Between them, the dark interior - and the
            // arcs that jump it, Zeus between two electrodes.
            float t = uTime;
            float ex = min(vUv.x, 1.0 - vUv.x);
            // GATES OPEN = LIGHT WIDENS. Jacob's law, and the dark
            // interior broke it: a wider gap became a wider band of
            // NOTHING between two thin lips, so opening the gate made
            // the frame darker and the whole beat read as the light
            // dying (measured 2026-08-29 - mean luminance peaked at
            // .15 and fell to its starting value by .27).
            //
            // The light lives INSIDE, and it WIDENS. Jacob, 2026-08-29:
            // "if you trying to say light is coming as the gate opens
            // then it should look like it slowly widening. here it
            // looks just like idk what".
            //
            // The fault was that the glow was a gradient in UV, so it
            // filled the gap at every width - scaling the plane just
            // drew a bigger copy of the same picture, and the leftover
            // was a faint gold wash lying over the black. Nothing ever
            // widened; it only got bigger.
            //
            // Now the LIT BAND is a fraction of the gap that grows with
            // the parting. Early it is a thin seam of light in a dark
            // slot, and the walls either side stay black because the
            // light has not reached them yet. At full opening it fills
            // the doorway. dc is distance from the centre line, so the
            // band opens outward from the middle the way light escaping
            // a widening crack actually does.
            float dc = abs(vUv.x - 0.5);
            float litHalf = mix(0.10, 0.40, uOpen);
            float depth = 1.0 - smoothstep(litHalf * 0.42, litHalf, dc);
            // THE LIGHT KEEPS A MARGIN. Jacob, 2026-08-29: "the gold
            // should stop at the white line on either side so black
            // looks like black". Measured across the gap, the pure
            // black was ONE pixel wide with gold sitting outside the
            // white line - because this plane spans the whole opening
            // and its glow and lip ran right to its own edge, leaving
            // the stone nothing to be dark against.
            //
            // Everything the gap emits is now cut to zero before the
            // plane ends, so there is a genuine unlit band between the
            // light and the stone. A margin cannot be tuned into
            // existence with levels; the emission has to actually stop.
            float edgeCut = 1.0 - smoothstep(0.38, 0.47, dc);
            // and the slot recedes: the light is deepest low, thinning
            // toward the crown, so the interior has somewhere to go
            // instead of reading as a flat lit slab (the "blinding
            // white" of the same review).
            depth *= 0.70 + 0.30 * smoothstep(0.9, 0.15, vUv.y);
            // EDGE FIRE: THE GOLD SEAM, SPLIT IN TWO. Jacob,
            // 2026-08-29: it "seems to be disappearing instead of
            // splitting". These two lips ARE the original seam after
            // the stone divides it - one gold line becoming two that
            // ride the blades apart - so they have to be the strongest
            // gold in the frame, not a trim weaker than the glow
            // between them. At 0.40 against a 0.58 interior the centre
            // outshone them and there was nothing left to read as
            // splitting.
            //
            // Still well under the 0.85 that clipped to white in the
            // blinding review: this is contrast between the two golds,
            // not a return to a hot filament.
            // and the LEVEL is what keeps it gold. ACES desaturates
            // bright colour toward white, so a correct hue at high
            // intensity still renders pale - measured rgb(191,185,173)
            // with the chromaticity already fixed. The seam's tension
            // look survives precisely because watch scales it DOWN to
            // 0.20; the darkness is what protects the hue. The gate can
            // afford the same drop now that its widening is structural
            // rather than carried by brightness.
            float lip = exp(-ex * 20.0) * 0.38;
            // THE ARCS: five wandering horizontal strikes, coming and
            // going on their own clocks, always lip to lip
            // ZEUS, WITH FLAIR. A single smooth sine meander is a
            // ribbon, not a discharge - lightning has KINKS, it has
            // strikes of wildly different size, and it FORKS. Three
            // octaves of noise stacked at rising frequency give the
            // path corners it cannot get from one wave, and a rare
            // "big" selector lets some strikes be real events instead
            // of every bolt being the same bolt.
            float arcs = 0.0;
            for (int i = 0; i < 6; i++) {
              float fi = float(i);
              float yc = 0.08 + 0.16 * fi + 0.06 * sin(t * (0.7 + 0.3 * fi) + fi * 2.1);
              float jag = (n2(vec2(vUv.x * 10.0 + fi * 13.0, t * (1.6 + 0.6 * fi))) - 0.5) * 0.052
                        + (n2(vec2(vUv.x * 27.0 + fi * 31.0, t * (2.5 + 0.7 * fi))) - 0.5) * 0.022
                        + (n2(vec2(vUv.x * 61.0 + fi * 57.0, t * (3.7 + 0.9 * fi))) - 0.5) * 0.009;
              float d = abs(vUv.y - yc - jag);
              float strike = smoothstep(0.26, 0.74, n2(vec2(t * 2.6 + fi * 5.0, fi * 17.0)));
              // most strikes are small; a few are the ones you remember
              float big = smoothstep(0.72, 0.97, n2(vec2(t * 1.1 + fi * 9.0, 3.0)));
              float amp = 0.30 + 0.85 * big;
              arcs += (exp(-d * 150.0) * amp + exp(-d * 46.0) * amp * 0.38) * strike;
              // THE FORK: a short branch splitting off the main bolt,
              // only on the big ones and only out toward one flank, so
              // it reads as a discharge finding a second path rather
              // than as a second bolt drawn beside the first.
              float fSide = fract(fi * 7.3) > 0.5 ? 1.0 : -1.0;
              float fReach = smoothstep(0.06, 0.34, (vUv.x - 0.5) * fSide);
              float fy = yc + jag * 1.9 + (0.014 + 0.026 * fract(fi * 3.7));
              arcs += exp(-abs(vUv.y - fy) * 210.0) * strike * big * fReach * 0.55;
            }
            // ---- THE GATE WEARS THE SEAM'S OWN GOLD ----
            // Jacob, 2026-08-29: under tension the seam "turns very
            // dark gold which is not bright and doesn't hurt eyes ...
            // can you do the same to the gate colour".
            //
            // The seam's trick is not that it is dark. It is that it
            // holds ONE HUE at every level: holy is (1.8, 1.15, 0.42)
            // and the watcher only ever scales it, 0.20 where it is not
            // attending to 1.35 where it is. It never travels toward
            // white, so it cannot glare however hot it gets.
            //
            // The gate was doing the opposite - a near-white hot colour
            // for the arcs and a PALE ceiling to roll off into - so every
            // bright part drifted to white and burned. Both colours are
            // now the seam's chromaticity, holy normalised to its own
            // red: only the multiplier changes.
            vec3 gold = vec3(1.0, 0.64, 0.233);
            vec3 hot = gold;
            // the interior glow is GOLD and moderate - it is depth, not
            // a lamp. It KEEPS its level while the peaks come down:
            // the body of the light is the brightness Jacob wants, the
            // spread between it and the lips was the blinding part.
            vec3 col = gold * depth * 0.32 + gold * lip + hot * arcs;

            // ---- THE DUST THE SEAL HAS BEEN HOLDING ----
            // Jacob, 2026-08-29: the chamber is ancient, ruined and
            // rugged, and "it cant just split just like that". A seal
            // that has been shut for an age is full of grit, and the
            // grit comes down the moment the stone breaks free. This is
            // the visible consequence of the slip, which is why it is
            // gained by uGrind and not by time.
            //
            // SHORT DASHES, NOT STRIPES AND NOT SPECKLE. Elongated
            // about two to one down the fall, so a grain reads as a
            // falling grain with its own motion blur. Red-paint capture
            // caught the first attempt at 8:1, which drew full-height
            // lines the length of the gap - striping, not dust.
            // Isotropic noise is the other failure and resolves to the
            // static this repo has already killed twice.
            float dust = 0.0;
            for (int i = 0; i < 4; i++) {
              float fi = float(i);
              // four layers falling at their own rates: the near grit
              // outruns the far, which is what gives the fall depth
              float g = n2(vec2(vUv.x * (95.0 + fi * 52.0) + fi * 31.0,
                                vUv.y * (38.0 + fi * 17.0) - t * (1.05 + 0.55 * fi)));
              dust += smoothstep(0.80, 0.99, g) * (0.55 - fi * 0.10);
            }
            // THE EMBERS. A few coarse pieces falling slower than the
            // grit and burning brighter - what gives the fall a scale
            // to read against. All grains the same size is a texture;
            // a few big ones among many small is a cascade. They drift
            // sideways as they go, so they tumble rather than rail.
            float ember = 0.0;
            for (int i = 0; i < 3; i++) {
              float fi = float(i);
              float drift = sin(t * (0.5 + 0.3 * fi) + fi * 2.7) * 0.06;
              float e = n2(vec2(vUv.x * (17.0 + fi * 9.0) + drift * 20.0 + fi * 47.0,
                                vUv.y * (7.0 + fi * 3.0) - t * (0.42 + 0.16 * fi)));
              ember += smoothstep(0.90, 0.995, e) * (0.9 - fi * 0.22);
            }
            dust += ember * 1.6;
            // grit is only seen where the light has reached: in the
            // dark part of the slot it is falling unlit, which is
            // exactly nothing to draw
            dust *= depth;
            // grit is STONE: it takes the gap's own gold as reflected
            // light rather than glowing in a colour of its own, which
            // is the same one-hue law the seam keeps.
            col += gold * dust * (0.12 + 1.85 * uGrind);
            // THE SHADOW ROAD: the authored route crossing the
            // natural light at the wrong angle - darkness cut into
            // the seam, readable against the stress paths
            // 0.97 was a blackout, not a road: at full strength it took
            // the seam out entirely and read as the light DYING right
            // before the opening (Jacob, 2026-08-29). A road crosses the
            // light; it does not end it.
            float rd = abs((vUv.y - 0.42) * 3.0 + (vUv.x - 0.5) * 0.9);
            col *= 1.0 - exp(-rd * 3.0) * 0.55 * uRoad;
            // a SOFT KNEE, not a hard clamp. min() flattens everything
            // above the ceiling to one flat value, which is what turns
            // a highlight into a white slab with no shape in it. This
            // rolls the top off instead, so the peaks stay separable
            // and the range narrows - contrast, not brightness.
            //
            // AND THE CEILING IS GOLD. It was (0.86, 0.76, 0.60), a
            // pale colour - so the knee pulled every bright fragment
            // toward off-white on its way to saturating, which is where
            // the glare actually came from. A gold ceiling means the
            // hottest thing in the gap is still deep gold.
            vec3 ceil = gold * 0.50;
            col = ceil * (col / (col + ceil));
            // the interior glow is SEEN THROUGH, not a curtain: the far
            // wall and the stress ridges carved into it have to read
            // inside the light, or the ridges spread apart where no one
            // can see them happen. Lips and arcs keep full opacity -
            // they are the near edges and the strike, not depth.
            //
            // And OUTSIDE the lit band this reaches zero, so the dark
            // interior is genuinely dark rather than carrying a film of
            // gold over it. That film was the "faint gold on the black
            // part": alpha that never fell to nothing.
            float a = clamp(depth * 0.52 + lip + arcs + dust * uGrind * 0.9, 0.0, 1.0);
            // the margin applies to the LIGHT ITSELF, not just its
            // colour: alpha goes to zero too, so nothing of this plane
            // survives near the stone to be bloomed outward.
            col *= edgeCut;
            a *= edgeCut;
            gl_FragColor = vec4(col, uWake * a);
          }`
      });
      const column = new THREE.Mesh(
        new THREE.PlaneGeometry(4.4, tuning.columnHeight),
        columnMat
      );
      column.position.y = tuning.columnHeight * 0.5 + 2;
      holder.add(column);
      coreParts.column = columnMat;
      coreParts.columnMesh = column;
      // the light pools at the foot of the gap: a soft billboard on
      // the stair, alive only with the core
      const poolCanvas = document.createElement('canvas');
      poolCanvas.width = 128;
      poolCanvas.height = 64;
      const pctx = poolCanvas.getContext('2d')!;
      const pg = pctx.createRadialGradient(64, 32, 0, 64, 32, 62);
      pg.addColorStop(0, 'rgba(255,235,190,0.9)');
      pg.addColorStop(1, 'rgba(255,220,150,0)');
      pctx.fillStyle = pg;
      pctx.fillRect(0, 0, 128, 64);
      const pool = new THREE.Mesh(
        new THREE.PlaneGeometry(44, 15),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(poolCanvas),
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false
        })
      );
      pool.rotation.x = -Math.PI / 2.3;
      pool.position.set(0, 8.5, 12);
      coreParts.pool = pool.material as THREE.MeshBasicMaterial;
      group.add(pool);
      holder.position.set(0, tuning.coreY, tuning.coreZ);
      holder.visible = false;
      coreParts.holder = holder;
      group.add(holder);
    },
    undefined,
    (err) => console.error('core asset failed to load', err)
  );

  return { group, mats };
}

// THE LOCKED PALETTE, and it is a set of ROLES, not a set of swatches.
// Every hex from the crest spec sheet's section 2 converted to LINEAR,
// because diffuseColor lives in linear space inside these shaders: the
// sRGB numbers used raw would land every role roughly twice as light
// as the sheet specifies. Features MIX toward their role's colour -
// adding arbitrary greys, which the previous pass did, is how the
// material drifts off the sheet while still looking plausible.
//
// White Specular #F3F4F6 is deliberately absent. The sheet reserves it
// for lighting response and forbids painting it into albedo.
// Updated to the HERO VISUAL IDENTITY sheet, 2026-08-27, which
// supersedes the crest sheet's palette. Same linear-conversion law.
const PALETTE_GLSL = `
const vec3 P_VOID     = vec3(0.00152, 0.00182, 0.00273); // #050609 void
const vec3 P_OBSIDIAN = vec3(0.00560, 0.00650, 0.00857); // #111317 darkest metal
const vec3 P_GRAPHITE = vec3(0.02220, 0.02420, 0.02960); // #292B30 base albedo
const vec3 P_IRON     = vec3(0.03950, 0.04230, 0.04970); // legacy mid-tone, broad variation
const vec3 P_STEEL    = vec3(0.10460, 0.11190, 0.12740); // #5B5E64 worn steel, broad lit planes
const vec3 P_WORN     = vec3(0.28740, 0.30950, 0.34670); // #92979F edge silver, wear and chamfers
const vec3 P_SILVER   = vec3(0.55840, 0.55840, 0.57750); // legacy inlay, dormant
const vec3 P_ETCH     = vec3(0.54580, 0.57760, 0.61720); // #C3C8CE pale etch, the vein field
const vec3 P_CORE     = vec3(0.91300, 0.92990, 0.92990); // #F5F7F7 core white, the slit only
const vec3 P_RIM      = vec3(0.21960, 0.29620, 0.39160); // #8194A8 cold rim, edge response only
`;

const FRAG_COMMON = `#include <common>
${PALETTE_GLSL}
varying vec3 vMonoW;
varying vec3 vMonoL;
uniform float uPart;
uniform float uDecay;
uniform float uSeverity;
uniform float uTime;
uniform float uCalm;
uniform vec3 uHover;
uniform float uHoverAmt;
uniform vec3 uInner;
uniform float uInnerAmt;
uniform float uSignal;
uniform float uAlign;
// THE ROT ANSWERS THE WATCHER. The world height it is attending to, and
// how present it is. The MASS reacting to where the visitor points is
// far worse than a light doing it alone - it means the monument is
// aware, not that there is a lamp inside it.
uniform float uWatchY;
uniform float uWatchAmt;
// gate 3: how hard the sky's grazing light finds the outer edges
uniform float uRim;
// how hard the crowded record reads at the wound: a review pin, so its
// strength is pointed at rather than guessed
uniform float uScript;
// NO WAKE ON THE STONE. Three passes put a travelling front on the face
// here - into the rot's emission, then into the albedo - and Jacob
// rejected all three. Measuring the leaving against the build he liked
// says why: the ripple he asked for was never on the stone. It was the
// SEAM crossing the bloom threshold, and it lives in the fissure
// material now. See THE SURGE there.
// presses: xyz world position, w born time in seconds
uniform vec4 uMarks[12];
uniform int uMarkN;
// culls: xyz world position of a cell the law struck, w strike time
uniform vec4 uCulls[6];
uniform int uCullN;
float vMonoEng;
float vMonoRough = 0.9;
// surface height for the peening and linework, read back by the
// normal injection so both are relief rather than paint
float vMonoH = 0.0;
// THE ROT IS OFF. Jacob, 2026-08-26, after the body went to worked
// metal: "remove the rot from the body". His reference shows intact
// metal - no vesicular pitting, no eaten band, no weeping - so every
// term of the corrosion is gated to zero here rather than deleted.
// The mechanism, its coordinates and its comments all survive intact
// below; set this to 1.0 and the condition returns exactly as it was.
//
// What is NOT gated, because it is not rot: the base skin, the
// machined edges, the scratches, the plate cracks, the inscription
// and the record at the foot, the press marks and the witnessed cull.
const float ROT = 0.0;
float monoHash(vec3 c) { return fract(sin(dot(c, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float monoNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  float a0 = monoHash(vec3(i, 0.0));
  float b0 = monoHash(vec3(i + vec2(1.0,0.0), 0.0));
  float c0 = monoHash(vec3(i + vec2(0.0,1.0), 0.0));
  float d0 = monoHash(vec3(i + vec2(1.0,1.0), 0.0));
  return mix(mix(a0,b0,f.x), mix(c0,d0,f.x), f.y);
}
float monoFbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * monoNoise(p); p *= 2.03; a *= 0.5; }
  return s / 0.9375;
}
// THE WAVE FIELD. One long smooth warp, nothing sharper: the meander
// IS the look. An angular double-warped fracture variant was tried
// here and Jacob killed it on sight, 2026-08-27 - "it was super cool
// earlier where it was like single wave".
float monoCrack(vec2 q) {
  vec2 w = q + (vec2(monoFbm(q * 0.42), monoFbm(q * 0.42 + 19.7)) - 0.5) * 3.0;
  return monoFbm(w) - 0.5;
}
float monoSegDist(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  return length(p - a - ab * t);
}`;

const FRAG_MAP = `#include <map_fragment>
{
  float heightT = clamp(vMonoL.y / 195.0, 0.0, 1.0);

  // THE SPLIT SPIRE is a wedge: no twist to unwrap. Courses run across
  // the outer face by depth, then wrap the flank
  float sideS = vMonoL.x >= 0.0 ? 1.0 : -1.0;
  // THE FLARE, mirrored from monumentForm.ts: the skin must agree with
  // the geometry about where the stone is, or the courses slide off
  // the splay at the foot.
  float flareS = 1.0 + 0.42 * exp(-max(heightT, 0.0) / 0.055);
  float formS = (1.0 - 0.9 * pow(max(heightT, 1e-4), 1.0)) * flareS;
  float cutX = sideS * (5.0 - 3.9 * clamp(heightT, 0.0, 1.0));
  float fromFissure = abs(vMonoL.x - cutX);
  float outward = fromFissure / max(31.0 * formS, 0.001);
  float across = clamp(vMonoL.z / max(17.0 * formS, 0.001), -1.0, 1.0);
  float ang = across * 1.5 + sign(vMonoL.z) * smoothstep(0.5, 1.0, outward) * 1.2;

  // decay eats plates, and a plate is bounded by the macro cracks
  float plateId = floor(vMonoL.y / 2.4) * 17.0 + floor((ang + 3.0) * 6.5);
  float h = monoHash(vec3(plateId, sideS, 3.0));
  float cluster = 0.5 + 0.5 * sin(plateId * 0.61 + sideS + h * 9.0);
  float th = clamp(0.2 + 0.78 * (1.0 - heightT) + 0.28 * (cluster - 0.5) + (h - 0.5) * 0.12, 0.06, 0.985);
  if (uDecay > th) discard;
  float dying = smoothstep(0.035, 0.0, th - uDecay);

  if (!gl_FrontFacing) {
    diffuseColor.rgb = vec3(0.02, 0.023, 0.028);
    vMonoEng = 0.0;
    vMonoRough = 0.62;
  } else {

  // ---- SIGNAL SKIN ----
  // Sintered graphite, machined. The engravings live in ROUGHNESS and
  // specular, not in albedo, so they are nearly invisible head on and
  // only surface as the light rakes across them.
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewPosition);
  float graze = 1.0 - abs(dot(N, V));
  graze = smoothstep(0.25, 0.92, graze);

  // THE GLYPH LANGUAGE. Columns, not scatter: the face is divided
  // into vertical lanes and each lane carries a run of small marks
  // stacked down it, the way the spec sheets inscribe them. Two
  // systems overlaid at different lane widths.
  // THE RECORD CROWDS AT THE WOUND, 2026-08-23. Jacob asked for the
  // base to read corrupted and RUNIC. Literal fantasy runes are banned
  // here and would be wrong anyway - the monument already has a runic
  // language, which is the inscription it has carried since the first
  // gate. So the answer is not a new alphabet, it is the SAME record,
  // packed hard where the blight has it: entries crowd at the contact
  // the way a ledger crowds around the event it is recording.
  // THE FOOT STATIC IS OFF. Jacob, 2026-08-27: "remove the static shit
  // at the base of the hero". This term drove a third glyph system
  // packed finer than anything else on the mass, plus a density lift
  // on the other two - which at landing distance resolved to speckle,
  // not to a record. Zero here disables all three effects at once and
  // leaves the mechanism readable for whoever turns it back on.
  float footIns = 0.0;
  float glyph = 0.0;
  for (int sys = 0; sys < 3; sys++) {
    // the third system exists only at the foot, and it is packed finer
    // than anything else on the mass
    if (sys == 2 && footIns < 0.02) continue;
    float laneW = sys == 0 ? 58.0 : sys == 1 ? 37.0 : 104.0;
    float rowH = sys == 0 ? 0.72 : sys == 1 ? 1.15 : 0.40;
    float lane = floor(ang * laneW);
    float lanePhase = monoHash(vec3(lane, sideS, float(sys) * 3.0));
    // not every lane is inscribed: the density the spec asks for, and
    // more of them are as the ground is approached
    float laneGate = sys == 2 ? 0.02 : 0.10 - footIns * 0.065;
    if (lanePhase < laneGate) continue;
    float lx = fract(ang * laneW);
    float row = floor(vMonoL.y / rowH + lanePhase * 5.0);
    float ly = fract(vMonoL.y / rowH + lanePhase * 5.0);
    float gh = monoHash(vec3(lane, row, sideS + float(sys) * 7.0));
    float rowGate = sys == 2 ? 0.10 : 0.20 - footIns * 0.11;
    if (gh < rowGate) continue;
    // a mark: a vertical stem with one or two crossbars, or a short
    // stroke. Small, hard edged, machined
    float mark = 0.0;
    float stem = smoothstep(0.055, 0.022, abs(lx - 0.5))
               * smoothstep(0.06, 0.10, ly) * smoothstep(0.94, 0.90, ly);
    mark = max(mark, stem * step(0.45, gh));
    for (int b = 0; b < 2; b++) {
      float bh = fract(gh * (5.7 + float(b) * 9.3));
      if (bh < 0.4) continue;
      float by = 0.22 + 0.52 * fract(bh * 3.3);
      float barHalf = 0.16 + 0.20 * fract(bh * 11.0);
      float bar = smoothstep(0.05, 0.02, abs(ly - by))
                * smoothstep(barHalf, barHalf - 0.06, abs(lx - 0.5));
      mark = max(mark, bar);
    }
    glyph = max(glyph, mark * (sys == 2 ? footIns : 1.0));
  }

  // long scratch lines: the fine diagonal hairlines the sheets carry
  // across every face, at a much longer scale than the glyphs
  // Each scratch is a LINE with its own centre and length along its own
  // axis. Gating length with a repeating wave, as the first version
  // did, only drew them in horizontal bands about fifty units apart,
  // which is why they appeared at the top and bottom and nowhere else
  // KILLED, Jacob 2026-08-27. These were tuned for the near-black
  // stone, where a polished cut barely surfaced; on the worked-metal
  // finish they caught hard and read as stray pale lines crossing the
  // spires. He was asked dim / kill / leave and said "kill".
  float scratch = 0.0;

  // macro plate cracks: sparse and thin, a few per face. A periodic
  // fract() here striped the whole skin like corduroy
  vec2 pc = vec2(ang * 1.15, vMonoL.y * 0.026);
  vec2 pcell = floor(pc);
  float ph = monoHash(vec3(pcell, sideS));
  float crack = 0.0;
  if (ph > 0.62) {
    vec2 pf = fract(pc) - vec2(0.35 + 0.3 * fract(ph * 7.0), 0.5);
    float pa = (fract(ph * 13.0) - 0.5) * 2.2;
    float dd = abs(pf.x * cos(pa) + pf.y * sin(pa));
    crack = smoothstep(0.035, 0.004, dd);
  }

  // ROUGHNESS is where the engraving lives. Grooves hold a duller,
  // rougher surface inside a polished skin, so they read as light
  // catches the lip and skips the groove
  // each facet carries its own tone, keyed off its constant normal
  vec3 facetKey = floor(normalize(vNormal) * 18.0);
  float facetTone = 0.86 + 0.30 * monoHash(facetKey);

  // the machined edge: with flat shading the normal changes only at a
  // facet boundary, so its derivative finds every edge in the body
  float edge = smoothstep(0.35, 1.6, length(fwidth(vNormal)) * 26.0);

  // H1, THE MONUMENT READ. The surface is ancient wet mineral now, not
  // clean machined graphite. Fine sintered grain remains the material's
  // body, while two very low-frequency fields divide it into broad dry
  // and rain-darkened territories. The wetness lives in roughness, not
  // emission or a painted highlight, so it appears only when the locked
  // light and environment genuinely catch it.
  float micro = monoHash(floor(vec3(ang * 130.0, vMonoL.y * 26.0, sideS)));
  float speck = monoHash(floor(vec3(ang * 420.0, vMonoL.y * 84.0, sideS * 3.0)));
  // sintered pitting off: two percent of fragments punched dark is
  // exactly the "noisy high-frequency grain" the spec sheet bans, and
  // it reads as static on a face this dark
  float pit = 0.0;
  float macroVar = monoHash(floor(vec3(ang * 3.0, vMonoL.y * 0.5, sideS + 9.0)));
  float mineralBed = monoFbm(vec2(ang * 0.82 + sideS * 4.7, vMonoL.y * 0.018));
  float rainSheet = monoFbm(vec2(ang * 2.15 + sideS * 9.3, vMonoL.y * 0.006 + 17.0));
  float wetTerritory = smoothstep(0.54, 0.77, mineralBed * 0.72 + rainSheet * 0.28);
  // Dry stone holds a diffuse mineral tooth. Broad wet territories pull
  // that response down to a restrained sheen, never a mirror or clearcoat.
  float rough = 0.58 + 0.055 * (micro - 0.5) * 2.0
                     + 0.045 * (macroVar - 0.5) * 2.0
                     + 0.035 * (mineralBed - 0.5) * 2.0;
  // dry stone: the wet sheen is nearly gone, the territory survives
  // as tone only
  rough -= wetTerritory * 0.06;
  rough += glyph * 0.16;
  rough += crack * 0.14;
  rough -= scratch * 0.26;
  rough -= edge * 0.18;
  rough += pit * 0.20;
  vMonoRough = clamp(rough, 0.28, 0.94);

  // albedo barely moves: a hint of darkening in the deepest grooves,
  // and only where the light is already raking
  // Mineral depth comes from value and temperature changing at a scale
  // much larger than the grain. Wet territories darken the same stone;
  // they do not add a second coloured material.
  vec3 mineralTint = mix(vec3(0.91, 0.95, 1.02), vec3(1.025, 0.99, 0.94), mineralBed);
  diffuseColor.rgb *= facetTone * mineralTint;
  diffuseColor.rgb *= 1.0 - wetTerritory * 0.12;
  diffuseColor.rgb *= 1.0 - glyph * 0.10 * graze;
  // a scratch is a polished cut: it catches, never darkens
  diffuseColor.rgb += diffuseColor.rgb * scratch * (0.55 + 0.45 * graze) * 1.8;
  diffuseColor.rgb *= 1.0 - crack * 0.28;
  // sintered pitting, and the bright machined edge
  diffuseColor.rgb *= 1.0 - pit * 0.45;
  diffuseColor.rgb += vec3(0.055, 0.058, 0.065) * edge;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.62, 0.76, 1.05), uSeverity * 0.3);
  diffuseColor.rgb = mix(diffuseColor.rgb * 0.35, diffuseColor.rgb, smoothstep(0.0, 4.0, vMonoL.y));
  if (dying > 0.0) {
    float gt = 0.72 + 0.22 * sin(uTime * (1.0 + h * 1.4) + h * 40.0);
    diffuseColor.rgb *= mix(1.0, mix(gt, 0.8, uCalm), dying);
  }

  // ---- PROXIMITY / SIGNAL ----
  // Activity is a function of distance from the fissure. The wave of
  // roughness travels first; light follows it, and only ever in
  // fragments, never a whole glyph
  // THE TRAVELLING FRONT IS DEAD. Jacob, 2026-08-27: "remove the
  // moving things inside the wave seam". This was a band of roughness
  // climbing the mass on uTime, strongest near the cleft - the one
  // thing still moving through the seam waves' territory, sliding
  // sheen along them so the waves appeared inhabited. It came back
  // with the faithful restore; he has now killed it on its own.
  float prox = exp(-fromFissure * 0.22);
  float wave = 0.0;
  vMonoRough = clamp(vMonoRough - wave * prox * 0.16, 0.05, 0.95);

  // ---- THE CORROSION ----
  // Jacob's third set of references, 2026-08-21: "something like this
  // not tribal tattooing my hero".
  //
  // The glowing claw gashes are dead. Bright lines drawn on a face are
  // a tattoo however they are shaped, and that is the one word that
  // covers every version so far - rivulets, helix, claw sets, swathe,
  // bleed, gashes. All of them ADDED marks to the surface.
  //
  // What his references show is the opposite: the surface is EATEN.
  // A diagonal band where the stone has gone vesicular - open dark
  // pits of varying size, with a thin bright cWeb of remaining material
  // between them, densest at the core and thinning to fine veins at the
  // edges. The band reads DARKER than the stone around it, because most
  // of it is holes. Only the webbing catches light. Nothing glows.
  //
  // The cWeb is the ZERO SET of a warped field divided by its own
  // gradient - not a threshold on noise and not cells. This project has
  // the lesson recorded twice: a threshold admits half the volume and
  // reads as smoke, and Voronoi always resolves into a repeating unit,
  // which is what killed the golf-ball core. Dividing by the gradient
  // gives every vein the same width however steep the field is there,
  // which is what makes it read as structure rather than as noise.
  //
  // Surface coordinate is a sheared projection of world x and z, so it
  // varies across the front faces AND the flanks. World x alone streaks
  // on the flank; ang alone barely moves across the front, which is the
  // fault that made an earlier stroke wrap the monument as a bracelet.
  // THE HORIZONTAL IS outward, AND ONLY outward. Three coordinates
  // were tried and measured before this one, all wrong for the same
  // underlying reason - none of them runs monotonically across the
  // visible face:
  //
  //   world x       - constant along the flank, so the pattern smears.
  //   a sheared x/z projection - mixes DEPTH into the horizontal, so it
  //     varies fastest where the surface turns away and the band chased
  //     the blade's silhouette. Scaling it up (2.7, then 9.0) only made
  //     it track the edge harder.
  //   ang           - looked right and is not. The prong's cut edge is
  //     at MAXIMUM depth, so across the visible face across falls 1
  //     to 0 while the outward term rises 0 to 1.2, and the two very
  //     nearly cancel: ang spans 1.5 to 1.2, three tenths, effectively
  //     constant. That is also the real reason an earlier stroke built
  //     on ang collapsed into a bracelet.
  //
  // outward is distance from the cut plane over the half width: 0 at
  // the cleft, 1 at the outer edge, monotonic the whole way. It is
  // already computed at the top of this shader for the plate law.
  // SIGNED, so it crosses BOTH spires as one event. Jacob: "tilt it
  // horizontally so it is on both of the spires". Unsigned, outward is
  // 0 at the cleft on each blade and 1 at each outer edge, so a band
  // built on it comes out MIRRORED - two symmetric marks, which reads
  // as decoration rather than as something that happened. Multiplying
  // by sideS runs the coordinate continuously from the left blade's
  // outer edge, through the cleft, to the right blade's outer edge, so
  // the band carries across the gap and the texture lines up either
  // side of it.
  float cS = sideS * clamp(outward, 0.0, 1.0);

  vec2 CP = vec2(cS * 34.0, vMonoL.y);
  vec2 BP = vec2(cS * 95.0, vMonoL.y);

  // the band: one SHALLOW diagonal crossing the whole monument. 0.497
  // over 0.868 rose 0.57 per unit across, which on a coordinate now
  // spanning both blades would climb a hundred and ten units and stand
  // the band on end. 0.287 over 0.958 gives about fifty over the full
  // width - a tilt, not a climb.
  const float CCA = 0.958, CSA = 0.287;
  // LOWERED, Jacob 2026-08-21. The offset IS the crossing height: at
  // the cleft the coordinate is zero, so the centreline sits at
  // offset / 0.958. 91 put it at y=95, mid-height. 60 puts it at 63,
  // low on the mass where the blades are broad.
  float cAcross = -BP.x * CSA + BP.y * CCA - 60.0;
  float cAlong  =  BP.x * CCA + BP.y * CSA;

  // THE LOWER BOUNDARY DISSOLVES; IT IS NOT CUT. Jacob: "its in a
  // straight line no matter you added the weeping ... can you make it
  // zig zag like top part of rot", then chose dissolving over jagged.
  //
  // step() on a constant value of the band's own axis is a
  // mathematically perfect diagonal, so the edge read as drawn however
  // much weeping hung below it - the runs broke the silhouette, they
  // could not break the LINE. And the top of the rot was never like
  // that: its edge is irregular because three things vary along it -
  // the centreline wanders, the half width breathes, and a clustering
  // field eats into it. The bottom had none of that, because it was one
  // number.
  //
  // So the same mechanism now works the bottom. A soft ramp replaces
  // the step, and a clustering field breaks it into patches - weighted
  // so it only bites NEAR the boundary and leaves the body of the band
  // solid. The result has no line anywhere: the rot thins into stone.
  float cSoft = smoothstep(-70.0, -20.0, cAcross);
  float cBreak = smoothstep(0.26, 0.70,
    monoFbm(vec2(cAlong * 0.050, cAcross * 0.070 + 61.0)));
  float cCut = cSoft * mix(cBreak, 1.0, cSoft * cSoft);

  // THE CROWN STAYS CLEAN. Jacob: "dim the static on the top". Up there
  // the band and its cracks thin out into scattered grain, and
  // scattered grain on a near-black spire against a dark sky is
  // STATIC - it stops reading as corrosion and starts reading as noise
  // in the image. The corrosion fades out over the upper third so the
  // crown is stone again.
  float cTop = smoothstep(170.0, 96.0, vMonoL.y);

  cAcross += 26.0 * (monoFbm(vec2(cAlong * 0.010, 5.0)) - 0.5);
  // WIDER. 30 to 50 read as a belt across a tall mass; 46 to 76 gives
  // the corrosion a territory, which is what the references show.
  float cHalf = 46.0 + 30.0 * monoFbm(vec2(cAlong * 0.014, 11.0));
  float band = 1.0 - smoothstep(cHalf * 0.22, cHalf, abs(cAcross));
  // clustered, so it takes hold in patches rather than filling the band
  band *= smoothstep(0.30, 0.66, monoFbm(vec2(cAlong * 0.035, cAcross * 0.048)) * 0.55 + band * 0.62);
  band *= smoothstep(-12.0, 3.0, vMonoL.z) * cCut * cTop;

  // ---- THE HIERARCHY ----
  // E0, 2026-08-22, Jacob's strike. Everything above defines the
  // corrosion's TERRITORY: where the condition could take hold. Until
  // now that was also its COVERAGE, so the whole visible face came out
  // evenly infected and read as marbling, a mineral, a contour map -
  // the monument's normal material rather than something happening TO
  // it. The disease was not too strong. It was everywhere.
  //
  // The territory is now filtered into tiers by two coarse outbreak
  // fields. oDom has a high threshold on a very low frequency, so there
  // is exactly ONE place on the mass where the disease has won. oSec is
  // finer and thresholded hard, so the secondary outbreaks are discrete
  // patches with untouched stone between them and never a network. What
  // is left over is a residue faint enough that only raking light finds
  // it, which is what makes the same condition read as present
  // everywhere while the mass stays majority clean graphite.
  //
  // This is deliberately a redistribution, not an attenuation: inside
  // the dominant outbreak the corrosion is at full former strength. The
  // fault was distribution, and no single strength number can fix a
  // distribution.
  //
  // Asymmetry needs no term of its own. cAlong carries the sign of the
  // body x, so the two blades sample different neighbourhoods of both
  // fields and cannot mirror each other.
  float oDom = smoothstep(0.55, 0.87, monoFbm(vec2(cAlong * 0.0068 + 2.3, cAcross * 0.0092 - 5.1)));
  float oSec = smoothstep(0.52, 0.74, monoFbm(vec2(cAlong * 0.0185 + 17.6, cAcross * 0.0235 + 4.2)));
  band *= clamp(oDom + oSec * 0.62 * (1.0 - oDom) + 0.13, 0.0, 1.0);
  band *= ROT;

  // the vesicular field. Warped BEFORE the level set is taken, or the
  // veins inherit the noise's own roundness and come out as bubbles
  vec2 cq = CP * 0.52;
  cq += (vec2(monoFbm(cq * 0.42), monoFbm(cq * 0.42 + 19.7)) - 0.5) * 3.4;
  float cf = monoFbm(cq) - 0.5;
  float cg = length(vec2(dFdx(cf), dFdy(cf))) + 1e-6;
  float cWeb = (1.0 - smoothstep(0.0, 2.2, abs(cf) / cg));
  // the pits: where the field runs deep, the material is simply gone
  float cPit = smoothstep(0.02, -0.16, cf);
  // pits open up at the core of the band and close to nothing at its
  // edge, so the band ends in fine veins rather than stopping
  float cWebRaw = cWeb;
  cPit *= smoothstep(0.18, 0.78, band);
  cWeb *= smoothstep(0.02, 0.34, band);

  // THE BLIGHT AT THE FOOT, 2026-08-23, from Jacob's mocks: the same
  // vesicular condition the band carries mid-mass is DENSEST where the
  // stone meets the ground, and it thins fast going up - the contact is
  // the wound. Raw fields, not the band-gated ones: this has its own
  // territory and it is the only place the corrosion is allowed to be
  // dense, which is what keeps the rest of the mass clean graphite.
  {
    // Tuned to the mock: the lace wraps the whole flare and is BRIGHT -
    // it catches the light, it does not hide in it - dense to about a
    // quarter height and thinning to traces, never a hard stop.
    float footM = exp(-max(vMonoL.y - 8.0, 0.0) / 26.0) * smoothstep(-2.0, 2.0, vMonoL.y);
    float fPit = smoothstep(0.02, -0.16, cf) * footM * ROT;
    float fWeb = cWebRaw * footM * ROT;
    diffuseColor.rgb *= 1.0 - fPit * 0.6;
    diffuseColor.rgb += diffuseColor.rgb * fWeb * (1.6 + 1.2 * graze) + vec3(0.115, 0.122, 0.135) * fWeb;

    // THE RECORD IS EATEN. Where the rot has taken the surface it has
    // taken the writing with it, so the inscription at the wound is
    // PARTIAL - half-marks, broken rows, whole entries missing - and
    // that is the corruption Jacob asked for. What survives catches the
    // light hard, because a groove that is still there is still a
    // groove, and a fragment of a record is worse than none of it.
    //
    // Kept in albedo and roughness. No emission: glowing script is the
    // licorice-veins failure this project has already paid for, and a
    // record that lights up is announcing itself rather than being
    // found.
    // and the inscription's lift at the wound goes with it: the same
    // speckle by another route
    float insc = 0.0 * glyph * footM * (1.0 - fPit * 0.9) * uScript;
    diffuseColor.rgb += diffuseColor.rgb * insc * (0.8 + 1.3 * graze);
    diffuseColor.rgb += vec3(0.062, 0.066, 0.075) * insc * 0.6;
    vMonoRough = clamp(vMonoRough + insc * 0.2, 0.08, 0.96);
  }

  // THE CRACKS, spreading past the band into intact stone. The band has
  // to fray outward or it reads as a decal with a boundary, which is
  // what Jacob's sheets never do: theirs sends fine veins running well
  // clear of the corroded mass. The same web field carries them, so
  // they are continuous with it and cannot look bolted on - but out
  // here only the STRONGEST veins survive, and they break along their
  // length so the network thins to isolated hairlines rather than
  // fading uniformly.
  // Reach and selectivity both matter. At 3.1x the half width the halo
  // covered a hundred and fifty units and the cracks became a second
  // TEXTURE over most of the blade - the intact stone disappeared,
  // which defeats the point of the band being an event. 1.9x, and only
  // the top quarter of the web survives out here, gated again by a
  // slow field so the veins arrive in runs rather than evenly.
  // the halo multiplier comes down as the band widens, or the cracks
  // scale with it and swallow the intact stone again
  float halo = 1.0 - smoothstep(cHalf * 0.7, cHalf * 1.55, abs(cAcross));
  halo *= smoothstep(-12.0, 3.0, vMonoL.z) * cCut * cTop * ROT;
  float cCrack = smoothstep(0.76, 0.99, cWebRaw)
               * smoothstep(0.48, 0.82, monoFbm(CP * 0.14 + 31.0))
               * halo * (1.0 - band * 0.85);

  // ---- GATE 4: MACRO CONCEALS, MICRO REVEALS ----
  // The reference picture, 2026-08-22. At the opening distance the web
  // resolved to a field of white dots covering two thirds of the face -
  // every vein is a couple of pixels at any range, so distance turns
  // structure into coverage, and coverage kills the material read. The
  // picture's faces are mostly clean dark stone broken by a FEW large
  // fractures that catch light.
  //
  // So the read is graded by distance, which is this project's own law
  // applied to its own skin. Far away the fine web and the runs fade
  // and a sparse set of macro fractures carries the corrosion's
  // presence; close in, the fractures stay physical and the web comes
  // back as the discovery. The FIELDS are untouched - band, pits, web,
  // cracks, engine glint, watcher response, presses all keep their
  // mechanism - only what the eye is given at each range changes.
  float viewDist = length(vViewPosition);
  float far = smoothstep(80.0, 240.0, viewDist);
  float webVis = 1.0 - far * 0.85;

  // the macro fractures: the same level-set-over-gradient family as the
  // web, an order of magnitude coarser, so they are continuous with it
  // rather than a second language. The gradient divide keeps each break
  // a clean line at every distance instead of dissolving.
  vec2 mq = CP * 0.075;
  mq += (vec2(monoFbm(mq * 0.5 + 7.0), monoFbm(mq * 0.5 + 23.0)) - 0.5) * 1.8;
  float mf = monoFbm(mq) - 0.5;
  float mg = length(vec2(dFdx(mf), dFdy(mf))) + 1e-6;
  float mLine = 1.0 - smoothstep(0.0, 1.7, abs(mf) / mg);
  // few survive: a slow selector breaks the network into three or four
  // long breaks per face rather than a lattice
  float mSel = smoothstep(0.84, 0.98, monoFbm(CP * 0.016 + 51.0));
  float mFrac = mLine * mSel * halo;
  // a break is a lip that catches light, strongest where the light
  // rakes - the scratch law at fracture scale. It strengthens with
  // distance as it takes the web's job, and stays modest up close.
  diffuseColor.rgb += diffuseColor.rgb * mFrac * (0.8 + 1.3 * graze) * (0.4 + 0.6 * far);
  diffuseColor.rgb += vec3(0.050, 0.055, 0.066) * mFrac * far;
  vMonoRough = clamp(vMonoRough - mFrac * 0.16, 0.05, 0.95);

  // THE STONE IS EATEN, not painted. The pits are voids and the cWeb is
  // what is left standing between them - so this is a DARKENING with a
  // thin bright residue, and the emissive channel is barely used.
  // THE WEB CARRIES IT, NOT THE PITS. Two faults found by rendering:
  //
  // 1. The web highlight was multiplied by graze at 1.1 + 2.4*graze, so
  //    it was three and a half times stronger at the silhouette than
  //    across the face - and the corrosion hugged the blade's outer
  //    EDGE, following the contour instead of crossing it. It looked
  //    like the band was misplaced when it was simply only visible
  //    where the surface turned away.
  // 2. Darkening does nothing here. The stone is already near black, so
  //    removing 88 percent of almost nothing is invisible. The pits
  //    cannot be what reads; the surviving WEB between them has to be,
  //    and the holes read as the gaps in it.
  //
  // So the web gets an absolute term that does not depend on how lit
  // the fragment already was, and graze is reduced to a modest lift
  // rather than the whole effect.
  diffuseColor.rgb *= 1.0 - cPit * 0.88;
  // gate 4: the fine web is the close-range discovery. webVis fades its
  // LIGHT at distance; the field itself never moves.
  diffuseColor.rgb += diffuseColor.rgb * cWeb * band * (1.6 + 0.9 * graze) * webVis;
  diffuseColor.rgb += vec3(0.058, 0.063, 0.072) * cWeb * band * webVis;

  // the runs: fine vertical streaks descending out of the band, where
  // it has wept down the face. Broken, because a dried run is dotted
  // THE WEEPING, HUNG FROM THE CUT. Jacob: "the cut looks straight add
  // some weeping to it maybe".
  //
  // It was sourced from the band above and then killed below the cut,
  // which is what left the edge reading as a ruled line. Now it hangs
  // FROM the cut itself and lives only below it, so the same term that
  // makes the boundary coherent also breaks it: threads of uneven
  // length reach past the line by different amounts and the straight
  // edge stops being straight without being blurred.
  //
  // Distance below the cut, in world units: cAcross carries CCA per
  // unit of height, so dividing by it converts back.
  float belowCut = max(0.0, -(cAcross + 30.0) / CCA);
  // Asymmetric on purpose. Jacob marked the left spire and asked the
  // weeping there to "stop at the line": on that blade the runs barely
  // clear the cut, just enough to keep the edge from reading as ruled,
  // while the right keeps its length. The two sides are not meant to
  // match - a symmetric pair of drip curtains would be the decoration
  // problem again, and the corrosion already crosses the cleft as one
  // event, so it can weep unevenly the way anything real does.
  float cSideLen = sideS < 0.0 ? 0.26 : 1.0;
  float cSideAmt = sideS < 0.0 ? 0.55 : 1.0;
  float cLane = monoHash(vec3(floor(cS * 52.0), 21.0, sideS));
  float cRunLen = (5.0 + 26.0 * fract(cLane * 5.3)) * cSideLen;
  float cRun = step(0.48, cLane)
             * step(0.52, monoNoise(vec2(cS * 96.0, vMonoL.y * 0.85)))
             * smoothstep(cRunLen, cRunLen * 0.12, belowCut)
             * smoothstep(-12.0, 3.0, vMonoL.z) * cSideAmt * ROT;
  // dimmer again, Jacob 2026-08-21: the runs support the cut edge, they
  // are not a feature of their own. Gate 4: and they are micro detail,
  // so they fade at range with the web.
  diffuseColor.rgb += diffuseColor.rgb * cRun * (0.45 + 0.35 * graze) * webVis;
  diffuseColor.rgb += vec3(0.016, 0.018, 0.021) * cRun;

  // the cracks are thin bright residue too, and fainter than the band
  diffuseColor.rgb += diffuseColor.rgb * cCrack * (1.2 + 0.8 * graze);
  diffuseColor.rgb += vec3(0.040, 0.044, 0.051) * cCrack;

  // roughness follows the damage: the pits are matte voids, the cWeb is
  // a hard remaining edge
  vMonoRough = clamp(vMonoRough + cPit * 0.30 - (cWeb * band + cCrack * 0.6 + cRun * 0.25) * 0.22, 0.08, 0.96);

  // THE WEB EMITS, NOT THE PITS. Jacob: "i think we are emitting the
  // wrong shader of rot emit the other stuff not the ones already".
  //
  // The pits were carrying it, on the idea that light comes from inside
  // the holes. But the pits are the part that is GONE - the voids - and
  // a void has nothing to emit. What is left standing is the web, the
  // surviving lace between the holes, and that is the material the rot
  // has actually turned into. So it is the web that glows, the cracks
  // that carry it out past the band, and the weeping that carries it
  // down.
  //
  // Kept at the same threshold as before: on stone this dark, anything
  // the eye can call a patch is too much, and the fissure must stay the
  // only real light in the frame.
  // THE PRESSES EAT THE STONE. A sprite at a press point is a decal
  // however it is drawn - filled it was a pimple, and as a bare ring at
  // landing distance it was STILL a white speck, because a ring under
  // twenty pixels is indistinguishable from a dot. So no sprite: the
  // press joins the corrosion field itself. Each mark darkens a small
  // bitten patch of face and rims it with the same pale residue the rot
  // carries, so a visitor's touch is a place the monument has been
  // EATEN, in the one language this surface already speaks.
  // A ROUND BITE IS A PIMPLE. Jacob, after gate 4 cleaned the face:
  // "pimples are popping". The old mark was a radial pit with a pale
  // ring, opening in half a second - and on calm stone a disc arriving
  // fast reads as a blemish popping in, whatever it is made of. Three
  // changes, all toward the corrosion's own language:
  //
  // 1. The local vesicular field decides what survives inside the bite,
  //    so a mark is ragged and directional like the rot, never a coin.
  // 2. It seeps in over about two seconds instead of popping in half of
  //    one. An opening performs; a taking does not.
  // 3. The rim is nearly gone - residue, not a ring. The DARKNESS is
  //    the mark.
  float mkPit = 0.0;
  float mkRim = 0.0;
  for (int mi = 0; mi < 12; mi++) {
    if (mi >= uMarkN) break;
    float md = distance(vMonoL, uMarks[mi].xyz);
    float age = uTime - uMarks[mi].w;
    if (age < 0.0 || md > 6.0) continue;
    float grow = clamp(age * 0.55, 0.0, 1.0);
    float mr = (1.3 + 0.9 * monoHash(vec3(uMarks[mi].xyz))) * grow;
    // ragged edge, from the same hash family as everything else here
    float wob2 = 0.75 + 0.5 * monoNoise(vec2(vMonoL.y * 1.7 + uMarks[mi].w, md * 2.2));
    float body = smoothstep(mr * wob2, mr * wob2 * 0.35, md);
    // eaten in the rot's own pattern: cf is the corrosion field already
    // computed above, so the bite and the band share one structure
    float eaten = 0.40 + 0.60 * smoothstep(0.14, -0.10, cf);
    mkPit = max(mkPit, body * eaten);
    mkRim = max(mkRim, exp(-pow((md - mr * wob2) / 0.5, 2.0)) * 0.22 * grow);
  }
  // THE WITNESSED CULL, sinister gate 5, 2026-08-22. Where the law
  // struck a cell from the face, the stone keeps the pit - the same
  // bite law as a press, because absence has one law here, but with
  // NO rim residue: a taking, with nothing to show for itself. It
  // opens over the second the cell is still in the air.
  for (int ci = 0; ci < 6; ci++) {
    if (ci >= uCullN) break;
    float cd = distance(vMonoL, uCulls[ci].xyz);
    float cage = uTime - uCulls[ci].w;
    if (cage < 0.0 || cd > 5.0) continue;
    float cgrow = clamp(cage * 0.8, 0.0, 1.0);
    // a whole cell is gone here, not a symbolic touch, so the pit runs
    // a little wider than a press mark's: 1.6 to 2.2 units
    float cr = (1.6 + 0.6 * monoHash(uCulls[ci].xyz)) * cgrow;
    float cwob = 0.8 + 0.4 * monoNoise(vec2(vMonoL.y * 1.7 + uCulls[ci].w, cd * 2.2));
    mkPit = max(mkPit, smoothstep(cr * cwob, cr * cwob * 0.3, cd));
  }
  // THE BITES ARE OFF, Jacob 2026-08-27: "the stupid bug when you
  // click on spires holes form on it". The press bite was designed in
  // the corrosion's language - a visitor's touch eating the stone -
  // and with the rot gone it reads as a rendering hole, not a mark.
  // The press still reaches the world and the ledger; only the pit
  // visuals die, the cull's included.
  mkPit = 0.0;
  mkRim = 0.0;
  diffuseColor.rgb *= 1.0 - mkPit * 0.72;
  vMonoRough = clamp(vMonoRough + mkPit * 0.3, 0.05, 0.96);

  // ---- THE PEENING AND THE LINEWORK ----
  // Carried across from the crest, Jacob 2026-08-26, so the body and
  // the wings wear one finish: shallow hammered dimpling over every
  // face, and thin single-weight lines meandering across it. With the
  // rot gated off the mass had lost nearly all its surface incident
  // and read as a shaded solid; this is what puts worked metal back
  // without putting the condition back.
  //
  // Same construction as the crest's, on the body's own face
  // coordinate: CP runs monotonically from the cleft to the outer
  // edge, which is the one coordinate on this wedge that does not
  // smear on the flanks - see the corrosion note above, which paid
  // for that lesson three times.
  // Broad modulation, not dimpling: the spec's roughness map is "broad
  // 5 to 15 percent modulation plus directional micro-scratches", and
  // it bans noisy high-frequency grain. The body already carries its
  // own scratch system above, so only the broad term is needed here.
  float pPeen = monoFbm(CP * 0.06) - 0.5;
  // THE VEIN SEAM, RUNNING THROUGHOUT. Jacob, 2026-08-27: "run the
  // veiny seam throughout and there are some white lines like waves".
  // Those were the same term - at 0.22 this field draws long sweeping
  // contours that read as waves crossing the faces - and it was gated
  // into patches on top. Raising the frequency turns the contours into
  // a vein network and dropping the gate runs it over the whole mass.
  //
  float pLine = 0.0;

  // ---- THE ETCH FIELD ----
  // The material sheet's pale etched vein field, 2026-08-27. Level
  // set over its own gradient - the recorded recipe - with the width
  // measured by FIXED OFFSETS in the stone's frame, never screen
  // derivatives: the sheet bans swimming procedural noise and the
  // dFdx route is exactly how a field swims under a moving camera.
  // Territory-gated so it arrives in fields, not coverage, and kept
  // restrained: it reads as figure in the stone, mostly under graze.
  // Emission stays zero here; the state machine owns it later.
  // ETCH FIELD REMOVED, Jacob 2026-08-27: "remove the wavy thing on
  // the spires". The sheet asked for it; his eye killed it. The
  // spires carry no drawn field at all.
  float pEtch = 0.0;

  // B1 — LOWER LOAD RIBS, 2026-08-28. Three shallow structural ribs
  // rise through the existing flare on each half of the Spire. They
  // are relief in the locked graphite skin, not attached blades or a
  // new skirt: the outer silhouette, footprint and gold seam do not
  // move. Their broad feet carry the apparent load and taper out before
  // the lower body, avoiding the repeated vertical striping of a full
  // fluted column.
  float ribRise = 1.0 - smoothstep(0.055, 0.205, heightT);
  float ribWidth = mix(0.075, 0.026, smoothstep(0.0, 0.205, heightT));
  float ribD0 = abs(outward - 0.18);
  float ribD1 = abs(outward - 0.46);
  float ribD2 = abs(outward - 0.74);
  float rib0 = 1.0 - smoothstep(0.0, ribWidth, ribD0);
  float rib1 = 1.0 - smoothstep(0.0, ribWidth, ribD1);
  float rib2 = 1.0 - smoothstep(0.0, ribWidth, ribD2);
  float loadRib = max(rib0, max(rib1, rib2)) * ribRise;
  float ribLip0 = exp(-pow((ribD0 - ribWidth) / max(ribWidth * 0.24, 0.004), 2.0));
  float ribLip1 = exp(-pow((ribD1 - ribWidth) / max(ribWidth * 0.24, 0.004), 2.0));
  float ribLip2 = exp(-pow((ribD2 - ribWidth) / max(ribWidth * 0.24, 0.004), 2.0));
  float ribGroove = max(ribLip0, max(ribLip1, ribLip2)) * ribRise;

  // Keep the B1 read fixed in the skin. View-dependent graze tint and
  // fragment-normal relief were tried here first; the locked ambient
  // camera drift made their highlights crawl, so the base looked as if
  // it were continually resolving. Stable graphite tone gives the ribs
  // structure without introducing a second moving surface language.
  diffuseColor.rgb *= 1.0 - ribGroove * 0.20;
  diffuseColor.rgb = mix(diffuseColor.rgb, P_WORN,
    clamp(loadRib * 0.045, 0.0, 0.045));
  // Worn Edge, the palette's role for exposed metal at a seam lip -
  // mixed to, not added as a grey. Weighted by graze because it is
  // exposure rather than pigment.
  diffuseColor.rgb = mix(diffuseColor.rgb, P_WORN,
    clamp(pLine * (0.42 + 0.38 * graze), 0.0, 1.0));
  vMonoRough = clamp(vMonoRough + pPeen * 0.24 - pLine * 0.10, 0.05, 0.96);
  vMonoH = pLine * 0.28;

  // ---- THE PANEL SEAMS ----
  // From Jacob's clean-spire reference, 2026-08-27, and he took ONLY
  // this of its three proposals. The prongs read as constructed from
  // large facet panels: three authored seams per face at fixed
  // positions in the cleft-to-edge coordinate, so they converge with
  // the taper exactly as the reference's panels do, and their world
  // width narrows toward the tip for the same reason. AUTHORED, few,
  // straight - construction lines, not texture. Each seam is a dark
  // groove with a lit chamfer either side, in relief.
  // SEAM LOGIC per the identity sheet, with Jacob's constraint,
  // 2026-08-27: "make sure the seams join together like the image and
  // just supporting seams dont go all ballistic be coherent". One
  // dominant seam holds the face; three short supports BRANCH FROM IT
  // - every support's first endpoint sits exactly on the main line, so
  // the network reads as one stress system, never scattered stripes.
  // They concentrate at the transitions: the flare shoulder, the mid
  // panel, the upper body. Four seams a face, inside the sheet's
  // three-to-five band.
  // MAIN SEAMS ONLY, Jacob 2026-08-27, third ruling and the standing
  // one: every support is dead, including the shoulder. The seam is a
  // constant FRACTION of the face again - he wants the convergence
  // with the taper; the world-parallel attempt removed it and that
  // was a misread of his note. Thinner than the world-width version
  // ("super thick and weird"), and still stopping short of the tip.
  // THE SEAMS MIMIC THE CROWN, Jacob 2026-08-27: instead of fading
  // out where they used to stop, both faces' seams curve inward as
  // they rise - the same convergence the prongs' own edges carry -
  // and MERGE into the cleft at that height, so the pair and the slit
  // read as one lancet shape. Below the bend they hold the straight
  // 0.38 line as before.
  float seam = 0.0;
  float chamfer = 0.0;
  float seamDepth = 0.0;
  {
    // THE BROAD LANCET, Jacob 2026-08-27: thin lines, wide arch. The
    // seams hold their stance almost to the top of the run and then
    // sweep into the merge on a quarter-ellipse - the sides of a true
    // arch - instead of pinching to the centre early. A thick tapered
    // cut was tried against the same sentence and rejected.
    // PER-SIDE MERGE HEIGHT, measured not guessed: the prongs are
    // asymmetric (different tips, offset cleft), so one world height
    // lands at different screen heights per side - the left tip
    // measured 16px above the right. Each side merges at its own
    // height, offset by exactly that measurement.
    // The offset serves the EYE, not the ruler: red-paint measurement
    // put the two tips level to 2px, and Jacob still saw the left
    // running high - because the left face is lit and its line holds
    // contrast to the top, while the right's upper stretch dies into
    // shadow. The left therefore merges visibly lower.
    float mergeEnd = 0.73 - (sideS < 0.0 ? 0.004 : 0.0);
    // LINEAR ramp, not smoothstep: the S-curve below already eases
    // both ends, and easing the ramp too stacked the curvatures - the
    // line bent across too few pixels in the upper half and the
    // antialiasing could not track it, which is the "rough and
    // pixelated again" of 2026-08-27.
    float mergeT = clamp((heightT - 0.45) / (mergeEnd - 0.45), 0.0, 1.0);
    // THE POINTED MERGE, Jacob 2026-08-27: "the merge feels curved
    // while it should pointed like the pointy crown spires tops". The
    // ellipse and cosine both arrive at the cleft moving at their
    // fastest horizontal rate, so the two seams met shallow and the
    // join read as a rounded arch. This S-curve has ZERO slope at both
    // ends: the seams hold their stance, sweep through the middle,
    // then STRAIGHTEN toward vertical as they land - two near-vertical
    // lines meeting is a point, which is the crown's own geometry.
    // Slope stays bounded everywhere, so the anti-noise fix holds.
    // NOT fully vertical at the landing. A zero end slope makes the
    // final stretch run PARALLEL to the cleft, hugging it - which is
    // the "line drawn after the merge" Jacob saw on the lit left face
    // (the right hides the same tail in shadow). Mixing 15 percent
    // linear back in keeps the arrival steep enough to read pointed
    // while meeting the cleft at an angle and TERMINATING.
    float seamS = mergeT * mergeT * (3.0 - 2.0 * mergeT);
    float seamPos = 0.38 * (1.0 - mix(seamS, mergeT, 0.15));
    // the cap ends EXACTLY at the apex. Past the merge the position
    // clamps to the cleft, so any life left in the cap draws a stub
    // line hugging the slit above the point - "looks like a line
    // above the merge". Tight antialiased cut at each side's own
    // landing height.
    float seamCap = 1.0 - smoothstep(mergeEnd - 0.005, mergeEnd, heightT);
    float d = abs(clamp(outward, 0.0, 1.1) - seamPos);
    // "it feel still rough", Jacob 2026-08-27: a shader line one or
    // two pixels wide aliases into stair-steps unless its edges are
    // softened by the pixel footprint. fwidth here is ANTIALIASING of
    // the edge, not a position term - the line stays world-locked and
    // cannot swim; only its border blends over the one pixel it
    // crosses. This is what machined finish looks like at this scale.
    float aaD = fwidth(d) * 1.8;
    seam = (1.0 - smoothstep(0.0, 0.011 + aaD, d)) * seamCap;
    chamfer = (1.0 - smoothstep(0.011, 0.03 + aaD, d)) * step(0.011, d) * seamCap;
    // THE SCULPT, Jacob 2026-08-27: "the seam is too static and
    // render feels off can you sculpt it even more". Static here
    // means FLAT - a drawn line, not a carved one. This basin is a
    // smooth squared profile across groove and chamfer whose depth
    // feeds the normal injection, so the channel has walls the light
    // actually models, and the painted lip below is cut back to let
    // the lit geometry do that work.
    float basin = (1.0 - smoothstep(0.0, 0.034 + aaD, d)) * seamCap;
    seamDepth = basin * basin;
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, P_OBSIDIAN, seam * 0.7);
  // the cavity: the interior occludes toward the centre line - the
  // sheet's "use cavity or AO for seam depth"
  diffuseColor.rgb *= 1.0 - seamDepth * 0.42;
  diffuseColor.rgb = mix(diffuseColor.rgb, P_WORN, chamfer * (0.16 + 0.24 * graze));
  // the lip polishes harder than before: a machined edge is smooth
  vMonoRough = clamp(vMonoRough + seam * 0.16 - chamfer * 0.2, 0.05, 0.96);
  vMonoH = vMonoH - seamDepth * 1.7 + chamfer * 0.22;

  float wResp = exp(-pow((vMonoL.y - uWatchY) * 0.017, 2.0)) * uWatchAmt;
  vMonoEng = (cWeb * band * 0.028
            + cCrack * 0.020
            + cRun * 0.005) * (1.0 - uCalm * 0.45)
            * (1.0 + wResp * 2.2)
            + mkRim * 0.016 * (1.0 - uCalm * 0.45);

  // ---- THE SEALED FACE IS PITCH BLACK ----
  // Jacob, 2026-08-29: "i dont want anything after the white and gold
  // lines the black should be pitch black nothing on it". Masking the
  // emissive terms was not enough on its own - this is a lit material,
  // so the exposed wall still answers the scene lights and the
  // environment, and no amount of removing GLOWS makes a surface that
  // is being lit go black.
  //
  // So the albedo itself goes to nothing on the faces the parting
  // exposes. A face that has been sealed against another slab of rock
  // since the thing was built has no finish on it to catch anything.
  // Keyed on how far the face turns into the cleft and gated by the
  // parting, so at uPart = 0 it is exactly 1 and the hero is untouched.
  {
    float kSide = vMonoL.x >= 0.0 ? 1.0 : -1.0;
    float kInward = clamp(normalize(vNormal).x * -kSide, 0.0, 1.0);
    float sealed = kInward * (1.0 - exp(-uPart * 0.55));
    diffuseColor.rgb *= 1.0 - sealed * 0.97;
    vMonoEng *= 1.0 - sealed;
  }
  }
}`;

const FRAG_EMISSIVE = `#include <emissivemap_fragment>
if (gl_FrontFacing) {
  float heightT = clamp(vMonoL.y / 195.0, 0.0, 1.0);
  vec3 sig = mix(vec3(1.0, 0.98, 0.94), vec3(0.72, 0.86, 1.0), uSeverity);
  // only fragments ever light, and they are small and hard edged
  totalEmissiveRadiance += sig * vMonoEng * 2.4;
  // NO HOVER LAMP. Jacob: "when you hover cursor over the spire there
  // is glow as well which is undercutting the sinister part".
  //
  // He is right, and the cause is that TWO things answered the pointer
  // and they were saying opposite things. A soft warm pool under the
  // cursor is an interaction affordance - it means "you may touch
  // this", which is welcoming - and the watcher in the cleft means
  // something is aware of you. Run together, the friendly one wins,
  // because a glow under your hand is the older and more familiar
  // signal.
  //
  // One input, one response, and it is the predatory one. The press
  // still works and still writes to the ledger; it simply no longer
  // announces itself in advance.
  if (uInnerAmt > 0.001) {
    vec3 iv = uInner - vMonoL;
    totalEmissiveRadiance += vec3(0.45, 0.5, 0.6) * (uInnerAmt / (1.0 + dot(iv, iv) * 0.02));
  }

  // ---- THE ERODED GILDING ----
  // 40k steal 3, Jacob 2026-08-27: gold in that language is never
  // clean, it survives where light pools. The seam's ruined gold has
  // stained the stone that FACES it - a static warm bounce on the
  // cleft-facing walls, falling off within a few units, so the slit's
  // edges carry a centuries-of-lamplight patina. Bounce, not pigment:
  // it lives in emission at whisper level, fades with decay, and adds
  // no line to any face the camera sees square-on.
  {
    float gSide = vMonoL.x >= 0.0 ? 1.0 : -1.0;
    // THE SEAM MOVES WITH THE SPIRE - Jacob, 2026-08-29, said three
    // times before it was heard. The gilded band was anchored at a
    // fixed WORLD x, so the blades slid out from under their own
    // gold. The anchor rides the parting now: each blade carries its
    // seam-edge with it, wherever it stands.
    float gCut = gSide * (5.0 - 3.9 * clamp(heightT, 0.0, 1.0));
    float gDist = abs(vMonoL.x - gCut);
    vec3 gN = normalize(vNormal);
    float gFace = clamp(gN.x * -gSide, 0.0, 1.0);
    float gNear = exp(-gDist * 0.45);
    // CONTRAST, NOT BRIGHTNESS - Jacob, 2026-08-29. Measured the same
    // day: at the full opening the brightest columns of the frame were
    // NOT the seam (133) but the gilded stone either side of it (184
    // and 208). Both terms below are gained by uPart, which runs to
    // 3.5, so the parting was doubling the face bounce and turning the
    // blades into a wall of gold. The gains come down; the 0.5 base is
    // untouched, so the standing hero frame is bit-for-bit unchanged.
    // THE EXPOSED WALL IS NOT GILDED, AND IT IS NOT FLAT. Jacob,
    // 2026-08-29, with a frame: two flat beige strips flanking the gap,
    // "faint gold on the black part ... it looks odd". Red-paint capture
    // put the fault exactly there and showed it UNIFORM across each
    // face - because gNear is measured from gDist, which lives in the
    // stone's own unparted frame, and the cut face sits at gDist = 0
    // across its whole area. A stain meant for the lip of a slit became
    // a painted slab the moment the slit became a doorway.
    //
    // Two corrections, both physical rather than a level cut:
    //
    // gTravel - the wall carries itself AWAY from the light as the
    // stone parts, so it falls into shadow rather than brightening.
    // Exactly 1 at uPart = 0, so the standing hero frame is untouched.
    //
    // AND IT GOES TO NOTHING. Jacob, 2026-08-29, with a zoom: "the gold
    // should stop at the white line on either side so black looks like
    // black". At 0.17 the falloff still left 36 percent of the gilding
    // on the exposed wall - the faint gold lying on the black band.
    // Red-paint capture ruled out the gap light as the source: the
    // column plane stops well inside those bands, so the only thing
    // lighting them was this term. 0.62 takes it to under three percent
    // by the time the gate is open, which is also the honest reading -
    // the gilding is a patina from centuries of light pooling at the
    // lip of a slit, and this face was sealed behind it the whole time.
    //
    // gDepth - the face RECEDES into the chamber. Lit at the front
    // where the light escapes, dark going back, so it reads as a wall
    // with depth instead of a card. At the hero only the front sliver
    // is visible and gDepth is already 1 there, so again nothing moves.
    float gTravel = exp(-uPart * 0.62);
    float gDepth = smoothstep(-16.0, 8.0, vMonoL.z);
    totalEmissiveRadiance += vec3(0.42, 0.27, 0.10) * gFace * gNear * gDepth * 0.5 * gTravel * (1.0 - uDecay);
    // the door panels' FRONT faces catch the gap's fire as they
    // travel: without this the parting is invisible dead-on
    // (inspection fault 1, 2026-08-29)
    //
    // THIS IS THE OUTER BLOOM AND IT STAYS. Damping it by
    // exp(-uPart * 0.30) killed the warm bounce on the outer faces and
    // Jacob caught it immediately - "the outer bloom is gone". It was
    // never the fault: the gold lying beside the black band comes from
    // the gap light's own plane running to its edge, not from the
    // stone. Restored to full.
    float gFront = clamp(gN.z, 0.0, 1.0);
    totalEmissiveRadiance += vec3(0.5, 0.34, 0.13) * gFront * exp(-gDist * 0.3) * uPart * 0.047 * (1.0 - uDecay);
  }

  // ---- THE RIM ----
  // Gate 3 of the reference picture, 2026-08-22. With the sky dropped to
  // near-black (gate 1), the shadow side of the mass sank into it and the
  // silhouette died - the exact failure the skyAt comment predicts for a
  // near-black object on a near-black sky. The picture separates them
  // with pale light grazing the outer edges, sourced by its backlit
  // cloud break.
  //
  // Built as a fresnel response to SKY light, not a fixed backlight: the
  // camera orbits this monument across the whole journey, and a sun
  // nailed to one azimuth reads correctly from the opening and wrongly
  // from everywhere else. View-grazing edges catch a cold sky-coloured
  // light, biased upward twice - by the surface facing the sky and by
  // height on the mass - because the light this claims to be comes from
  // above. Fades with decay like everything else, and lives in the
  // material so the flat audit keeps it: this is the static-frame law
  // being served, not bloom.
  {
    vec3 rimV = normalize(vViewPosition);
    // the sheet's edge response: fresnel exponent 5.0, Cold Rim only,
    // idle strength - the pressure lift belongs to the state machine
    float graze = pow(max(1.0 - abs(dot(normal, rimV)), 0.0), 5.0);
    // the sky is up: normals with any upward lean catch more of it
    float up = 0.35 + 0.65 * clamp(normal.y * 0.5 + 0.5, 0.0, 1.0);
    // A SURFACE INSIDE THE CLEFT HAS NO SKY. Jacob, 2026-08-29: "what
    // are those grey outer lines" - the pale cold edges standing either
    // side of the black band. They are this rim, which is a fresnel
    // response to SKY light and exists to hold the monument's outer
    // silhouette off a near-black sky. Parting the stone exposed a set
    // of inner edges that never had sky to catch: they face another
    // slab of rock a few units away. The rim was lighting them anyway,
    // which is what drew a grey line down each side of the opening.
    //
    // Masked by how far the face turns INTO the cleft, and gated by the
    // parting so it can only bite on geometry the opening exposed. At
    // uPart = 0 this is exactly 1 and the standing hero is untouched.
    float rSide = vMonoL.x >= 0.0 ? 1.0 : -1.0;
    float rInward = clamp(normalize(vNormal).x * -rSide, 0.0, 1.0);
    float rimMask = 1.0 - rInward * (1.0 - exp(-uPart * 0.55));
    totalEmissiveRadiance += P_RIM * graze * up * (0.30 + 0.70 * heightT) * uRim * rimMask;
  }
}`;



/**
 * THE MONUMENT, observed. One colossal stele of light cells in a dark
 * sea. Scroll strips it: cells fail and fall, crown first, and the
 * dark frame that was always holding it becomes the subject. The
 * renderer owns no authoritative state: decay is a pure function of
 * scroll, strikes come from the world's law.
 */

/**
 * The light score: every beat is lit on purpose. Warm hero light at
 * the establish, a raking key across the relief at the reading dwells
 * (the igloo move: material is revealed by light direction, not
 * brightness), near-darkness inside the cleft, cold witness light for
 * the return. Lerped by scroll progress.
 */
/**
 * THE AIR, re-solved 2026-08-21. Jacob: the hero "is engulfed in the
 * background and the colour and seems small like part of choir".
 *
 * Three complaints, one fault, and it was not the rig or the albedo -
 * both were rebalanced on 2026-08-19 and both were correct for where
 * the camera stood THEN. The landing pose moved the same week from
 * (0,14,300) to (0,95,620) for the processional reference frame.
 * FogExp2 is quadratic in distance, so more than doubling it did not
 * double the veil, it squared it:
 *
 *   at 300 units, density 0.0022 -> 35% fog, 65% of the stone survives
 *   at 620 units, density 0.0022 -> 84% fog, 16% of the stone survives
 *
 * Five sixths of the hero was being discarded and replaced with flat
 * fog colour before it reached the frame. Every facet tone, machined
 * edge, inscribed glyph and raking key highlight was multiplied by
 * 0.16, which is why the mass reads as a cutout: what is left is the
 * fog colour, #05070c at luminance 0.027, against a sky measured at
 * 0.165 across the horizon. A dark shape on a lighter ground is a
 * silhouette, and a silhouette carries no size cue but its outline.
 * That is also why it reads as one of the choir: the choir sits at
 * 99.9% fog, so hero and witnesses were being painted the same colour,
 * and aerial perspective then puts them at the same distance, and
 * anything at the choir's distance must be the choir's size.
 *
 * That diagnosis was right and the remedy was solved for the wrong
 * camera. 0.00106 gives the 35% veil at 620 units - but the landing
 * went back to (0,14,300) on 2026-08-21, and the whole reason the hero
 * was drowning was that the camera had moved out to 620 in the first
 * place. Fix the distance and the air does not need rescuing: at 300
 * units 0.0022 IS the 35% veil, which is what the rig was balanced
 * against on 2026-08-19 and what this number always meant.
 *
 * Leaving it thinned would have double-counted the correction and
 * stripped the aerial perspective out of the frame entirely.
 *
 * Sweep it with window.__dl.setFog(density) rather than trusting this
 * number: it is solved, not judged, and judging it is Jacob's.
 */
const LANDING_FOG = 0.0022;

/**
 * How much denser the landing air is at the plain than at the hero's
 * mid-height.
 *
 * 2.08 existed only to hold the plain down under the thinned air, and
 * that air is gone. Jacob, 2026-08-21: "now haze is too much you over
 * did it so we wont see the choir hovering but that made it worse".
 * Back to 1.0 - uniform, no ground term at all. The height falloff is
 * kept in the shader because haze genuinely does pool low and it is one
 * uniform away, but it is OFF until a frame asks for it, not on because
 * a sweep liked it.
 */
const GROUND_HAZE = 1.0;
const HERO_LIGHT: {
  i: number;
  c: string;
  d: [number, number, number];
  amb: number;
  env: number;
} =
  // THE RIG, rebalanced 2026-08-19. Jacob: the hero is "very light in
  // colour and rest of background and skybox are eating it... can we
  // make it something that is very coherent".
  //
  // The fault was not the albedo, it was the ratio. Ambient was STRONGER
  // than the key at every stop - 1.1 against 0.88 at the landing - so
  // the monument was lit mostly by directionless fill. Fill cannot model
  // a form: it raises every facet by the same amount whatever way the
  // facet faces, which is the definition of flat. Lifting the albedo on
  // top of that only made the flatness paler, which is why it started
  // reading as a light grey cutout the sky could eat.
  //
  // Ambient roughly halved and the key raised to carry the exposure
  // instead. Now one side of the mass is lit and the other falls away,
  // so it reads as a solid with weight rather than a shape with a tone.
  // The landing key also swings side-on, from [0.35, 0.75, 0.55] which
  // was almost down the camera axis - frontal light flattens a form as
  // surely as ambient does - to a raking angle that separates the two
  // prongs and lets the skin's grazing-angle glyphs do their work.
  //
  // Inside the cleft the ambient is cut less hard: in there the fissure
  // and the traveller's light are doing the modelling already, and the
  // walls need enough fill to stay material rather than becoming a
  // black cutout.
  { i: 1.45, c: '#eef1f4', d: [0.85, 0.55, 0.12], amb: 0.5, env: 0.29 };

const CLAD_VERT = /* glsl */ `
  in vec3 aOffset;
  in float aSeed;
  in float aThresh;
  in float aStrike;
  uniform float uDecay;
  uniform float uTime;
  uniform float uFogDensity;
  uniform float uCalmV;
  out vec3 vNormalV;
  out float vSeed;
  out float vFog;
  out float vDying;
  out float vFall;
  out float vStruck;
  out float vHeight;
  out vec2 vUv;
  out float vWorldY;
  out vec3 vWorld;
  void main() {
    vSeed = aSeed;
    // culled by the law, as opposed to failed by the scroll's decay
    float struckF = aStrike < 0.0 ? 0.0 : 1.0;
    vStruck = struckF;
    // the standing monument is authored stone now; a cube exists only
    // in its moment of failure, as debris in the air. The fall is
    // punctuation, never weather: it completes quickly and goes dark.
    // A CULLED cell falls at half the decay's rate and keeps most of
    // its size - one witnessed judgment, not weather, and a fall too
    // fast to see is a fall that never happened. Gate 5, 2026-08-22.
    float over = max(0.0, uDecay - aThresh);
    // a live strike fells the cell regardless of scroll
    float sinceStrike = aStrike < 0.0 ? -1.0 : max(0.0, uTime - aStrike);
    float fallT = max(over * 40.0, sinceStrike > 0.0 ? sinceStrike * mix(1.8, 0.9, struckF) : 0.0);
    vFall = fallT;
    vDying = smoothstep(0.035, 0.0, aThresh - uDecay) * step(uDecay, aThresh);

    // masonry: no two cells cut quite alike
    float sizeVar = 0.93 + 0.1 * fract(aSeed * 7.31);
    float shrink = clamp(1.0 - fallT * mix(0.85, 0.4, struckF), 0.05, 1.0);
    vec3 wp = position * sizeVar * shrink + aOffset;
    if (fallT <= 0.0 || fallT > 2.0) wp = vec3(0.0, -9999.0, 0.0);
    if (fallT > 0.0) {
      float ang = fallT * (aSeed * 8.0 - 4.0) + uTime * 0.22 * (aSeed - 0.5) * (1.0 - uCalmV);
      float ca = cos(ang);
      float sa = sin(ang);
      vec3 lp = wp - aOffset;
      lp.xy = mat2(ca, -sa, sa, ca) * lp.xy;
      lp.xz = mat2(ca, -sa, sa, ca) * lp.xz;
      wp = lp + aOffset;
      wp.y -= fallT * fallT * 34.0;
      wp.x += sin(aSeed * 43.0) * fallT * 6.0;
      wp.z += cos(aSeed * 91.0) * fallT * 6.0;
      if (wp.y < -2.0) wp = vec3(0.0, -9999.0, 0.0);
    }
    #ifdef MIRROR
    if (wp.y > -100.0) {
      wp.y = -wp.y - 0.12;
      wp.x += sin(wp.y * 0.32 + uTime * 0.7 + wp.z * 0.11) * 0.4;
    }
    #endif
    vUv = uv;
    vWorldY = wp.y;
    vWorld = wp;
    vHeight = clamp(aOffset.y / 195.0, 0.0, 1.0);
    vNormalV = normalize(normalMatrix * normal);
    vec4 mv = viewMatrix * vec4(wp, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = max(1.0, -mv.z);
    vFog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  }
`;

const CLAD_FRAG = /* glsl */ `
  precision highp float;
  in vec3 vNormalV;
  in float vSeed;
  in float vFog;
  in float vDying;
  in float vFall;
  in float vStruck;
  in float vHeight;
  in vec2 vUv;
  in float vWorldY;
  in vec3 vWorld;
  uniform float uTime;
  uniform float uSeverity;
  uniform float uCalm;
  uniform vec3 uHover;
  uniform float uHoverAmt;
  uniform vec3 uInner;
  uniform float uInnerAmt;
  uniform vec3 uFogColor;
  out vec4 outColor;
  void main() {
    vec3 n = normalize(vNormalV);
    vec3 L = normalize(vec3(0.35, 0.75, 0.55));
    float diff = clamp(dot(n, L), 0.0, 1.0);
    // chunks of the body: dark igneous stone, its light failing with it
    vec3 base = mix(vec3(0.21, 0.205, 0.2), vec3(0.25, 0.24, 0.225), vSeed * 0.5);
    base = mix(base, vec3(0.14, 0.17, 0.23), uSeverity * 0.5);
    vec3 col = base * (0.38 + 0.5 * diff) * mix(0.5, 1.15, vHeight * vHeight);
    // the crown burns near-white: the monument's own lamp
    vec3 crownCol = mix(vec3(1.0, 0.94, 0.8), vec3(0.85, 0.92, 1.0), uSeverity);
    col += crownCol * smoothstep(0.93, 1.0, vHeight) * 1.5 * (1.0 - uSeverity * 0.5);
    // mortar: the joints hold shadow
    vec2 eUv = min(vUv, 1.0 - vUv);
    float edge = min(eUv.x, eUv.y);
    col *= 0.76 + 0.24 * smoothstep(0.0, 0.1, edge);

    // the engravings: every cell inscribed with its own recursive
    // pattern, records carved in light. A slow pulse climbs the
    // monument through them: the tower reading itself.
    if (vFall <= 0.0) {
      float eng = 0.0;
      vec2 p = vUv;
      float amp = 1.0;
      for (int i = 0; i < 4; i++) {
        p = fract(p * 2.0 + vSeed * 13.17 + float(i) * 0.31);
        vec2 dd = abs(p - 0.5);
        float frame = smoothstep(0.5, 0.44, max(dd.x, dd.y)) *
                      smoothstep(0.3, 0.36, max(dd.x, dd.y));
        float keep = step(0.45, fract(vSeed * (7.0 + float(i) * 3.7) + float(i) * 0.37));
        eng = max(eng, frame * keep * amp);
        amp *= 0.72;
      }
      eng *= smoothstep(0.02, 0.09, edge);
      // carved: the grooves hold quiet shadow, dormant until attended
      col *= 1.0 - eng * 0.24;
      // the visitor's lamp: where you point, the records wake. Warm
      // light early; the same touch turns cold as the truth arrives.
      // the hover lamp is gone here too - see the note in
      // FRAG_EMISSIVE. It was the warmest thing in the frame, at
      // (1.0, 0.88, 0.68), which is exactly why it read as an
      // invitation.
    }
    // the traveller's light, inside the wall
    if (uInnerAmt > 0.001) {
      vec3 iv = uInner - vWorld;
      float id2 = dot(iv, iv);
      float il = uInnerAmt / (1.0 + id2 * 0.02);
      col += vec3(0.5, 0.55, 0.65) * il * (0.3 + 0.7 * max(dot(n, normalize(iv)), 0.0));
    }
    // the waterline keeps its dark
    col = mix(col * 0.35, col, smoothstep(0.0, 4.0, vWorldY));
    #ifdef MIRROR
    col *= 0.24;
    #endif
    if (vDying > 0.0) {
      // a slow gutter, never a strobe: shallow, smooth, and still under
      // reduced motion
      float g = 0.72 + 0.22 * sin(uTime * (1.0 + vSeed * 1.4) + vSeed * 40.0);
      col *= mix(1.0, mix(g, 0.8, uCalm), vDying);
    }
    if (vFall > 0.0) {
      // The scroll's decay drops cells dark: they were dead already,
      // and dozens fall at once, so dark is the only calm option. A
      // CULLED cell is different, and there is only ever one at a
      // time: the law takes it lit and it dies in the air. The pale
      // fleck crossing the dark is what makes the witnessed cull
      // witnessable at landing distance - sinister gate 5, 2026-08-22.
      float dim = mix(
        clamp(1.0 - vFall * 1.1, 0.08, 1.0),
        clamp(1.0 - vFall * 0.45, 0.18, 1.0),
        vStruck
      );
      col *= dim;
      // the record's light leaves it in the air: taken lit, lands dark
      col += vec3(0.85, 0.9, 1.0) * vStruck * clamp(1.0 - vFall * 0.7, 0.0, 1.0) * 0.5;
    }
    col = mix(col, uFogColor, vFog);
    outColor = vec4(col, 1.0);
  }
`;

const MARK_VERT = /* glsl */ `
  in float aBorn;
  uniform float uTime;
  uniform float uScale;
  out float vBorn;
  void main() {
    vBorn = aBorn;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = max(1.0, -mv.z);
    gl_Position = projectionMatrix * mv;
    float ignite = clamp((uTime - aBorn) * 1.4, 0.0, 1.0);
    float swell = 1.0 + (1.0 - ignite) * 2.4;
    // smaller, too: at 72 pixels a mark was a feature of the frame
    // rather than something the visitor left in it
    gl_PointSize = clamp(uScale * 1.35 * swell / dist, 2.0, 38.0);
  }
`;

const MARK_FRAG = /* glsl */ `
  precision highp float;
  in float vBorn;
  uniform float uTime;
  out vec4 outColor;
  void main() {
    // A MARK IS A HOLE, NOT A DOT. Jacob: "when i click on hero there
    // are small white sprouts sticking on hero like pimples".
    //
    // It was a soft round additive falloff - a filled bright disc stuck
    // on the surface, which is exactly what a pimple is. In a direction
    // where the stone is EATEN, a press has to open the surface, not
    // add something to it.
    //
    // So only the RIM lights. Additive cannot darken, but a lit ring
    // with nothing inside reads as an opening rather than a lump, and
    // the rim is irregular per mark so it is bitten rather than
    // stamped. The arrival still flares, briefly; what remains is a
    // small hole in the face carrying the same cold as the rot.
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    if (r > 1.0) discard;
    float a = atan(d.y, d.x);
    float wob = 0.74 + 0.15 * sin(a * 5.0 + vBorn * 7.3)
                     + 0.07 * sin(a * 11.0 - vBorn * 3.1);
    float rim = exp(-pow((r - wob) / 0.15, 2.0));
    float ignite = clamp((uTime - vBorn) * 1.4, 0.0, 1.0);
    float flash = 1.0 - ignite;
    vec3 cold = vec3(0.72, 0.86, 1.0);
    vec3 col = cold * rim * (0.45 + 1.9 * flash)
             + cold * smoothstep(wob, wob * 0.5, r) * 0.10 * flash;
    outColor = vec4(col, 1.0);
  }
`;



// MONO_VERT and MONO_FRAG lived here: the mirrored stone shader for
// the drowned monument. Removed with the reflection itself, 2026-08-19.
//
// Worth recording: MONO_FRAG carried its own inlined copy of the form
// constants, so the rule was "change the form in FOUR places" -
// src/world/monumentForm.ts, tools/blender/monument.py, FRAG_MAP and
// MONO_FRAG. It is THREE now. One fewer copy to drift out of step.

const MOTE_VERT = /* glsl */ `
  in float aSeed;
  uniform float uTime;
  uniform float uScale;
  out float vSeed;
  void main() {
    vSeed = aSeed;
    vec3 p = position;
    // slow rise and drift: the air made visible
    p.y = mod(p.y + uTime * (0.3 + aSeed * 0.5), 34.0);
    p.x += sin(uTime * 0.05 + aSeed * 40.0) * 2.0;
    p.z += cos(uTime * 0.04 + aSeed * 70.0) * 2.0;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = max(1.0, -mv.z);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uScale * 0.08 * (0.5 + aSeed) / dist, 1.0, 14.0);
  }
`;

const MOTE_FRAG = /* glsl */ `
  precision highp float;
  in float vSeed;
  uniform float uSeverity;
  uniform float uAmt;
  out vec4 outColor;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d) ;
    if (r2 > 0.25) discard;
    float fall = exp(-r2 * 12.0);
    vec3 warm = vec3(0.62, 0.5, 0.34);
    vec3 cold = vec3(0.3, 0.38, 0.5);
    outColor = vec4(mix(warm, cold, uSeverity) * fall * 0.62 * uAmt, 1.0);
  }
`;

const SKY_VERT = /* glsl */ `
  out vec3 vDir;
  void main() {
    vDir = position;
    vec4 mv = modelViewMatrix * vec4(position, 0.0);
    gl_Position = (projectionMatrix * vec4(mv.xyz, 1.0)).xyww;
  }
`;

// THE SKY, as one function rather than one shader. The shore now runs
// all the way out to the fog, so the plain has to MEET this instead of
// cutting it, and the ground evaluates the same law at the horizon
// rather than carrying a second copy of these numbers.
const SKY_LAW = /* glsl */ `
// how far the world is lifted out of night and into twilight. Declared
// here because SKY_LAW is injected into BOTH the sky and the ground, and
// they have to agree about what the sky is worth or the horizon splits.
uniform float uGlow;
float skyHash(vec2 c) { return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453); }
float skyNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(skyHash(i), skyHash(i + vec2(1.0, 0.0)), f.x),
             mix(skyHash(i + vec2(0.0, 1.0)), skyHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float skyFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * skyNoise(p); p *= 2.07; a *= 0.5; }
  return v;
}

// Rotating the SAMPLE POINT about the monument's axis, rather than
// translating it, is what keeps the drift even. A flat sheet seen from
// below is 300 units away overhead and 26000 at the horizon, so a
// constant world velocity would tear across the zenith and stand still
// at the horizon. Rotation moves every sample at the same ANGULAR rate,
// which is the same rate on screen everywhere.
//
// It rotates the texture only. Deck altitude and the draw's dip are
// computed from the true direction, so the bend stays fixed on the
// Spire while the weather moves through it.
vec2 skyDrift(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

vec3 skyAt(vec3 d, vec3 eye, float sev, float lidAmt, float drawAmt, float strata, float shaftAmt, float breakAmt, float time) {
  // The skin is #050607. A near-black object against a near-black sky
  // is nothing at all, which is why the spire vanished when the spec
  // albedo went in. Every reference sheet stands it against haze, so
  // the atmosphere carries the silhouette and the stone stays honest
  float band = exp(-abs(d.y + 0.02) * 3.2);
  float high = exp(-max(d.y - 0.1, 0.0) * 2.4);
  // COLD BLUE, on Jacob's instruction 2026-08-19: the sky "collides
  // with the base and hero and spires and rest plain". It did. Sky,
  // plain, choir and monument were all sitting in one narrow neutral
  // grey band, so nothing separated from anything and the only thing
  // outside the band was the fissure - which is why it read as blinding
  // and why the hero read as invisible beside it.
  //
  // This is the brief's Deep energy blue as a HUE, not as a colour: at
  // roughly three to one blue over red it lands near 225 degrees, a true
  // blue with no violet in it, and it stays deeply desaturated. The
  // near-black stone is very slightly warm, so it now reads warm against
  // a cold sky instead of grey against grey.
  //
  // It is also about a quarter darker in luminance than the neutral sky
  // was, which gives the monument somewhere to be brighter THAN.
  //
  // GATE 1 OF THE REFERENCE PICTURE, 2026-08-22: the whole field drops to
  // about forty percent of that. Measured before the change, the clear
  // sky sat at 12.7/255 and the horizon at 15.2 - a broad mid-navy wash
  // that the monument's shadow side sank UNDER, so the frame read as a
  // grey-blue card with a dark cutout. The picture's sky is near-black
  // with structure. Hue untouched; the decks, lid and drift all scale
  // with these two, which is the point of them being the only two.
  // ---- TWILIGHT, 2026-08-23 ----
  // Jacob: "light fades but twilight always lives", and sinister is
  // knowing awareness, not threat. What was here was NIGHT WITH A LAMP -
  // a near-black field with one bright seam in it, which is a lit object
  // in a void, and a lit object in a void is a cool 3D thing beside
  // company copy however it is dressed.
  //
  // Twilight is different physics. Nothing is black. The whole field
  // carries light, there is no source anyone can point at, and it never
  // resolves - it does not fall to night and it does not lift to day, it
  // HOLDS. The base term is what black used to be, so the darkest part
  // of the sky is still sky; the glow rides on top of it.
  //
  // uGlow scales both together so the state stays one dial: 0 is the old
  // night, 1 is twilight, and it goes past that for review.
  vec3 base = mix(vec3(0.0017, 0.0024, 0.0048), vec3(0.0013, 0.0020, 0.0044), sev)
            * (1.0 + uGlow * 5.2);
  vec3 glow = mix(vec3(0.0097, 0.0147, 0.0294), vec3(0.0055, 0.0092, 0.0210), sev)
            * (1.0 + uGlow * 1.9);
  vec3 col = base + glow * band * (0.35 + 0.65 * high);

  // THE DECKS. Three horizontal sheets of haze at real altitudes. A ray
  // meets a sheet at t = (H - eye.y) / d.y, so the texture compresses
  // toward the horizon on its own and slides as the camera translates.
  // That perspective is the entire difference between weather and a
  // painted backdrop.
  //
  // This replaces a pair of sines on d.y that claimed to be strata and
  // could only ever have been stripes on a dome: banding the VIEW angle
  // has no distance in it, so it has no compression, no parallax, and a
  // nameable repeated element the moment it is strong enough to see. It
  // was also multiplied by exp(-|d.y| * 2.2), which killed it exactly
  // where the sky is bright. Measured, the sky was a monotonic ramp of
  // 0.060 to 0.234 varying 12 percent across the whole frame.
  float dens = 0.0;
  float lit = 0.0;
  float dy = max(d.y, 0.035);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float H0 = 300.0 + fk * 760.0;

    // THE DRAW. The sheets are not level: they dip toward the Spire's
    // axis, nearly horizontal at the edges and gently curving down as
    // they pass over the monument, as if the whole chamber were under a
    // field.
    //
    // This is deliberately GEOMETRY and not a texture warp. Swirling
    // the sample coordinate would crowd the pattern toward the centre
    // and read as an effect painted on a flat sheet; bending the sheet
    // itself and intersecting the bent sheet makes the perspective, the
    // compression and the convergence all fall out on their own. A
    // swirl says "effect". A draw says "law".
    //
    // Bending H makes the intersection implicit, so it is solved with
    // one fixed-point step: hit the flat sheet, ask how deep the dip is
    // there, then hit the bent sheet. One step is ample for a bend this
    // gentle and it keeps the cost closed-form.
    //
    // Two properties come free and both are in the brief. At grazing
    // angles t is enormous, so the sample lands far out where the dip
    // has died and the strata stay level at the edges. Overhead the
    // sample lands near the axis, which is where the dip is deepest.
    float t = (H0 - eye.y) / dy;
    vec2 pf = eye.xz + d.xz * t;
    // 7000 units of influence, not 3000. At 3000 the dip only reached
    // the lowest deck: the upper two are sampled four and seven
    // thousand units out at the elevations that matter, so the field
    // had died before it got to them and the bend touched about a third
    // of the density. "As if the whole chamber were under a field"
    // needs the field to reach the whole chamber.
    float bend = exp(-dot(pf, pf) / 49000000.0);
    float H = H0 * (1.0 - drawAmt * 0.35 * bend);

    // clamped so the horizon converges instead of running to infinite
    // frequency, which is where a flat deck aliases
    t = min((H - eye.y) / dy, 26000.0);
    vec2 p = eye.xz + d.xz * t;
    // STRATIFICATION. Isotropic fbm gives a field of blobs, and a bent
    // sheet of blobs reads as blobs that MOVED, not as a sheet that
    // bent - there is no line for the eye to follow. Squeezing one
    // horizontal axis elongates the features into layers, which is what
    // the word strata means and what makes the dip legible. Kept
    // parallel and never radial: features converging on the axis would
    // be a radial bloom, which is banned.
    // uStrata = 1.0 is the isotropic sky that was already approved.
    // 0.005 rad/s is about 0.29 degrees a second, near seven pixels a
    // second at this field of view - a hundred pixels over a fifteen
    // second dwell. Found by rendering, not reasoning: the decks were
    // built STATIC on the argument that camera parallax would carry the
    // motion, and at the landing dwell the camera barely travels, so
    // the whole upper frame froze. The first correction at 0.0026 was
    // still too slow to read.
    float n = skyFbm(skyDrift(p, time * 0.005) * vec2(strata, 1.0) * (0.00055 - fk * 0.00013));
    // thin and mostly clear. A low threshold fills the sky and the
    // frame stops having negative space, which is the whole composition
    float body = smoothstep(0.46, 0.70, n);
    // how much deck the ray actually crosses, which goes as 1/d.y. This
    // is the physical term and it also removes the zenith singularity:
    // straight up, every ray meets the sheet at almost the same point,
    // so without it the whole top of the sky is one arbitrary noise
    // sample that slides in value as the camera moves
    body *= clamp(0.16 / dy, 0.0, 1.0);
    dens += body * (0.52 - 0.12 * fk);
    // the fissure lights its own weather. A deck passing over the
    // monument carries that light and the rest of the sky does not,
    // which keeps the glow and its source on one axis
    lit += body * exp(-length(p) * 0.0016) * (0.9 - 0.22 * fk);
  }
  // thick air eats the horizon glow before it arrives, and gives a
  // little of it back where a deck is lit from below
  col *= 1.0 - clamp(dens, 0.0, 1.0) * 0.38;
  col += glow * clamp(lit, 0.0, 1.5) * 0.26;

  // ---- SKY PRESSURE ----
  // E0, 2026-08-22, replacing the deleted crown halo. That was a radial
  // sprite, and a disc behind a crown is a nimbus whatever its opacity:
  // it made the holiness read as applied to the object rather than
  // produced by the world. The lock story cannot afford that.
  //
  // This is its opposite by construction. There is no radius in it
  // anywhere. It is a VERTICAL term - narrow across the bearing to the
  // monument, drawn out up the sky - so it can only ever read as the
  // air standing up behind the blades, never as a body. Three guards
  // make the difference structural rather than tuned:
  //
  //   - the horizontal falloff is on azimuth alone and the vertical
  //     has no falloff at all until it thins with altitude, so no
  //     iso-line of this term is ever a circle;
  //   - it is pushed OFF the axis by 0.16 rad, so it never centres
  //     between the horns, which is the eye the halo law forbids;
  //   - its edge is broken by the same deck noise the sky already
  //     carries, so it has no clean boundary to read as an object.
  //
  // It dims as severity rises, the way the halo's opacity used to: the
  // holiness leaves as the monument strips.
  {
    float azim = atan(d.x, d.z) - 0.16;
    azim = mod(azim + 3.14159265, 6.28318531) - 3.14159265;
    float across = exp(-azim * azim * 5.2);
    float up = smoothstep(-0.06, 0.30, d.y) * (1.0 - smoothstep(0.34, 0.95, d.y));
    float ragged = 0.72 + 0.55 * skyFbm(vec2(azim * 260.0, d.y * 340.0));
    col += glow * across * up * ragged * 0.42 * (1.0 - sev * 0.55);
  }

  // ---- THE BREAK ----
  // Gate 5 of the reference picture, 2026-08-22. The picture's sky is
  // lit from one place: a torn opening in the weather above the tower,
  // and everything else - the rim on the outer edges (gate 3), the pale
  // crown, the silhouette - follows from that one source. Ours had a
  // halo sprite at the tips with no reason in the sky for it; this is
  // the reason, behind and above the crown, so the light the frame
  // already carries finally has a source.
  //
  // NOT a disc, and the guards are structural, not tuning. An eclipse
  // read needs a body with an edge: this is two very broad cosine
  // powers, its centre sits well ABOVE the tips (the sight line to it
  // from every journey camera clears the crown), and the decks occlude
  // it, so it arrives as weather torn open rather than as an object.
  // Severity takes it down by almost half: the return's sky closes.
  {
    // SUBORDINATED, sinister gate 3, 2026-08-22. As built for the
    // reference gate this had a broad pow(7) wing at full sky-blue,
    // and it read as its own celestial body - a moon behind the crown,
    // a SECOND light in a frame whose holiness depends on having one.
    // Two demotions:
    //
    // The wing collapses (pow 12 at a third of its weight), so the
    // break is a tear the crown's light escapes through, not a disc
    // with an atmosphere.
    //
    // And at rest its tint leans to the SEAM's warm white rather than
    // the sky's own blue, so the light up there is recognisably the
    // blade's, arrived in the air - the sky answering the seam, owning
    // nothing. Severity hands it back to the cold sky family as the
    // whole frame goes cold.
    vec3 toBreak = normalize(vec3(0.0, 360.0, 0.0) - eye);
    float bAlign = max(dot(d, toBreak), 0.0);
    float breakGlow = pow(bAlign, 34.0) * 0.72 + pow(bAlign, 12.0) * 0.10;
    breakGlow *= 1.0 - clamp(dens, 0.0, 1.0) * 0.55;
    vec3 bCol = mix(vec3(0.0315, 0.0300, 0.0270), glow * 1.05, sev * 0.8);
    col += bCol * breakGlow * breakAmt * (1.0 - sev * 0.45) * 2.0;
  }

  // THE LID. The faint inverted plain far above, met at the same
  // t = (H - eye.y) / d.y as any deck. Three things separate it from
  // the decks below and each one is load-bearing:
  //
  // 1. NO PATH-LENGTH TERM. The decks scale by clamp(0.16 / d.y)
  //    because a ray crosses more haze at a shallow angle. A SURFACE
  //    has no path length. Applying it would make the ceiling weakest
  //    directly overhead, which is exactly backwards.
  // 2. BROAD TONE, NOT TEXTURE. Two octaves at enormous scale and
  //    nothing finer. Detail turns a ceiling into a cloud, and a
  //    nameable repeated element is what has killed every carrier this
  //    project has built.
  // 3. IT NEVER ANNOUNCES ITSELF. It must read first as depth and only
  //    later as WRONG depth, so it is faint, it carries no edge, and
  //    the landing camera barely looks up.
  //
  // "Almost lost in haze" is free: t runs to infinity at the horizon,
  // so the aerial term buries the lid there without being asked, and
  // the tonal patches compress as they recede. That compression is the
  // whole cue that says surface rather than gradient.
  {
    float t = min((11000.0 - eye.y) / max(d.y, 0.02), 400000.0);
    vec2 q = eye.xz + d.xz * t;
    // The aerial term has to reach further down than the decks' does or
    // the lid dies above the elevations where its compression becomes
    // legible, and legible compression is the entire surface cue.
    float far = exp(-t / 42000.0);
    // Cell size is the number that decides whether this is a ceiling or
    // a wash. The landing camera sees roughly 15 to 36 degrees of sky,
    // which is t from 42500 down to 18560: about 24000 units of lid. At
    // the first attempt's 24000 unit cell that is ONE feature across the
    // whole band, so it read as brighter fog. Near 4800 puts five
    // features in it, which is enough to watch them stack and squash
    // toward the horizon, and still far too coarse to be a texture.
    // A third of the decks' rate. The difference is the point: the lid
    // and the weather beneath it separate over time, and relative
    // motion is the only kind the eye reads as depth. Everything moving
    // together is what a camera sway looks like, and it reads as still.
    vec2 qd = skyDrift(q, time * 0.0018);
    float n = skyNoise(qd * 0.00021) * 0.70 + skyNoise(qd * 0.00048) * 0.30;
    // centred and contrasty rather than a floor plus a wobble: the lid
    // must be uneven, not uniformly present
    float tone = smoothstep(0.32, 0.74, n);

    // THE SHAFT. A rectangular absence cut clean through the lid, and
    // nothing else. Cloud has no straight edges, so the cut itself is
    // the whole evidence that something engineered it - no beam, no god
    // rays, no column, and it never crosses the monument.
    //
    // Everything about its placement is a guard against the failure
    // Jacob named, that it becomes a second focal monument and reduces
    // the Spire to foreground dressing:
    //   - 24700 units out, so the light it lets past falls on a part of
    //     the plain nowhere near the Spire;
    //   - offset 22 degrees to one side, never centred, never overhead;
    //   - small, about 3 degrees, so it reads as an incision.
    //
    // The distance is also what puts it in frame at all. On a lid at
    // altitude 11000, horizontal distance IS elevation: the first
    // placement at 19000 units sat at 30 degrees, which is the landing
    // frame's top edge, so the viewport cut it in half and it read as a
    // smudge rather than a cut. 24700 units is 24 degrees - the upper
    // third, with room around it.
    //
    // Longer along the line of sight than across it, because the plane
    // is seen at a shallow angle and the radial extent foreshortens by
    // roughly sixty percent. In plan it is a slot; on screen it is near
    // square.
    //
    // The edge is hard but not aliased: its width is one pixel of the
    // lid's own coordinate, taken from the derivative, so it stays a
    // clean line at every distance instead of crawling.
    vec2 rel = abs(q - vec2(-9253.0, -22902.0)) - vec2(700.0, 900.0);
    float ew = max(fwidth(q.x), 1.0);
    float cut = (1.0 - smoothstep(-ew, ew, rel.x)) * (1.0 - smoothstep(-ew, ew, rel.y));
    tone *= 1.0 - cut * shaftAmt;

    // d.y guard, which also keeps the ground's horizon call at exactly
    // zero: it asks for a horizontal bearing and gets no lid at all
    float lid = far * smoothstep(0.0, 0.05, d.y) * tone;
    col += glow * lid * lidAmt * 0.70;

    // "faint remote illumination beneath it". Not a shaft of light: the
    // air under the opening simply carries a little more of whatever is
    // above, which is what an absence in a ceiling actually does.
    col += glow * cut * far * shaftAmt * 0.06;
  }

  // a faint drift across the azimuth, so turning the camera finds
  // variation instead of the same ramp everywhere
  float drift = sin(atan(d.z, d.x) * 2.0 + d.y * 3.0) * 0.5 + 0.5;
  return col + glow * drift * 0.08 * band;
}`;

const SKY_FRAG = /* glsl */ `
  precision highp float;
  in vec3 vDir;
  uniform float uSeverity;
  uniform float uLid;
  uniform float uDraw;
  uniform float uStrata;
  uniform float uShaft;
  uniform float uBreak;
  uniform float uTime;
  out vec4 outColor;
  ${SKY_LAW}
  void main() {
    outColor = vec4(skyAt(normalize(vDir), cameraPosition, uSeverity, uLid, uDraw, uStrata, uShaft, uBreak, uTime), 1.0);
  }
`;

/**
 * THE SHORE. The authored plain is a 1400 unit plane, so it stopped at
 * 700 units - and the choir stands from 560 out to 1560. Four of the six
 * masses had no ground under them at all and hung in open sky, which is
 * exactly what they looked like, and the plain's own far edge cut a hard
 * straight line across the frame at the same place.
 *
 * This carries the plain out into the fog. Its inner ring IS the authored
 * mesh's boundary vertices, read from the geometry rather than assumed,
 * so there is no seam to hide and no second copy of the plain's extent to
 * keep in step with monument.py.
 */
function buildShore(src: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const p = src.getAttribute('position') as THREE.BufferAttribute;
  const box = new THREE.Box3().setFromBufferAttribute(p);
  const edge = Math.min(box.max.x, box.max.z) - 0.5;
  const OUT = 3600;
  const seen = new Set<string>();
  const ring: { a: number; x: number; y: number; z: number }[] = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    if (Math.abs(x) < edge && Math.abs(z) < edge) continue;
    const key = `${Math.round(x)}:${Math.round(z)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ring.push({ a: Math.atan2(z, x), x, y: p.getY(i), z });
  }
  // the plain is convex and contains the origin, so azimuth around the
  // centre IS boundary order and no edge walk is needed
  ring.sort((u, v) => u.a - v.a);

  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  for (const v of ring) {
    const r = Math.hypot(v.x, v.z) || 1;
    // inner vertex is the plain's own; outer runs level, so the dunes
    // ease off over three thousand units instead of ending
    pos.push(v.x, v.y, v.z, (v.x / r) * OUT, 0, (v.z / r) * OUT);
    nrm.push(0, 1, 0, 0, 1, 0);
  }
  for (let i = 0; i < ring.length; i++) {
    const a = i * 2;
    const b = ((i + 1) % ring.length) * 2;
    idx.push(a, a + 1, b + 1, a, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  const shore = new THREE.Mesh(g, mat);
  shore.frustumCulled = false;
  return shore;
}

/**
 * The crest's skin. The asset ships as bare positions - no material,
 * no texture, no UV - so the surface is authored here, in world
 * space, in the monument's own graphite language: near-black mineral
 * base, pale etched veins that only surface where light rakes, detail
 * carried in roughness, a machined edge catch, and a cold sky rim so
 * the silhouette survives against a dark sky. No emissive glow.
 */
const CREST_COMMON = `#include <common>
${PALETTE_GLSL}
varying vec3 vCrestW;
varying vec3 vCrestL;
varying vec3 vCrestN;
float vCrestRough = 0.5;
// surface height, in the crest's own units: veins stand proud, cuts go
// in. Read back by the normal injection so the skin has real relief -
// the NORMAL DETAIL panel of the identity board - rather than lines
// painted flat on the faces.
float vCrestH = 0.0;
// ONE MARK OF THE LANGUAGE. Not an alphabet lookup: a stem with
// crossbars, an optional ring or diamond node, and an optional
// opening head, which is what every glyph on the board's rune sheet
// is built from. The hash decides which features this mark carries,
// so the marks vary the way a real script does without any of them
// being drawn twice.
// Strokes are cut WIDE on purpose. A rune cell lands about ten pixels
// across at the landing framing, so a hairline stroke is one pixel and
// the whole record disappears - which is what the first pass did.
float crestGlyph(vec2 uv, float h) {
  float m = 0.0;
  // the stem
  m = max(m, smoothstep(0.095, 0.048, abs(uv.x - 0.5))
           * smoothstep(0.09, 0.14, uv.y) * smoothstep(0.91, 0.86, uv.y));
  // one to three crossbars
  for (int b = 0; b < 3; b++) {
    float bh = fract(h * (7.3 + float(b) * 11.7));
    if (bh < 0.38) continue;
    float by = 0.22 + 0.56 * fract(bh * 3.7);
    float hw = 0.15 + 0.20 * fract(bh * 13.0);
    m = max(m, smoothstep(0.082, 0.038, abs(uv.y - by))
             * smoothstep(hw, hw - 0.05, abs(uv.x - 0.5)));
  }
  // a node: ring or open diamond, on the stem
  float nh = fract(h * 29.1);
  if (nh > 0.50) {
    float ny = 0.28 + 0.44 * fract(nh * 5.3);
    vec2 d = vec2((uv.x - 0.5) * 1.5, uv.y - ny);
    if (nh > 0.75) {
      m = max(m, smoothstep(0.042, 0.018, abs(length(d) - 0.085)));
    } else {
      m = max(m, smoothstep(0.038, 0.015, abs(abs(d.x) + abs(d.y) - 0.090)));
    }
  }
  // a fork, opening up or down off the stem
  float ch = fract(h * 17.7);
  if (ch > 0.55) {
    float cy = ch > 0.78 ? 0.80 : 0.20;
    float dir = ch > 0.78 ? -1.0 : 1.0;
    float dy = (uv.y - cy) * dir;
    m = max(m, smoothstep(0.070, 0.030, abs(abs(uv.x - 0.5) - dy * 0.9))
             * smoothstep(-0.01, 0.02, dy) * smoothstep(0.19, 0.15, dy));
  }
  // a hook or crescent: an arc opening to one side of the stem
  float kh = fract(h * 41.3);
  if (kh > 0.58) {
    float ky = 0.30 + 0.36 * fract(kh * 9.1);
    float side = kh > 0.79 ? 1.0 : -1.0;
    vec2 d = vec2((uv.x - 0.5) * 1.35 * side, uv.y - ky);
    float a = atan(d.y, d.x);
    m = max(m, smoothstep(0.040, 0.016, abs(length(d) - 0.10))
             * smoothstep(-0.5, 0.0, a) * smoothstep(2.4, 1.9, a));
  }
  return m;
}
float crestHash(vec3 c) { return fract(sin(dot(c, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float crestNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(crestHash(vec3(i, 0.0)), crestHash(vec3(i + vec2(1.0,0.0), 0.0)), f.x),
             mix(crestHash(vec3(i + vec2(0.0,1.0), 0.0)), crestHash(vec3(i + vec2(1.0,1.0), 0.0)), f.x), f.y);
}
float crestFbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * crestNoise(p); p *= 2.03; a *= 0.5; }
  return s / 0.9375;
}
// the body's wave field, same construction: one long smooth warp and
// nothing sharper - the meander is the look
float crestCrack(vec2 q) {
  vec2 w = q + (vec2(crestFbm(q * 0.42), crestFbm(q * 0.42 + 19.7)) - 0.5) * 3.0;
  return crestFbm(w) - 0.5;
}`;

const CREST_FRAG = `#include <map_fragment>
{
  vec3 cN = normalize(vNormal);
  vec3 cV = normalize(vViewPosition);
  float cGraze = smoothstep(0.25, 0.95, 1.0 - abs(dot(cN, cV)));

  // world-space coordinate, sheared by depth so the flanks vary too
  vec2 cP = vCrestW.xy + vec2(vCrestW.z * 0.8, vCrestW.z * 0.5);

  // broad variation, smooth: never hash-of-floor, which stamps square
  // tiles across the faces. This is the sheet's "raised planes and
  // mid-tone variation" - Graphite lifting toward Blackened Iron.
  float cTone01 = clamp(crestFbm(cP * 0.03) * 1.4 - 0.2, 0.0, 1.0);

  // ---- THE MONUMENT'S OWN LACE, AT LOWER DENSITY ----
  // Identical recipe to the body's vesicular field, term for term: the
  // field is warped BEFORE the level set is taken, then divided by its
  // own gradient so every vein holds one width however steep the field
  // is - a plain threshold admits half the volume and reads as smoke,
  // and Voronoi always resolves into a repeating unit. Pits open where
  // the field runs deep; the bright residue is what stands between
  // them, and the residue is what reads, never the holes.
  //
  // Only two things differ from the body: the cells are twice the size
  // and the residue is dimmer. That is what "identical shader, lower
  // contrast" means on the identity board - the same surface turned
  // down, not a second surface invented. An earlier pass wrote the
  // crest its own vein logic and the two stopped reading as one
  // material, 2026-08-26.
  // THE ROUGHNESS IDENTITY MAP, per the spec sheet's section 4: broad
  // 5 to 15 percent modulation plus directional micro-scratches. NOT
  // hammered dimpling - that pass read as speckle and the spec bans
  // it outright twice, as "noisy high-frequency grain" and as "noisy
  // procedural micro-detail that destroys the hard-surface read".
  float cBroad = (crestFbm(cP * 0.02) - 0.5) * 0.24;
  // honed basalt: no scratches, no linework - nothing drawn
  float cScr = 0.0;

  // THE ETCHED LINEWORK. Same level-set-over-gradient machinery as
  // before, retuned to the reference: the lines there are THIN,
  // single-weight and sparse, meandering across the faces like a
  // contour, not the dense vesicular lace the body wears. Narrowing
  // the width band does the first half and raising the territory gate
  // does the second. The pits are gone entirely - the reference has
  // no vesicular rot in it, the metal is intact.
  float cLine = 0.0;

  // WORN BEVEL, as a curvature response and not an outline. The spec
  // is explicit: thin, discontinuous, "never outline every edge
  // uniformly", and carried by exposure and roughness rather than
  // bright albedo. The previous pass painted every chamfer silver,
  // which is the banned read.
  float cEdge = smoothstep(0.30, 1.5, length(fwidth(cN)) * 22.0)
              * smoothstep(0.34, 0.72, crestFbm(cP * 0.16 + 53.0));

  // ---- RESOLVE ONTO THE PALETTE ----
  // Graphite base, lifting to Blackened Iron on the raised planes,
  // and exposing toward Worn Edge exactly where the sheet says that
  // colour belongs: curvature wear, scratch lips and seam edges.
  // Weighted by graze, because it is exposure, not paint.
  // COHERENCE LOCK: the crest follows the hero's palette one step
  // brighter - Worn Steel base, because it is a frontal relief lit by
  // ambient while the body takes the key. This overwrite is also why
  // the material's color property never reaches the faces: the base
  // must be set HERE, a fact an earlier "lift" missed.
  // MATCHED BY MEASUREMENT, 2026-08-27: the crest uses the body's own
  // albedo band times one lift factor, and the factor is set by
  // measuring both on the live canvas until their on-screen means
  // agree - not by picking a swatch that "should" match. The lift
  // exists because this is a frontal relief under ambient while the
  // body takes the raking key.
  vec3 skin = mix(P_GRAPHITE, P_IRON, cTone01) * 0.9;
  // the Edge Silver exposure is gone - "the white shit on the crest",
  // Jacob 2026-08-27. Edges keep only a small roughness change below;
  // nothing pale is painted onto the wings.
  diffuseColor.rgb = skin;

  // RUNES REMOVED, Jacob 2026-08-27: "remove the runes". The engraved
  // record is off the crest entirely - honed basalt carries nothing.
  float cRune = 0.0;

  // A CUT CATCHES, it does not darken. On stone this dark, removing
  // a fifth of almost nothing is invisible - the same fault the body
  // found with its pits. What reads is the machined lip of the
  // groove, so the mark is carried by an absolute catch plus a
  // grazing lift, and the darkening is only a hint of depth behind it.
  // Silver Inlay, the palette's own #C5C5C8: the rune IS a strip of
  // exposed metal, so the colour is mixed to, not added on. No
  // emissive in the dormant and ceremonial states.
  // raking-light inscription: mostly relief and roughness, only a
  // hint of exposed metal in the albedo
  diffuseColor.rgb = mix(diffuseColor.rgb, P_SILVER, cRune * 0.3);

  // Base graphite steel: the spec's 0.42, modulated broadly, with the
  // scratches and the worn bevel polishing it and the rune grooves
  // dulling it. Roughness is the primary identity map here.
  vCrestRough = clamp(0.78 + cBroad + cRune * 0.1 - cEdge * 0.12, 0.55, 0.95);

  // relief: machined seams, sparse scratches and shallow engraving -
  // the spec's normal map, and nothing finer than that
  vCrestH = cLine * 0.28 + cScr * 0.16 - cRune * 1.0;
}`;

/**
 * The crest behind the upper half of the Split Spire. The geometry is
 * Jacob's own authored asset - public/models/crest.glb, 2026-08-26,
 * made from his approved crest renders. Its baked normal map is kept
 * (the engraved runes live there); its grey Meshy base materials are
 * replaced by the hero-family skin above, per the identity board.
 * Every procedural geometry rebuild that preceded the asset is gone:
 * do not re-derive the crest from images. Only mount maths and the
 * skin live here.
 */
function buildHeroCrest(): THREE.Group {
  const tuning = HERO_CREST_TUNING;
  const heroHeight = TOWER_TOP;
  const group = new THREE.Group();
  group.name = 'heroCrest';
  group.position.set(tuning.offsetX, -50, tuning.rearOffset);
  // UNIFORM scale only. The width knob multiplied into x for the old
  // procedural crest; on Jacob's authored asset it stretched the fan
  // 23% wide, shallowing every blade angle - the "it feels tilted /
  // off" report of 2026-08-26. The asset's own proportions rule.
  group.scale.set(tuning.scale, tuning.scale, tuning.scale);

  new GLTFLoader().load(
    '/models/crest.glb',
    (gltf) => {
      const model = gltf.scene;
      // THE SPLIT AND THE SPREAD, Jacob 2026-08-26. The wings first
      // shift outward so their big inner blades clear the spire's
      // body, then each wing leans toward the centre, rotated about
      // its own middle - the ring tops close over the apex while the
      // blades spread wider at the bottom, the way open wings do. The
      // wings are disjoint at the centre so per-side is exact, and the
      // rotation is applied to normals and tangents as well as
      // positions so the lighting follows the lean.
      const crestSkin = (): THREE.MeshStandardMaterial => {
        // Base sits above the monument's 0x090b0f: the body earns its
        // near-black from a raking key across 3D flanks, while this is
        // a frontal relief the key barely reaches, so it is carried by
        // ambient and environment. Matching the body's NUMBER here
        // renders black; matching its READ is the point.
        // BASE GRAPHITE STEEL, from the crest spec sheet's section 3.
        // The values are the spec's own, with one translation: the
        // spec's envMapIntensity of 0.65 assumes a unit environment,
        // and this scene multiplies every material by
        // scene.environmentIntensity = 0.36, so 1.8 here delivers the
        // 0.65 the spec intends. Setting 0.65 raw would land at 0.23
        // and the metal would go dark again.
        //
        // The previous pass used #8F959D, which is the palette's WORN
        // EDGE - the colour reserved for curvature wear - as the body
        // colour, and bought brightness with a 5x environment instead.
        // Graphite reflecting properly is the spec's way round.
        // Honed basalt, frontal-relief law applied: the crest is lit
        // by ambient and environment rather than the raking key, so
        // its base sits toward the palette's Cold Steel role while the
        // body holds Graphite - matching the READ, not the number.
        // env halved-plus, 2026-08-27: measurement showed the crest's
        // environment response and rim alone outshone the body's whole
        // read, so no albedo could ever match them - the "crest and
        // hero dont match" complaint lived HERE, not in the colour.
        const material = new THREE.MeshStandardMaterial({
          color: 0x585a5f,
          roughness: 0.85,
          metalness: 0.0,
          envMapIntensity: 0.7,
          side: THREE.DoubleSide
        });
        material.onBeforeCompile = (sh) => {
          sh.vertexShader = sh.vertexShader
            .replace(
              '#include <common>',
              '#include <common>\nvarying vec3 vCrestW;\nvarying vec3 vCrestL;\nvarying vec3 vCrestN;'
            )
            .replace(
              '#include <begin_vertex>',
              `#include <begin_vertex>
vCrestW = (modelMatrix * vec4(position, 1.0)).xyz;
vCrestL = position;
vCrestN = normal;`
            );
          sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', CREST_COMMON)
            .replace('#include <map_fragment>', CREST_FRAG)
            .replace(
              '#include <roughnessmap_fragment>',
              '#include <roughnessmap_fragment>\nroughnessFactor = vCrestRough;'
            )
            .replace(
              '#include <normal_fragment_maps>',
              // NORMAL DETAIL, the identity board's third panel. The
              // vein residue, the pits and the cut marks perturb the
              // shading normal, so they are relief the light has to
              // cross rather than lines painted on a flat face. Height
              // comes from vCrestH, set while the skin was computed;
              // the gradient is taken in screen space against the
              // surface derivatives, which is three.js's own arbitrary
              // bump construction and needs no tangents - this asset
              // has none.
              `#include <normal_fragment_maps>
{
  vec3 cSurf = -vViewPosition;
  vec3 cSx = dFdx(cSurf);
  vec3 cSy = dFdy(cSurf);
  vec3 cR1 = cross(cSy, normal);
  vec3 cR2 = cross(normal, cSx);
  float cDet = dot(cSx, cR1);
  if (abs(cDet) > 1e-8) {
    vec2 cDH = vec2(dFdx(vCrestH), dFdy(vCrestH)) * 0.10;
    vec3 cGradH = sign(cDet) * (cDH.x * cR1 + cDH.y * cR2);
    normal = normalize(abs(cDet) * normal - cGradH);
  }
}`
            )
            .replace(
              '#include <emissivemap_fragment>',
              // the body's own cold sky rim, at reduced strength: what
              // keeps a dark mass legible against a dark sky. The
              // max() guard is load-bearing - pow() of a negative is
              // NaN, and one NaN pixel through bloom blacks the frame.
              `#include <emissivemap_fragment>
{
  vec3 cRimN = normalize(vNormal);
  float cRimG = pow(max(1.0 - abs(dot(cRimN, normalize(vViewPosition))), 0.0), 5.0);
  float cRimUp = 0.35 + 0.65 * clamp(cRimN.y * 0.5 + 0.5, 0.0, 1.0);
  totalEmissiveRadiance += P_RIM * cRimG * cRimUp * 0.3;
}`
            );
        };
        return material;
      };
      const tiltL = THREE.MathUtils.degToRad(tuning.wingTiltL);
      const tiltR = THREE.MathUtils.degToRad(tuning.wingTiltR);
      const cosL = Math.cos(tiltL);
      const sinL = Math.sin(tiltL);
      const cosR = Math.cos(tiltR);
      const sinR = Math.sin(tiltR);
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const geometry = child.geometry as THREE.BufferGeometry;
          const position = geometry.getAttribute('position');
          const normal = geometry.getAttribute('normal');
          const tangent = geometry.getAttribute('tangent');
          for (let i = 0; i < position.count; i++) {
            const s = Math.sign(position.getX(i)) || 1;
            const cosT = s < 0 ? cosL : cosR;
            const sinT = s < 0 ? sinL : sinR;
            const split = s < 0 ? tuning.wingSplitL : tuning.wingSplitR;
            // centre of this wing's x-span after its split: the asset
            // wing runs 0.045 to 0.95 in x
            const wingCentreX = 0.4975 + split;
            const dx = position.getX(i) + s * split - s * wingCentreX;
            const dy = position.getY(i);
            position.setX(i, s * wingCentreX + dx * cosT - dy * s * sinT);
            position.setY(i, dx * s * sinT + dy * cosT + (s < 0 ? tuning.wingLiftL : tuning.wingLiftR));
            if (normal) {
              const nx = normal.getX(i);
              const ny = normal.getY(i);
              normal.setX(i, nx * cosT - ny * s * sinT);
              normal.setY(i, nx * s * sinT + ny * cosT);
            }
            if (tangent) {
              const tx = tangent.getX(i);
              const ty = tangent.getY(i);
              tangent.setX(i, tx * cosT - ty * s * sinT);
              tangent.setY(i, tx * s * sinT + ty * cosT);
            }
          }
          position.needsUpdate = true;
          if (normal) normal.needsUpdate = true;
          if (tangent) tangent.needsUpdate = true;
          geometry.computeBoundingBox();
          geometry.computeBoundingSphere();

          // THE ASSET CARRIES NO NORMALS. Read from the GLB's own JSON
          // chunk, 2026-08-26: no materials, no textures, no UVs, and
          // POSITION as the only vertex attribute. A surface with no
          // normals cannot be lit at all, and that - not albedo, not
          // the key's angle, not colour space - is the real cause of
          // every black and flat-grey crest in this session. Computed
          // AFTER the split and tilt move the vertices, or they would
          // describe the untransformed asset.
          geometry.computeVertexNormals();
          // No UVs either, so the skin has to be world-space
          // procedural rather than mapped.
          const previous = child.material;
          child.material = crestSkin();
          for (const old of Array.isArray(previous) ? previous : [previous]) old.dispose();
        }
      });
      // normalise the asset - centred, sized against the hero - so the
      // tuning knobs keep meaning what they always meant here
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());
      const s = (heroHeight * 0.52) / Math.max(size.y, 1e-6);
      model.scale.setScalar(s);
      model.position.copy(centre).multiplyScalar(-s);
      model.position.y += heroHeight * 0.75;
      model.rotation.x = THREE.MathUtils.degToRad(tuning.pitch);
      group.add(model);

      // Jacob's isolated left-parenthesis component closes the two
      // upper semicircular pockets beside the Spire. It is loaded once
      // and mirrored for the right side, so both inserts remain the
      // same authored object rather than two independently invented
      // fills. It inherits the final crest's normalization, pitch and
      // graphite skin; the hero, seam and original crest are untouched.
      new GLTFLoader().load(
        '/models/crest-pocket-insert.glb',
        (pocketGltf) => {
          const left = pocketGltf.scene;
          left.name = 'heroCrestPocketLeft';
          const pocketMaterial = crestSkin();
          left.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              const geometry = child.geometry as THREE.BufferGeometry;
              geometry.computeVertexNormals();
              geometry.computeBoundingBox();
              geometry.computeBoundingSphere();
              const previous = child.material;
              child.material = pocketMaterial;
              for (const old of Array.isArray(previous) ? previous : [previous]) old.dispose();
            }
          });
          left.scale.setScalar(tuning.pocketScale);
          left.position.set(tuning.pocketOffsetXL, tuning.pocketLiftL, tuning.pocketDepth);
          left.rotation.z = -tiltL + THREE.MathUtils.degToRad(tuning.pocketTurnL);

          const right = left.clone(true);
          right.name = 'heroCrestPocketRight';
          right.position.x = tuning.pocketOffsetXR;
          right.position.y = tuning.pocketLiftR;
          right.rotation.z = tiltR + THREE.MathUtils.degToRad(tuning.pocketTurnR);
          right.scale.x *= -1;

          model.add(left, right);
        },
        undefined,
        (err) => console.error('hero crest pocket insert failed to load', err)
      );
    },
    undefined,
    (err) => console.error('hero crest asset failed to load', err)
  );

  return group;
}

export class HeroRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly path = new CameraPath();
  private readonly delta: DeltaAct;
  /** the visitor's one input, held like the seed. Set by main.ts. */
  detent: Detent = 0;
  private readonly hardware: { group: THREE.Group; mats: THREE.MeshStandardMaterial[] };
  private stress!: { group: THREE.Group; skin: THREE.ShaderMaterial; mesh: THREE.Mesh };
  private readonly coreParts: {
    holder: THREE.Group | null;
    column: THREE.ShaderMaterial | null;
    columnMesh: THREE.Mesh | null;
    pool: THREE.MeshBasicMaterial | null;
  } = { holder: null, column: null, columnMesh: null, pool: null };
  private fisPlane: THREE.Mesh | null = null;
  private coreVoid: THREE.Mesh | null = null;
  private openBraceAmt = 0;

  private readonly scene = new THREE.Scene();
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly grade: ShaderPass;
  /** ?flat=1: bloom held at zero so the static frame is audited bare */
  flatAudit = false;
  private readonly cladMat: THREE.ShaderMaterial;
  private readonly markMat: THREE.ShaderMaterial;
  private readonly skyMat: THREE.ShaderMaterial;
  /** review pin for the lid; null means the severity ramp owns it */
  private lidOverride: number | null = null;
  private landingFog = LANDING_FOG;
  private readonly strikeAttr: THREE.InstancedBufferAttribute;
  private readonly markGeom: THREE.BufferGeometry;
  private readonly markPos = new Float32Array(12 * 3);
  private readonly markBorn = new Float32Array(12);
  private readonly scree: THREE.InstancedMesh;
  private readonly screeTotal: number;
  private readonly annos: Array<{
    el: HTMLElement | null;
    point: THREE.Vector3;
    from: number;
    to: number;
  }> = (() => {
    const tipA = prongCentre(TIP_T[0] - 0.01, 0);
    const law = surfacePoint(100 / TOWER_TOP, 0, 0.5);
    return [
      {
        el: document.getElementById('anno-crown'),
        point: new THREE.Vector3(tipA.x, tipA.y + 2, tipA.z),
        from: 0.05,
        to: 0.4
      },
      {
        el: document.getElementById('anno-cleft'),
        point: new THREE.Vector3(0, 40, 16),
        from: 0.3,
        to: 0.44
      },
      {
        el: document.getElementById('anno-law'),
        point: new THREE.Vector3(law.x * 1.05, law.y, law.z * 1.05),
        from: 0.36,
        to: 0.5
      }
    ];
  })();
  private keyLight!: THREE.DirectionalLight;
  private fillLight!: THREE.DirectionalLight;
  private ambient!: THREE.AmbientLight;
  private readonly groundU: Record<string, THREE.IUniform> = {
    uGSeverity: { value: 0 },
    // the ground runs SKY_LAW too, so it needs the twilight lift or the
    // horizon splits: a lit sky meeting an unlit plain draws exactly the
    // hard line buildShore exists to prevent
    uGlow: { value: 1 },
    uGDecay: { value: 0 },
    // the ground samples the sky at the horizon, so it needs the same
    // clock or the join would drift apart from what it is joining
    uGTime: { value: 0 },
    // how far the plain has failed at the foot. Built too weak and
    // swept, then taken UP on Jacob's call - 1.0 was the dial's ceiling
    // so "a little more" had to come from the coefficients above, not
    // from here.
    uGBite: { value: 1.0 },
    // THE GROUND HAZE. See the note in the ground fragment.
    uGHaze: { value: GROUND_HAZE }
  };
  private fissureMat!: THREE.ShaderMaterial;
  private hazeMat!: THREE.ShaderMaterial;
  private fieldMat!: THREE.ShaderMaterial;
  private mistMat!: THREE.ShaderMaterial;
  private strataMat!: THREE.ShaderMaterial;
  private readonly choir: ChoirGroup;
  private moteMat!: THREE.ShaderMaterial;
  private monoMat!: THREE.MeshStandardMaterial;
  private stoneU!: Record<string, THREE.IUniform>;
  /** resolves once the authored monument is standing */
  readonly ready: Promise<void>;
  private readonly maxDpr: number;
  private time = 0;

  private readonly towerBox = new THREE.Box3(
    new THREE.Vector3(-HALF - 5.5, 0, -HALF - 5.5),
    new THREE.Vector3(HALF + 5.5, TOWER_TOP, HALF + 5.5)
  );
  private readonly raycaster = new THREE.Raycaster();
  private readonly hoverPoint = new THREE.Vector3(0, -999, 0);
  private pointerNdc: { x: number; y: number } | null = null;
  private hoverAmt = 0;
  /** seconds since attention left the mass; 99 until it ever has */
  private wakeT = 99;
  /** the height along the seam it left from, 0 foot to 1 crown */
  private wakeY = 0.5;
  private parX = 0;
  /** the watcher's smoothed aim, and how present it is */
  private watchX = 0;
  private watchY = 0;
  private watchAmt = 0;
  /** false until the first pointer ever enters: the idle-attention gate */
  private everPointed = false;
  private watchDrift = 0;
  /** seconds with no pointer and no scroll: the road into THE STILLNESS */
  private idleT = 0;
  /** 0 alive, 1 embalmed - gate 6's overrule, eased both ways */
  private stillAmt = 0;
  /** gate I1: the threshold freeze, driven by nearness to the mouth */
  private braceAmt = 0;
  /** review pin for the brace: -1 is live, 0 and 1 hold it open */
  private stillPin = -1;
  /** the clock the autonomous motions run on; it stops when the world does */
  private ambientT = 0;
  private parY = 0;
  /** the signal the skin carries: driven by the law, not by a clock */
  private signal = 0;
  private lastStrikeTick = 0;

  constructor(canvas: HTMLCanvasElement, private readonly world: LatticeWorld, maxDpr: number) {
    this.maxDpr = maxDpr;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setClearColor(0x0b111c, 1);
    this.scene.fog = new THREE.FogExp2(0x0c0906, 0.0022);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 4200);

    const rt = new THREE.WebGLRenderTarget(2, 2, {
      samples: 4,
      type: THREE.HalfFloatType
    });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // THRESHOLD 0.78, NOT 1.0. At 1.0 the seam's surge was either over the
    // line - a hard halo, which Jacob read as an object being carried
    // along the crack - or under it and completely invisible, with no
    // useful range between. Every attempt at "dim but still there" landed
    // in that gap. Dropping the line gives the front somewhere to fade
    // THROUGH, so its glow shrinks as it travels instead of holding.
    //
    // 0.78 is chosen against the resting frame, not for the surge: the
    // blade at rest is 0.68 at its brightest and the tone-mapped stone
    // sits well under that, so nothing that is lit now starts glowing.
    // Verified by diffing the resting frame across the change - the only
    // thing that moved was the seam during a wave.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.34, 0.5, 0.78);
    this.composer.addPass(this.bloom);

    // ---- THE GRADE ----
    // Gate 7 of the reference picture, 2026-08-22, and deliberately the
    // smallest gate: most of the picture's grade fell out of gates 1 and
    // 5 (the value flip and the break). What remained is a floor and a
    // curve. The black point clips the last of the atmospheric haze off
    // the deep sky, and a gentle pivot contrast in linear space snaps
    // the stone's mids apart before ACES rolls the shoulder. It runs
    // BEFORE tone mapping so it grades light, not pixels, and it stays
    // in the flat audit: a curve is part of the static frame, bloom is
    // not.
    this.grade = new ShaderPass(
      new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: null },
          // 0.0035 / 1.07 crushed the break to a tight halo and put the
          // frame back under the 25 percent floor - the sky and the break
          // live exactly in the lows a black point eats. Halved and
          // gentled: the depth stays, the opening survives.
          // TWILIGHT, 2026-08-23: the black point is ZERO now. It existed
          // to clip the last of the haze off a night sky, and in a held
          // blue hour there is nothing to clip - crushing the lows is
          // exactly how twilight collapses back into night.
          uLift: { value: 0.0 },
          uContrast: { value: 1.05 }
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform sampler2D tDiffuse;
          uniform float uLift;
          uniform float uContrast;
          varying vec2 vUv;
          void main() {
            vec3 c = texture2D(tDiffuse, vUv).rgb;
            c = max(c - uLift, 0.0);
            // pivot at mid-grey in linear, so shadows crush and
            // highlights open without the frame changing exposure
            c = pow(c / 0.18, vec3(uContrast)) * 0.18;

            gl_FragColor = vec4(c, 1.0);
          }`
      })
    );
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    // --- sky ---
    this.skyMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      // uLid is driven from severity in update(); 0.3 is the landing
      // value, which is what the first frame shows before the ramp has
      // anything to add.
      //
      // uDraw and uStrata are LOCKED to the cell Jacob chose out of the
      // 2x2 in captures/draw/matrix: "d-layered-bend is right, lock
      // it". They stay uniforms so the pair can be pinned for review,
      // not because either is still open.
      uniforms: {
        uSeverity: { value: 0 },
        uGlow: { value: 1 },
        uLid: { value: 0.3 },
        uDraw: { value: 0.6 },
        uStrata: { value: 0.35 },
        uShaft: { value: 0.5 },
        // gate 5: the torn opening above the crown. Review pin.
        uBreak: { value: 1.0 },
        uTime: { value: 0 }
      },
      side: THREE.BackSide,
      depthWrite: false
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 24, 16), this.skyMat);
    sky.frustumCulled = false;
    this.scene.add(sky);

    // The sea is gone. It was a 2400 unit transparent plane at y=0 from
    // the drowned-monument direction, lying flat across the shore and
    // hazing everything the floor was supposed to show.

    // --- the cladding: the flesh of light ---
    const box = new THREE.BoxGeometry(CELL * 0.98, CELL * 0.98, CELL * 0.98);
    const cladGeom = new THREE.InstancedBufferGeometry();
    cladGeom.index = box.index;
    cladGeom.attributes.position = box.attributes.position!;
    cladGeom.attributes.normal = box.attributes.normal!;
    cladGeom.attributes.uv = box.attributes.uv!;
    cladGeom.instanceCount = world.nodeCount;
    cladGeom.setAttribute('aOffset', new THREE.InstancedBufferAttribute(world.positions, 3));
    cladGeom.setAttribute('aSeed', new THREE.InstancedBufferAttribute(world.nodeSeeds, 1));
    cladGeom.setAttribute('aThresh', new THREE.InstancedBufferAttribute(world.thresholds, 1));
    this.strikeAttr = new THREE.InstancedBufferAttribute(world.strikeTimes, 1);
    cladGeom.setAttribute('aStrike', this.strikeAttr);

    this.cladMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: CLAD_VERT,
      fragmentShader: CLAD_FRAG,
      uniforms: {
        uDecay: { value: 0 },
        uTime: { value: 0 },
        uSeverity: { value: 0 },
        uCalm: { value: 0 },
        uCalmV: { value: 0 },
        uHover: { value: new THREE.Vector3(0, -999, 0) },
        uHoverAmt: { value: 0 },
        uInner: { value: new THREE.Vector3(0, -999, 0) },
        uInnerAmt: { value: 0 },
        uFogColor: { value: new THREE.Color('#07080a') },
        uFogDensity: { value: 0.0035 }
      }
    });
    const clad = new THREE.Mesh(cladGeom, this.cladMat);
    clad.frustumCulled = false;
    this.scene.add(clad);

    // THE DROWNED REFLECTION IS REMOVED, 2026-08-19. Both copies of it:
    // the cells here and the stone body below.
    //
    // It reflected the monument in water that no longer exists - the sea
    // was taken out, and this was left behind. What it did instead was
    // put a plinth under the hero. MONO_VERT mirrors with
    // wp.y = -wp.y - 0.12, and the monument's foot is deliberately
    // BURIED: monument.py lofts from t = -0.055, about 10.7 units below
    // the plain, so each foot enters the terrain as straight stone.
    // Mirrored, that buried stub lands at +10.6 ABOVE the plain at full
    // untapered section, BASE_W wide, with a flat top. Two of them, one
    // per half, flanking the fissure. Jacob: "it just looks its been
    // placed on ground with support pillars ... a prop rather than
    // holy". They were the support pillars, exactly.
    //
    // It should have gone with the drowned inverted monument, which he
    // killed on the 19th. Removing it finishes that.


    // --- the scree of the struck ---
    this.screeTotal = 1500;
    const screeMat = new THREE.MeshStandardMaterial({
      color: 0x1a1f26,
      roughness: 0.9,
      metalness: 0.05
    });
    this.scree = new THREE.InstancedMesh(
      new THREE.BoxGeometry(CELL * 0.9, CELL * 0.55, CELL * 0.9),
      screeMat,
      this.screeTotal
    );
    const dummy = new THREE.Object3D();
    const rng = mulberry32ish(world.seed ^ 0x77aa11);
    for (let i = 0; i < this.screeTotal; i++) {
      const ang = rng() * Math.PI * 2;
      const rad = HALF + 1.5 + Math.sqrt(rng()) * 15;
      dummy.position.set(
        Math.cos(ang) * rad,
        SEA_Y + 0.2 + rng() * 1.6 * Math.exp(-(rad - HALF) * 0.08),
        Math.sin(ang) * rad
      );
      dummy.rotation.set(rng() * 0.6, rng() * Math.PI, rng() * 0.6);
      dummy.updateMatrix();
      this.scree.setMatrixAt(i, dummy.matrix);
    }
    this.scree.count = 0;
    this.scene.add(this.scree);

    // --- light for the standard materials: driven per beat by the
    // light score in update(), never one static rig ---
    this.keyLight = new THREE.DirectionalLight(0xe8eef5, 1.0);
    this.keyLight.position.set(0.35, 0.8, 0.55);
    this.scene.add(this.keyLight);
    // THE DELTA ACT replaces the ember fall (THE_DELTA section 10:
    // the fall is CUT, the memory is absorbed into Z). Same seed as
    // everything else; it renders (scroll, detent) and owns nothing.
    this.delta = new DeltaAct(world.seed);
    this.scene.add(this.delta.group);
    this.ambient = new THREE.AmbientLight(0x1a2129, 1.1);
    this.scene.add(this.ambient);

    // the fill: a cool, weak light opposite the key. Without it the
    // horn on the key's far side is a black cutout with no material
    // in it at all, which is not restraint, it is absence
    this.fillLight = new THREE.DirectionalLight(0x9db3c8, 0.35);
    this.fillLight.position.set(-0.7, 0.35, -0.35);
    this.scene.add(this.fillLight);

    // --- THE FISSURE ---
    // The reference's defining feature: not a glow around the spire
    // but a blade of light standing inside the slit, seen through the
    // gap between the halves. It is the doorway, and it is the only
    // bright thing in the opening frame.
    this.fissureMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: `
        out vec2 vUvF;
        void main() {
          vUvF = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        precision highp float;
        in vec2 vUvF;
        uniform float uSeverity;
        uniform float uDecay;
        uniform float uNear;
        uniform vec2 uWatch;
        uniform float uWatchAmt;
        // THE SURGE. Seconds since the visitor's attention left the mass,
        // the height along the seam it left from, and how hard the seam
        // answers. See the note beside the term.
        uniform float uWakeT;
        uniform float uWakeY;
        uniform float uSurge;
        uniform float uHand;
        uniform float uSurgeTime;
        uniform float uSurgeTail;
        out vec4 outColor;
        void main() {
          // THE LIGHT FILLS THE SLOT; THE STONE GIVES IT ITS SHAPE.
          //
          // Not the halfway bug - that was depthWrite, see the material.
          // This is the separate fault the diagnosis turned up. The
          // plane was a fixed 4.6 across with a 2.8-unit core, while
          // monument.py cuts the slit at 5.0 - 3.9t half-width: 2.2
          // across at the crown, 10 across at the foot. So the light
          // overflowed the gap high up and the prongs cropped it into a
          // solid bar, and at the foot it covered barely a quarter of a
          // ten-unit slot with the rest left black. One light, two
          // different reads, and neither of them decided by the stone.
          //
          // So the plane is WIDER than the slit at every height and its
          // lit width tracks the cut, overspilling by a quarter into
          // stone that hides it. The prongs become the only thing that
          // decides the seam's width, at every height and every angle.
          //
          // Filling the slit EXACTLY, though, turns the foot into a
          // floodlight: the slot is ten across down there, and ten units
          // of white at this intensity blows out the whole base and puts
          // the frame back to one blinding wedge. So the blade keeps a
          // hairline width of its own - 4.4 across at the foot, 2.0 at
          // the crown - which is under the slit low down, where the
          // extra slot depth stays honestly dark, and OVER it high up,
          // where the prongs close to 2.2 and crop it.
          //
          //   world half-width 2.2 at the foot to 1.0 at the crown,
          //   over a 14-unit plane
          float wob = 0.008 * sin(vUvF.y * 21.0) + 0.004 * sin(vUvF.y * 53.0 + 1.7);
          float halfW = 0.157 - 0.086 * vUvF.y + wob;
          float d = abs(vUvF.x - 0.5);
          // softness scales with the cut, so the edge stays proportionate
          // instead of swallowing the gap where the slit is thinnest
          // The beam is a hairline and stays one. What fills the rest of
          // the slot is BLACK, not a dim glow - see the occluder plane
          // below. Jacob: "lit the gap with black colour instead of
          // white". Adding light there was the wrong reading: the gap
          // was showing SKY through the open slit, so it needed
          // blocking, not lighting.
          float u = smoothstep(halfW, halfW * 0.72, d);
          // THE GAP AT THE CROWN. Jacob: "there is a gap between two
          // spires". The top fade ran over the last TEN percent of the
          // plane, which is 18 units, so the light died from about
          // y=164 - while the slit stays open to y=175, where the short
          // prong ends. Eleven units of open slit with no light behind
          // it, seen against the sky: a dark wedge between the two
          // tips, exactly where the eye goes first.
          //
          // The fade is now the last two percent. The blade runs to the
          // top of the slit and the stone closes it, which is the same
          // rule the width follows - the prongs decide the shape, not
          // the plane.
          float v = smoothstep(0.0, 0.04, vUvF.y) * smoothstep(1.0, 0.98, vUvF.y);
          // RUINED GOLD, Jacob 2026-08-27: "make the light seam dark
          // gold in color like ruined gold colour". Supersedes the
          // sheet's pure-white spec on his word. The chroma carries
          // the tarnish; the peak channel stays above the bloom
          // threshold so the surge and its halo keep working - dimming
          // all three channels instead would have quietly killed the
          // propagation, which lives on crossing 0.78.
          // lit up on Jacob's word, and the bloom pass gates on
          // LUMINANCE, not per-channel - a first pass reasoned per
          // channel and produced no halo. Gold is luma-poor (heavy in
          // red, light counts blue-green), so the level runs hotter
          // than white ever needed to reach the same glow: resting
          // luma ~0.85 against the 0.78 threshold gives the seam a
          // standing warm halo, and the surge still rides above it.
          vec3 holy = vec3(1.8, 1.15, 0.42);
          vec3 cold = vec3(0.86, 0.93, 1.0);
          float fail = 1.0 - uDecay * 0.55;
          // inside the slit the plane is a few units from the eye, so
          // full strength floods the frame and the walls lose their
          // dark. It burns from a distance and only glows up close.
          //
          // 4.2 was blinding, and blinding is not the same as bright:
          // at that intensity the eye adapts to the blade and every
          // other value in the frame collapses, which is exactly why
          // Jacob could not see the monument standing around it. 1.9
          // still clips to white in the core and still carries the
          // bloom; it just stops being the only thing the frame has.
          // 1.2 keeps the core bright without saturating, so the whole
          // seam reads as one continuous hairline.
          // 1.2 clips the core to white down the entire length of the
          // blade. On an OLED that is not "bright", it is a strip of
          // full-output pixels in a frame that is otherwise near-black,
          // and it hurts to look at. It also costs the watcher its
          // effect, because a saturated pixel cannot get brighter where
          // the attention lands.
          // resting level down 0.68 -> 0.52, Jacob 2026-08-27: "light
          // seam is too bright when idle". At this level the standing
          // halo largely sits below the bloom threshold, so idle is a
          // solid gold line and the glow belongs to the surge and the
          // watcher's node - brightness becomes an EVENT again.
          float near = mix(0.52, 0.42, uNear);
          // ---- THE WATCHER ----
          // Jacob asked for "an eye or something sinister looking from
          // the middle of the light crack" that follows the cursor.
          //
          // NOT an eye. A lit void framed by two forms IS one, and
          // eye-of-sauron is a kill word this project has already paid
          // for - the law is written beside the crown halo. A literal
          // iris in the cleft is also "a fully obvious monster on first
          // load", which the reject list names outright.
          //
          // So the light WATCHES instead of looking. A concentration
          // slides along the blade to the pointer's height and the beam
          // tightens and brightens there, as though the attention of
          // whatever is behind the slit has moved. No iris, no pupil,
          // no shape that can be read as a face - the menace is that it
          // TRACKS, which is behaviour, and behaviour is what this
          // project is supposed to unsettle with.
          float watchY = 0.5 + uWatch.y * 0.34;
          float dy = vUvF.y - watchY;
          float node = exp(-dy * dy * 420.0);
          // it narrows where it concentrates: attention, not a lamp
          float pinch = 1.0 - 0.34 * node * uWatchAmt;
          u = smoothstep(halfW * pinch, halfW * pinch * 0.72, d);
          // and the far side of the slot dims as it turns, so the
          // concentration reads as facing somewhere rather than sitting
          float turn = 1.0 - 0.30 * uWatchAmt * node * abs(uWatch.x)
                     * step(0.0, -uWatch.x * (vUvF.x - 0.5));
          // BRIGHTENING DOES NOTHING HERE. The blade already clips to
          // white down its whole length, so a concentration that only
          // adds intensity is invisible - the pixels are saturated
          // before it starts. It has to work by the beam DIMMING
          // everywhere it is not attending to. That also reads better:
          // the light gathering somewhere is attention; the light
          // getting brighter everywhere is a lamp.
          // Deeper. At 0.38 the rest of the blade was still clearly lit,
          // so the concentration read as a highlight ON a light. At 0.20
          // the crack goes nearly out where it is not attending, and
          // what is left is one point of interest in a dead seam.
          float watch = mix(1.0, mix(0.20, 1.35, node), uWatchAmt);

          // ---- THE SURGE ----
          // Jacob, four times: "you removed the cool effect when you take
          // away the cursor from the hero it ripples through out", then
          // "not like the wave you built earlier", then "there is no
          // fucking wave", then "wave is still not fixed".
          //
          // Three passes answered that by building a travelling front on
          // the STONE. Driving the same leaving gesture against the build
          // he liked, frame by frame with the camera pinned, says the
          // ripple was never on the stone. At f864728 the seam sat at 1.2
          // and the bloom pass thresholds at 1.0, so the core cleared it
          // and a soft halo blossomed out across the whole frame. 3ef6cdf
          // took the blade to 0.68 to stop it burning on an OLED - which
          // it had to - and 0.68 can never reach 1.0, so the halo went out
          // in the same commit that removed the hover lamp. That is why it
          // read as the lamp's doing, and why three rebuilds of a "wave"
          // never brought it back.
          //
          // So the seam SURGES instead of sitting bright. Rest stays at
          // 0.68: nothing clips, nothing burns. When attention leaves the
          // mass the whole length briefly overshoots the bloom threshold
          // and settles. The ripple through the frame is the bloom
          // answering, which is what it always was.
          //
          // Added OUTSIDE watch on purpose. The watcher holds the seam at
          // a fifth of its level while a pointer is anywhere on the page,
          // and a surge multiplied by that could never reach the
          // threshold. This is the seam's own light, not the watcher's.
          // Jacob: "wave is too fast now", then "the wave isnt propagating
          // to each ends its just lame".
          //
          // The second note is the real one and he is right. Both earlier
          // shapes were f(time) ALONE: every point of the seam brightened
          // and dimmed in lockstep, so the whole length pulsed at once.
          // That is a swell, not a wave. Nothing travelled, and a wave
          // that does not travel has no reason to be called one.
          //
          // So it propagates. Jacob on the first travelling version: "the
          // propagation is bit too slow and the split is awkward,
          // execution flawless".
          //
          // IT SPLITS. Two fronts leave the height attention was at in the
          // same instant, one for the crown and one for the foot, and each
          // dies where it lands.
          //
          // Recorded because it cost four rounds: the split was RIGHT the
          // first time it was built. "the split is awkward" was read here
          // as remove the split, so it became one front to the crown -
          // "its only propagating towards crown" - and then a single front
          // that reflected off the crown and came back down, which reaches
          // both ends but never at the same time. None of that was asked
          // for. The note under "awkward" is the tail, not the topology,
          // and the tail is uSurgeTail now rather than another guess.
          //
          // BOTH ENDS ARE REACHED AT THE SAME MOMENT. The split is almost
          // never in the middle of the seam, so a shared SPEED lands the
          // two fronts at different times and the thing reads lopsided -
          // Jacob: "timing is off both should reach the same time". What
          // is shared is the CLOCK, not the speed: one journey from 0 to 1
          // that both fronts run, each covering its own distance in it, so
          // the front with further to go simply travels faster. They leave
          // together and they arrive together whatever height was touched.
          //
          // uSurgeTime is that journey, in seconds, swept live through
          // __dl.setSurgeTime, because tempo cannot be judged from a
          // number.
          float prog = uWakeT / uSurgeTime;
          float toCrown = 1.0 - uWakeY;
          float toFoot = uWakeY;
          // THEY COME UP ALREADY MOVING. Starting both fronts ON the split
          // means the first thing that happens is a bright point at the
          // touch height that then tears into two, and that flash is what
          // Jacob was seeing. They appear a sixth of the way out instead,
          // in motion, so there is never a moment where the pair is one
          // object. The landing is unaffected: travel still reaches 1 when
          // prog does.
          float travel = mix(0.16, 1.0, prog);
          float posUp = uWakeY + toCrown * travel;
          float posDn = uWakeY - toFoot * travel;

          // tight ahead of each front, softer behind it, so each carries a
          // tail and reads as a wave with a direction rather than a band
          // sliding on a rail. Both tails point back at the split.
          float relUp = vUvF.y - posUp;
          float relDn = posDn - vUvF.y;
          float bandUp = exp(-pow(relUp / (relUp > 0.0 ? 0.085 : uSurgeTail), 2.0));
          float bandDn = exp(-pow(relDn / (relDn > 0.0 ? 0.085 : uSurgeTail), 2.0));

          // AND THE SPLIT IS LET GO OF. Both tails point back toward the
          // touch height, so while the fronts are still close the seam
          // between them stays lit and the pair reads as one lump being
          // torn rather than two things leaving. Each tail is cut where it
          // reaches back toward the split, measured along that front's own
          // run so it works the same whichever end is nearer. What is
          // behind a front goes dark; what is ahead of it is untouched, so
          // the travel is exactly as it was.
          float sUp = toCrown > 0.0001 ? (vUvF.y - uWakeY) / toCrown : 0.0;
          float sDn = toFoot > 0.0001 ? (uWakeY - vUvF.y) / toFoot : 0.0;
          bandUp *= smoothstep(0.0, travel * 0.72, sUp);
          bandDn *= smoothstep(0.0, travel * 0.72, sDn);

          // MAX, never a sum: adding the two would double the seam
          // wherever their reach overlaps.
          float band = max(bandUp, bandDn);
          // IT SPENDS ITSELF. Holding the level so both fronts stayed at
          // full brightness the whole way was wrong: Jacob, "earlier it
          // went fast with less glow, now its like forced". A front that
          // grinds to its end at constant strength reads as something
          // being carried along the crack; one that flares and is spent
          // reads as the structure doing something. So it decays as it
          // runs, and with the bloom threshold at 0.78 there is now room
          // for that decay to be seen as a shrinking glow rather than
          // falling straight off a cliff into nothing.
          float envelope = smoothstep(0.0, 0.07, prog)
                         * exp(-prog * 0.8)
                         * (1.0 - smoothstep(0.88, 1.04, prog));
          float surge = prog < 1.2 ? band * envelope * uSurge : 0.0;

          // THE BLOOM IS THE EFFECT, not decoration on top of it. Tried
          // holding the front under the pass's threshold of 1.0 so it
          // would travel without a halo - Jacob asked for exactly that -
          // and the propagation disappeared outright: the seam is three or
          // four pixels wide in a 1600-pixel frame, and a brightness
          // change on a line that thin is not something an eye finds. The
          // halo is what carries the front's position out to where it can
          // be seen. Recorded so it is not tried a second time.
          vec3 seam = mix(holy, cold, uSeverity) * v * u;
          outColor = vec4(seam * (near * fail * watch * turn + surge * fail) * uHand, 1.0);
        }`,
      uniforms: {
        uSeverity: { value: 0 },
        uDecay: { value: 0 },
        uNear: { value: 0 },
        // THE HANDOVER. The resting seam used to be switched off by a
        // boolean the instant partT passed 0.06, while the gap light
        // was still at a third - measured 2026-08-29, the seam's mean
        // brightness HALVED at p=0.09 and its peak fell from 220 to
        // 151. That is Jacob's "the gold seam seems to be disappearing
        // instead of splitting", and it landed exactly where the white
        // lines arrive, which is why it read as the lines killing it.
        // One light, actually handed off this time.
        uHand: { value: 1 },
        // THE WATCHER. x and y in -1..1, smoothed toward the pointer.
        uWatch: { value: new THREE.Vector2(0, 0) },
        uWatchAmt: { value: 0 },
        // THE SURGE. 99 parks it: no surge at load, none under reduced
        // motion. Amount is swept from rendered frames, not argued.
        uWakeT: { value: 99 },
        // where along the seam the fronts start, 0 foot to 1 crown
        uWakeY: { value: 0.5 },
        // 0.92 against a threshold of 0.78 and a resting seam of 0.136
        // puts the front only about a quarter over the line at birth, so
        // its halo is small from the start and shrinks as it spends
        // itself. The old 1.25 against a threshold of 1.0 sat much further
        // over and held there, which is the hard travelling glow.
        uSurge: { value: 0.92 },
        // seconds for the whole journey. Both fronts leave the split at
        // zero and land on their own end at one, whatever the two
        // distances are, so the far one simply travels faster.
        uSurgeTime: { value: 0.5 },
        // how long a tail each front drags back toward the split. Short
        // detaches the two fronts cleanly; long keeps the origin lit while
        // they pull away, which is the likeliest reading of "awkward".
        uSurgeTail: { value: 0.185 }
      },
      side: THREE.DoubleSide,
      // Jacob, 2026-08-21: "there is a something in the back of crown
      // making it look weird i think its the light crack silhouette".
      // He was right, and it was mine. This material wrote alpha 1.0
      // with no blending, so everywhere the lit core falls away it was
      // painting SOLID BLACK, not nothing. At 4.6 wide that black hid
      // inside the slit. At 14 wide - see below - it protrudes past the
      // prongs near the crown, where they narrow to 6.3 from the axis,
      // and its top corners drew a dark plate across the sky behind the
      // tips.
      //
      // A blade of light is additive. Black then contributes nothing
      // and there is no plate to see. This also cannot bring back the
      // halfway bug: transparent geometry draws after ALL opaque
      // geometry, so the terrain no longer gets a turn after this.
      transparent: true,
      blending: THREE.AdditiveBlending,
      // THIS ONE FLAG WAS THE "LIT ONLY HALFWAY".
      //
      // The blade is opaque - alpha 1.0, no blending - but it was set
      // not to write depth, so it painted colour into the framebuffer
      // without ever claiming those pixels. Through the open slit there
      // is no stone to write depth either, so the buffer stayed at the
      // clear value and ANY geometry drawn afterwards passed the test
      // and overwrote the light.
      //
      // Above the horizon the slit opens onto sky, nothing is drawn
      // after it, and the blade survives at full strength. Below the
      // horizon the slit opens onto the plain, the terrain draws later
      // and paints straight over it. That put a hard edge across the
      // seam at exactly the horizon line - and the horizon moves with
      // the camera, which is precisely why the cut-off slid up and down
      // the spire on every camera move.
      //
      // Ruled out along the way, so none of it gets retried: not length
      // (184 tall spans the whole slit), not intensity (1.9 to 1.2 left
      // the ratio identical), not occlusion (depthTest off changed
      // nothing at all), and not width (a 14-unit plane widened the lit
      // part above the line and moved the line not one pixel).
      depthWrite: true
    });
    {
      // 184 tall at y=90 covers the whole slit top to bottom, and
      // z=-2.2 keeps the plane inside the slot: the prongs are
      // 17*(1-0.9t) deep, so the shallowest point the plane reaches is
      // still 2.7 deep and no thickness can ever stand in front of it.
      //
      // 14 wide, against a slit that is 10 across at its widest. The
      // plane must always be wider than the hole - see the shader - or
      // the light reads as a solid bar high up and a thread at the
      // foot. The overspill is buried in stone at every height: the
      // prongs run from the cut plane out to 31*(1-0.9t), which is
      // never less than 5 units of cover on each side.
      // THE SLOT'S BACK WALL. The slit is open, so at heights where no
      // stone lies behind it the visitor sees straight through to the
      // SKY - a pale strip either side of the beam, which read as the
      // two prongs standing apart rather than as one mass parted.
      //
      // This is an opaque near-black plane sitting just behind the
      // beam, cropped to the slit's own profile so the stone still
      // decides its shape. It DISCARDS outside that profile rather than
      // drawing black, which matters: an opaque plane that paints black
      // everywhere is exactly what put a dark plate across the sky
      // behind the crown once already, and discard cannot do that.
      const slotMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: `
          out vec2 vUvS;
          void main() {
            vUvS = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          precision highp float;
          in vec2 vUvS;
          out vec4 outColor;
          void main() {
            // the slit: 5.04 falling to 1.36 over the plane's 184 units,
            // over 14 units of width. The same numbers the beam uses.
            float slitW = 0.400 - 0.292 * vUvS.y;
            if (abs(vUvS.x - 0.5) > slitW) discard;
            outColor = vec4(0.004, 0.005, 0.007, 1.0);
          }`,
        side: THREE.DoubleSide
      });
      const slot = new THREE.Mesh(new THREE.PlaneGeometry(14, 184), slotMat);
      slot.position.set(0, 90, -3.4);
      slot.frustumCulled = false;
      this.scene.add(slot);

      const fis = new THREE.Mesh(new THREE.PlaneGeometry(14, 184), this.fissureMat);
      fis.position.set(0, 90, -2.2);
      fis.frustumCulled = false;
      this.scene.add(fis);
      this.fisPlane = fis;

      // THE OPENING's void: what the parted blades expose around the
      // core. Near-black interior so no sky ever leaks through the gap.
      // the interior's darkness, shaped like the interior: a TAPERED
      // strip tracking the spire's own profile, wide at the foot,
      // narrow at the crown. Every rectangular version of this - two
      // boxes now - spawned corners past the narrowing silhouette the
      // moment the gates cracked. Jacob's eye caught it both times,
      // 2026-08-29. A shape that matches the monument cannot peek.
      const voidGeo = new THREE.BufferGeometry();
      voidGeo.setAttribute(
        'position',
        new THREE.BufferAttribute(
          new Float32Array([
            -8, 1, -6, 8, 1, -6, 8, 150, -6,
            -8, 1, -6, 8, 150, -6, 2.2, 186, -6,
            -8, 1, -6, 2.2, 186, -6, -2.2, 186, -6
          ]),
          3
        )
      );
      // AND IT WIDENS WITH THE STONE. Jacob, 2026-08-29: "when gates
      // open i can see the background". The strip was authored for the
      // unparted slit, but the halves translate by PART_TRAVEL at EVERY
      // height - and near the crown, where the blades are only a couple
      // of units thick, a twelve-unit separation opens a gap far wider
      // than a 2.2 strip could ever cover. The sky came through the top
      // of the opening.
      //
      // Scaling the mesh was the wrong instinct and would have
      // reintroduced the fault this geometry exists to fix: a uniform
      // x-scale big enough for the crown throws the foot's corners
      // (already 8 wide) out past the monument's own silhouette at
      // mid-height. Instead the void takes the IDENTICAL rigid-body
      // offset the stone takes. The triangles simply grow wider - there
      // is no vertex on the centre line to tear open - so the interior
      // tracks the parting exactly, at every height, by construction.
      const voidMat = new THREE.MeshBasicMaterial({
        color: 0x020304,
        side: THREE.DoubleSide,
        fog: false
      });
      voidMat.onBeforeCompile = (sh) => {
        sh.uniforms.uPart = this.stoneU.uPart!;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uPart;')
          .replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\ntransformed.x += sign(position.x) * uPart;'
          );
      };
      const core = new THREE.Mesh(voidGeo, voidMat);
      core.frustumCulled = false;
      core.visible = false;
      this.scene.add(core);
      this.coreVoid = core;
    }

    // --- THE CORE HAZE ---
    // The spec asks for slight volumetric haze near the core. This is
    // a camera-facing sheet standing in the slit plane: air catching
    // the fissure, densest at the foot where the light pools.
    {
      const hazeMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: `
          out vec2 vH;
          void main() {
            vH = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          precision highp float;
          in vec2 vH;
          uniform float uSeverity;
          uniform float uDecay;
          out vec4 outColor;
          void main() {
            // a plume: soft at the foot, narrowing as it rises, never a
            // hard shape - and never wider than the cut it belongs to.
            //
            // THIS WAS THE "LIT ONLY HALFWAY". The seam was colour-coded
            // bottom-red / top-green and sampled down the frame. Above
            // screen y=740 the readings varied red-to-green, which is the
            // fissure plane itself. Below y=760 red and green came back
            // EQUAL - flat grey, not this gradient at all. What sat there
            // was THIS sheet: on a 46-unit plane, 0.10 + 0.34*rise made it
            // up to twenty units across against the fissure's 4.6, so it
            // spilled well outside the slit and laid a soft grey band down
            // the lower monument. The eye read one light that went dim at
            // a fixed height, and it appeared to move with the camera
            // because the crossover depends on the viewing angle. Neither
            // a length problem nor an occlusion problem, which is why a
            // taller plane and a forward move both failed to shift it.
            //
            // Air beside the cut, never a stand-in for it.
            float rise = vH.y;
            float w = 0.035 + 0.055 * rise;
            float across = smoothstep(w, 0.0, abs(vH.x - 0.5));
            float fade = smoothstep(0.0, 0.05, rise) * smoothstep(1.0, 0.30, rise);
            vec3 tint = mix(vec3(1.0, 0.99, 0.97), vec3(0.80, 0.88, 1.0), uSeverity);
            outColor = vec4(tint * across * fade * 0.075 * (1.0 - uDecay * 0.6), 1.0);
          }`,
        uniforms: { uSeverity: { value: 0 }, uDecay: { value: 0 } },
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        side: THREE.DoubleSide
      });
      this.hazeMat = hazeMat;
      const haze = new THREE.Mesh(new THREE.PlaneGeometry(46, 120), hazeMat);
      haze.position.set(0, 58, -3.5);
      haze.frustumCulled = false;
      this.scene.add(haze);
    }

    // --- THE FIELD ---
    // NOT more spires. Twenty-six miniature copies of the hero gave the
    // eye rivals and broke the brief's one-object rule, which is why
    // they read wrong at every scale I tried. The plain is populated
    // with what the system LEAVES instead: low broken remains, flat and
    // horizontal, so nothing out there competes with a vertical hero.
    {
      const N = 120;
      const rng = mulberry32ish(world.seed ^ 0x5f1e);
      const pos: number[] = [];
      const idx: number[] = [];
      for (let i = 0; i < N; i++) {
        const a = rng() * Math.PI * 2;
        const d = 210 + Math.pow(rng(), 0.6) * 1500;
        const cx = Math.cos(a) * d;
        const cz = Math.sin(a) * d;
        // a slab lying in the dirt: long, low, and turned any way
        const len = 8 + rng() * 46 + d * 0.012;
        const hgt = 1.4 + rng() * 7.5 + d * 0.004;
        const rot = rng() * Math.PI;
        const tx = Math.cos(rot);
        const tz = Math.sin(rot);
        const b = pos.length / 3;
        for (const sgn of [-1, 1]) {
          pos.push(cx + tx * len * sgn, -1.0, cz + tz * len * sgn);
          pos.push(cx + tx * len * sgn * 0.72, hgt, cz + tz * len * sgn * 0.72);
        }
        idx.push(b, b + 1, b + 3, b, b + 3, b + 2);
      }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      fg.setIndex(idx);
      this.fieldMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: `
          out float vDist;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vDist = -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          precision highp float;
          in float vDist;
          uniform float uTime;
          uniform float uSeverity;
          uniform vec3 uFog;
          out vec4 outColor;
          void main() {
            vec3 col = vec3(0.010, 0.011, 0.014);
            float fog = 1.0 - exp(-vDist * vDist * 0.0000019);
            outColor = vec4(mix(col, uFog, clamp(fog, 0.0, 1.0)), 1.0);
          }`,
        uniforms: {
          uTime: { value: 0 },
          uSeverity: { value: 0 },
          uFog: { value: new THREE.Color('#07080a') }
        },
        side: THREE.DoubleSide
      });
      const field = new THREE.Mesh(fg, this.fieldMat);
      field.frustumCulled = false;
      this.scene.add(field);
    }

    // THE CHOIR is no longer built here. Five transparent swaying
    // billboards were the wrong quality level for the idea; the real
    // masses are authored geometry in ChoirGroup, loaded from
    // choir.glb, and they never move.
    this.choir = new ChoirGroup(this.scene);

    // --- DRIFTING MIST ---
    // Low banks crossing the field. Movement across the frame, which
    // is what a still background was missing; slow enough that nothing
    // in it can be watched.
    {
      this.mistMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: `
          out vec3 vM;
          void main() {
            vM = position;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          precision highp float;
          in vec3 vM;
          uniform float uTime;
          uniform vec3 uFog;
          out vec4 outColor;
          float mh(vec2 c) { return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453); }
          float bank(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mh(i), mh(i + vec2(1, 0)), f.x),
                       mix(mh(i + vec2(0, 1)), mh(i + vec2(1, 1)), f.x), f.y);
          }
          void main() {
            vec2 q = vec2(vM.x * 0.0032, vM.z * 0.0032);
            float d = bank(q + vec2(uTime * 0.0065, uTime * 0.0022));
            d *= bank(q * 2.1 - vec2(uTime * 0.004, 0.0));
            float body = smoothstep(0.22, 0.75, d);
            float fade = smoothstep(0.0, 1.0, clamp(vM.y / 34.0, 0.0, 1.0));
            // The "slow light crossing the plain" sweep is REMOVED, on
            // Jacob's instruction 2026-08-19. It was tuned to blend
            // into a neutral grey sky; against a cold blue one it read
            // as a warm glowing patch sitting on the ground with no
            // source, which is the most obviously wrong thing a frame
            // can have. The banks still drift, so the movement it was
            // there for survives without the blob.
            outColor = vec4(uFog * (2.6 * body) * (1.0 - fade) * 0.5, 1.0);
          }`,
        uniforms: { uTime: { value: 0 }, uFog: { value: new THREE.Color('#07080a') } },
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        side: THREE.DoubleSide
      });
      for (let layer = 0; layer < 3; layer++) {
        const g = new THREE.PlaneGeometry(2600, 2600);
        const m = new THREE.Mesh(g, this.mistMat);
        m.rotation.x = -Math.PI / 2;
        m.position.y = 6 + layer * 11;
        m.frustumCulled = false;
        this.scene.add(m);
      }
    }

    // --- DISTANT RIDGES ---
    // Depth behind the monument: low broken silhouettes that give the
    // haze something to sit in front of, and give the spire a world.
    {
      const ridgeMat = new THREE.MeshBasicMaterial({ color: 0x090a0d, fog: true });
      const rng = mulberry32ish(world.seed ^ 0x1d6e);
      for (let ring = 0; ring < 3; ring++) {
        const dist = 620 + ring * 260;
        const pts: number[] = [];
        const idx: number[] = [];
        const segs = 90;
        for (let i = 0; i <= segs; i++) {
          const a = (i / segs) * Math.PI * 2;
          const h = (14 + rng() * 46) * (1 - ring * 0.2);
          pts.push(Math.cos(a) * dist, 0, Math.sin(a) * dist);
          pts.push(Math.cos(a) * dist, h, Math.sin(a) * dist);
          if (i < segs) {
            const b = i * 2;
            idx.push(b, b + 1, b + 3, b, b + 3, b + 2);
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        g.setIndex(idx);
        const m = new THREE.Mesh(g, ridgeMat);
        m.frustumCulled = false;
        this.scene.add(m);
      }
    }

    // --- THE FAR STANDING FIELD ---
    // Gate 2 of the reference picture, 2026-08-22. The world used to end
    // at the last choir mass: choir 560 to 1560 out, ridges inside 1140,
    // and past that nothing until fog - so seven same-scale shapes stood
    // on one plane and the frame read model-sized. The picture's scale
    // comes from monoliths that keep receding in LAYERS.
    //
    // Three rings of standing silhouettes, 1850 to 3250 out - inside the
    // shore's 3600, so every foot stays in ground. Each ring bakes a
    // deeper blend toward the fog colour into its vertices, which is the
    // whole recession: nearer rings cut darker against the horizon, the
    // last is almost air. No facets, no lights, no response to anything -
    // these are distance, not company. The old field note ("nothing out
    // there competes with a vertical hero") still governs the NEAR plain;
    // at these distances a 90-unit monolith subtends two degrees and
    // competes with nothing.
    {
      const rng = mulberry32ish(world.seed ^ 0x3a91);
      const pos: number[] = [];
      const fade: number[] = [];
      const idx: number[] = [];
      const RINGS: ReadonlyArray<readonly [number, number, number]> = [
        // distance, count, blend toward fog
        [1850, 26, 0.5],
        [2500, 36, 0.72],
        [3250, 48, 0.88]
      ];
      for (const [dist, count, blend] of RINGS) {
        for (let i = 0; i < count; i++) {
          const a = ((i + rng() * 0.8) / count) * Math.PI * 2;
          const d = dist * (0.92 + rng() * 0.16);
          const cx = Math.cos(a) * d;
          const cz = Math.sin(a) * d;
          // heights grow with distance more slowly than distance does,
          // so each layer subtends less: recession the eye can read
          const h = (26 + rng() * 64) * Math.pow(d / 1400, 0.8);
          const w = (7 + rng() * 16) * Math.pow(d / 1400, 0.9);
          // stood across the sightline, with a slight taper and lean
          const tx = -Math.sin(a);
          const tz = Math.cos(a);
          const lean = (rng() - 0.5) * 0.24;
          const top = 0.42 + rng() * 0.3;
          const b = pos.length / 3;
          pos.push(cx - tx * w, -6, cz - tz * w);
          pos.push(cx + tx * w, -6, cz + tz * w);
          pos.push(cx + tx * w * top + tx * lean * h * 0.2, h, cz + tz * w * top + tz * lean * h * 0.2);
          pos.push(cx - tx * w * top + tx * lean * h * 0.2, h, cz - tz * w * top + tz * lean * h * 0.2);
          fade.push(blend, blend, blend, blend);
          idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aFade', new THREE.Float32BufferAttribute(fade, 1));
      g.setIndex(idx);
      this.strataMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: `
          in float aFade;
          out float vFade;
          void main() {
            vFade = aFade;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          precision highp float;
          in float vFade;
          uniform vec3 uFog;
          out vec4 outColor;
          void main() {
            outColor = vec4(mix(vec3(0.006, 0.007, 0.010), uFog, vFade), 1.0);
          }`,
        uniforms: { uFog: { value: new THREE.Color('#020305') } },
        side: THREE.DoubleSide
      });
      const strata = new THREE.Mesh(g, this.strataMat);
      strata.frustumCulled = false;
      this.scene.add(strata);
    }

    // --- THE ROOTS ---
    // E0, 2026-08-22, Jacob's strikes. The plinth, the thirteen treads
    // and the paired pylons are DELETED. They were built under the
    // temple story and they were good at it, which is exactly the
    // problem: under the lock story a processional stair is an
    // invitation, a platform presents the object, and two stones
    // flanking an axis are ceremony. The monument is not approached. It
    // is contained.
    //
    // What replaces them is not architecture. The blades enter the
    // plain directly - monument.py lofts from t = -0.055, about ten
    // units of full section below grade, so the join was always solid
    // and the podium was merely hiding it. The ground is FORCED around
    // the object instead of built to present it: a narrow asymmetric
    // subsidence slot at each root, a deep contact shadow and a little
    // of the fissure's light continuing below grade - all three in the
    // ground shader, where a slot can be black without being a hole.
    //
    // Scale used to come from the treads, the only human ruler in the
    // frame. It now has to come from spatial evidence: the
    // viewer-height camera, the readable courses on the blades, the
    // atmospheric gap out to the choir, the width of the roots
    // themselves, and near/far parallax on the approach.
    //
    // The scree goes with them. A hundred and ninety five small pieces
    // read as unfinished dressing, never as evidence.
    {
      // THE RUIN IS GONE, 2026-08-23, Jacob's base brief: "kill the
      // random right-side hole... it reads like test geometry". He was
      // right twice - moved out and sunk it still read as an arbitrary
      // prop, because wreckage with no visible cause is scenery. The
      // world's reaction to the spire is carried by the contact now:
      // the seam, the basin, the incision, the blight and the stress
      // seams, all keyed to the footprint. Secondary ground events only
      // return if they are consequences of the spire, not props.
    }

    // --- atmosphere ---
    // THE BACKING HALO IS REMOVED, 2026-08-19. A 180 unit additive
    // sprite off to the left at low height, and the bright patch on the
    // plain Jacob asked to lose. It is worth recording WHY it can go
    // rather than just that he said so: it existed to separate a
    // near-black form from a near-black sky, by backlighting the
    // silhouette. That condition no longer holds. The sky is cold blue
    // and the key rakes side-on, so the form is separated by hue and by
    // modelling, and the halo had nothing left to do except sit there
    // glowing with no source.
    //
    // Its two placement laws stand for anything that replaces it: never
    // on the axis, because an additive sprite there paints over every
    // surface behind it and washes the far horn to a ghost; and NEVER
    // in the gap between the horns, because a lit void framed by two
    // curved forms is an eye, which is a kill word this project has
    // already paid for once.
    //
    // The crown light stays. It belongs to the tall horn alone, it is a
    // third the size, and it reads as part of the fissure rather than
    // as weather.
    // CENTRED AND LARGER, on Jacob's instruction 2026-08-21:
    // "reposition the halo dude it should be centre of twospires and a
    // lil big am i not right".
    //
    // This overrides the placement law written directly above, which is
    // his to override - but it is recorded rather than quietly deleted,
    // because the law was paid for. A lit void framed by two forms is
    // an EYE, and eye-of-sauron is a kill word this project has already
    // been burned by once. If the frame starts reading that way, this
    // line is the cause and moving x back off the axis is the fix.
    //
    // Two things hold it back from that read for now: it sits BEHIND
    // the crown at z-34 so the horns occlude its centre rather than
    // framing a clean disc, and it is set below the tall tip so it does
    // not float as a separate body above the monument.
    // ---- AND THE CROWN HALO IS REMOVED TOO, E0, 2026-08-22. ----
    // Everything above is kept as the record of why it was centred, and
    // it is now moot. It was a 112-unit additive radial sprite: a disc,
    // and a disc behind a crown is a saint's nimbus however it is
    // tuned. It made the holiness read as GRAPHICALLY APPLIED rather
    // than produced by the world, which is the one thing the lock story
    // cannot afford - the exterior has to look holy because it is doing
    // something, not because it has been haloed.
    //
    // Lowering its opacity was explicitly rejected: that keeps the disc
    // and only dims it. The replacement is in the sky itself, at
    // SKY PRESSURE in skyAt() - a narrow, vertically drawn, slightly
    // irregular lift behind the blades, off-centre, with no radial
    // falloff anywhere in it. The read must be that the sky is under
    // pressure around this object, never that the object is radiating.
    //
    // The eye law from above survives its subject and still binds
    // anything that ever goes back up there: never on the axis, and
    // never a lit void framed by the two horns.

    // --- the air: dust motes over the water, rising slowly ---
    {
      const N = 430;
      const rngM = mulberry32ish(world.seed ^ 0x5150);
      const mp = new Float32Array(N * 3);
      const ms = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const ang = rngM() * Math.PI * 2;
        const rad = 20 + rngM() * 130;
        mp[i * 3] = Math.cos(ang) * rad;
        mp[i * 3 + 1] = rngM() * 34;
        mp[i * 3 + 2] = Math.sin(ang) * rad;
        ms[i] = rngM();
      }
      const mg = new THREE.BufferGeometry();
      mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
      mg.setAttribute('aSeed', new THREE.BufferAttribute(ms, 1));
      this.moteMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: MOTE_VERT,
        fragmentShader: MOTE_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uScale: { value: 900 },
          uSeverity: { value: 0 },
          uAmt: { value: 1 },
          uFall: { value: 0 }
        },
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true
      });
      // not added to the scene: drifting points read as dust, and dust
      // is a kill word on this project. The air is carried by the sky
      // strata and the core haze instead
      void mg;
    }

    // --- visitor marks ---
    this.markGeom = new THREE.BufferGeometry();
    this.markGeom.setAttribute('position', new THREE.BufferAttribute(this.markPos, 3));
    this.markGeom.setAttribute('aBorn', new THREE.BufferAttribute(this.markBorn, 1));
    this.markGeom.setDrawRange(0, 0);
    this.markMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: MARK_VERT,
      fragmentShader: MARK_FRAG,
      uniforms: { uTime: { value: 0 }, uScale: { value: 900 } },
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true
    });
    const marks = new THREE.Points(this.markGeom, this.markMat);
    marks.frustumCulled = false;
    // hidden with the shader bites, Jacob 2026-08-27: a press leaves
    // no visible mark on the basalt. The system underneath still runs.
    marks.visible = false;
    this.scene.add(marks);


    this.resize();
    window.addEventListener('resize', this.resize);

    // --- image-based light: the single biggest jump toward the
    // reference's material quality ---
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.02).texture;
    // TWILIGHT: the sky is the fill. Raised, but only a little - the
    // recorded law still binds, ambient stronger than the key models no
    // form at all, and a lighter flat is still flat.
    this.scene.environmentIntensity = 0.36;

    // --- the monument itself: authored stone, not boxes ---
    const monoUniforms = (): Record<string, THREE.IUniform> => ({
      uTime: { value: 0 },
      uPart: { value: 0 },
      uDecay: { value: 0 },
      uSeverity: { value: 0 },
      uCalm: { value: 0 },
      uRim: { value: 1.0 },
      uScript: { value: 1.0 },
      uHover: { value: new THREE.Vector3(0, -999, 0) },
      uHoverAmt: { value: 0 },
      uInner: { value: new THREE.Vector3(0, -999, 0) },
      uInnerAmt: { value: 0 },
      uSignal: { value: 0 },
      uAlign: { value: 0 },
      uWatchY: { value: 90 },
      uWatchAmt: { value: 0 },
      // the visitor's presses, as world positions + born times. The
      // stone eats at these points instead of a sprite being glued on.
      uMarks: { value: Array.from({ length: 12 }, () => new THREE.Vector4(0, -999, 0, -99)) },
      uMarkN: { value: 0 },
      // where the law struck cells from the face: the kept wounds
      uCulls: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, -999, 0, -99)) },
      uCullN: { value: 0 },
      uFogColor: { value: new THREE.Color('#07080a') },
      uFogDensity: { value: 0.0022 }
    });
    // physically based stone, with the world's law injected into it:
    // dark igneous mass whose relief is REAL, baked from the high-poly
    // sculpt (tools/blender/monument.py) into tangent normal + AO maps
    this.stoneU = monoUniforms();
    const texLoader = new THREE.TextureLoader();
    const stoneNormal = texLoader.load('/models/monument-normal.png');
    stoneNormal.flipY = false;
    stoneNormal.colorSpace = THREE.NoColorSpace;
    const stoneAO = texLoader.load('/models/monument-ao.png');
    stoneAO.flipY = false;
    stoneAO.colorSpace = THREE.NoColorSpace;
    stoneAO.channel = 0;
    // H1 keeps the locked near-black base but removes the clean machined
    // response: lower metalness, stronger baked relief, and shader-driven
    // dry/wet roughness territories make this old mineral rather than a prop.
    // THE BODY GOES TO WORKED METAL, Jacob 2026-08-26: "i want it to
    // mimic the pic i sent", then "do the hero body too". The finish
    // changes and the MECHANISM does not - the corrosion band, the
    // foot blight, the inscription, the press marks and the witnessed
    // cull all still run below, because those carry meaning rather
    // than surface. What moves is the four numbers that decide whether
    // this reads as near-black mineral or as cut gunmetal, and they
    // are the crest's numbers exactly, so body and crest stay one
    // material.
    //
    // Note the consequence, since it is not obvious: at this metalness
    // the diffuse term is scaled by (1 - metalness), so the albedo
    // work below now tints REFLECTION more than it lightens a surface.
    // The lace and the record still read; they read as a polished
    // figure in the metal rather than as pale marks on stone.
    const stone = new THREE.MeshStandardMaterial({
      // 0x050607 put the hero BELOW the sky in value, so it could only
      // ever be a silhouette. 0x0c0e12 overcorrected into a pale flat
      // grey. The band is bought with the KEY now, not the albedo - see
      // the rig note above - so the stone comes back down to something
      // that is still near-black sintered graphite by the SIGNAL SKIN
      // spec and lets the light do the modelling.
      // HERO BODY tokens from the material sheet, 2026-08-27: matte
      // roughness with subtle metallic depth - the midpoint between
      // the chrome failure (0.9/0.34) and bone-dry basalt (0.0/0.8),
      // and the sheet names it exactly. Micro normal at the sheet's
      // 0.28.
      color: 0x292b30,
      roughness: 0.66,
      metalness: 0.86,
      envMapIntensity: 1.0,
      normalMap: stoneNormal,
      normalScale: new THREE.Vector2(0.28, 0.28),
      aoMap: stoneAO,
      aoMapIntensity: 1.15,
      side: THREE.DoubleSide
    });
    stone.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.stoneU);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vMonoW;\nvarying vec3 vMonoL;\nuniform float uPart;')
        .replace(
          '#include <begin_vertex>',
          // TWO STONES, PULLED APART - Jacob, 2026-08-29: "i carved a
          // line on a stone ... when two friends pull the stones the
          // carved line doesn't stay stationary, it moves with the
          // stone." Each half is a RIGID BODY. It slides whole, and
          // every crease, glyph and grain carved on it rides with it,
          // because the skin samples vMonoL - the stone's own frame.
          // No door panels, no boundary bands, no smearing. The only
          // crack is the seam the monument always had.
          [
            '#include <begin_vertex>',
            'transformed.x += sign(position.x) * uPart;',
            'vMonoW = (modelMatrix * vec4(transformed, 1.0)).xyz;',
            'vMonoL = (modelMatrix * vec4(position, 1.0)).xyz;'
          ].join('\n')
        );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', FRAG_COMMON)
        .replace('#include <map_fragment>', FRAG_MAP)
        .replace(
          '#include <roughnessmap_fragment>',
          // The skin computes vMonoRough across roughly 0.28 to 0.94,
          // which is a mineral range and would leave the metal dull.
          // Remapped into a polished band rather than replaced, so
          // every variation the skin derives - grain, wetness, glyph
          // grooves, scratches, fracture lips, press pits - still
          // modulates the finish, only now as sheen instead of tooth.
          '#include <roughnessmap_fragment>\nroughnessFactor = clamp(0.60 + (vMonoRough - 0.58) * 0.45, 0.44, 0.86);'
        )
        .replace(
          '#include <normal_fragment_maps>',
          // the peening and linework as real relief, the same
          // tangent-free construction the crest uses
          `#include <normal_fragment_maps>
{
  vec3 pSurf = -vViewPosition;
  vec3 pSx = dFdx(pSurf);
  vec3 pSy = dFdy(pSurf);
  vec3 pR1 = cross(pSy, normal);
  vec3 pR2 = cross(normal, pSx);
  float pDet = dot(pSx, pR1);
  if (abs(pDet) > 1e-8) {
    vec2 pDH = vec2(dFdx(vMonoH), dFdy(vMonoH)) * 0.14;
    vec3 pGrad = sign(pDet) * (pDH.x * pR1 + pDH.y * pR2);
    normal = normalize(abs(pDet) * normal - pGrad);
  }
}`
        )
        .replace('#include <emissivemap_fragment>', FRAG_EMISSIVE);
    };
    this.monoMat = stone;
    this.scene.add(buildHeroCrest());
    this.hardware = buildOpeningHardware(this.coreParts);
    this.scene.add(this.hardware.group);
    this.stress = buildStressStage(world.seed);
    this.scene.add(this.stress.group);
    this.ready = new GLTFLoader()
      .loadAsync('/models/monument.glb')
      .then((gltf) => {
        // THE FLOOR. A flat grey plane under a fully skinned monument
        // reads as paint. It is the same family of material now: the
        // same near-black base, polished enough to hold the fissure's
        // reflection and the sky's sheen at grazing angles, with the
        // same sintered grain running through it.
        const terrainMat = new THREE.MeshStandardMaterial({
          color: 0x06070a,
          roughness: 0.34,
          metalness: 0.04,
          side: THREE.DoubleSide
        });
        terrainMat.onBeforeCompile = (sh) => {
          Object.assign(sh.uniforms, this.groundU);
          sh.vertexShader = sh.vertexShader
            .replace(
              '#include <common>',
              `#include <common>
varying vec3 vGroundW;
float apHash(vec2 c) { return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453); }
float apNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(apHash(i), apHash(i + vec2(1.0, 0.0)), f.x),
             mix(apHash(i + vec2(0.0, 1.0)), apHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`
            )
            .replace(
              '#include <begin_vertex>',
              `#include <begin_vertex>
{
  // ---- THE APRON ----
  // Jacob, 2026-08-23: "the base of the hero right spire bottom is
  // uneven and why there is a bump in the landscape".
  //
  // One cause for both. The dunes on this plain run to +6, and until E0
  // the plinth stood over all of it - the platform topped at 6.4
  // precisely so no dune could ever poke through. Taking the podium out
  // put the blades straight into that relief: a dune riding up against
  // a tapering blade lifts its visible bottom edge, so the contact line
  // wanders instead of cutting straight, and the dune itself reads as a
  // bump sitting at the foot of the monument.
  //
  // The plain is graded level where the mass went in. Not decoration -
  // it is the same fact the subsidence slots state: the ground did not
  // stay as it was here. Full flat under the roots, blending back into
  // the natural dunes further out, and the blend edge is broken by
  // noise so the apron is never a machined disc.
  vec3 apW = (modelMatrix * vec4(transformed, 1.0)).xyz;
  float apR = length(apW.xz);
  float apEdge = 150.0 + 66.0 * apNoise(apW.xz * 0.010);
  float apFlat = 1.0 - smoothstep(apEdge * 0.42, apEdge, apR);
  transformed.y = mix(transformed.y, transformed.y - apW.y, apFlat);
  // THE BASIN, from the base brief: the world sags under the mass.
  // Broad and almost imperceptible - about a unit and a half at the
  // seam easing to nothing by 150 out - so it never reads as a crater,
  // only as ground that has been under this weight for a very long
  // time. The dip is what stops the plain reading dead-flat.
  transformed.y -= 1.6 * exp(-(apR * apR) / (95.0 * 95.0));
  // the graded ground faces up: a flattened vertex keeps the normal of
  // the dune it used to belong to, and that normal lights a slope that
  // is no longer there
  objectNormal = normalize(mix(objectNormal, vec3(0.0, 1.0, 0.0), apFlat));
  transformedNormal = normalMatrix * objectNormal;
}
vGroundW = (modelMatrix * vec4(transformed, 1.0)).xyz;`
            );
          sh.fragmentShader = sh.fragmentShader
            .replace(
              '#include <common>',
              `#include <common>
varying vec3 vGroundW;
uniform float uGSeverity;
uniform float uGDecay;
uniform float uGTime;
uniform float uGBite;
uniform float uGHaze;
float gHash(vec2 c) { return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453); }
float gN2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = gHash(i); float b = gHash(i + vec2(1.0, 0.0));
  float c = gHash(i + vec2(0.0, 1.0)); float d = gHash(i + vec2(1.0, 1.0));
  float n = a + (b - a) * f.x + (c - a) * f.y + (a - b - c + d) * f.x * f.y;
  vec2 p2 = p * 2.13 + 7.7; vec2 i2 = floor(p2); vec2 f2 = fract(p2); f2 = f2 * f2 * (3.0 - 2.0 * f2);
  float a2 = gHash(i2); float b2 = gHash(i2 + vec2(1.0, 0.0));
  float c2 = gHash(i2 + vec2(0.0, 1.0)); float d2 = gHash(i2 + vec2(1.0, 1.0));
  float n2 = a2 + (b2 - a2) * f2.x + (c2 - a2) * f2.y + (a2 - b2 - c2 + d2) * f2.x * f2.y;
  return n * 0.68 + n2 * 0.32;
}
${SKY_LAW}`
            )
            .replace(
              '#include <map_fragment>',
              `#include <map_fragment>
{
  // the fissure lays a reflection down the floor: a long streak on the
  // monument's axis, tightest near the foot and spreading with distance
  float r = length(vGroundW.xz);
  // THE FOOT, 2026-08-22. Jacob: "need to do something about the base".
  // Four faults, one treatment; the lane is the first. It was 2.2 wide
  // at a mouth whose slit is under one unit of visible light, and it
  // died by r=80 - a blob at the foot, not light CAST BY the slit. It
  // leaves narrower and carries further now, a blade's throw.
  float axis = abs(vGroundW.x) / (1.6 + r * 0.085);
  float streak = exp(-axis * axis) * exp(-r * 0.0075) * step(-1.0, vGroundW.z);
  vec3 lit = mix(vec3(1.0), vec3(0.86, 0.93, 1.0), uGSeverity);
  // THE COLD LANDING, sinister gate 4, 2026-08-22. The pool, where
  // the light actually LANDS at the mouth, is already cold; the lane
  // warms as it runs out toward the visitor. One temperature gradient
  // by distance, no boundary anywhere. The plinth carries the same
  // law and the same constant.
  lit = mix(lit, vec3(0.50, 0.78, 1.14), exp(-r * 0.030));
  diffuseColor.rgb += lit * streak * 0.26 * (1.0 - uGDecay * 0.5);

  // THE STANDING SHADOW. The mass blocks the sky, so the plain darkens
  // where it stands - the contact the frame never had, which is most of
  // why the monument read as placed on the ground rather than standing
  // in it. The lane wins near the mouth: light escaping the slit falls
  // INSIDE the shadow, which is exactly what makes both read as real.
  // E0 re-cut this. It was sized to the plinth's skirt, 74 by 46, and
  // the plinth is gone: it is cut to the ROOTS now, which is what
  // actually stands on the plain. Tighter and deeper on purpose - a
  // small shadow going very dark against the stone reads as a mass
  // driven into the ground, where a wide soft one reads as a platform.
  vec2 fp = vec2(vGroundW.x / 30.0, vGroundW.z / 21.0);
  float foot = 1.0 - smoothstep(0.80, 2.10, length(fp));
  diffuseColor.rgb *= 1.0 - foot * 0.62 * (1.0 - streak * 0.75);

  // ---- THE SEALED INSERTION ----
  // 2026-08-23, Jacob's base brief, replacing the E0 subsidence slots.
  // His diagnosis of the slots was exact: read from the landing camera
  // they were not "the ground broke here", they were one random cutout
  // on the right. The whole contact is rebuilt around one sentence:
  //
  //   this object has been forced into the world, and the world has
  //   never recovered from the contact.
  //
  // Everything below keys off ONE measure: fd, distance to the spire's
  // actual footprint - the two half-sections either side of the slit -
  // approximated by their bounding ellipse per side. 1 is the line
  // where stone meets ground; everything the contact does is a falloff
  // from that line, so it all agrees about where the object IS.
  // The footprint follows THE FLARE: at ground the section is 1.42x
  // the shaft (FLARE_K 0.42), so the seam, the press shadow and the
  // lace all sit at the stone's real edge. Keyed to the unflared
  // width they would fall UNDER the splay and vanish - which is
  // exactly what the first capture showed.
  float fdax = max(abs(vGroundW.x) - 5.0, 0.0);
  float fd = length(vec2(fdax / 44.0, vGroundW.z / 24.1));

  // THE SEAM. A hairline of black hugging the footprint: not a ring
  // pedestal, a containment seam - the width of a shadow a blade would
  // leave if it had been pressed into wax. This is what makes the
  // contact read ENGINEERED rather than rested.
  float seam = exp(-pow((fd - 1.045) / 0.030, 2.0));
  diffuseColor.rgb *= 1.0 - seam * 0.9;

  // UNDER THE STONE, kept from E0 but re-cut to the true footprint:
  // the ground against the stone goes to almost nothing on its own
  // term, and the lane cannot lift it - light grazing past a root
  // cannot get underneath it.
  float under = 1.0 - smoothstep(0.90, 1.06, fd);
  diffuseColor.rgb *= 1.0 - under * 0.88;
  // and the contact shadow proper: pressure, not vignette. Tight.
  float press = exp(-max(fd - 1.0, 0.0) * 6.5);
  diffuseColor.rgb *= 1.0 - press * 0.5 * (1.0 - streak * 0.6);

  // THE INCISION. The split does not stop at the ground: it continues
  // through it as a narrow dark cut along the slit's own axis, running
  // out past the footprint and closing. This ties the floor to the
  // spire's one defining feature, and it is where the below-grade
  // light lives - cold on arrival like the pool, because it is the
  // same light still landing.
  {
    // Extended to the mock: on the approach side the incision runs out
    // toward the visitor and off the bottom of the frame, a thin groove
    // with the slit's own light lying in it, dying slowly along its
    // length. Behind the monument it closes within the footprint.
    float cut = exp(-vGroundW.x * vGroundW.x / (1.5 * 1.5));
    float runS = step(0.0, vGroundW.z) * (1.0 - smoothstep(200.0, 290.0, vGroundW.z));
    float runN = step(vGroundW.z, 0.0) * (1.0 - smoothstep(21.0, 33.0, -vGroundW.z));
    float trench = cut * max(runS, runN);
    diffuseColor.rgb *= 1.0 - trench * 0.82;
    float glowZ = exp(-max(vGroundW.z - 17.0, 0.0) * 0.010) * step(0.0, vGroundW.z);
    diffuseColor.rgb += vec3(0.50, 0.78, 1.14) * trench * glowZ * 0.42;
  }

  // THE BLIGHT AT THE CONTACT. From Jacob's reference: the porous web
  // is densest exactly where stone meets ground and thins FAST - the
  // spire is the source, and the ground has caught what it sheds. The
  // same vesicular construction as the skin (level set over its own
  // gradient), scaled to the floor, clinging to the seam. Sparse
  // tendrils, never a puddle of noise.
  {
    vec2 bq = vGroundW.xz * 0.16;
    bq += (vec2(gN2(bq * 0.5), gN2(bq * 0.5 + 19.7)) - 0.5) * 2.6;
    float bf = gN2(bq) - 0.5;
    float bg = length(vec2(dFdx(bf), dFdy(bf))) + 1e-6;
    float bWeb = 1.0 - smoothstep(0.0, 1.9, abs(bf) / bg);
    float bPit = smoothstep(0.03, -0.14, bf);
    float cling = exp(-max(fd - 1.0, 0.0) * 3.0) * (1.0 - under);
    diffuseColor.rgb *= 1.0 - bPit * cling * 0.5;
    diffuseColor.rgb += vec3(0.105, 0.112, 0.124) * bWeb * cling;
  }

  // THE STRESS SEAMS. Four lines running outward from the seam: force
  // transmitted into the plain, each one authored - a bearing, a reach,
  // a slight wander - and none of them on the approach axis, which
  // stays swept. Four is deliberate: a few deliberate lines read as
  // consequence, many read as decoration, and a uniform fan is a
  // sunburst, which is banned.
  {
    vec4 SEAM_A = vec4(0.62, 2.48, 320.0, 0.0);  // bearing pairs: angle, angle, reach, -
    vec4 SEAM_B = vec4(3.62, 5.05, 470.0, 0.0);
    for (int si = 0; si < 4; si++) {
      float sang = si == 0 ? SEAM_A.x : si == 1 ? SEAM_A.y : si == 2 ? SEAM_B.x : SEAM_B.y;
      float sreach = (si < 2 ? SEAM_A.z : SEAM_B.z) * (1.0 + 0.35 * float(si == 3));
      vec2 sdir = vec2(cos(sang), sin(sang));
      vec2 sp = vGroundW.xz;
      float along = dot(sp, sdir);
      float aside = dot(sp, vec2(-sdir.y, sdir.x));
      // it wanders as it goes: a dead-straight crack is a ruled line
      aside += sin(along * 0.045 + sang * 7.0) * 2.4;
      float on = smoothstep(30.0, 44.0, along) * (1.0 - smoothstep(sreach * 0.55, sreach, along));
      float line = exp(-aside * aside / (0.85 * 0.85));
      // recessed, and thinning to nothing at the far end
      diffuseColor.rgb *= 1.0 - line * on * 0.55;
    }
  }
  // wet sheen in the middle distance. This was carrying the comment
  // about resolving into a horizon and it never could: past about a
  // thousand units the fog owns the pixel outright and no albedo
  // survives it. The horizon is done below, in the fog itself
  diffuseColor.rgb += vec3(0.020, 0.021, 0.026) * smoothstep(120.0, 620.0, r);
  // the same sintered grain the skin carries, at floor scale
  float g = gHash(floor(vGroundW.xz * 1.6));
  diffuseColor.rgb *= 0.86 + 0.28 * g;

  // THE CONTACT. The plain is not intact where the mass went into it.
  // Jacob: the hero reads as "a prop rather than holy" - a thing placed
  // on ground rather than standing in a world that has answered it. The
  // answer is consequence, not scenery: the plain carries the same
  // plate failure the skin does, and the fissure finds the seams it
  // opened. The mechanism is the form.
  //
  // Seams are the ZERO SET of a warped field divided by its own
  // gradient - not a threshold on noise, and not cells. A threshold
  // admits half the volume and reads as smoke; cells always resolve
  // into a repeating unit, which is what killed the Voronoi core.
  // Dividing by the gradient gives every seam the same width however
  // steep the field is there, which is what makes it read as fracture.
  float bite = 1.0 - smoothstep(46.0, 215.0, r);
  if (bite > 0.0015) {
    vec2 q = vGroundW.xz * 0.05;
    // warped BEFORE the field is taken, or the seams inherit the
    // noise's own roundness and come out as a lattice of bubbles
    q += (vec2(skyNoise(q * 0.8), skyNoise(q * 0.8 + 11.3)) - 0.5) * 2.2;
    float ff = skyFbm(q) - 0.4375;
    float grad = length(vec2(dFdx(ff), dFdy(ff))) + 1e-6;
    float seam = (1.0 - smoothstep(0.0, 3.0, abs(ff) / grad)) * bite;
    // the lane stays continuous: the seams cut the stone, not the light
    seam *= 1.0 - streak * 0.6;
    // a crack is a shadow before it is anything else
    diffuseColor.rgb *= 1.0 - seam * uGBite * 0.94;

    // AND THEN IT CARRIES. Which stretches of the network are live
    // drifts slowly, so it reads as charge finding a path through
    // broken ground.
    //
    // Deliberately NOT a wave travelling out from the foot. A radial
    // pulse on an axis is a ring, and a ring here is a radial bloom -
    // which is on the banned-construction list and is the single
    // easiest way to turn this into a portal. The light has to belong
    // to the fracture, not to the centre.
    //
    // It also grows with uGDecay, so the more the monument fails the
    // more the ground carries. The plain is part of the ledger.
    float chan = skyFbm(q * 0.42 + vec2(uGTime * 0.055, uGTime * -0.021));
    float live = smoothstep(0.46, 0.78, chan);
    float carry = seam * live * uGBite * exp(-r * 0.014);
    // GATED ON DECAY, hard. At the opening uGDecay is zero: nothing has
    // failed, so the plain has nothing to carry - and yet these were the
    // brightest thing at the foot, pale worms wandering an intact floor.
    // Consequence before cause, exactly the read the ledger forbids. The
    // charge now arrives WITH the failure and grows with it.
    diffuseColor.rgb += lit * carry * uGDecay * (0.55 + 0.9 * uGDecay);
  }
}`
            )
            .replace(
              '#include <roughnessmap_fragment>',
              `#include <roughnessmap_fragment>
{
  float rr = length(vGroundW.xz);
  // polished where the light falls, dulling as it runs out to the dunes.
  // 0.24 was mirror enough that every dune ridge drew a banded specular
  // loop around the foot - the "water rings" read. 0.34 keeps the lane's
  // response and loses the rings.
  roughnessFactor = mix(0.34, 0.72, smoothstep(40.0, 340.0, rr))
                  + 0.06 * (gHash(floor(vGroundW.xz * 0.5)) - 0.5);
}`
            )
            .replace(
              '#include <fog_fragment>',
              `#ifdef FOG_EXP2
{
  // THE HORIZON, and the reason the shore does not simply move the old
  // edge further away. Fog carries the far plain to fogColor, which is
  // a good deal darker than the sky's glow at grazing angles, so a
  // plain that runs to the fog still cuts a straight line across it.
  // Out here the ground fogs toward the SKY instead, evaluated along
  // its own bearing so the azimuth drift matches at the join. The
  // plain stops being an object with an edge and becomes distance.
  // THE GROUND HAZE, 2026-08-21. Jacob: "the ground is too bright now,
  // keep hero fix".
  //
  // Measured first, and it killed three guesses. Cutting the plain's
  // albedo to a quarter moved it 16 percent; sanding it fully matte,
  // 22 to 33; dropping its skylight to nothing, 2. None of those is
  // what lights this plain. What lit it was that it had STOPPED being
  // fogged: the landing air was thinned from 0.0022 to 0.00106 to give
  // the hero its stone back, and the plain took the same gift, which it
  // did not need. Fog was always the term holding the ground down.
  //
  // So the air gets its height back instead. FogExp2 is uniform in y,
  // which no air is: haze pools low, and the plain lies in it along its
  // whole length while the monument stands up out of it. uGHaze is how
  // much denser the air is down here than at the hero's mid-height, so
  // the ground fogs as it did before and the hero keeps its 35 percent.
  // One lever, on the term that was doing the work all along.
  float gDensity = fogDensity * uGHaze;
  float fogFactor = 1.0 - exp(-gDensity * gDensity * vFogDepth * vFogDepth);
  vec3 bearing = normalize(vec3(vGroundW.x - cameraPosition.x, 0.0, vGroundW.z - cameraPosition.z));
  // lid amount is zero here on purpose: the bearing is horizontal, so
  // the lid contributes nothing at the horizon anyway and the ground
  // does not need a second uniform to say so
  // The blend starts at 2400, not at 700, and that number is the
  // furthest thing standing on the plain rather than a taste call.
  //
  // Objects fog to fogColor. This ground fogs toward the SKY. At the
  // same distance that leaves the ground bright and the object black,
  // so a distant mass became a silhouette sitting on a bright strip -
  // which is what "its hovering" actually was, and it was my own
  // horizon fix causing it. The furthest choir mass is at radius 2091,
  // so out to 2400 the ground stays fogColour and a foot merges into
  // ground of its own tone. Only past everything that stands on the
  // plain does it fade into the sky, and it reaches full sky by the
  // shore's rim, so the horizon still has no edge.
  //
  // ANYTHING PLACED FURTHER OUT THAN 2400 WILL HOVER AGAIN.
  vec3 far = mix(fogColor, skyAt(bearing, cameraPosition, uGSeverity, 0.0, 0.0, 1.0, 0.0, 0.0, uGTime), smoothstep(2400.0, 3550.0, length(vGroundW.xz)));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, far, fogFactor);
}
#endif`
            );
        };
        gltf.scene.traverse((o) => {
          if (!(o as THREE.Mesh).isMesh) return;
          const mesh = o as THREE.Mesh;
          if (mesh.name === 'Terrain') {
            const ground = new THREE.Mesh(mesh.geometry, terrainMat);
            ground.frustumCulled = false;
            this.scene.add(ground);
            this.scene.add(buildShore(mesh.geometry, terrainMat));
            return;
          }
          const body = new THREE.Mesh(mesh.geometry, this.monoMat);
          body.frustumCulled = false;
          this.scene.add(body);
        });
      })
      .catch((e) => {
        console.error('monument.glb failed to load; debris continues without its body', e);
      });
  }

  /**
   * Pin the lid's presence, 0 to 1, overriding the severity ramp.
   * Review affordance only, and the reason the ramp's two endpoints are
   * measured frames rather than numbers someone wrote down.
   */
  setLid(amount: number): void {
    this.lidOverride = Math.max(0, Math.min(1, amount));
    this.skyMat.uniforms.uLid!.value = this.lidOverride;
  }

  /** How far the decks bend toward the axis, 0 to 1. Review pin. */
  setDraw(amount: number): void {
    this.skyMat.uniforms.uDraw!.value = Math.max(0, Math.min(1, amount));
  }

  /** Deck anisotropy: 1 is the approved isotropic sky, lower is more
   *  layered. Review pin, because it changes an approved frame. */
  setStrata(amount: number): void {
    this.skyMat.uniforms.uStrata!.value = Math.max(0.1, Math.min(1, amount));
  }

  /** Gate 5 review pin: the torn opening above the crown. */
  setBreak(amount: number): void {
    this.skyMat.uniforms.uBreak!.value = Math.max(0, Math.min(3, amount));
  }

  /**
   * Gate I1 review pin: hold the brace open or force it shut, so the
   * held breath can be judged as an A/B without waiting out a scroll or
   * a fifty second idle. -1 hands it back to the world.
   */
  /** the crowded record at the wound. */
  setScript(amount: number): void {
    this.stoneU.uScript!.value = Math.max(0, Math.min(4, amount));
  }

  /**
   * TWILIGHT. 0 is the old night-with-a-lamp, 1 is the held blue hour,
   * and it runs past that for review. One dial for one state.
   */
  setTwilight(amount: number): void {
    const a = Math.max(0, Math.min(3, amount));
    this.skyMat.uniforms.uGlow!.value = a;
    this.groundU.uGlow!.value = a;
  }

  setStill(amount: number): void {
    this.stillPin = amount < 0 ? -1 : Math.max(0, Math.min(1, amount));
  }

  /** Gate 7 review pin: black point and pivot contrast, in that order. */
  setGrade(lift: number, contrast: number): void {
    this.grade.material.uniforms.uLift!.value = Math.max(0, Math.min(0.02, lift));
    this.grade.material.uniforms.uContrast!.value = Math.max(0.8, Math.min(1.4, contrast));
  }

  /** How open the shaft is, 0 to 1. Review pin. */
  setShaft(amount: number): void {
    this.skyMat.uniforms.uShaft!.value = Math.max(0, Math.min(1, amount));
  }

  /** How lit the choir masses are, 0 to 1. Review pin. */
  setChoirDim(amount: number): void {
    this.choir.setDim(amount);
  }

  /** Landing air density, FogExp2. Review pin; see THE AIR. */
  setFog(density: number): void {
    this.landingFog = Math.max(0, Math.min(0.01, density));
  }

  /** Air density at the plain, as a multiple of the hero's. See THE GROUND HAZE. */
  setGround(amount: number): void {
    this.groundU.uGHaze!.value = Math.max(1, Math.min(6, amount));
  }

  /** How far the plain has failed at the foot, 0 to 1. Review pin. */
  setBite(amount: number): void {
    this.groundU.uGBite!.value = Math.max(0, Math.min(1, amount));
  }

  /**
   * How hard the seam answers attention leaving the mass. 0 is silent;
   * the surge only reads once the peak clears the bloom pass's threshold
   * of 1.0, so this is a level to sweep against rendered frames, not a
   * number to argue about.
   */
  setSurge(amount: number): void {
    this.fissureMat.uniforms.uSurge!.value = Math.max(0, Math.min(4, amount));
  }

  /**
   * Seconds for the whole journey: both fronts leave the split together
   * and land on their own end together. Lower is quicker.
   */
  setSurgeTime(seconds: number): void {
    this.fissureMat.uniforms.uSurgeTime!.value = Math.max(0.08, Math.min(6, seconds));
  }

  /** Gate 3 review pin: the sky's grazing light on the outer edges. */
  setRim(amount: number): void {
    this.stoneU.uRim!.value = Math.max(0, Math.min(3, amount));
  }

  /**
   * Where a press lands: the point on the monument under the cursor.
   *
   * Jacob, 2026-08-22: "when i click on the hero holes are forming on
   * the base wtf?" The old path put a mark 14 units ahead of the CAMERA
   * - right for inside the cleft, where the wall is that close, and
   * wrong everywhere else: at the opening the camera is hundreds of
   * units out, so the point's height was the camera's height, the world
   * clamped it onto the face, and every press seated at the foot
   * whatever the visitor aimed at. The bright web used to bury the
   * evidence; gate 4's clean base put it on display.
   *
   * Same raycast the hover lamp uses, so where the monument answers
   * attention and where it takes a mark are one geometry. When the ray
   * misses the tower entirely, the old fixed reach stands - pressing
   * into the dark is still a press.
   */
  pressPoint(ndcX: number, ndcY: number): THREE.Vector3 {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hit = this.raycaster.ray.intersectBox(this.towerBox, new THREE.Vector3());
    if (hit) return hit;
    const dir = new THREE.Vector3(ndcX, ndcY, 0.5)
      .unproject(this.camera)
      .sub(this.camera.position)
      .normalize();
    return this.camera.position.clone().add(dir.multiplyScalar(14));
  }

  /**
   * How long a tail each front drags back toward the split, in uv. Short
   * (0.08) detaches the two fronts cleanly; long (0.25) keeps the split
   * point lit while they pull away.
   */
  setSurgeTail(uv: number): void {
    this.fissureMat.uniforms.uSurgeTail!.value = Math.max(0.02, Math.min(0.6, uv));
  }

  /** The visitor's attention: where they point at the monument. */
  setPointer(ndcX: number, ndcY: number): void {
    this.pointerNdc = { x: ndcX, y: ndcY };
    this.everPointed = true;
  }

  clearPointer(): void {
    this.pointerNdc = null;
  }

  /** Harness probe: first surface on a -z ray from (x, y, 200). The
   * proven placement technique here is measurement, not guessing. */
  probeSurface(x: number, y: number): { z: number; name: string } | null {
    const rc = new THREE.Raycaster(new THREE.Vector3(x, y, 200), new THREE.Vector3(0, 0, -1));
    const hits = rc.intersectObjects(this.scene.children, true);
    for (const h of hits) {
      if (h.object.visible && h.object.type !== 'Points') {
        let root: THREE.Object3D | null = h.object;
        while (root && !root.name && root.parent) root = root.parent;
        return { z: h.point.z, name: root?.name || h.object.type };
      }
    }
    return null;
  }

  update(_progress: number, dt: number, reduced: boolean): void {
    this.time += dt;
    // THE STILLNESS. Sinister gate 6, 2026-08-22, from the paper list,
    // and it knowingly OVERRULES the law written below: "the world is
    // never embalmed". On Jacob's word. If the visitor neither points
    // nor scrolls for about fifty seconds, every autonomous motion
    // eases to a dead stop over the next fifteen - the camera's own
    // drift, the sky's decks and lid, the watcher's idle sway, the
    // motes, the ground's charge - and the world holds its breath
    // until they move again. The drift existed so the world would
    // read alive; a thing that stops pretending to be alive once you
    // have watched it long enough is worse. Two things never freeze:
    // the visitor's hand (input causality is a kill test and parX/parY
    // stay live), and the seam with the monument's own skin - the
    // world is embalmed, the system is not. The witnessed cull lands
    // at 74 seconds, falling through a world that has gone completely
    // still.
    //
    // THE BRACE, gate I1, 2026-08-23. The same freeze, reached the other
    // way: by PROXIMITY instead of patience. As the visitor commits the
    // last of the approach to the mouth, the world holds its breath -
    // and it is the containment bracing, never a welcome.
    //
    // Jacob's objection is what shaped this, and it was right: the only
    // autonomous motion he can consciously see is the camera sway.
    // Everything else the stillness stops (deck rotation at 0.005 rad/s,
    // the lid at 0.0018, motes, the ground's charge) is below the
    // threshold of notice on its own, so stillness alone would be a
    // measurement rather than an event. The brace therefore carries a
    // second, perceptible cue: the watcher LOCKS. It stops wandering,
    // stops idling, and comes dead centre onto the visitor - see the
    // lock in THE WATCHER below.
    //
    // The third cue ChatGPT proposed - freezing the skin's own micro
    // activity - is deliberately NOT taken. Gate 6's law is that the
    // world is embalmed and the SYSTEM is not, and that distinction is
    // the whole meaning of the freeze. At the threshold it says exactly
    // the right thing: the world stops, and the thing inside does not.
    // ---- THE OPENING ----
    // Five beats on one scalar. Arrival .24-.32: the watcher fixes on
    // the visitor (the brace below). Refusal .34-.43: decay withdraws
    // every light the monument owns - the gold is being GATHERED, not
    // killed. The black beat. Parting .46-.60: the split spire finally
    // splits, and the light returns as THE CORE standing revealed in
    // the widening gap (Jacob's frames, 2026-08-29). Committal .60-.66:
    // through the shadow beside the core. The fall follows.
    const opP = this.path.progressValue;
    // EVERY STATE IS A PURE FUNCTION OF SCROLL POSITION - both ways.
    // And THE SEAM NEVER GOES DARK: the drain/refusal beat read as
    // "the gold seam is disappearing before the gates open, why is
    // that" (Jacob, 2026-08-29) - a bug report, not drama. The light
    // holds through the arrival and turns to LIGHTNING as the stone
    // parts. refusal is pinned dead, kept only so its wiring reads.
    const refusal = 0;
    // STRESS + PATH = FORM. incisionT: the seam gains depth before
    // width - the halves separate barely a hand's width. openT: the
    // RESOLUTION, where the negotiated form actually opens.
    // ONE CONTINUOUS PARTING - Jacob, 2026-08-29: "it illuminates then
    // goes dark then the opening happens its not coherent". It was
    // three disconnected events because partT held FLAT at 0.22 from
    // .10 to .19 - half the beat where the stone did not move and the
    // light did not change - so the ridges flared and died and the road
    // blacked out the seam in a dead window, and the opening then
    // started from scratch. Two stones being pulled apart do not pause.
    // The gap widens monotonically from the incision to the resolution;
    // X and Y are things seen IN that widening light, never instead of
    // it.
    const incisionT = smooth01(opP, 0.07, 0.1);
    // ---- THE SEAL IS SEIZED ----
    // Jacob's physical model, 2026-08-29, and the one that was missing:
    // the chamber is ancient, ruined and rugged, and "it cant just
    // split just like that ... it should feel opening as an event".
    // A smooth ramp is a machine part on rails. Stone that has been
    // shut for an age RESISTS, loads up, and breaks free - then seizes
    // again on the next bind, three times before it is open.
    //
    // Stick-slip as a pure function of scroll: within each stage the
    // stone is HELD for the first half and then gives across the
    // second. Nothing is latched, nothing integrates, nothing eases in
    // time - drag backwards and it binds and releases at exactly the
    // same three places. That is the law kept while the motion stops
    // being a glide.
    // LINEAR underneath, so the three binds are evenly spaced. An
    // eased ramp here stretched the first stage over 4 percent of the
    // page and crushed the last into one - the stone appeared stuck at
    // the start and then snapped open at the end. All the shaping
    // belongs to the stick-slip; the carrier stays a straight map from
    // scroll, which is the law anyway.
    const openRaw = Math.min(1, Math.max(0, (opP - 0.1) / 0.17));
    const STAGES = 3;
    const s = Math.min(openRaw, 1 - 1e-6) * STAGES;
    const stage = Math.floor(s);
    const withinStage = s - stage;
    // held, then the give. The bind takes the first 42 percent of each
    // stage and the release is fast but not instant - stone, not a
    // shutter, and short enough that the hold never reads as stuck.
    const give = smooth01(withinStage, 0.42, 0.95);
    const partT = incisionT * 0.15 + ((stage + give) / STAGES) * 0.85;
    // the grind is the SLIP ITSELF: nothing while the stone is bound,
    // hard through the release. The dust in the gap rides this, so the
    // seam sheds exactly when it tears free and settles while it holds.
    const grind = give * (1 - give) * 4;
    this.openBraceAmt = smooth01(opP, 0.06, 0.09) * (1 - smooth01(opP, 0.11, 0.16));
    this.stoneU.uPart!.value = partT * PART_TRAVEL;
    // THE DRAIN is geometric: the blade of light sinks into the floor,
    // top first, a bolt being drawn. The black wall stays - after the
    // light leaves, the slit is a dead mouth, which is the point.
    if (this.fisPlane) {
      // the resting seam stands until the widening sheet takes over
      // at matching width: one light, handed off, never absent.
      // A BOOLEAN IS NOT A HANDOFF. It cut the resting seam dead at
      // partT 0.06 while the gap light was still at a third, and the
      // measured brightness halved. The two now OVERLAP across the
      // whole early parting, so at every point in the crossover the
      // total is carried by one source or the other or both.
      this.fisPlane.scale.y = 1;
      this.fisPlane.position.y = 90;
      const hand = 1 - smooth01(partT, 0.04, 0.30);
      this.fissureMat.uniforms.uHand!.value = hand;
      this.fisPlane.visible = hand > 0.002;
    }
    // SEAMS DO NOT DISAPPEAR WHEN GATES OPEN - Jacob, 2026-08-29.
    // The light lives INSIDE: the refusal drains the crack, the stone
    // cracks in the dark, and light floods the gap the instant there
    // is a gap. The thin seam and the revealed column are one light,
    // continuous, only ever seen through a wider door.
    // wake is IMMEDIATE - no dark crack - and it now tracks the GAP
    // rather than the resolution beat. Keying the second term to openT
    // pinned the light at a third from .10 to .19 whatever the stone
    // did, which is the flat stretch that broke the read. Light is a
    // function of how far apart the stones are, and nothing else.
    const coreWake = smooth01(partT, 0.0, 0.06) * (0.25 + 0.75 * partT);
    if (this.coreParts.holder) this.coreParts.holder.visible = coreWake > 0.005;
    if (this.coreParts.column) {
      this.coreParts.column.uniforms.uWake!.value = coreWake;
      this.coreParts.column.uniforms.uTime!.value = this.time;
      this.coreParts.column.uniforms.uGrind!.value = grind;
      this.coreParts.column.uniforms.uOpen!.value = partT;
    }
    if (this.coreParts.columnMesh) {
      // THE SEAM GOES WITH THE SPIRE - Jacob, 2026-08-29. The light
      // belongs to the GAP: its edges ride the blades' inner edges as
      // they part, the thin seam widening into a sheet of light that
      // fills the opening. A fixed-width line in a widening gap reads
      // as nothing happening, because it is.
      const gap = 5 + 2 * partT * PART_TRAVEL;
      this.coreParts.columnMesh.scale.x = Math.max(0.5, gap / 4.4);
    }
    if (this.coreParts.pool) this.coreParts.pool.opacity = coreWake * 0.7;
    // the beats grade themselves: the black beat crushes, the reveal
    // burns. The flat audit keeps its zero.
    if (!this.flatAudit) {
      this.bloom.strength = 0.34;
    }
    this.renderer.toneMappingExposure = 1.1;
    // and the parted walls catch its warmth again
    this.stoneU.uDecay!.value = refusal * (1 - coreWake * 0.7);
    if (this.coreVoid) this.coreVoid.visible = partT > 0.01;
    // X: the ridges emerge through the incision and then RIDE THE
    // STONE. They hold at full once arrived - the only way they leave
    // is by travelling apart with the halves they are carved into and
    // passing out of the gap, which is what the rigid-body law
    // requires and what a fade can never look like. The dim at the end
    // belongs to the dive, not to the opening.
    this.stress.skin.uniforms.uX!.value =
      smooth01(opP, 0.09, 0.14) * (1 - smooth01(opP, 0.29, 0.33));
    // the halves' separation, in the skin's own units: the same
    // parting scalar the stone and the gap already run on, so the
    // ridges cannot drift out of agreement with the geometry.
    // THE INTERIOR WALL SPANS THE GAP AND NOTHING MORE. The skin is
    // authored 14 wide; widening the geometry to fit a 6-unit travel
    // would let a rectangle peek past the monument's silhouette, which
    // is a standing prohibition. So the plane SCALES to the gap
    // instead, and the ridge offset is converted into that scaled
    // frame - the ridges still translate by exactly PART_TRAVEL in
    // world units, so they stay rigid with the stone they are cut into.
    {
      const gapW = 5 + 2 * partT * PART_TRAVEL;
      this.stress.mesh.scale.x = gapW / 14;
      this.stress.skin.uniforms.uSpread!.value = (partT * PART_TRAVEL * 14) / gapW;
    }
    // Y: the shadow road is a darkness IN the light - a band crossing
    // the seam at the wrong angle, contained by construction. The 3D
    // wedge version read as a floating shard (recheck, 2026-08-29).
    if (this.coreParts.column) {
      this.coreParts.column.uniforms.uRoad!.value =
        smooth01(opP, 0.15, 0.19) * (1 - smooth01(opP, 0.21, 0.26));
    }
    const idleNow = !this.pointerNdc;
    this.idleT = idleNow ? this.idleT + dt : 0;
    this.braceAmt = 0;
    if (this.stillPin >= 0) this.braceAmt = this.stillPin;
    const wantStill = reduced
      ? 0
      : Math.max(smooth01(this.idleT, 48, 63), this.braceAmt, this.openBraceAmt);
    this.stillAmt += (wantStill - this.stillAmt) * (1 - Math.exp(-dt * 0.9));
    if (this.stillPin >= 0) this.stillAmt = this.stillPin;
    this.ambientT += dt * (1 - this.stillAmt);
    this.path.update(this.camera);
    this.delta.update(
      journeyAt(this.path.progressValue, this.detent, reduced),
      this.detent
    );
    // the lock resolves on approach and is absent from the stand
    {
      const hwGlow = 1.15 * smooth01(partT, 0.45, 0.85);
      for (const m of this.hardware.mats) m.emissiveIntensity = hwGlow;
      const hw = smooth01(this.path.progressValue, 0.03, 0.08);
      this.hardware.group.visible = hw > 0.005;
      if (this.hardware.group.visible) {
        for (const m of this.hardware.mats) m.opacity = hw;
      }
    }
    const inside = this.path.state.inside;
    if (!reduced) {
      // the world is never embalmed: the camera orbits its subject,
      // drifting on its own and leaning with the visitor's hand. The
      // hand's reach shrinks inside the cleft: the walls are close.
      // (Overruled during the long dwell - see THE STILLNESS above.)
      // 0.92: at the held station the look arm is 80 units, so even a
      // small yaw sways the eye in metres. The slit's half width at
      // camera height is about 1.9 units; full reach would put the
      // near plane through the wall.
      // THE DESCENT IS A STRAIGHT RAIL - Jacob, 2026-08-29: "camera is
      // going sideways rather than straight". Every keyframe sits at
      // x = 0, so the rail never was the fault: the pointer parallax
      // ORBITS the eye around the look point, and where the cursor
      // happened to rest while scrolling swung the whole frame. It is
      // also pointer-driven and time-smoothed, which breaks the law
      // that the journey is a pure function of scroll. So the lean
      // belongs to the STAND alone and is gone the moment the descent
      // starts - the camera only ever closes distance.
      const stand = Math.max(0, 1 - this.path.progressValue / 0.04);
      const reach = (1 - inside * 0.92) * stand;
      const px = this.pointerNdc ? this.pointerNdc.x : 0;
      const py = this.pointerNdc ? this.pointerNdc.y : 0;
      this.parX += (px - this.parX) * (1 - Math.exp(-dt * 1.6));

      // THE WATCHER follows the pointer, slowly. The lag is the whole
      // effect: something that snaps to the cursor is a UI widget,
      // something that takes half a second to come round is paying
      // attention. It fades out entirely once the visitor is inside the
      // cleft, where the blade is overhead and there is nothing left to
      // watch from.
      // IT DECIDES TO LOOK. A constant follow rate is a cursor readout,
      // and a readout is never sinister - it is a widget. The turn rate
      // scales with how far the pointer has got from where it is
      // already attending, so small movements are IGNORED and a real
      // move brings it round fast. Being beneath its notice is worse
      // than being tracked.
      //
      // THE LOCK, gate I1. Under the brace the watcher stops tracking
      // and comes to the centre - not to the cursor, to the VISITOR.
      // A light that has been loosely following the hand and then
      // fixes, dead still, on the middle of the screen is the one cue
      // at this threshold that cannot be missed, and it costs nothing
      // because both the target and the rate are already here.
      const bl = this.braceAmt;
      const tx = px * (1 - bl);
      const ty = py * (1 - bl);
      const werr = Math.hypot(tx - this.watchX, ty - this.watchY);
      const wrate = (0.22 + 8.0 * smooth01(werr, 0.09, 0.42)) * (1 + bl * 2.2);
      const watchK = 1 - Math.exp(-dt * wrate);
      this.watchX += (tx - this.watchX) * watchK;
      this.watchY += (ty - this.watchY) * watchK;
      // and it never holds perfectly still. Something motionless is an
      // object; something that drifts while it waits is alive.
      // (Except in THE STILLNESS: when the world stops pretending, so
      // does the watcher - its attention stays, its idling does not.)
      this.watchDrift += dt * (1 - this.stillAmt);
      const wdrift = Math.sin(this.watchDrift * 0.23) * 0.055
                   + Math.sin(this.watchDrift * 0.071) * 0.030;
      // IT WAS ALREADY LOOKING. Sinister gate 2, 2026-08-22, from the
      // paper list. Before any pointer has ever entered, the watcher is
      // not asleep waiting to be summoned - it is settled at moderate
      // presence, attending the centre of the screen, which is where
      // the visitor is. The drift keeps it alive. The first mouse move
      // does not wake it; it hands it a better target.
      //
      // Once a pointer has existed, absence means the visitor LEFT, and
      // the watcher lets go as before - that release is the wave's
      // moment and it stays untouched.
      // and under the brace it attends whether or not anyone is pointing
      const wantWatch = Math.max(
        this.pointerNdc ? 1 : this.everPointed ? 0 : 0.6,
        this.braceAmt
      );
      this.watchAmt += (wantWatch - this.watchAmt) * (1 - Math.exp(-dt * 1.1));
      const fu = this.fissureMat.uniforms;
      (fu.uWatch!.value as THREE.Vector2).set(this.watchX, this.watchY + wdrift);
      // inside the cleft the blade is overhead: nothing left to watch from
      const wAmt = this.watchAmt * (reduced ? 0.35 : 1) * (1 - inside);
      fu.uWatchAmt!.value = wAmt;
      // the same height in world units, so the rot can answer it: the
      // plane is 184 tall centred at 90, and the node sits at
      // 0.5 + 0.34*wy along it
      this.stoneU.uWatchY!.value = 90 + 62.6 * (this.watchY + wdrift);
      this.stoneU.uWatchAmt!.value = wAmt;
      this.parY += (py - this.parY) * (1 - Math.exp(-dt * 1.6));
      // OWNER CORRECTION, 2026-08-28: the autonomous camera sway made
      // the worked-metal response slide over the new lower ribs, so the
      // whole render looked as if it were continually resolving. Hold
      // the authored camera pose when the visitor is idle. Pointer
      // parallax remains intact and is still the only camera movement.
      const yaw = this.parX * 0.11 * reach;
      const pitch = this.parY * 0.055 * reach;
      const lookP = this.path.lookPoint;
      const off = this.camera.position.clone().sub(lookP);
      off.applyAxisAngle(UP, -yaw);
      const right = new THREE.Vector3().crossVectors(off, UP).normalize();
      off.applyAxisAngle(right, pitch);
      this.camera.position.copy(lookP).add(off);
      // THE FLOOR. Jacob, 2026-08-22: "the camera sway is going inside
      // the ground". The pitch above rotates the camera's OFFSET around
      // the look point, and at the opening that arm is 250 units long -
      // a pointer at the bottom edge pitched the eye seventeen units
      // DOWN, from a stand of ten, straight through the plain. It could
      // always dip; gate 6's lower stand made it plunge. The dunes run
      // to +6 out there and the stair treads to 6.4, so the eye never
      // goes below 8.2: the sway keeps its full range everywhere except
      // through the one boundary that is supposed to be solid. Inside
      // the cleft every key sits at 20 or higher, so this never binds.
      // (exterior only: during the fall the eye lives far below zero)
      if (this.camera.position.y < 8.2 && this.camera.position.y > -100) this.camera.position.y = 8.2;
      // the frame itself leans with the hand: the subject swings gently.
      // Gated by stand for the same reason as the orbit above - once the
      // descent begins the look target is on the axis and stays there.
      const sway = lookP.clone().addScaledVector(right.normalize(), -this.parX * 5.0 * stand);
      sway.y += -this.parY * 3.0 * stand;
      this.camera.lookAt(sway);
    }
    const sev = this.path.state.severity;
    // the refusal reaches ONLY light. Driving global decay was
    // photographed 2026-08-29: the clad discarded into checkerboard
    // confetti and the silhouette died with the rim. The stone's own
    // uDecay kills the gilding bounce; clad and records never decay.
    const decay = 0;
    const coreDecay = refusal;

    // The approved hero light rig is fixed.
    {
      const a = HERO_LIGHT;
      this.keyLight.intensity = a.i;
      this.keyLight.color.set(a.c);
      this.keyLight.position.set(a.d[0], a.d[1], a.d[2]);
      this.ambient.intensity = a.amb;
      this.scene.environmentIntensity = a.env;
      // the fill tracks the key, opposite and weak: never a second key
      this.fillLight.position.set(
        -this.keyLight.position.x,
        Math.abs(this.keyLight.position.y) * 0.45,
        -this.keyLight.position.z
      );
      this.fillLight.intensity = this.keyLight.intensity * 0.3;
    }

    const fogDensity = this.landingFog;
    // Gate 1: the fog tracks the darkened sky at the same forty percent,
    // or every hazed slab reads as a paler cutout against it.
    // TWILIGHT: fog is the colour of the air, and in a held blue hour
    // the air is not black. This is what stops the far plain and the
    // choir reading as cutouts against a lit sky - they now fog to
    // something that belongs to the same world.
    const fogColor = lerpColor('#0d141f', '#0a1019', sev);
    (this.scene.fog as THREE.FogExp2).color.copy(fogColor);
    (this.scene.fog as THREE.FogExp2).density = fogDensity;

    // the lamp follows attention; it wakes and settles smoothly
    let hoverTargetAmt = 0;
    if (this.pointerNdc) {
      this.raycaster.setFromCamera(
        new THREE.Vector2(this.pointerNdc.x, this.pointerNdc.y),
        this.camera
      );
      const hit = this.raycaster.ray.intersectBox(this.towerBox, new THREE.Vector3());
      if (hit) {
        const k = 1 - Math.exp(-dt * 7);
        this.hoverPoint.lerp(hit, this.hoverAmt < 0.02 ? 1 : k);
        hoverTargetAmt = 1;
      }
    }
    this.hoverAmt += (hoverTargetAmt - this.hoverAmt) * (1 - Math.exp(-dt * 5));

    // THE LEAVING CLOCK. Zero while the pointer is on the mass; it runs
    // the moment attention goes, and the seam surges off it. Gated on the
    // tower box rather than on the window, so it answers the cursor being
    // taken off the HERO and not only the cursor leaving the page - which
    // is the gesture Jacob has been describing all along.
    // The height it left FROM travels with it: the blade plane is 184
    // units tall centred at 90, which is the mapping the watcher already
    // uses in the other direction at uWatchY.
    if (hoverTargetAmt > 0.5) {
      this.wakeT = 0;
      this.wakeY = Math.max(0, Math.min(1, 0.5 + (this.hoverPoint.y - 90) / 184.1));
    } else if (this.wakeT < 8) {
      this.wakeT += dt;
    }
    const fsu = this.fissureMat.uniforms;
    fsu.uWakeT!.value = reduced ? 99 : this.wakeT;
    fsu.uWakeY!.value = this.wakeY;

    for (const mat of [this.cladMat]) {
      const cu = mat.uniforms;
      cu.uDecay!.value = decay;
      cu.uTime!.value = this.time;
      cu.uSeverity!.value = sev;
      cu.uCalm!.value = reduced ? 1 : 0;
      cu.uCalmV!.value = reduced ? 1 : 0;
      (cu.uHover!.value as THREE.Vector3).copy(this.hoverPoint);
      cu.uHoverAmt!.value = this.hoverAmt;
      (cu.uInner!.value as THREE.Vector3).copy(this.camera.position);
      cu.uInnerAmt!.value = inside * 0.35;
      cu.uFogDensity!.value = fogDensity;
      (cu.uFogColor!.value as THREE.Color).copy(fogColor);
    }

    this.skyMat.uniforms.uSeverity!.value = sev;
    // THE LID'S PRESENCE. Jacob approved two frames, and they are not
    // the same setting: the landing frame at 0.30 and the studio foot
    // at 0.85. One global value cannot serve both - 0.85 at landing
    // announces a roof, which he explicitly forbade, and 0.30 at the
    // foot is invisible. So presence rides severity, which is 0.0 at
    // the landing key and 0.88 at the foot, and 0.30 + 0.625 * sev
    // lands on his two frames exactly.
    //
    // This is also the read he specified: first depth, then WRONG
    // depth. The enclosure becomes apparent as the world turns, and it
    // rides the same grade that already moves the whole palette rather
    // than being a new kind of change in the sky.
    //
    // Note the lid is scaled by `glow`, which cools and dims with
    // severity. That coupling is NOT a bug to fix: it is part of what
    // produced the frame he approved, and removing it would make the
    // foot 1.6x brighter than what he saw.
    if (this.lidOverride === null) {
      this.skyMat.uniforms.uLid!.value = 0.3 + 0.625 * sev;
    }
    this.fissureMat.uniforms.uSeverity!.value = sev;
    this.fissureMat.uniforms.uDecay!.value = coreDecay;
    // the revealed core burns, and it is not still: the surge system
    // carries the turbulence while the blades stand apart
    if (partT > 0.01) {
      const fsurge = this.fissureMat.uniforms.uSurge!;
      fsurge.value = Math.max(fsurge.value as number, partT * 2.0);
    }
    this.fissureMat.uniforms.uNear!.value = inside;
    // ambient motions ride the stillness clock - gate 6
    this.fieldMat.uniforms.uTime!.value = reduced ? 0 : this.ambientT;
    this.mistMat.uniforms.uTime!.value = reduced ? 0 : this.ambientT;

    (this.mistMat.uniforms.uFog!.value as THREE.Color).copy(fogColor);
    this.fieldMat.uniforms.uSeverity!.value = sev;
    (this.fieldMat.uniforms.uFog!.value as THREE.Color).copy(fogColor);
    (this.strataMat.uniforms.uFog!.value as THREE.Color).copy(fogColor);
    this.hazeMat.uniforms.uSeverity!.value = sev;
    this.hazeMat.uniforms.uDecay!.value = coreDecay;
    this.skyMat.uniforms.uTime!.value = reduced ? 0 : this.ambientT;
    this.groundU.uGTime!.value = reduced ? 0 : this.ambientT;
    this.groundU.uGSeverity!.value = sev;
    this.groundU.uGDecay!.value = decay;
    // bloom must not smear the fissure across the walls in there
    this.bloom.strength = this.flatAudit ? 0 : 0.34;

    // holiness dims as the monument strips. The crown halo it used to
    // drive is deleted (E0); the sky's pressure lift carries this now,
    // and it is driven from the same decay term inside skyAt.

    this.scree.count = 0;

    if (this.world.strikesDirty) {
      this.strikeAttr.needsUpdate = true;
      this.world.strikesDirty = false;
    }

    // THE SIGNAL. The skin is the visible face of the mechanism, so
    // the law drives it: a strike floods the surface and it settles
    // back toward inert. Idle keeps a slow breath so it is never dead
    if (this.world.tick !== this.lastStrikeTick && this.world.strikesDirty) {
      this.signal = 1;
      this.lastStrikeTick = this.world.tick;
    }
    this.signal *= Math.exp(-dt * 0.5);
    const idle = reduced ? 0.06 : 0.09 + 0.05 * Math.sin(this.time * 0.11);
    const signal = Math.min(1, this.signal + idle);

    // CROSS-GAP ALIGNMENT, camera driven: when the eye comes square to
    // the fissure, the faces either side of it agree for a moment
    const toSpire = this.camera.position.clone().setY(0);
    const align = toSpire.lengthSq() > 1 ? Math.abs(toSpire.normalize().x) : 0;
    const alignAmt = smooth01(1 - align, 0.86, 1.0);

    for (const mu of [this.stoneU]) {
      mu.uTime!.value = this.time;
      mu.uDecay!.value = decay;
      mu.uSeverity!.value = sev;
      mu.uCalm!.value = reduced ? 1 : 0;
      (mu.uHover!.value as THREE.Vector3).copy(this.hoverPoint);
      mu.uHoverAmt!.value = this.hoverAmt;
      (mu.uInner!.value as THREE.Vector3).copy(this.camera.position);
      mu.uInnerAmt!.value = inside * 0.35;
      if (mu.uSignal) mu.uSignal.value = signal;
      if (mu.uAlign) mu.uAlign.value = alignAmt;
      if (mu.uFogColor) (mu.uFogColor.value as THREE.Color).copy(fogColor);
      if (mu.uFogDensity) mu.uFogDensity.value = fogDensity;
    }
    this.markMat.uniforms.uTime!.value = this.world.tick / 60;
    this.moteMat.uniforms.uTime!.value = reduced ? 0 : this.ambientT;
    this.moteMat.uniforms.uSeverity!.value = sev;
    this.moteMat.uniforms.uAmt!.value = 1;
    const marks = this.world.marks;
    for (let m = 0; m < marks.length; m++) {
      const mk = marks[m]!;
      this.markPos[m * 3] = mk.x;
      this.markPos[m * 3 + 1] = mk.y;
      this.markPos[m * 3 + 2] = mk.z;
      this.markBorn[m] = mk.bornTick / 60;
      // the same marks, into the stone's own field - see THE PRESSES
      // EAT THE STONE. The sprite path is retired: draw range stays 0.
      const mv = this.stoneU.uMarks!.value as THREE.Vector4[];
      mv[m]!.set(mk.x, mk.y, mk.z, mk.bornTick / 60);
    }
    this.stoneU.uMarkN!.value = marks.length;
    // the culls, by the same route: world state in, stone opens
    const pits = this.world.cullPits;
    const cvv = this.stoneU.uCulls!.value as THREE.Vector4[];
    for (let ci = 0; ci < pits.length; ci++) {
      const p = pits[ci]!;
      cvv[ci]!.set(p.x, p.y, p.z, p.tick / 60);
    }
    this.stoneU.uCullN!.value = pits.length;
    this.markGeom.setDrawRange(0, 0);
    this.markGeom.attributes.position!.needsUpdate = true;
    this.markGeom.attributes.aBorn!.needsUpdate = true;

    // the choir: three inputs, none of which move a single vertex
    this.choir.update({ progress: 0, severity: sev, alignment: alignAmt });

    // survey annotations track their anchors
    const v = new THREE.Vector3();
    for (const a of this.annos) {
      if (!a.el) continue;
      v.copy(a.point).project(this.camera);
      const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      const phase = false;
      a.el.style.opacity = vis && phase && !reduced ? '1' : phase && vis ? '1' : '0';
      if (vis) {
        a.el.style.left = ((v.x * 0.5 + 0.5) * window.innerWidth).toFixed(1) + 'px';
        a.el.style.top = ((-v.y * 0.5 + 0.5) * window.innerHeight).toFixed(1) + 'px';
      }
    }

    this.composer.render();
  }

  private readonly resize = (): void => {
    // SUPERSAMPLED, Jacob 2026-08-27: "its looks pixelated and rough
    // and not sharp at all". His display reports devicePixelRatio 1,
    // and min(dpr, cap) meant the 1.75 headroom was never used - the
    // frame rendered exactly 1:1, where even multisampled edges read
    // soft. A floor of 1.5 renders above native and downscales, which
    // is what sharp looks like on a standard-density monitor. The
    // low-tier cap still binds through maxDpr.
    const pr = Math.min(Math.max(window.devicePixelRatio, 2), this.maxDpr);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.markMat.uniforms.uScale!.value = window.innerHeight * pr * 0.8;
    if (this.moteMat) this.moteMat.uniforms.uScale!.value = window.innerHeight * pr * 0.8;
  };

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
  }
}

/** tiny local PRNG for cosmetic scatter (not authoritative state) */
function mulberry32ish(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}



function lerpColor(a: string, b: string, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

function smooth01(x: number, a: number, b: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
