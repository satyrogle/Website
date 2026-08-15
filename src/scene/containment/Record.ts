/**
 * What happened, and what the system says happened.
 *
 * Two parallel logs. `physical` is the truth: who acted, where, when, and how
 * many paths the disturbance actually took. `recorded` is the file the system
 * keeps, and every entry in it is attributed to the visitor — including the one
 * the system performed itself when nobody acted.
 *
 * The lie is **inspectable, not theatrical**. Both logs are kept in full and
 * neither is decorated; they are only ever diffed at the floor, under `YOUR
 * RECORD`. Nothing here is hidden, and nothing here announces itself.
 *
 * Two layers, and the distinction is the whole design:
 *
 * - **Route simplification happens on every event, always.** A disturbance
 *   branches across dozens of trajectories and several shells; the file records
 *   one event, at one site. As an occasional outcome this would vanish on some
 *   visits and take the argument with it, so it is not in the catalogue.
 * - **The catalogue adds exactly one further failure**, chosen deterministically
 *   by hashing `(seed, event position, visit index)`. The visit index is why
 *   this needs persistence: the same visitor returning sees the file fail in a
 *   different way, and neither way is wrong enough to notice alone.
 */

export type Actor = 'SYSTEM' | 'VISITOR';

export type Divergence =
  /** A system action filed as the visitor's. */
  | 'ATTRIBUTION'
  /** Filed against the nearest catalogued site rather than where it happened. */
  | 'POSITION'
  /** Filed to the nearest bucket rather than when it happened. */
  | 'TIME'
  /** One of the branches the disturbance took is not in the file. */
  | 'BRANCH_OMITTED'
  /** Folded into the previous entry, so two events are filed as one. */
  | 'COLLAPSED';

export interface PhysicalEvent {
  source: Actor;
  /** The node the disturbance actually started at. */
  node: number;
  /** Simulation tick, exact. */
  tick: number;
  /** Concurrent paths at the cascade's widest. */
  paths: number;
}

export interface RecordedEvent {
  /** Always the visitor. That is the whole point. */
  source: 'VISITOR';
  node: number;
  tick: number;
  paths: number;
  divergence: Divergence;
  visit: number;
}

/** Ticks the file resolves time to. At dt = 1/120 this is half a second. */
const TIME_BUCKET = 60;

/**
 * Which further failure this event gets.
 *
 * Deterministic in `(seed, node, visit)` — not random, so a given visitor on a
 * given visit can be reproduced exactly, and not fixed, so the file does not
 * fail the same way forever.
 */
function pick(seed: number, node: number, visit: number, from: Divergence[]): Divergence {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ node, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (visit + 1), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return from[h % from.length];
}

/** Everything available to an event the visitor genuinely performed. */
const REAL_INTERACTION: Divergence[] = ['POSITION', 'TIME', 'BRANCH_OMITTED', 'COLLAPSED'];

export class Record {
  readonly physical: PhysicalEvent[] = [];
  readonly recorded: RecordedEvent[] = [];

  /** Set when the visitor asked for the work directly instead of the machine. */
  private declined = false;

  constructor(
    private readonly positions: Float32Array,
    private readonly catalogue: Uint32Array,
    private readonly seed: number,
    private readonly visit: number
  ) {}

  log(source: Actor, node: number, tick: number, paths: number): void {
    this.physical.push({ source, node, tick, paths });

    // Route simplification, always: the branching is not in the file.
    const entry: RecordedEvent = {
      source: 'VISITOR',
      node,
      tick,
      paths: 1,
      divergence: 'ATTRIBUTION',
      visit: this.visit,
    };

    if (source === 'SYSTEM') {
      // The condition is "no interaction", and the catalogue offers exactly
      // one failure for it. It is already applied by `source` above.
      this.recorded.push(entry);
      return;
    }

    entry.divergence = pick(this.seed, node, this.visit, REAL_INTERACTION);
    switch (entry.divergence) {
      case 'POSITION':
        entry.node = this.nearestSite(node);
        break;
      case 'TIME':
        entry.tick = Math.round(tick / TIME_BUCKET) * TIME_BUCKET;
        break;
      case 'BRANCH_OMITTED':
        // The file keeps the branching it would otherwise have discarded, and
        // then loses one of them. Less simplified than usual, and still wrong.
        entry.paths = Math.max(1, paths - 1);
        break;
      case 'COLLAPSED': {
        const previous = this.recorded[this.recorded.length - 1];
        if (previous) {
          // Folded into the entry before it: two things happened, one is filed.
          previous.paths += entry.paths;
          return;
        }
        // Nothing to fold into on the first event of a visit.
        entry.divergence = 'POSITION';
        entry.node = this.nearestSite(node);
        break;
      }
      default:
        break;
    }

    this.recorded.push(entry);
  }

  /**
   * The visitor asked for the work instead.
   *
   * This is the one entry the file gets right, and that is the argument: a
   * system that misattributes everything it can still records a refusal
   * accurately, because nothing about a refusal is inconvenient to it. It is
   * not counted as a deviation, not penalised, and not treated as an absence
   * of consent to anything else.
   */
  skip(): void {
    this.declined = true;
  }

  get skipped(): boolean {
    return this.declined;
  }

  /**
   * What the record says about the visit, in the words the floor prints.
   *
   * Computed here rather than written into the editorial, so the statement is
   * always derived from what actually happened. A visitor who watched the
   * system act and then left is not told the simulation was never entered.
   */
  get statement(): [string, string] {
    const entered = this.physical.length > 0;
    return [
      `SIMULATION   ${entered ? `Entered. ${this.physical.length} event${this.physical.length === 1 ? '' : 's'}.` : 'Not entered.'}`,
      this.declined
        ? 'RECORD       Visitor requested direct access to work.'
        : `RECORD       ${entered ? 'Complete.' : 'No entries.'}`,
    ];
  }

  /** Entries where the file and the world disagree about anything. */
  get divergences(): number {
    let n = 0;
    for (let i = 0; i < this.physical.length; i++) {
      const p = this.physical[i];
      const r = this.recorded[i];
      if (!r) {
        // No counterpart at all: this event was collapsed into another.
        n++;
        continue;
      }
      if (p.source !== r.source || p.node !== r.node || p.tick !== r.tick || p.paths !== r.paths) {
        n++;
      }
    }
    return n;
  }

  /** Events the visitor did not perform but is carrying. */
  get attributed(): number {
    return this.physical.filter((e) => e.source === 'SYSTEM').length;
  }

  private nearestSite(node: number): number {
    const p = this.positions;
    const x = p[node * 3];
    const y = p[node * 3 + 1];
    const z = p[node * 3 + 2];
    let best = node;
    let bestD = Infinity;
    for (const site of this.catalogue) {
      const dx = p[site * 3] - x;
      const dy = p[site * 3 + 1] - y;
      const dz = p[site * 3 + 2] - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = site;
      }
    }
    return best;
  }
}
