import { mulberry32 } from '../core/rng';
import type { WorldEvent } from '../record/events';

/**
 * THE MONUMENT. The authoritative world: one colossal stele of light
 * cells standing in a dark sea. Every cell is a record. Scroll decays
 * it: cells fail and fall in waves, crown first, and what remains is
 * the dark frame that was always doing the holding. The strike law
 * runs live regardless of scroll: the weakest cell on the visited face
 * is struck into the record. A visitor press seats a new cell into the
 * face, retained and recorded.
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

    // shell cells only: the monument's face
    for (let level = 0; level < LEVELS; level++) {
      const y = level * CELL + CELL / 2;
      let ring = 0;
      for (let ix = 0; ix < FOOT; ix++) {
        for (let iz = 0; iz < FOOT; iz++) {
          const isShell = ix === 0 || iz === 0 || ix === FOOT - 1 || iz === FOOT - 1;
          if (!isShell) continue;
          const x = ix * CELL - HALF + CELL / 2;
          const z = iz * CELL - HALF + CELL / 2;
          const index = seeds.length;
          pts.push(x, y, z);
          const s = rng();
          seeds.push(s);

          // decay climbs down from the crown, clustered so it reads as
          // blight, not dissolve
          const heightT = level / LEVELS; // 0 base, 1 crown
          const cluster = 0.5 + 0.5 * Math.sin(x * 0.21 + z * 0.17 + level * 0.11 + s * 9.0);
          const th = 0.2 + 0.78 * (1 - heightT) + 0.28 * (cluster - 0.5) + (s - 0.5) * 0.12;
          thresholds.push(Math.min(0.985, Math.max(0.06, th)));

          // the law runs on the face the camera passes (front, mid-heights)
          if (iz === FOOT - 1 && level > 25 && level < 95 && this.lawCells.length < 420) {
            this.lawCells.push({
              index,
              level,
              ring,
              health: 0.5 + rng() * 0.5,
              decay: 0.0008 + rng() * 0.003,
              struck: false
            });
          }
          ring++;
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

    // snap to the closest face plane, keep height within the tower
    const my = Math.min(TOWER_TOP - CELL, Math.max(CELL, y));
    const px = Math.min(HALF + 0.4, Math.max(-HALF - 0.4, x));
    const pz = Math.min(HALF + 0.4, Math.max(-HALF - 0.4, z));
    const snapX = Math.abs(Math.abs(px) - HALF) < Math.abs(Math.abs(pz) - HALF);
    const sx = snapX ? Math.sign(px || 1) * (HALF + 0.4) : px;
    const sz = snapX ? pz : Math.sign(pz || 1) * (HALF + 0.4);

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
