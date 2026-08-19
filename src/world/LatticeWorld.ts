import { mulberry32 } from '../core/rng';
import type { WorldEvent } from '../record/events';
import {
  PERIMETER,
  TIP_T,
  prongCentre,
  prongFrame,
  profileSupport,
  scaleAt,
  surfacePoint
} from './monumentForm';

/**
 * THE MONUMENT. The authoritative world: two twisting prongs of
 * inscribed stone standing in a dark sea, every surface cell a record.
 * Scroll decays it: cells fail and fall in waves, crown first, and what
 * remains is the dark lattice of ties that was always doing the
 * holding. The strike law runs live regardless of scroll: the weakest
 * cell on the visited face is struck into the record. A visitor press
 * seats a new cell into the face, retained and recorded.
 *
 * Deterministic: seeded generation, fixed-step law, no Math.random.
 * Scroll decay is a pure function of progress; replay needs only the
 * seed and the input trace.
 */

export const SEA_Y = 0;
export const CELL = 1.5;
export const FOOT = 28; // cells per side
export const LEVELS = 130;
export const HALF = (FOOT * CELL) / 2;
export const TOWER_TOP = LEVELS * CELL;

const CULL_COOLDOWN_TICKS = 1100;
const FIXED_DT = 1 / 60;
const MARK_COOLDOWN_TICKS = 30;
const MAX_MARKS = 12;

interface LawCell {
  index: number;
  level: number;
  ring: number;
  health: number;
  decay: number;
  struck: boolean;
}

export interface Mark {
  x: number;
  y: number;
  z: number;
  bornTick: number;
  label: string;
}

export class LatticeWorld {
  tick = 0;
  readonly seed: number;

  /** cladding cells: shell of the tower */
  readonly positions: Float32Array;
  readonly nodeSeeds: Float32Array;
  /** decay threshold per cell: the scroll point at which it falls */
  readonly thresholds: Float32Array;
  /** law strikes: tick/60 at which the cell was struck, else -1 */
  readonly strikeTimes: Float32Array;
  readonly nodeCount: number;
  strikesDirty = false;

  readonly marks: Mark[] = [];

  private readonly lawCells: LawCell[] = [];
  private readonly onEvent: (e: WorldEvent) => void;
  private lastCullTick = 0;
  private lastMarkTick = -MARK_COOLDOWN_TICKS;
  private markCounter = 0;

  constructor(seed: number, onEvent: (e: WorldEvent) => void) {
    this.seed = seed;
    this.onEvent = onEvent;
    const rng = mulberry32(seed);

    const pts: number[] = [];
    const seeds: number[] = [];
    const thresholds: number[] = [];

    // surface cells: every course wraps the two prongs of the form
    for (let level = 0; level < LEVELS; level++) {
      const y = level * CELL + CELL / 2;
      const t = y / TOWER_TOP;
      for (const side of [0, 1] as const) {
        if (t > TIP_T[side]) continue;
        const per = PERIMETER * scaleAt(t);
        const count = Math.max(6, Math.round(per / CELL));
        for (let k = 0; k < count; k++) {
          // half-cell course offset: masonry, not a grid
          const u = (k + (level % 2) * 0.5) / count;
          const p = surfacePoint(t, side, u);
          const index = seeds.length;
          pts.push(p.x, y, p.z);
          const s = rng();
          seeds.push(s);

          // decay climbs down from the crown, clustered so it reads as
          // blight, not dissolve
          const cluster = 0.5 + 0.5 * Math.sin(p.x * 0.21 + p.z * 0.17 + level * 0.11 + s * 9.0);
          const th = 0.2 + 0.78 * (1 - t) + 0.28 * (cluster - 0.5) + (s - 0.5) * 0.12;
          thresholds.push(Math.min(0.985, Math.max(0.06, th)));

          // the law runs on the first prong's mid courses, the face the
          // journey reads up close
          if (side === 0 && level > 25 && level < 95 && this.lawCells.length < 420) {
            this.lawCells.push({
              index,
              level,
              ring: k,
              health: 0.5 + rng() * 0.5,
              decay: 0.0008 + rng() * 0.003,
              struck: false
            });
          }
        }
      }
    }

    this.positions = new Float32Array(pts);
    this.nodeSeeds = new Float32Array(seeds);
    this.thresholds = new Float32Array(thresholds);
    this.nodeCount = seeds.length;
    this.strikeTimes = new Float32Array(this.nodeCount).fill(-1);
  }

  /** One fixed step of the strike law. */
  step(): void {
    this.tick++;
    let weakest: LawCell | null = null;
    for (const c of this.lawCells) {
      if (c.struck) continue;
      c.health -= c.decay * FIXED_DT;
      if (weakest === null || c.health < weakest.health) weakest = c;
    }
    if (
      weakest &&
      weakest.health <= 0 &&
      this.tick - this.lastCullTick > CULL_COOLDOWN_TICKS
    ) {
      this.lastCullTick = this.tick;
      weakest.struck = true;
      this.strikeTimes[weakest.index] = this.tick / 60;
      this.strikesDirty = true;
      this.onEvent({
        kind: 'removed',
        tick: this.tick,
        text:
          'CELL L' +
          String(weakest.level).padStart(3, '0') +
          '-R' +
          String(weakest.ring).padStart(3, '0') +
          ' STRUCK FROM THE FACE',
        status: 'CULLED'
      });
    }
  }

  stepTo(target: number): number {
    while (this.tick < target) this.step();
    return this.tick;
  }

  /**
   * A visitor press becomes a cell seated into the nearest face of the
   * monument at that height: retained, recorded.
   */
  placeMark(x: number, y: number, z: number): boolean {
    if (this.tick - this.lastMarkTick < MARK_COOLDOWN_TICKS) return false;
    this.lastMarkTick = this.tick;
    this.markCounter++;
    const label = 'MARK ' + String(this.markCounter).padStart(2, '0');

    // seat the mark onto the nearest prong's surface at that height
    const my = Math.min(TOWER_TOP - CELL, Math.max(CELL, y));
    const t = my / TOWER_TOP;
    let side: 0 | 1 = 0;
    let centre = prongCentre(t, 0);
    {
      const other = prongCentre(Math.min(t, TIP_T[1]), 1);
      const d0 = (x - centre.x) ** 2 + (z - centre.z) ** 2;
      const d1 = (x - other.x) ** 2 + (z - other.z) ** 2;
      if (d1 < d0) {
        side = 1;
        centre = other;
      }
    }
    const frame = prongFrame(t, side);
    const dx = x - centre.x;
    const dz = z - centre.z;
    const len = Math.hypot(dx, dz) || 1;
    const la = dx * frame.radial[0] + dz * frame.radial[1];
    const lb = dx * frame.tangential[0] + dz * frame.tangential[1];
    const reach = profileSupport(la, lb) * scaleAt(t) + 0.45;
    const sx = centre.x + (dx / len) * reach;
    const sz = centre.z + (dz / len) * reach;

    if (this.marks.length >= MAX_MARKS) {
      const oldest = this.marks.shift();
      if (oldest) {
        this.onEvent({
          kind: 'removed',
          tick: this.tick,
          text: oldest.label + ' DISPLACED BY A NEWER MARK',
          status: 'REMOVED'
        });
      }
    }
    this.marks.push({ x: sx, y: my, z: sz, bornTick: this.tick, label });
    this.onEvent({
      kind: 'placed',
      tick: this.tick,
      text: label + ' SEATED IN THE FACE',
      status: 'RETAINED'
    });
    return true;
  }

  /** Harness hook: deterministic scalar of the live law state. */
  checksum(): number {
    let sum = 0;
    for (const c of this.lawCells) {
      sum += c.struck ? -1 : c.health;
    }
    return Math.round(sum * 1e6) / 1e6;
  }
}
