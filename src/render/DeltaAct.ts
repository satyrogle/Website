import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  computeFamilies,
  checksum,
  SECTIONS,
  TICKS,
  BLADE,
  type Detent,
  type Families
} from '../core/Delta';
import type { JourneyState } from '../core/Journey';
import { mulberry32 } from '../core/rng';
import { FORM_H, cutPlaneX } from '../world/monumentForm';

/**
 * THE DELTA ACT: X, Y and Z as one world. docs/THE_DELTA.md, godmode
 * build of 2026-08-30/31.
 *
 * THE FORGE ERA. Every earlier pass built the monolith out of
 * runtime boxes and Jacob killed them all - jenga, bulges, "soo bad".
 * The stone is now FORGED: tools/blender/delta_fracture.py rebuilds
 * the Split Spire from the same numbers as monumentForm.ts, fractures
 * it into ~285 genuine rock chunks with a hand-rolled seeded Voronoi
 * (real conchoidal faces, hairline crack seams, beveled edges), and
 * exports public/models/delta-monolith.glb. At rest the chunks
 * assemble into ONE carved monolith - the crack network is real
 * geometry. The detonation throws real rubble.
 *
 * EVERYTHING DISPLAYED IS A KERNEL VALUE:
 *   - X's settling      = baseline offset per section per tick
 *   - the yield wave    = each section's real threshold crossing
 *   - Y's detonations   = each section's real onset tick and gap
 *   - Z's unfolding     = the same gaps, display-expanded by unfold
 *   - the blade         = the detent itself, standing in its socket
 * Chunks are mapped to kernel sections by their forged height. The
 * display constants are the legend on the map, stated, never a second
 * fact. Nothing here owns state: it renders (scroll, detent).
 */

export const DELTA_Y = -3260;

/** display law, carried over from the judged blockout */
const GAP_MAX = 170;
const GAP_GAMMA = 0.36;
/** X's settling shear per unit of kernel offset */
const SHEAR = 9;
/** Y opens sockets at 0.45 of full; Z expands to inhabitable */
const DEPART_BASE = 0.45;
/** the blade block's slide between its three sockets, world units */
const BLADE_SLIDE = 6.5;
/** every blast clears its source; the kernel ranks who flies furthest */
const REACH_FLOOR = 34;

/** soft radial sprite for haze and shafts */
function glowTexture(r: number, g: number, b: number): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 128;
  const x = cv.getContext('2d')!;
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(${r},${g},${b},0.85)`);
  gr.addColorStop(0.55, `rgba(${r},${g},${b},0.28)`);
  gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = gr;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

interface Chunk {
  mesh: THREE.Mesh;
  base: THREE.Vector3;
  quat0: THREE.Quaternion;
  section: number;
  side: 0 | 1;
  mobile: boolean;
  dir: THREE.Vector3;
  frac: number;
  axis: THREE.Vector3;
  spin: number;
  sagK: number;
}

export class DeltaAct {
  readonly group = new THREE.Group();
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
  /** the forged rubble, once the GLB lands */
  private readonly chunks: Chunk[] = [];
  private ready = false;
  private readonly bladeLamp: THREE.PointLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly key: THREE.DirectionalLight;
  private readonly rim: THREE.DirectionalLight;
  /** THE BLADE STATION: the one control, physical, unmissable */
  private readonly bladeMesh: THREE.Mesh;
  /** per-family checksums, so the page can display the truth */
  private readonly sums: { base: number; pos: number; neg: number };
  private readonly q = new THREE.Quaternion();
  private readonly q2 = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  /** the ground the visitor arrives on; it dissolves as Z unfolds */
  private readonly floorMat: THREE.MeshStandardMaterial;
  private readonly pathMat: THREE.MeshBasicMaterial;

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

    this.sums = {
      base: checksum(this.fam.baseline),
      pos: checksum(this.fam.altered.get(1)!),
      neg: checksum(this.fam.altered.get(-1)!)
    };

    // per-section onset: the first tick that future visibly diverges
    this.onsetPos = new Float32Array(SECTIONS).fill(Infinity);
    this.onsetNeg = new Float32Array(SECTIONS).fill(Infinity);
    for (let i = 0; i < SECTIONS; i++) {
      for (let t = 0; t < TICKS; t++) {
        if (this.onsetPos[i] === Infinity && this.gapPos[t * SECTIONS + i]! > this.widestPos * 0.01) this.onsetPos[i] = t;
        if (this.onsetNeg[i] === Infinity && this.gapNeg[t * SECTIONS + i]! > this.widestNeg * 0.01) this.onsetNeg[i] = t;
        if (this.onsetPos[i] !== Infinity && this.onsetNeg[i] !== Infinity) break;
      }
    }

    // the yield wave: X shows each section's one real threshold crossing
    this.yieldTick = new Float32Array(SECTIONS).fill(Infinity);
    for (let i = 0; i < SECTIONS; i++) {
      for (let t = 0; t < TICKS; t++) {
        if (this.fam.baseline.frames[t]![i]!.yielded) {
          this.yieldTick[i] = t;
          break;
        }
      }
    }
    {
      const wr = mulberry32((seed ^ 0x77a3e) | 0);
      this.waveAmp = new Float32Array(SECTIONS);
      for (let i = 0; i < SECTIONS; i++) {
        this.waveAmp[i] = (5 + wr() * 5) * (wr() < 0.5 ? -1 : 1);
      }
      for (let i = 0; i < SECTIONS; i++) {
        this.mobileSide[i] = wr() < 0.5 ? 0 : 1;
      }
    }

    // ---- THE WORLD, NOT A VOID. "Its the same" - Jacob, 2026-08-31,
    // and the diagnosis was finally right: the rocks changed three
    // times but the PICTURE never did, because a product floating in
    // black is the same photo whatever the product is made of. The
    // boards have an environment: a storm-graded sky, a ground, and
    // the gold line running along it to the visitor's feet.
    const shell = new THREE.Mesh(
      // r=900 and depth-writing: the ENTRANCE's own sky dome hangs
      // 3200 units overhead and painted a hard black cap over the
      // storm until this shell both sat nearer and owned the depth
      new THREE.SphereGeometry(900, 32, 20),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        fog: false,
        depthWrite: true,
        uniforms: {},
        vertexShader: `varying vec3 vP;
void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `varying vec3 vP;
void main(){
  float h = clamp(vP.y / 900.0, -1.0, 1.0);
  // storm grade: coal at the feet, bruised slate overhead, one faint
  // warm exhaustion where the crown's shafts fall
  vec3 lo = vec3(0.008, 0.011, 0.016);
  vec3 mid = vec3(0.02, 0.026, 0.035);
  vec3 hi = vec3(0.038, 0.046, 0.058);
  vec3 c = mix(lo, mid, smoothstep(-0.2, 0.35, h));
  c = mix(c, hi, smoothstep(0.35, 0.9, h));
  float warm = exp(-pow(length(vP.xz) / 380.0, 2.0)) * smoothstep(0.2, 0.9, h);
  c += vec3(0.10, 0.075, 0.04) * warm;
  gl_FragColor = vec4(c, 1.0);
}`
      })
    );
    shell.position.y = FORM_H * 0.5;
    this.group.add(shell);

    // the ground: dark dressed stone, and THE PATH - the seam's gold
    // running along the floor from the visitor's feet to the door,
    // which is the board's whole composition in one stroke
    this.floorMat = new THREE.MeshStandardMaterial({
      color: 0x0b0e13,
      roughness: 0.42,
      metalness: 0.12,
      flatShading: false,
      fog: false,
      transparent: true
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(560, 48), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.0;
    this.group.add(floor);
    this.pathMat = new THREE.MeshBasicMaterial({
      color: 0xcaa25e,
      fog: false,
      transparent: true
    });
    const path = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 300), this.pathMat);
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.06, 150);
    this.group.add(path);

    // ---- the light score: seam lights its canyon, cold key rakes the
    // strata, rim holds the silhouette, all dimmable for Tick Zero
    this.hemi = new THREE.HemisphereLight(0x323b46, 0x080b0f, 1.35);
    this.group.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xcfdae6, 2.5);
    this.key.position.set(-180, 340, 240);
    this.group.add(this.key);
    this.rim = new THREE.DirectionalLight(0x8fa0b4, 0.95);
    this.rim.position.set(220, 120, -260);
    this.group.add(this.rim);
    for (const y of [FORM_H * 0.25, FORM_H * 0.55, FORM_H * 0.85]) {
      const glow = new THREE.PointLight(0xd9b070, 0.85, 120, 2.0);
      glow.position.set(0, y, 0);
      this.group.add(glow);
    }
    this.bladeLamp = new THREE.PointLight(0xd9b070, 0.0, 55, 2.0);
    this.group.add(this.bladeLamp);

    // ---- THE AIR: god shafts and depth haze, dead still
    {
      const warm = glowTexture(214, 172, 108);
      const cold = glowTexture(120, 140, 165);
      const mk = (
        tex: THREE.CanvasTexture,
        w: number,
        h: number,
        x: number,
        y: number,
        z: number,
        o: number,
        rz = 0
      ): void => {
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(w, h),
          new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            opacity: o,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            fog: false
          })
        );
        m.position.set(x, y, z);
        m.rotation.z = rz;
        this.group.add(m);
      };
      mk(warm, 26, 340, -6, FORM_H * 0.9, -14, 0.1, 0.06);
      mk(warm, 16, 300, 10, FORM_H * 0.85, -20, 0.08, -0.045);
      mk(cold, 44, 380, -46, FORM_H * 0.8, -34, 0.05, 0.1);
      mk(cold, 36, 360, 52, FORM_H * 0.75, -30, 0.045, -0.08);
      // the big cold pools at 0.04-0.05 fogged the entire sky grey
      // (photographed 2026-08-31); depth-glow whispers now
      mk(cold, 620, 480, 0, FORM_H * 0.55, -120, 0.018);
      mk(warm, 260, 220, 0, FORM_H * 0.28, -40, 0.05);
    }

    // ---- the seam: the one line, in its real place
    const seam = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, FORM_H * 1.04, 1.1),
      new THREE.MeshBasicMaterial({ color: 0xcaa25e, fog: false })
    );
    seam.position.set(0, FORM_H / 2, 0);
    this.group.add(seam);

    // ---- THE BLADE STATION: a carved mechanism at the hinge height.
    // Three deep sockets in a dressed panel, one gold-lit blade block
    // standing in whichever socket the detent chooses. No UI.
    {
      const side = this.mobileSide[BLADE]! as 0 | 1;
      const sgn = side === 0 ? -1 : 1;
      const bx = cutPlaneX((BLADE + 0.5) / SECTIONS, side) + sgn * 1.2;
      const by = ((BLADE + 0.5) / SECTIONS) * FORM_H;
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 12, 22),
        new THREE.MeshStandardMaterial({
          color: 0x11151b,
          roughness: 0.6,
          metalness: 0.25,
          flatShading: true,
          fog: false
        })
      );
      panel.position.set(bx + sgn * 0.6, by, 5);
      this.group.add(panel);
      const socketMat = new THREE.MeshStandardMaterial({
        color: 0x05070a,
        roughness: 0.95,
        metalness: 0,
        fog: false
      });
      for (const off of [-BLADE_SLIDE, 0, BLADE_SLIDE]) {
        const so = new THREE.Mesh(new THREE.BoxGeometry(1.4, 5.2, 3.4), socketMat);
        so.position.set(bx - sgn * 0.4, by, 5 + off);
        this.group.add(so);
      }
      this.bladeMesh = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 4.6, 2.6),
        new THREE.MeshStandardMaterial({
          color: 0x2a1f10,
          emissive: 0xd9b070,
          emissiveIntensity: 0.5,
          roughness: 0.4,
          metalness: 0.45,
          flatShading: true,
          fog: false
        })
      );
      this.bladeMesh.position.set(bx - sgn * 1.4, by, 5);
      this.group.add(this.bladeMesh);
      this.bladeLamp.position.set(bx - sgn * 4, by + 7, 8);
    }

    // ---- THE FORGED STONE. One shared material wearing the cracked
    // skin; the crack pattern samples LOCAL coordinates plus a per-mesh
    // seed, so it rides each chunk rigidly through its flight.
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x171c23,
      roughness: 0.85,
      metalness: 0.14,
      flatShading: true,
      fog: false
    });
    stoneMat.onBeforeCompile = (sh) => {
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
            '  vec2 w = q*0.34 + (vec2(skFbm(q*0.11), skFbm(q*0.11+19.7))-0.5)*2.8;',
            '  float f = skFbm(w)-0.5;',
            '  float g = length(vec2(dFdx(f),dFdy(f)))+1e-5;',
            '  float crack = 1.0 - smoothstep(0.0, 1.9, abs(f)/g);',
            '  float wear = skFbm(q*0.06);',
            '  diffuseColor.rgb *= 0.78 + 0.5*wear;',
            '  diffuseColor.rgb *= 1.0 - crack*0.6;',
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
            '  float sel = smoothstep(0.6, 0.85, skFbm(q*0.028+7.0));',
            '  totalEmissiveRadiance += vec3(0.62,0.44,0.17) * core * sel * 0.55;',
            '  float dist = length(vViewPosition);',
            '  totalEmissiveRadiance += vec3(0.035,0.045,0.06) * smoothstep(70.0, 420.0, dist);',
            '}'
          ].join('\n')
        );
    };

    // ---- load the forge's output and marry chunks to kernel sections
    const rng = mulberry32((seed ^ 0x2b10c) | 0);
    new GLTFLoader().load(
      '/models/delta-monolith.glb',
      (gltf) => {
        const kids: THREE.Object3D[] = [];
        gltf.scene.traverse((o) => {
          if (o instanceof THREE.Mesh) kids.push(o);
        });
        for (const o of kids) {
          const mesh = o as THREE.Mesh;
          const p = new THREE.Vector3();
          mesh.getWorldPosition(p);
          const side: 0 | 1 = mesh.name.startsWith('L') ? 0 : 1;
          const t = Math.min(0.999, Math.max(0, p.y / FORM_H));
          const section = Math.min(SECTIONS - 1, Math.floor(t * SECTIONS));
          // spall: radially out of its own half, blended with a seeded
          // scatter so a section erupts in every direction at once
          const cx = cutPlaneX(t, side);
          const out = new THREE.Vector3(p.x - cx, 0, p.z);
          if (out.lengthSq() < 1e-4) out.set(side === 0 ? -1 : 1, 0, 0);
          out.normalize();
          const dir = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1)
            .normalize()
            .multiplyScalar(0.9)
            .addScaledVector(out, 1.0)
            .normalize();

          const geo = mesh.geometry as THREE.BufferGeometry;
          geo.setAttribute(
            'aSkinSeed',
            new THREE.BufferAttribute(
              new Float32Array(geo.attributes.position!.count).fill(rng() * 220),
              1
            )
          );
          mesh.material = stoneMat;

          this.chunks.push({
            mesh,
            base: mesh.position.clone(),
            quat0: mesh.quaternion.clone(),
            section,
            side,
            mobile: this.mobileSide[section] === side,
            dir,
            frac: 0.15 + Math.pow(rng(), 1.3) * 0.85,
            axis: new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize(),
            spin: (rng() - 0.5) * 6,
            sagK: 0.08 + rng() * 0.24
          });
          this.group.add(mesh);
        }
        this.ready = true;
      },
      undefined,
      (err) => console.error('the forge output failed to load', err)
    );
  }

  /** the truth for the page's stats line */
  checksumFor(d: Detent): number {
    return d === 0 ? this.sums.base : d === 1 ? this.sums.pos : this.sums.neg;
  }

  private dispOf(gap: number, widest: number): number {
    return gap <= 0 || widest <= 0 ? 0 : Math.pow(gap / widest, GAP_GAMMA) * GAP_MAX;
  }

  /**
   * Pure function of (journey state, detent). Scrub backwards and the
   * detonations un-happen in the same order, chunk for chunk.
   */
  update(st: JourneyState, detent: Detent, camY: number): void {
    const on = st.phase !== 'entrance' || camY < -1000;
    this.group.visible = on;
    if (!on) return;

    // Tick Zero staging: the world dims, the station is the only
    // bright thing, the blade stands in the chosen socket
    const dim = st.bladeLive ? 0.4 : 1;
    this.hemi.intensity = 1.35 * dim;
    this.key.intensity = 2.5 * dim;
    this.rim.intensity = 0.95 * dim;
    this.bladeLamp.intensity = st.bladeLive ? 1.6 : st.phase === 'y' || st.phase === 'z' ? 0.25 : 0.08;
    this.bladeMesh.position.z = 5 + detent * BLADE_SLIDE;
    (this.bladeMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = st.bladeLive ? 1.1 : 0.35;

    // Z sheds the ground: the difference is a place with no floor and
    // no horizon, so the world the visitor arrived through dissolves
    // exactly as far as the field has unfolded
    this.floorMat.opacity = 1 - st.unfold;
    this.pathMat.opacity = 1 - st.unfold;

    if (!this.ready) return;

    const tf = Math.min(TICKS - 1 - 1e-4, Math.max(0, st.tick));
    const t0 = Math.floor(tf);
    const t1 = t0 + 1;
    const a = tf - t0;

    const gaps = detent === 0 ? null : detent === 1 ? this.gapPos : this.gapNeg;
    const widest = detent === 1 ? this.widestPos : this.widestNeg;
    const onsets = detent === 1 ? this.onsetPos : this.onsetNeg;
    const expand = DEPART_BASE + (1 - DEPART_BASE) * st.unfold;

    // the jolt: every detonation kicks the whole stack, decaying
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

    for (const ch of this.chunks) {
      const i = ch.section;
      const off =
        this.baseOff[t0 * SECTIONS + i]! * (1 - a) + this.baseOff[t1 * SECTIONS + i]! * a;

      // X: settle + the yield wave, the kernel's own discrete events
      let x = off * SHEAR + flinch;
      const yt = this.yieldTick[i]!;
      if (tf >= yt) x += this.waveAmp[i]! * Math.exp(-(tf - yt) / 9);

      let snap = 0;
      if (ch.mobile && gaps) {
        const ot = onsets[i]!;
        if (tf >= ot && ot !== Infinity) {
          const raw = Math.min(1, (tf - ot) / 7);
          snap = raw * raw * (3 - 2 * raw);
        }
      }

      this.v.copy(ch.base);
      this.v.x += x;
      if (snap > 0) {
        const reach =
          (REACH_FLOOR + this.dispOf(gaps![(TICKS - 1) * SECTIONS + i]!, widest) * expand) *
          ch.frac *
          snap;
        this.v.addScaledVector(ch.dir, reach);
        this.v.y -= reach * ch.sagK * snap * (0.35 + 0.65 * snap);
        // the crack of the moment: it arrives oversized and settles
        const oversh = 1 + 0.4 * Math.exp(-((tf - (onsets[i] as number)) / 1.6));
        ch.mesh.scale.setScalar(oversh);
        this.q.setFromAxisAngle(ch.axis, ch.spin * snap);
        this.q2.copy(ch.quat0).premultiply(this.q);
        ch.mesh.quaternion.copy(this.q2);
      } else {
        ch.mesh.scale.setScalar(1);
        ch.mesh.quaternion.copy(ch.quat0);
      }
      ch.mesh.position.copy(this.v);
    }
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
