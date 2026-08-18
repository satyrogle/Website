import { mulberry32 } from '../core/rng';
import type { WorldEvent } from '../record/events';

/**
 * The authoritative world: one seeded lattice.
 *
 * The visible cosmos is thousands of luminous nodes. From outside they
 * read as free stars in soft order. The truth, revealed at the core, is
 * that every light sits in a frame, and the frame is live: a node that
 * fails its quota is culled, and every cull is written to the record.
 * A visitor's mark becomes a node, retained and held to the same law.
 *
 * Deterministic: seeded generation, fixed-step law, no Math.random.
 */

export interface CoreNode {
  ix: number;
  iy: number;
  iz: number;
  x: number;
  y: number;
  z: number;
  health: number;
  decay: number;
  alive: boolean;
  cullTick: number;
}

export interface Mark {
  x: number;
  y: number;
  z: number;
  bornTick: number;
  label: string;
}

export const CORE_CENTER = { x: 0, y: 0, z: -48 };
export const CORE_GRID = 5;
export const CORE_SPACING = 3.2;

const MASS_CENTER = { x: 0, y: 0, z: 20 };
const MASS_RADII = { x: 55, y: 40, z: 85 };
const CAVITY_RADIUS = 16;
const LATTICE_SPACING = 3.5;
const FIXED_DT = 1 / 60;
const MIN_CORE_ALIVE = 85;
const MARK_COOLDOWN_TICKS = 30;
const MAX_MARKS = 12;

export class LatticeWorld {
  tick = 0;
  readonly seed: number;

  /** Cloud node buffers: static in space, alive/dead set at genesis. */
  readonly positions: Float32Array;
  readonly nodeSeeds: Float32Array;
  readonly deadness: Float32Array;
  readonly nodeCount: number;

  readonly coreNodes: CoreNode[] = [];
  readonly marks: Mark[] = [];

  private readonly onEvent: (e: WorldEvent) => void;
  private lastMarkTick = -MARK_COOLDOWN_TICKS;
  private markCounter = 0;

  constructor(seed: number, onEvent: (e: WorldEvent) => void) {
    this.seed = seed;
    this.onEvent = onEvent;
    const rng = mulberry32(seed);

    // --- genesis of the cloud: a lattice inside an immense ovoid ---
    const pts: number[] = [];
    const seeds: number[] = [];
    const dead: number[] = [];
    const s = LATTICE_SPACING;
    for (let x = -MASS_RADII.x; x <= MASS_RADII.x; x += s) {
      for (let y = -MASS_RADII.y; y <= MASS_RADII.y; y += s) {
        for (let z = -MASS_RADII.z; z <= MASS_RADII.z; z += s) {
          const px = x + MASS_CENTER.x;
          const py = y + MASS_CENTER.y;
          const pz = z + MASS_CENTER.z;
          const q =
            (x * x) / (MASS_RADII.x * MASS_RADII.x) +
            (y * y) / (MASS_RADII.y * MASS_RADII.y) +
            (z * z) / (MASS_RADII.z * MASS_RADII.z);
          if (q > 1) continue;
          // soft edge: thin the shell so the mass has atmosphere, not a skin
          if (q > 0.72 && rng() < (q - 0.72) / 0.28) continue;

          const dCore = Math.hypot(px - CORE_CENTER.x, py - CORE_CENTER.y, pz - CORE_CENTER.z);
          if (dCore < CAVITY_RADIUS) continue;

          // order is revealed with depth: jitter shrinks toward the core
          const orderT = smoothstep(90, 25, dCore);
          const jitter = 1.8 - 1.3 * orderT;
          pts.push(
            px + (rng() * 2 - 1) * jitter,
            py + (rng() * 2 - 1) * jitter,
            pz + (rng() * 2 - 1) * jitter
          );
          seeds.push(rng());
          // the discrepancy: failure density rises toward the core
          const pDead = 0.02 + 0.3 * orderT;
          dead.push(rng() < pDead ? 1 : 0);
        }
      }
    }
    this.positions = new Float32Array(pts);
    this.nodeSeeds = new Float32Array(seeds);
    this.deadness = new Float32Array(dead);
    this.nodeCount = seeds.length;

    // --- the core: the frame made visible, and the law made live ---
    const half = ((CORE_GRID - 1) / 2) * CORE_SPACING;
    for (let ix = 0; ix < CORE_GRID; ix++) {
      for (let iy = 0; iy < CORE_GRID; iy++) {
        for (let iz = 0; iz < CORE_GRID; iz++) {
          this.coreNodes.push({
            ix,
            iy,
            iz,
            x: CORE_CENTER.x + ix * CORE_SPACING - half,
            y: CORE_CENTER.y + iy * CORE_SPACING - half,
            z: CORE_CENTER.z + iz * CORE_SPACING - half,
            health: 0.55 + rng() * 0.45,
            // seeded rates: roughly one failure every half minute early,
            // slowing as the weak are gone
            decay: 0.0006 + rng() * 0.0028,
            alive: true,
            cullTick: -1
          });
        }
      }
    }
  }

  /** One fixed step of the law. */
  step(): void {
    this.tick++;
    let weakest: CoreNode | null = null;
    let aliveCount = 0;
    for (const n of this.coreNodes) {
      if (!n.alive) continue;
      aliveCount++;
      n.health -= n.decay * FIXED_DT;
      if (weakest === null || n.health < weakest.health) weakest = n;
    }
    if (weakest && weakest.health <= 0 && aliveCount > MIN_CORE_ALIVE) {
      weakest.alive = false;
      weakest.cullTick = this.tick;
      this.onEvent({
        kind: 'removed',
        tick: this.tick,
        text:
          'NODE ' + weakest.ix + '-' + weakest.iy + '-' + weakest.iz + ' FAILED ITS QUOTA',
        status: 'CULLED'
      });
    }
  }

  stepTo(target: number): number {
    while (this.tick < target) this.step();
    return this.tick;
  }

  /** A visitor press becomes a node: retained, recorded, subject to the law. */
  placeMark(x: number, y: number, z: number): boolean {
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
    this.marks.push({ x, y, z, bornTick: this.tick, label });
    this.onEvent({
      kind: 'placed',
      tick: this.tick,
      text: label + ' ADDED TO THE LATTICE',
      status: 'RETAINED'
    });
    return true;
  }

  /** Harness hook: deterministic scalar of the whole live state. */
  checksum(): number {
    let sum = 0;
    for (const n of this.coreNodes) {
      sum += n.alive ? n.health : -1;
    }
    return Math.round(sum * 1e6) / 1e6;
  }

  coreAlive(): number {
    return this.coreNodes.reduce((a, n) => a + (n.alive ? 1 : 0), 0);
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
