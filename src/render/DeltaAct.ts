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
const GAP_MAX = 150;
const GAP_GAMMA = 0.36;
/** how far X's baseline settling shears a stratum, world units per unit offset */
const SHEAR = 30;
/** Y shows the sockets cracking; Z expands the same gaps to inhabitable */
const DEPART_BASE = 0.22;
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
  private readonly bladeLamp: THREE.PointLight;
  private readonly goldFaceMat: THREE.MeshStandardMaterial;
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();

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

    // ---- the interior void: X is inside the line, and inside the line
    // there is no sky. A shell owns the background completely.
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0x04060a, side: THREE.BackSide, fog: false })
    );
    shell.position.y = FORM_H * 0.5;
    this.group.add(shell);

    // ---- light: enough to read form, one cold key, one whisper of
    // warmth at the blade. Returnal steal 1 is depth-cueing, done with
    // distance falloff on the key rather than a fog fight with the
    // entrance's global fog.
    this.group.add(new THREE.HemisphereLight(0x2a333e, 0x04060a, 1.0));
    const key = new THREE.DirectionalLight(0xcfdae6, 1.15);
    key.position.set(-180, 340, 240);
    this.group.add(key);
    // a WHISPER of a lamp: at 1.1 it turned every gilded inner face
    // within reach into a billboard (photographed 2026-08-30)
    this.bladeLamp = new THREE.PointLight(0xd9b070, 0.0, 55, 2.0);
    this.bladeLamp.position.set(0, ((BLADE + 0.5) / SECTIONS) * FORM_H, 10);
    this.group.add(this.bladeLamp);

    // ---- the seam, continuous with the one line the visitor has
    // followed since the hero: the worldline through the whole stack
    const seam = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, FORM_H * 1.04, 1.1),
      new THREE.MeshBasicMaterial({ color: 0xc9a45c, fog: false })
    );
    seam.position.set(0, FORM_H / 2, 0);
    this.group.add(seam);

    // ---- materials: the monument's own register, judged in the
    // blockout. Bloom and ACES live upstream, so intensities stay shy.
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0x151a20,
      roughness: 0.84,
      metalness: 0.16,
      flatShading: true
    });
    const movedMat = plateMat.clone();
    movedMat.color = new THREE.Color(0x1c222a);
    this.goldFaceMat = new THREE.MeshStandardMaterial({
      color: 0x1c1710,
      emissive: 0xb98a3c,
      emissiveIntensity: 0.13,
      roughness: 0.62,
      // near-dielectric: at 0.35 the warm lamp mirrored off every
      // gilded face and re-created the painted-panel fault by light
      metalness: 0.12,
      flatShading: true
    });
    const chipMat = plateMat.clone();
    chipMat.color = new THREE.Color(0x11151b);
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x23180c,
      emissive: 0xd9b070,
      emissiveIntensity: 0.22,
      roughness: 0.45,
      metalness: 0.4,
      flatShading: true
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
        const th = slabH * (0.7 + rng() * 1.6);

        const isMobile = side === mobile;
        const nFrag = 1 + Math.floor(rng() * 3);
        let zEdge = -d / 2;
        for (let f = 0; f < nFrag; f++) {
          const fd = (d / nFrag) * (0.6 + rng() * 0.8);
          const fw = w * (0.82 + rng() * 0.18);
          const fz = Math.min(zEdge + fd / 2, d / 2 - fd / 2);
          zEdge += fd;

          const isBlade = i === BLADE && isMobile && f === 0;
          const geo = new THREE.BoxGeometry(fw, th, fd);
          let mat: THREE.Material | THREE.Material[] = plateMat;
          if (isBlade) {
            mat = bladeMat;
          } else if (isMobile) {
            const faces: THREE.Material[] = [movedMat, movedMat, movedMat, movedMat, movedMat, movedMat];
            faces[side === 1 ? 1 : 0] = this.goldFaceMat;
            mat = faces;
          }
          const mesh = new THREE.Mesh(geo, mat);
          const base = new THREE.Vector3(cx + sgn * (rng() - 0.5) * 2.4, t * FORM_H, fz);
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
  }

  private dispOf(gap: number, widest: number): number {
    return gap <= 0 || widest <= 0 ? 0 : Math.pow(gap / widest, GAP_GAMMA) * GAP_MAX;
  }

  /**
   * Pure function of (journey state, detent). No latches, no clocks:
   * scrub backwards and every stratum retraces exactly, because every
   * value below is read from the stored frames.
   */
  update(st: JourneyState, detent: Detent): void {
    const on = st.phase !== 'entrance';
    this.group.visible = on;
    if (!on) return;

    const tf = Math.min(TICKS - 1 - 1e-4, Math.max(0, st.tick));
    const t0 = Math.floor(tf);
    const t1 = t0 + 1;
    const a = tf - t0;

    const gaps = detent === 0 ? null : detent === 1 ? this.gapPos : this.gapNeg;
    const widest = detent === 1 ? this.widestPos : this.widestNeg;
    const expand = DEPART_BASE + (1 - DEPART_BASE) * st.unfold;
    const bladeOut = st.phase === 'entrance' || st.phase === 'x' ? 0 : detent * BLADE_STEP;

    for (const fr of this.frags) {
      const i = fr.section;
      const off =
        this.baseOff[t0 * SECTIONS + i]! * (1 - a) + this.baseOff[t1 * SECTIONS + i]! * a;

      let dd = 0;
      if (fr.mobile && gaps) {
        const g = gaps[t0 * SECTIONS + i]! * (1 - a) + gaps[t1 * SECTIONS + i]! * a;
        dd = this.dispOf(g, widest) * expand * fr.trail;
      }

      this.v.copy(fr.base);
      // X: the baseline settling, the monolith shearing as it computes
      this.v.x += off * SHEAR;
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
        const g = gaps[t0 * SECTIONS + i]! * (1 - a) + gaps[t1 * SECTIONS + i]! * a;
        dd = this.dispOf(g, widest) * expand;
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
