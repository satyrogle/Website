import { mulberry32 } from '../core/rng';
import type { WorldEvent } from '../record/events';

/**
 * THE FALSE HEAVEN. The authoritative world, built to match the
 * approved image (captures/hybrids/openings-krea/h2/h2-krea.png in the
 * main repo): an immense ceiling of lights in manufactured rows above a
 * dark still sea. From below they read as stars. They are lamps, every
 * one mounted, every one on a quota. The law runs where the visitor
 * travels: a lamp that fails is dimmed, then culled into the record.
 *
 * Deterministic: seeded generation, fixed-step law, no Math.random.
 */

export const CEILING_Y = 26;
export const SEA_Y = 0;

const GRID_X_MIN = -240;
const GRID_X_MAX = 240;
const GRID_X_STEP = 3.0;
const GRID_Z_MIN = -460;
const GRID_Z_MAX = 50;
const GRID_Z_STEP = 2.4;
const JITTER = 0.12;

/** deadness values: 0 lit, 1 culled (off), 2 failing (flicker) */
export const LAMP_LIT = 0;
export const LAMP_CULLED = 1;
export const LAMP_FAILING = 2;

const LAW_X_RANGE = 14;
const LAW_Z_MIN = -330;
const LAW_Z_MAX = -130;
const CULL_COOLDOWN_TICKS = 900;
const FIXED_DT = 1 / 60;
const MARK_COOLDOWN_TICKS = 30;
const MAX_MARKS = 12;

interface LawLamp {
  index: number;
  row: number;
  col: number;
  health: number;
  decay: number;
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

  readonly positions: Float32Array;
  readonly nodeSeeds: Float32Array;
  /** dynamic: 0 lit, 1 culled, 2 failing */
  readonly deadness: Float32Array;
  readonly nodeCount: number;
  /** renderer checks and clears this after uploading the attribute */
  deadnessDirty = false;

  readonly marks: Mark[] = [];

  private readonly lawLamps: LawLamp[] = [];
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
    const dead: number[] = [];

    let row = 0;
    for (let x = GRID_X_MIN; x <= GRID_X_MAX; x += GRID_X_STEP, row++) {
      let col = 0;
      for (let z = GRID_Z_MAX; z >= GRID_Z_MIN; z -= GRID_Z_STEP, col++) {
        const index = seeds.length;
        pts.push(
          x + (rng() * 2 - 1) * JITTER,
          CEILING_Y + (rng() * 2 - 1) * JITTER,
          z + (rng() * 2 - 1) * JITTER
        );
        seeds.push(rng());

        // pristine from the sea; the failures live where the visitor goes
        const failT = smoothstep(-90, -300, z);
        const isDead = rng() < 0.13 * failT;
        dead.push(isDead ? LAMP_CULLED : LAMP_LIT);

        // the live law runs along the travelled aisle
        if (!isDead && Math.abs(x) < LAW_X_RANGE && z > LAW_Z_MIN && z < LAW_Z_MAX) {
          this.lawLamps.push({
            index,
            row,
            col,
            health: 0.5 + rng() * 0.5,
            decay: 0.0008 + rng() * 0.0034
          });
        }
      }
    }

    this.positions = new Float32Array(pts);
    this.nodeSeeds = new Float32Array(seeds);
    this.deadness = new Float32Array(dead);
    this.nodeCount = seeds.length;
  }

  /** One fixed step of the law. */
  step(): void {
    this.tick++;
    let weakest: LawLamp | null = null;
    for (const l of this.lawLamps) {
      if (this.deadness[l.index] === LAMP_CULLED) continue;
      l.health -= l.decay * FIXED_DT;
      if (l.health < 0.15 && this.deadness[l.index] === LAMP_LIT) {
        this.deadness[l.index] = LAMP_FAILING;
        this.deadnessDirty = true;
      }
      if (weakest === null || l.health < weakest.health) weakest = l;
    }
    if (
      weakest &&
      weakest.health <= 0 &&
      this.tick - this.lastCullTick > CULL_COOLDOWN_TICKS
    ) {
      this.lastCullTick = this.tick;
      this.deadness[weakest.index] = LAMP_CULLED;
      this.deadnessDirty = true;
      this.onEvent({
        kind: 'removed',
        tick: this.tick,
        text:
          'LAMP R' +
          String(weakest.row).padStart(3, '0') +
          '-C' +
          String(weakest.col).padStart(3, '0') +
          ' FAILED ITS QUOTA',
        status: 'CULLED'
      });
    }
  }

  stepTo(target: number): number {
    while (this.tick < target) this.step();
    return this.tick;
  }

  /**
   * A visitor press becomes a lamp. Wherever they press, the new light
   * is seated in the ceiling above that point: retained, recorded,
   * held to the same quota as everything else.
   */
  placeMark(x: number, _y: number, z: number): boolean {
    if (this.tick - this.lastMarkTick < MARK_COOLDOWN_TICKS) return false;
    this.lastMarkTick = this.tick;
    this.markCounter++;
    const label = 'MARK ' + String(this.markCounter).padStart(2, '0');
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
    this.marks.push({ x, y: CEILING_Y - 0.35, z, bornTick: this.tick, label });
    this.onEvent({
      kind: 'placed',
      tick: this.tick,
      text: label + ' SEATED IN THE SKY',
      status: 'RETAINED'
    });
    return true;
  }

  /** Harness hook: deterministic scalar of the live law state. */
  checksum(): number {
    let sum = 0;
    for (const l of this.lawLamps) {
      sum += this.deadness[l.index] === LAMP_CULLED ? -1 : l.health;
    }
    return Math.round(sum * 1e6) / 1e6;
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
