import * as THREE from 'three';
import {
  computeFamilies,
  SECTIONS,
  TICKS,
  BLADE,
  type Detent,
  type Families
} from '../core/Delta';
import type { JourneyState } from '../core/Journey';
import { mulberry32 } from '../core/rng';
import { FORM_H, prongCentre, surfacePoint, cutPlaneX } from '../world/monumentForm';

/**
 * THE DELTA ACT: X, Y and Z as one world. docs/THE_DELTA.md, built under
 * Jacob's godmode order of 2026-08-30 with the hero-anchored blockout as
 * the interim art target and the Control/Returnal studies as reference
 * law (docs/refs/). Section 8's frame test is the acceptance test for
 * what this renders; Jacob judges it on his own GPU.
 *
 * The world lives far below the entrance (DELTA_Y) in its own void
 * shell, entered through the crossing veil the entrance already owns.
 * Inside is the Split Spire again - the same form maths - stacked as
 * 48 strata: the monolith X scrubs, the body Y breaks open, the field Z
 * unfolds. One object, excavated for the whole journey.
 *
 * EVERYTHING DISPLAYED IS A KERNEL VALUE:
 *   - X's settling      = baseline offset per section per tick
 *   - Y's departures    = |altered - baseline| per section per tick
 *   - Z's unfolding     = the same gaps, display-expanded by unfold
 *   - the blade's nudge = the detent itself
 * The stated display constants (gamma, scales, lean) are the legend on
 * the map - how the fact is drawn, never a second fact. Nothing here
 * owns state: it renders (scroll, detent) and forgets.
 */

export const DELTA_Y = -3260;

/** display law, carried over from the judged blockout */
const GAP_MAX = 170;
const GAP_GAMMA = 0.36;
/** how far X's baseline settling shears a stratum, world units per unit
 * offset. 30 was the JENGA: offsets of 0.1-0.3 became 3-9 unit random
 * staggers and the monolith read as a tower of loose bricks mid-pull
 * (Jacob, 2026-08-30, with a screenshot). The settling is a MOVEMENT to
 * watch, not a misalignment to wear: at 9 the strata visibly work as X
 * scrubs and land aligned enough to stay one carved mass. */
const SHEAR = 9;
/** Y shows the sockets cracking; Z expands the same gaps to inhabitable.
 * 0.22 read as "nothing significant happening after 55" (Jacob,
 * 2026-08-30 contact sheet) - the sockets have to visibly OPEN in Y. */
const DEPART_BASE = 0.45;
/** the blade's own displacement per detent notch */
const BLADE_STEP = 2.4;

interface Frag {
  mesh: THREE.Mesh;
  base: THREE.Vector3;
  section: number;
  side: 0 | 1;
  mobile: boolean;
  dir: THREE.Vector3;
  trail: number;
  leanAxis: THREE.Vector3;
  leanAngle: number;
  sagK: number;
  isBlade: boolean;
}

interface Chip {
  mesh: THREE.Mesh;
  base: THREE.Vector3;
  section: number;
  dir: THREE.Vector3;
  frac: number;
  scatter: THREE.Vector3;
  sagK: number;
}

export class DeltaAct {
  readonly group = new THREE.Group();
  private readonly frags: Frag[] = [];
  private readonly chips: Chip[] = [];
  private readonly fam: Families;
  /** flattened [tick * SECTIONS + i] */
  private readonly baseOff: Float32Array;
  private readonly gapPos: Float32Array;
  private readonly gapNeg: Float32Array;
  private readonly widestPos: number;
  private readonly widestNeg: number;
  /** first tick each section's future visibly diverges, per family */
  private readonly onsetPos: Float32Array;
  private readonly onsetNeg: Float32Array;
  /** first tick each section crossed its threshold, Infinity if never */
  private readonly yieldTick: Float32Array;
  /** signed display amplitude of that section's yield snap */
  private readonly waveAmp: Float32Array;
  /** which half departs per section, fixed at seeding */
  private readonly mobileSide = new Uint8Array(SECTIONS);
  private readonly bladeLamp: THREE.PointLight;
  private readonly goldFaceMat: THREE.MeshStandardMaterial;
  /** THE SHATTER: every departing section detonates into shards */
  private shardMesh!: THREE.InstancedMesh;
  private readonly shards: Array<{
    section: number;
    origin: THREE.Vector3;
    dir: THREE.Vector3;
    frac: number;
    size: number;
    axis: THREE.Vector3;
    spin: number;
    sagK: number;
  }> = [];
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly m4 = new THREE.Matrix4();
  private readonly vScale = new THREE.Vector3();

  constructor(seed: number) {
    this.group.position.y = DELTA_Y;
    this.group.visible = false;

    this.fam = computeFamilies(seed);
    this.baseOff = new Float32Array(TICKS * SECTIONS);
    this.gapPos = new Float32Array(TICKS * SECTIONS);
    this.gapNeg = new Float32Array(TICKS * SECTIONS);
    for (let t = 0; t < TICKS; t++) {
      const bf = this.fam.baseline.frames[t]!;
      const gp = this.fam.delta.get(1)!.frames[t]!.gap;
      const gn = this.fam.delta.get(-1)!.frames[t]!.gap;
      for (let i = 0; i < SECTIONS; i++) {
        this.baseOff[t * SECTIONS + i] = bf[i]!.offset;
        this.gapPos[t * SECTIONS + i] = gp[i]!;
        this.gapNeg[t * SECTIONS + i] = gn[i]!;
      }
    }
    const lastRow = (arr: Float32Array): number => {
      let m = 0;
      for (let i = 0; i < SECTIONS; i++) m = Math.max(m, arr[(TICKS - 1) * SECTIONS + i]!);
      return m;
    };
    this.widestPos = lastRow(this.gapPos);
    this.widestNeg = lastRow(this.gapNeg);

    // THE TEAR ORDER. "A drag rather than something crazy" - Jacob,
    // 2026-08-30. Smooth growth is a drift; the kernel's real story is
    // thresholds CRACKING. Each section now tears out as an EVENT at
    // its own onset tick - the first tick its future visibly diverges
    // - fast, with a jolt through the whole stack. Order and moment
    // come straight from the data; only the shape of the arrival is
    // display. Reverse the scroll and the tears un-happen in order.
    this.onsetPos = new Float32Array(SECTIONS).fill(Infinity);
    this.onsetNeg = new Float32Array(SECTIONS).fill(Infinity);
    for (let i = 0; i < SECTIONS; i++) {
      for (let t = 0; t < TICKS; t++) {
        if (this.onsetPos[i] === Infinity && this.gapPos[t * SECTIONS + i]! > this.widestPos * 0.01) this.onsetPos[i] = t;
        if (this.onsetNeg[i] === Infinity && this.gapNeg[t * SECTIONS + i]! > this.widestNeg * 0.01) this.onsetNeg[i] = t;
        if (this.onsetPos[i] !== Infinity && this.onsetNeg[i] !== Infinity) break;
      }
    }

    // THE YIELD WAVE. "No blocks are changing, they are just moving by
    // negligible value" - Jacob, 2026-08-30. The kernel's real events
    // are DISCRETE: a section crosses its threshold once, at one tick.
    // X now shows exactly that: when a stratum yields it snaps sideways
    // and settles back over the following ticks, so scrubbing runs a
    // wave of visible give down the stack - computation you can watch,
    // in the deterministic order the thresholds actually fire. Pure
    // function of tick, both directions.
    this.yieldTick = new Float32Array(SECTIONS).fill(Infinity);
    for (let i = 0; i < SECTIONS; i++) {
      for (let t = 0; t < TICKS; t++) {
        if (this.fam.baseline.frames[t]![i]!.yielded) {
          this.yieldTick[i] = t;
          break;
        }
      }
    }
    this.waveAmp = new Float32Array(SECTIONS);
    {
      const wr = mulberry32((seed ^ 0x77a3e) | 0);
      for (let i = 0; i < SECTIONS; i++) {
        this.waveAmp[i] = (5 + wr() * 5) * (wr() < 0.5 ? -1 : 1);
      }
    }

    // ---- the interior void: X is inside the line, and inside the line
    // there is no sky. A shell owns the background completely.
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0x04060a, side: THREE.BackSide, fog: false })
    );
    shell.position.y = FORM_H * 0.5;
    this.group.add(shell);

    // ---- THE LIGHT SCORE. Cutting the borrowed fog revealed the act
    // had no light of its own: black-on-black, "instead of blue its
    // black now" (Jacob, 2026-08-30). The law already written for this:
    // dark regions rich with scattered light, real highlights, light
    // CONCENTRATED not sprayed. So the SEAM is the light source of
    // this world - the cleft glows from within and the walls catch it
    // warm, while a cold key rakes the outer strata and a faint rim
    // holds the silhouette off the void.
    this.group.add(new THREE.HemisphereLight(0x323b46, 0x080b0f, 1.35));
    const key = new THREE.DirectionalLight(0xcfdae6, 2.5);
    key.position.set(-180, 340, 240);
    this.group.add(key);
    const rim = new THREE.DirectionalLight(0x8fa0b4, 0.95);
    rim.position.set(220, 120, -260);
    this.group.add(rim);
    // the seam lights its own canyon - the CLEFT WALLS, not the front
    // face. At 1.5/280 these washed the whole facade into a flat gold
    // billboard (photographed 2026-08-30): sprayed, not concentrated.
    // Tight falloff keeps the warmth in the slit where the line lives.
    for (const y of [FORM_H * 0.25, FORM_H * 0.55, FORM_H * 0.85]) {
      const glow = new THREE.PointLight(0xd9b070, 0.85, 120, 2.0);
      glow.position.set(0, y, 0);
      this.group.add(glow);
    }
    // a WHISPER of a lamp: at 1.1 it turned every gilded inner face
    // within reach into a billboard (photographed 2026-08-30)
    this.bladeLamp = new THREE.PointLight(0xd9b070, 0.0, 55, 2.0);
    this.bladeLamp.position.set(0, ((BLADE + 0.5) / SECTIONS) * FORM_H, 10);
    this.group.add(this.bladeLamp);

    // ---- the seam, continuous with the one line the visitor has
    // followed since the hero: the worldline through the whole stack
    const seam = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, FORM_H * 1.04, 1.1),
      // old rustic gold - the light of the place, not a torch in the
      // face (Jacob, 2026-08-30: "blinding")
      new THREE.MeshBasicMaterial({ color: 0xcaa25e, fog: false })
    );
    seam.position.set(0, FORM_H / 2, 0);
    this.group.add(seam);

    // ---- materials: the monument's own register, judged in the
    // blockout. Bloom and ACES live upstream, so intensities stay shy.
    // fog:false everywhere in the act: the entrance drives scene.fog
    // from its SKY each frame, and at arrival distance that washed the
    // whole monolith blue - "still something blue at gate open"
    // (Jacob, 2026-08-30). The act does its own depth cueing.
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0x151a20,
      roughness: 0.84,
      metalness: 0.16,
      flatShading: true,
      fog: false
    });
    const movedMat = plateMat.clone();
    movedMat.color = new THREE.Color(0x1c222a);

    /**
     * THE STONE SKIN. Jacob, 2026-08-30, with his boards: "whats so
     * great about showing jenga blocks". Fair - the slabs were bare
     * placeholders. This is the skin: cracked weathered rock, gold
     * surviving only in the deepest crack cores, worn edges, and
     * aerial haze with distance. Same proven recipe as the entrance
     * monument (warped field level set over its own gradient - never
     * a threshold on noise), sampled in LOCAL coordinates plus a
     * per-mesh seed, so the pattern RIDES each piece rigidly when it
     * departs. Nothing swims.
     */
    const stoneSkin = (m: THREE.MeshStandardMaterial): void => {
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace(
            '#include <common>',
            `#include <common>
attribute float aSkinSeed;
varying vec3 vSkinP;
varying vec3 vSkinN;
varying float vSkinSeed;`
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
vSkinP = position;
vSkinN = normal;
vSkinSeed = aSkinSeed;`
          );
        sh.fragmentShader = sh.fragmentShader
          .replace(
            '#include <common>',
            [
              '#include <common>',
              'varying vec3 vSkinP;',
              'varying vec3 vSkinN;',
              'varying float vSkinSeed;',
              'float skHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
              'float skNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);',
              '  return mix(mix(skHash(i),skHash(i+vec2(1.,0.)),f.x),mix(skHash(i+vec2(0.,1.)),skHash(i+vec2(1.,1.)),f.x),f.y);}',
              'float skFbm(vec2 p){float s=0.,a=.5;for(int k=0;k<4;k++){s+=a*skNoise(p);p*=2.03;a*=.5;}return s/.9375;}',
              'vec2 skQ(){vec3 an=abs(vSkinN);',
              '  vec2 q = an.y>0.6 ? vSkinP.xz : (an.x>an.z ? vSkinP.zy : vSkinP.xy);',
              '  return q + vSkinSeed;}'
            ].join('\n')
          )
          .replace(
            '#include <map_fragment>',
            [
              '#include <map_fragment>',
              '{',
              '  vec2 q = skQ();',
              '  // cracks: warped field level set over its own gradient',
              '  vec2 w = q*0.34 + (vec2(skFbm(q*0.11), skFbm(q*0.11+19.7))-0.5)*2.8;',
              '  float f = skFbm(w)-0.5;',
              '  float g = length(vec2(dFdx(f),dFdy(f)))+1e-5;',
              '  float crack = 1.0 - smoothstep(0.0, 1.9, abs(f)/g);',
              '  // broad weathering territories, no two beds alike',
              '  float wear = skFbm(q*0.06);',
              '  diffuseColor.rgb *= 0.78 + 0.5*wear;',
              '  diffuseColor.rgb *= 1.0 - crack*0.6;',
              '  // chipped edges catch the cold light',
              '  float edge = smoothstep(0.4, 1.5, length(fwidth(vSkinN))*16.0);',
              '  diffuseColor.rgb += vec3(0.045,0.05,0.058)*edge;',
              '}'
            ].join('\n')
          )
          .replace(
            '#include <emissivemap_fragment>',
            [
              '#include <emissivemap_fragment>',
              '{',
              '  vec2 q = skQ();',
              '  vec2 w = q*0.34 + (vec2(skFbm(q*0.11), skFbm(q*0.11+19.7))-0.5)*2.8;',
              '  float f = skFbm(w)-0.5;',
              '  float g = length(vec2(dFdx(f),dFdy(f)))+1e-5;',
              '  float core = 1.0 - smoothstep(0.0, 0.65, abs(f)/g);',
              '  // gold survives only in the deepest cracks, in runs, not everywhere',
              '  float sel = smoothstep(0.6, 0.85, skFbm(q*0.028+7.0));',
              '  totalEmissiveRadiance += vec3(0.62,0.44,0.17) * core * sel * 0.55;',
              '  // aerial haze: the air has body, distance reads as depth',
              '  float dist = length(vViewPosition);',
              '  totalEmissiveRadiance += vec3(0.035,0.045,0.06) * smoothstep(70.0, 420.0, dist);',
              '}'
            ].join('\n')
          );
      };
    };
    stoneSkin(plateMat);
    stoneSkin(movedMat);
    this.goldFaceMat = new THREE.MeshStandardMaterial({
      color: 0x1c1710,
      emissive: 0xb98a3c,
      emissiveIntensity: 0.13,
      roughness: 0.62,
      // near-dielectric: at 0.35 the warm lamp mirrored off every
      // gilded face and re-created the painted-panel fault by light
      metalness: 0.12,
      flatShading: true,
      fog: false
    });
    const chipMat = plateMat.clone();
    chipMat.color = new THREE.Color(0x11151b);
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x23180c,
      emissive: 0xd9b070,
      emissiveIntensity: 0.22,
      roughness: 0.45,
      metalness: 0.4,
      flatShading: true,
      fog: false
    });

    // ---- the strata body, the blockout's construction verbatim:
    // both halves at full form extent per band, seeded thickness and
    // fragmentation, single-copy departures, gold on the seam-facing
    // face, restraint on the lean, chips as the fine tier.
    const rng = mulberry32((seed ^ 0x2b10c) | 0);
    const slabH = FORM_H / SECTIONS;
    const finalPos = (i: number): number => this.gapPos[(TICKS - 1) * SECTIONS + i]!;
    const finalNeg = (i: number): number => this.gapNeg[(TICKS - 1) * SECTIONS + i]!;

    for (let i = 0; i < SECTIONS; i++) {
      const t = (i + 0.5) / SECTIONS;
      const mobile = (rng() < 0.5 ? 0 : 1) as 0 | 1;
      this.mobileSide[i] = mobile;
      const u = rng();

      for (const side of [0, 1] as const) {
        const c = prongCentre(t, side);
        const sp = surfacePoint(t, side, u);
        const dir = new THREE.Vector3(sp.x - c.x, 0, sp.z - c.z).normalize();

        const inner = cutPlaneX(t, side);
        const reach = Math.abs(surfacePoint(t, side, 0.5).x - inner);
        const depth = Math.abs(surfacePoint(t, side, 0).z) * 2;
        const w = Math.max(2, reach);
        const d = Math.max(2, depth);
        const sgn = side === 0 ? -1 : 1;
        const cx = inner + sgn * (w / 2);
        // beds interpenetrate: consecutive strata overlap so the body
        // reads as one carved mass, not stacked courses
        const th = slabH * (1.05 + rng() * 1.3);

        const isMobile = side === mobile;
        const nFrag = 1 + Math.floor(rng() * 3);
        let zEdge = -d / 2;
        for (let f = 0; f < nFrag; f++) {
          const fd = (d / nFrag) * (0.7 + rng() * 0.7);
          // near-full width: fragment INSETS at this scale were teeth
          const fw = w * (0.94 + rng() * 0.06);
          const fz = Math.min(zEdge + fd / 2, d / 2 - fd / 2);
          zEdge += fd;

          const isBlade = i === BLADE && isMobile && f === 0;
          const geo = new THREE.BoxGeometry(fw, th, fd);
          // per-mesh skin seed: the crack pattern is unique per piece
          // and rides it rigidly when it departs
          geo.setAttribute(
            'aSkinSeed',
            new THREE.BufferAttribute(
              new Float32Array(geo.attributes.position!.count).fill(rng() * 220),
              1
            )
          );
          let mat: THREE.Material | THREE.Material[] = plateMat;
          if (isBlade) {
            mat = bladeMat;
          } else if (isMobile) {
            const faces: THREE.Material[] = [movedMat, movedMat, movedMat, movedMat, movedMat, movedMat];
            faces[side === 1 ? 1 : 0] = this.goldFaceMat;
            mat = faces;
          }
          const mesh = new THREE.Mesh(geo, mat);
          // jitter cut 2.4 -> 0.7: part of the jenga read
          const base = new THREE.Vector3(cx + sgn * (rng() - 0.5) * 0.7, t * FORM_H, fz);
          mesh.position.copy(base);
          this.group.add(mesh);

          const trail = f === 0 ? 1 : f === 1 ? 0.55 + rng() * 0.15 : 0.26 + rng() * 0.12;
          const leans = rng() < (f === 0 ? 0.3 : 0.5);
          this.frags.push({
            mesh,
            base,
            section: i,
            side,
            mobile: isMobile,
            dir,
            trail,
            leanAxis: new THREE.Vector3(-dir.z, 0, dir.x).normalize(),
            leanAngle: leans ? (0.05 + rng() * 0.14) * (rng() < 0.5 ? -1 : 1) : 0,
            sagK: 0.06 + rng() * 0.1,
            isBlade
          });
        }

        // the fine tier travels with any band that can depart in
        // EITHER future; it scales in with the live displacement
        if (isMobile && (finalPos(i) > 0 || finalNeg(i) > 0)) {
          const ax = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
          const nChips = 8 + Math.floor(rng() * 9);
          for (let k = 0; k < nChips; k++) {
            const cSize = 0.5 + rng() * 1.7;
            const chip = new THREE.Mesh(
              new THREE.BoxGeometry(cSize, cSize * (0.5 + rng() * 0.7), cSize * (0.6 + rng() * 0.8)),
              chipMat
            );
            chip.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
            chip.visible = false;
            this.group.add(chip);
            const frac = 0.12 + rng() * 0.84;
            this.chips.push({
              mesh: chip,
              base: new THREE.Vector3(cx, t * FORM_H + (rng() - 0.5) * slabH, (rng() - 0.5) * d * 0.8),
              section: i,
              dir,
              frac,
              scatter: ax.clone().multiplyScalar((rng() - 0.5) * (3 + frac * 9)),
              sagK: 0.06 + rng() * 0.1
            });
          }
        }
      }
    }

    this.buildShatter(seed);
  }

  private buildShatter(seedBase: number): void {
    // THE SHATTER CASCADE. Jacob, 2026-08-30: "you can break the
    // barrier ... create something. this is just sad and bland." The
    // honest diagnosis: sliding slabs could be keyframed by hand, so
    // they prove nothing about the engine. An arrested detonation of
    // four thousand shards that scrubs BACKWARD perfectly cannot be
    // hand-animated - reversibility at that scale IS the showcase.
    // Cornelia Parker's exploded shed, not a jenga tower: the monument
    // hangs mid-blast around its own gold line, dead still, and scroll
    // is the only clock.
    //
    // Determinism is untouched: each shard's cone, fraction, tumble and
    // size are seeded; its moment is its section's real onset tick; its
    // reach is the section's real computed gap through the display law.
    const rng = mulberry32((seedBase ^ 0x5a11) | 0);
    const PER = 210;
    const sections: number[] = [];
    for (let i = 0; i < SECTIONS; i++) {
      if (this.onsetPos[i] !== Infinity || this.onsetNeg[i] !== Infinity) sections.push(i);
    }
    const total = sections.length * PER;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1a2027,
      roughness: 0.8,
      metalness: 0.18,
      flatShading: true,
      fog: false
    });
    this.shardMesh = new THREE.InstancedMesh(geo, mat, total);
    this.shardMesh.frustumCulled = false;
    this.group.add(this.shardMesh);

    for (const i of sections) {
      const t = (i + 0.5) / SECTIONS;
      const side = this.mobileSide[i]! as 0 | 1;
      const c = prongCentre(t, side);
      const sp = surfacePoint(t, side, 0.5);
      const spall = new THREE.Vector3(sp.x - c.x, 0, sp.z - c.z).normalize();
      const originX = cutPlaneX(t, side) + (side === 0 ? -1 : 1) * Math.abs(sp.x - cutPlaneX(t, side)) * 0.5;
      for (let k = 0; k < PER; k++) {
        // a cone of directions around the spall axis, some straight,
        // some wild - a burst, not a beam
        const spread = 0.25 + rng() * 0.75;
        const d = spall
          .clone()
          .add(new THREE.Vector3((rng() - 0.5) * spread * 1.6, (rng() - 0.5) * spread, (rng() - 0.5) * spread * 1.6))
          .normalize();
        // most shards are grit, a few are boulders
        const u = rng();
        const size = u < 0.7 ? 0.5 + rng() * 1.3 : u < 0.95 ? 1.8 + rng() * 2.2 : 4.5 + rng() * 4;
        this.shards.push({
          section: i,
          origin: new THREE.Vector3(originX, t * FORM_H + (rng() - 0.5) * (FORM_H / SECTIONS) * 1.4, (rng() - 0.5) * 16),
          dir: d,
          frac: 0.06 + Math.pow(rng(), 1.6) * 0.94,
          size,
          axis: new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize(),
          spin: (rng() - 0.5) * 6,
          sagK: 0.05 + rng() * 0.12
        });
      }
    }
  }

  private dispOf(gap: number, widest: number): number {
    return gap <= 0 || widest <= 0 ? 0 : Math.pow(gap / widest, GAP_GAMMA) * GAP_MAX;
  }

  /**
   * Pure function of (journey state, detent). No latches, no clocks:
   * scrub backwards and every stratum retraces exactly, because every
   * value below is read from the stored frames.
   */
  update(st: JourneyState, detent: Detent, camY: number): void {
    // visible as soon as the camera has crossed under the veil, even
    // while the JOURNEY still says entrance: the dive lands at 0.33
    // and the act must already be standing there in the dark
    const on = st.phase !== 'entrance' || camY < -1000;
    this.group.visible = on;
    if (!on) return;

    const tf = Math.min(TICKS - 1 - 1e-4, Math.max(0, st.tick));
    const t0 = Math.floor(tf);
    const t1 = t0 + 1;
    const a = tf - t0;

    const gaps = detent === 0 ? null : detent === 1 ? this.gapPos : this.gapNeg;
    const widest = detent === 1 ? this.widestPos : this.widestNeg;
    const onsets = detent === 1 ? this.onsetPos : this.onsetNeg;
    const expand = DEPART_BASE + (1 - DEPART_BASE) * st.unfold;
    const bladeOut = st.phase === 'entrance' || st.phase === 'x' ? 0 : detent * BLADE_STEP;

    // the jolt: every tear kicks the whole stack, and the kick decays
    // over the following ticks. A sum of pure functions of tick.
    let flinch = 0;
    if (gaps) {
      for (let i = 0; i < SECTIONS; i++) {
        const ot = onsets[i]!;
        if (tf >= ot && ot !== Infinity) {
          const amp = Math.min(2.2, this.dispOf(gaps[(TICKS - 1) * SECTIONS + i]!, widest) / 55);
          flinch += amp * ((i & 1) === 0 ? 1 : -1) * Math.exp(-(tf - ot) / 2.5);
        }
      }
    }

    for (const fr of this.frags) {
      const i = fr.section;
      const off =
        this.baseOff[t0 * SECTIONS + i]! * (1 - a) + this.baseOff[t1 * SECTIONS + i]! * a;

      // THE DETONATION SWAP: a mobile slab does not slide anywhere.
      // It stands intact until its section's onset tick, then it IS
      // GONE - replaced in the same instant by its shard cloud. The
      // most violent thing a piece can do is stop being a piece.
      let dd = 0;
      let gone = false;
      if (fr.mobile && gaps) {
        const ot = onsets[i]!;
        gone = tf >= ot && ot !== Infinity;
      }
      fr.mesh.visible = !gone;

      this.v.copy(fr.base);
      // X: the baseline settling, the monolith shearing as it computes
      this.v.x += off * SHEAR + flinch;
      // ...and the yield wave: the discrete snap of this stratum's one
      // threshold crossing, settling back as the run continues
      const yt = this.yieldTick[i]!;
      if (tf >= yt) {
        this.v.x += this.waveAmp[i]! * Math.exp(-(tf - yt) / 9);
      }
      // Y and Z: the departure, the difference made physical
      if (dd > 0) {
        this.v.addScaledVector(fr.dir, dd);
        this.v.y -= dd * fr.sagK;
      }
      if (fr.isBlade) this.v.addScaledVector(fr.dir, bladeOut);
      fr.mesh.position.copy(this.v);

      if (fr.leanAngle !== 0 && dd > 0) {
        this.q.setFromAxisAngle(fr.leanAxis, fr.leanAngle * Math.min(1, dd / GAP_MAX));
        fr.mesh.quaternion.copy(this.q);
      } else {
        fr.mesh.quaternion.identity();
      }
    }

    for (const ch of this.chips) {
      const i = ch.section;
      let dd = 0;
      if (gaps) {
        const ot = onsets[i]!;
        if (tf >= ot && ot !== Infinity) {
          const snapT = Math.min(1, (tf - ot) / 6);
          dd = this.dispOf(gaps[(TICKS - 1) * SECTIONS + i]!, widest) * expand * (snapT * snapT * (3 - 2 * snapT));
        }
      }
      const vis = dd > 4;
      ch.mesh.visible = vis;
      if (!vis) continue;
      this.v.copy(ch.base).addScaledVector(ch.dir, dd * ch.frac).add(ch.scatter);
      this.v.y -= dd * ch.frac * ch.sagK;
      ch.mesh.position.copy(this.v);
      const s = Math.min(1, dd / 30);
      ch.mesh.scale.setScalar(s);
    }

    // THE ARRESTED DETONATION. Every shard of every torn section,
    // frozen at the reach its scroll moment gives it. Backwards scroll
    // runs the blast in reverse exactly - the one thing hand animation
    // can never fake at four thousand pieces.
    {
      const m4 = this.m4;
      const q4 = this.q;
      const s3 = this.v;
      let idx = 0;
      for (const sh of this.shards) {
        const ot = gaps ? onsets[sh.section]! : Infinity;
        let snap = 0;
        if (gaps && tf >= ot && ot !== Infinity) {
          const raw = Math.min(1, (tf - ot) / 7);
          snap = raw * raw * (3 - 2 * raw);
        }
        if (snap <= 0.001) {
          m4.makeScale(0.0001, 0.0001, 0.0001);
          this.shardMesh.setMatrixAt(idx++, m4);
          continue;
        }
        const reach = this.dispOf(gaps![(TICKS - 1) * SECTIONS + sh.section]!, widest) * expand * sh.frac * snap;
        s3.copy(sh.origin).addScaledVector(sh.dir, reach);
        s3.y -= reach * sh.sagK * snap;
        s3.x += flinch;
        q4.setFromAxisAngle(sh.axis, sh.spin * snap);
        m4.compose(s3, q4, this.vScale.setScalar(sh.size));
        this.shardMesh.setMatrixAt(idx++, m4);
      }
      this.shardMesh.instanceMatrix.needsUpdate = true;
    }

    // the blade is offered: the one warm lamp rises at Tick Zero and
    // settles once the choice is made. A step of scroll, not of time.
    this.bladeLamp.intensity = st.bladeLive ? 0.42 : st.phase === 'y' || st.phase === 'z' ? 0.16 : 0.06;
    // and the torn gold answers the opening: the faces brighten only as
    // far as the world has actually unfolded
    this.goldFaceMat.emissiveIntensity = 0.13 + 0.1 * st.unfold;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const m = o.material;
        if (Array.isArray(m)) for (const mm of m) mm.dispose();
        else (m as THREE.Material).dispose();
      }
    });
  }
}
