/**
 * The file the system keeps between visits.
 *
 * `localStorage` only. No account, no fingerprinting, no backend, no
 * cross-device identity — a company arguing that records are incomplete has no
 * business building a good one.
 *
 * The install seed is generated once and never changes. Everything downstream
 * of it is deterministic, so two visitors see different divergences and the
 * same visitor sees the same ones on the same visit number. It comes from
 * `crypto`, not `Math.random`: it is an identity rather than simulation state,
 * and the simulation never reads it as a timing input.
 */

/**
 * Namespaced while this is a prototype.
 *
 * The canon names the key `darkLattice.record`, and that is what this becomes
 * when the containment layer replaces the current record. It cannot use it
 * yet: `src/content/RecordController.ts` owns that key with a different shape
 * and commits to it the moment the site loads, so sharing it means each
 * clobbers the other — and the skip path navigates to the editorial, which is
 * exactly the moment the collision fires. Testing the slice would quietly
 * destroy the visitor's real record.
 */
export const STORE_KEY = 'darkLattice.record.containment';
const VERSION = 1;

/**
 * Recorded events kept across visits. The file is not allowed to grow without
 * bound, so the oldest entries fall off — which is an ordinary retention
 * policy, and also the reason a long-returning visitor's earliest adjustments
 * cannot be produced on request.
 */
const MAX_EVENTS = 200;

export interface StoredEvent {
  source: 'VISITOR';
  node: number;
  tick: number;
  paths: number;
  divergence: string;
  visit: number;
}

export interface StoredVisit {
  index: number;
  /** Wall clock, for the file only. Never fed to the simulation. */
  at: number;
  events: number;
  adjustments: number;
  /** The visitor asked for the work directly. Recorded, never penalised. */
  skipped: boolean;
  /** What the floor prints about this visit, derived rather than authored. */
  statement: [string, string];
}

export interface StoredRecord {
  version: number;
  seed: number;
  visits: StoredVisit[];
  events: StoredEvent[];
}

const blank = (seed: number): StoredRecord => ({ version: VERSION, seed, visits: [], events: [] });

function newSeed(): number {
  const buffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buffer);
  // Never zero: a zero seed makes every hash downstream collapse to a constant.
  return buffer[0] || 0x5eed_1a77;
}

function read(): StoredRecord | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredRecord;
    if (parsed?.version !== VERSION || typeof parsed.seed !== 'number') return null;
    if (!Array.isArray(parsed.visits) || !Array.isArray(parsed.events)) return null;
    return parsed;
  } catch {
    // Private browsing, a full quota, a hand-edited value, storage disabled by
    // policy. The visit proceeds as a first visit; the record is a feature of
    // the argument, not a requirement for the site to run.
    return null;
  }
}

export class Visit {
  readonly seed: number;
  /** 0 on the first visit, and an input to which divergence the file makes. */
  readonly index: number;
  readonly prior: StoredRecord;
  /** Adjustments the file already held before this visit began. */
  readonly priorAdjustments: number;

  private readonly available: boolean;

  constructor(now: number) {
    const existing = read();
    this.available = existing !== null || this.canWrite();
    this.prior = existing ?? blank(newSeed());
    this.seed = this.prior.seed;
    this.index = this.prior.visits.length;
    this.priorAdjustments = this.prior.visits.reduce((n, v) => n + v.adjustments, 0);

    this.prior.visits.push({
      index: this.index,
      at: now,
      events: 0,
      adjustments: 0,
      skipped: false,
      statement: ['SIMULATION   Not entered.', 'RECORD       No entries.'],
    });
  }

  private canWrite(): boolean {
    try {
      const probe = `${STORE_KEY}.probe`;
      globalThis.localStorage.setItem(probe, '1');
      globalThis.localStorage.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  }

  /** Everything the file holds, this visit included. */
  get total(): number {
    return this.priorAdjustments;
  }

  get stored(): boolean {
    return this.available;
  }

  /**
   * Write the visit back. Called after every event rather than on unload:
   * `beforeunload` does not fire reliably on mobile, and a record that loses
   * the last thing you did is a different argument from the one being made.
   */
  commit(
    events: StoredEvent[],
    adjustments: number,
    skipped = false,
    statement: [string, string] = ['SIMULATION   Not entered.', 'RECORD       No entries.']
  ): void {
    if (!this.available) return;
    const current = this.prior.visits[this.prior.visits.length - 1];
    current.events = events.length;
    current.adjustments = adjustments;
    current.skipped = skipped;
    current.statement = statement;

    // Replace this visit's slice rather than append to it. Committing after
    // every event, a plain concat re-added the whole visit each time: two
    // events became three stored, four became six, and the file grew
    // quadratically in what it was supposed to be recording faithfully.
    this.prior.events = this.prior.events
      .filter((e) => e.visit !== this.index)
      .concat(events.filter((e) => e.visit === this.index))
      .slice(-MAX_EVENTS);

    try {
      globalThis.localStorage.setItem(STORE_KEY, JSON.stringify(this.prior));
    } catch {
      // Quota. The visit continues; the file simply stops growing.
    }
  }
}
