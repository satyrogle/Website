/**
 * Branching fission across the containment graph, and its arrest.
 *
 * A disturbance enters at one node and travels the trajectories. Where the
 * topology offers a junction it splits in two, so one becomes two becomes four
 * becomes eight and the structure grows brighter and vastly more complicated.
 * Then the system arrests it, and the paths are withdrawn IN REVERSE CAUSAL
 * ORDER — last-born first, unwinding back to the origin. A scar stays.
 *
 * Two laws:
 *
 * - **Deterministic.** Fixed step, seeded per event, no `Math.random` anywhere.
 *   The same seed and the same origin produce the same cascade, tick for tick.
 * - **Light is only ever produced here.** The renderer has a resting floor and
 *   an energy input, and nothing else. If a pixel brightens, this file made it
 *   brighten.
 *
 * The reverse unwind is the whole tell. Nothing natural retracts along its own
 * history, so the visitor reads the first event as beautiful and only later —
 * after repetition — as a response.
 */

import type { ContainmentStructure } from './ContainmentSynth';
import { mulberry32 } from '../correction/graph/random';

export interface FissionConfig {
  /** Fixed timestep. Simulation time, never frame time. */
  dt: number;
  /**
   * Trajectory-following speed, world units per second. Criticality is fast:
   * at a walking pace a front covers thirty edges inside the 700ms window and
   * the structure cannot become "vastly more complicated" because almost none
   * of it has been reached.
   */
  speed: number;
  /** Energy each child carries, as a fraction of its parent's. */
  split: number;
  /** Below this a front has nothing left to carry and dies. */
  cutoff: number;
  /** Ticks from ignition to the system noticing. */
  arrestAfter: number;
  /** Ticks the withdrawal takes. */
  arrestOver: number;
  /** Hard ceiling on concurrent fronts. */
  maxFronts: number;
  /** What the origin keeps, permanently, once the event has been corrected. */
  scar: number;
}

export const DEFAULT_FISSION: FissionConfig = {
  dt: 1 / 120,
  speed: 14.0,
  // Above a half, so two children carry more than their parent and the
  // cascade is genuinely supercritical — the frame has to get *brighter*, not
  // merely busier, or nothing about it reads as criticality.
  // 0.85 against the denser graph.
  //
  // At 0.78 the cascade was spending itself before the arrest window opened —
  // twenty-eight fronts dying on the energy floor at tick 75 against a
  // correction that starts at 84, which leaves a beat where nothing is
  // happening and nothing has been answered. Five times the edges means more
  // junctions per unit travelled, so each front divides more often and pays
  // more often.
  split: 0.85,
  cutoff: 0.12,
  // 84 ticks is 700ms: long enough that the growth is unmistakable, short
  // enough that the arrest feels like an interruption rather than an ending.
  arrestAfter: 84,
  arrestOver: 46,
  maxFronts: 512,
  scar: 0.55,
};

/**
 * How brightly a front excites the node it reaches.
 *
 * Energy is a front's capacity to keep travelling and dividing; it is not how
 * hard the structure is disturbed. Lighting nodes at the raw energy tied the
 * two together, so once a cascade ran three hundred arrivals deep its trail
 * arrived at three percent and seven hundred lit nodes were invisible. What a
 * passing disturbance does to a trajectory is nearly the same wherever it
 * happens; the small residual dependence just keeps the far tips from reading
 * as loud as the origin.
 */
const excite = (energy: number): number => 0.62 + 0.38 * Math.min(energy, 1);

/** Edges a single front may cross in one tick before the step gives up. */
const MAX_HOPS = 12;

/**
 * How far past the deviation range a correction pushes the node it takes.
 *
 * Purely visual — `flash` is written here, composed into energy and read by
 * the renderers, and no decision in this file ever consults it. Raised
 * because the correction was measuring 0.22% of the frame against the
 * cascade's 4%, so the sequence read as "something beautiful gets excited"
 * with a faint afterthought, rather than as a suppression.
 */
const ARREST_FLASH = 4.1;

/** How fast being near a trajectory disturbs it, per second of contact. */
const CONTACT_RISE = 2.4;
/** How fast that fades once the pointer has moved on. */
const CONTACT_FALL = 1.6;
/** Contact past this is a deviation the system has to answer. */
const CONTACT_IGNITE = 0.72;

/**
 * Ticks of quiet the system takes after finishing a correction.
 *
 * The per-node cooldown stops someone provoking the same trajectory twice, and
 * it is not enough: the structure is dense enough that a moving pointer crosses
 * a fresh trajectory every few frames, so a drifting mouse ignited continuously
 * and the machine strobed. A system that answers, settles, and is then
 * available again reads as deliberate; one that answers instantly and forever
 * reads as a toy. Two seconds at 120 Hz.
 */
const QUIET_AFTER_CORRECTION = 240;

/**
 * How far the visitor must move for a region to be worth answering again.
 *
 * About twice the radius the presence path gathers its region over, so the
 * next provocation comes from somewhere that shares no trajectories with the
 * last one. Held in world units because that is what the anchor is: the place
 * on the body that was answered, not an index into anything.
 */
const PRESENCE_REARM = 1.5;

/** What a neighbouring trajectory catches from an excited node. */
const SPILL = 0.55;

/**
 * What the system's sensor can see.
 *
 * Enforcement only ever acts on deviation past this level. Below it the sensor
 * reports nothing, so nothing is corrected — the file tolerates invisible
 * error while violently correcting visible error. This is why RESIDUAL
 * DEVIATION prints zero over a structure that is still moving: the zero is
 * honest arithmetic and a false statement at the same time.
 */
const SENSOR_THRESHOLD = 0.16;

/**
 * How much of a spill settles permanently into a trajectory nobody visited.
 *
 * Small on purpose. Drift is never corrected and never decays — that is the
 * whole claim — so its coverage only ever grows, and at 0.22 the field had
 * lifted 15% after three events and would have kept going until the contrast a
 * cascade needs was gone. Sub-threshold means barely perceptible by
 * definition: what the visitor should end up with is a structure that is very
 * slightly not what it was, everywhere, and a sensor reporting zero.
 *
 * Cut again for the denser structure: at 0.08 across fifty thousand
 * trajectories the field lifted 136% after three events, which is not
 * sub-threshold by any reading.
 */
const DRIFT_KEEP = 0.03;

/** Arrivals a lineage must travel between divisions. */
const BRANCH_GAP = 7;

/**
 * Two branches must part by at least this much — about thirteen degrees.
 *
 * Wide once, at fifty degrees, which starved the cascade: the flow makes
 * neighbouring trajectories near-parallel by construction, so genuine wide
 * forks occur at three percent of arrivals. The spacing rule above is what
 * actually stops branches cannibalising each other, so this only has to reject
 * a fork that is really the same path twice.
 */
const FORK_COS = 0.972;

/** What a front keeps when it simply carries on along its own trajectory. */
const TRAVEL_KEEP = 0.995;

interface Front {
  from: number;
  to: number;
  /** 0 at `from`, 1 at `to`. */
  t: number;
  /** Reciprocal edge length, so the step is a multiply. */
  invLen: number;
  energy: number;
  generation: number;
  /** Arrivals since this lineage last divided. */
  sinceBranch: number;
  alive: boolean;
}

export type FissionState = 'held' | 'deviating' | 'arresting';

export class Fission {
  /** Per-node energy for the renderer: 0 at rest, ~1 deviating, >1 arrested. */
  readonly energy: Float32Array;

  private readonly lit: Float32Array;
  private readonly flash: Float32Array;
  private readonly scar: Float32Array;
  /**
   * Deviation that never rose far enough to be seen.
   *
   * A cascade disturbs the trajectories beside the ones it runs along. Those
   * never cross the sensor's threshold, so the correction never sweeps them —
   * it only withdraws what it recorded — and they are still deviating when the
   * system declares the structure held.
   */
  private readonly drift: Float32Array;
  /**
   * Deviation the visitor is causing simply by being near.
   *
   * Presence disturbs the structure. It does not need a click, and asking for
   * one made the machine feel like a button: the field is supposed to react to
   * you, not wait to be operated. Contact rises while the pointer is on a
   * trajectory and falls when it leaves, and once it passes the threshold the
   * system has a deviation it must answer.
   */
  private readonly contact: Float32Array;
  /**
   * Presence INCLUDING what it spills onto neighbouring trajectories.
   *
   * Renderer-only, and the reason it has to exist: `compose()` spills a node's
   * contact into its neighbours' ENERGY, so every neighbour of a hovered node
   * carried event energy while its own contact stayed zero. A renderer that
   * subtracts contact to find the event therefore saw a real deviation there,
   * and a hover lit a blown cyan-white blob of several thousand nodes with
   * full halation behind it. Nothing about the simulation changes; this is the
   * same spill, recorded so the renderer can tell whose it is.
   */
  private readonly spread: Float32Array;
  private contactAt = -1;
  /**
   * Where on the body the visitor's presence was last answered.
   *
   * A PLACE, not an index. It was keyed to a sheet id, and when the five
   * sheets became one body that id became the constant zero — so the first
   * answered event marked the only lobe there is and presence never provoked
   * again for the life of the page. Worse, it was set inside `ignite()`, which
   * the system's own autonomous event also calls: a visitor whose pointer
   * happened to rest on the body during that event had their eligibility
   * consumed by something they did not do.
   *
   * So it is a world position, set only by the presence path when a presence
   * event actually starts, and cleared by moving away or by leaving the body
   * once the system is quiet again. `ignite()` no longer knows it exists.
   */
  private answeredAt: [number, number, number] | null = null;
  /** Wall-independent clock, so the quiet period is simulation time. */
  private clock = 0;
  private quietUntil = 0;
  /**
   * When each node was first lit, as a global sequence number.
   *
   * This is the causal record, and it is the entire mechanism behind the
   * reverse unwind: withdrawal is a frontier that walks this sequence
   * backwards, so a node cannot go dark before anything it caused.
   */
  private readonly litSeq: Int32Array;

  private fronts: Front[] = [];
  private sequence = 0;
  private tick = 0;
  private state: FissionState = 'held';
  private random: () => number = mulberry32(1);
  private origin = -1;
  private corrections = 0;
  private peak = 0;

  /** Why fronts ended. Real telemetry, and the only way to tune a cascade. */
  readonly tally = {
    arrivals: 0,
    branched: 0,
    crossShell: 0,
    continued: 0,
    deadEnd: 0,
    spent: 0,
    merged: 0,
  };

  constructor(
    private readonly structure: ContainmentStructure,
    private readonly config: FissionConfig = DEFAULT_FISSION
  ) {
    const n = structure.graph.nodeCount;
    this.energy = new Float32Array(n);
    this.lit = new Float32Array(n);
    this.flash = new Float32Array(n);
    this.scar = new Float32Array(n);
    this.drift = new Float32Array(n);
    this.contact = new Float32Array(n);
    this.spread = new Float32Array(n);
    this.litSeq = new Int32Array(n).fill(-1);
  }

  get active(): number {
    return this.fronts.length;
  }

  get phase(): FissionState {
    return this.state;
  }

  /** Enforcement events completed. This is what `ADJUSTMENTS APPLIED` counts. */
  get adjustments(): number {
    return this.corrections;
  }

  get peakFronts(): number {
    return this.peak;
  }

  /**
   * Deviation the system can see, in nodes. Zero once a correction completes,
   * and that is the number the floor prints.
   */
  get residual(): number {
    let n = 0;
    for (let i = 0; i < this.lit.length; i++) if (this.lit[i] > SENSOR_THRESHOLD) n++;
    return n;
  }

  /**
   * Per-node contact, for the renderers.
   *
   * Read-only and identical to what `compose()` already folds into energy —
   * nothing about the simulation changes by exposing it. The renderers need
   * it separately because presence and deviation must not look alike: contact
   * reveals the hidden graph where the visitor is, and cyan is reserved for
   * something the system actually did.
   */
  get presence(): Float32Array {
    return this.spread;
  }

  /** Deviation that is still there and was never above the threshold to see. */
  get unseen(): number {
    let n = 0;
    for (let i = 0; i < this.drift.length; i++) if (this.drift[i] > 0.001) n++;
    return n;
  }

  /** The visitor is near this trajectory. Raises its deviation while they are. */
  /**
   * The visitor is over a region of the entity.
   *
   * Takes the whole neighbourhood under the cursor rather than one node, and
   * the node nearest the actual ray hit as the point a cascade would start
   * from. Interacting with individual microscopic nodes was never going to
   * feel local: the field is dense enough that the hit test succeeded at every
   * pixel on screen, and depth rather than proximity decided which of the
   * dozens under the cursor won — so it answered up to seventy pixels away
   * from where the visitor was pointing.
   */
  hover(region: ArrayLike<number>, lead: number, at: readonly number[], seconds: number): void {
    if (lead < 0 || lead >= this.contact.length) return;
    if (this.answeredAt) {
      const dx = at[0] - this.answeredAt[0];
      const dy = at[1] - this.answeredAt[1];
      const dz = at[2] - this.answeredAt[2];
      if (dx * dx + dy * dy + dz * dz < PRESENCE_REARM * PRESENCE_REARM) {
        // This part of the body has been answered. Nothing accumulates here
        // until they go somewhere else with it.
        this.contactAt = -1;
        return;
      }
      this.answeredAt = null;
    }
    const rise = CONTACT_RISE * seconds;
    for (let i = 0; i < region.length; i++) {
      const n = region[i];
      this.contact[n] = Math.min(1, this.contact[n] + rise);
    }
    this.contactAt = lead;
  }

  /**
   * This presence event has been answered, at this place on the body.
   *
   * Called by the presence path and by nothing else. A press, a debug press
   * and the system's own eight-second event all leave presence eligibility
   * exactly as they found it — only presence spends presence.
   */
  presenceAnswered(at: readonly number[]): void {
    this.answeredAt = [at[0], at[1], at[2]];
  }

  /** Nothing is under the pointer. Everything relaxes. */
  release(): void {
    this.contactAt = -1;
    // Off the body entirely, and the system has finished answering: the whole
    // surface is available again. Leaving and coming back is a deliberate act
    // in a way that a pointer resting in one place is not, and the quiet
    // period is what stops that becoming a strobe.
    if (this.clock >= this.quietUntil) this.answeredAt = null;
  }

  /**
   * A node the visitor has disturbed past the point the system can ignore.
   * Returns -1 when there is nothing to answer for.
   */
  get provoked(): number {
    if (this.state !== 'held' || this.contactAt < 0) return -1;
    if (this.clock < this.quietUntil) return -1;
    return this.contact[this.contactAt] >= CONTACT_IGNITE ? this.contactAt : -1;
  }

  /** Origins the system has marked. They do not rewind. */
  get scars(): number {
    let n = 0;
    for (let i = 0; i < this.scar.length; i++) if (this.scar[i] > 0.001) n++;
    return n;
  }

  /**
   * Start a disturbance. Ignored while one is already running: the system
   * handles one deviation at a time, and a queue of overlapping cascades would
   * make the arrest unreadable.
   */
  ignite(node: number, seed: number): boolean {
    if (this.state !== 'held') return false;

    const { graph } = this.structure;
    const start = graph.offsets[node];
    const end = graph.offsets[node + 1];
    if (end <= start) return false;

    this.random = mulberry32(seed >>> 0);
    this.origin = node;
    this.tick = 0;
    this.sequence = 0;
    this.peak = 0;
    this.state = 'deviating';
    this.tally.arrivals = 0;
    this.tally.branched = 0;
    this.tally.crossShell = 0;
    this.tally.continued = 0;
    this.tally.deadEnd = 0;
    this.tally.spent = 0;
    this.tally.merged = 0;

    this.litSeq.fill(-1);
    this.lit.fill(0);
    // The accumulated pressure has been discharged into this event. Not the
    // same thing as presence eligibility, which this method deliberately does
    // not touch: `ignite()` is simulation machinery and answers for the system
    // as readily as for the visitor.
    this.contact.fill(0);
    this.contactAt = -1;

    this.mark(node);
    this.lit[node] = 1;

    // One path leaves. The doubling starts at the first junction it meets.
    const first = graph.neighbours[start + Math.floor(this.random() * (end - start))];
    // Ready to divide at the first junction it meets.
    this.fronts = [this.spawn(node, first, 1, 0, BRANCH_GAP)];
    return true;
  }

  private mark(node: number): void {
    if (this.litSeq[node] < 0) this.litSeq[node] = this.sequence++;
  }

  private spawn(
    from: number,
    to: number,
    energy: number,
    generation = 0,
    sinceBranch = 0
  ): Front {
    const p = this.structure.graph.positions;
    const dx = p[to * 3] - p[from * 3];
    const dy = p[to * 3 + 1] - p[from * 3 + 1];
    const dz = p[to * 3 + 2] - p[from * 3 + 2];
    const len = Math.hypot(dx, dy, dz) || 1e-4;
    return { from, to, t: 0, invLen: 1 / len, energy, generation, sinceBranch, alive: true };
  }

  /**
   * Where a front goes when it arrives.
   *
   * Never back the way it came, and preferentially onward: neighbours are
   * ranked by how well they continue the incoming direction, so a disturbance
   * reads as travelling rather than as a stain spreading outward. The best two
   * are taken where two exist, which is what makes the cascade double.
   */
  private choose(front: Front, out: number[], mayBranch: boolean): number[] {
    const { graph } = this.structure;
    const p = graph.positions;
    const node = front.to;

    let ix = p[node * 3] - p[front.from * 3];
    let iy = p[node * 3 + 1] - p[front.from * 3 + 1];
    let iz = p[node * 3 + 2] - p[front.from * 3 + 2];
    const im = Math.hypot(ix, iy, iz) || 1;
    ix /= im;
    iy /= im;
    iz /= im;

    out.length = 0;
    const family = this.structure.family;
    const shell = family[node];
    let bestA = -2;
    let bestB = -2;
    let bestShell = -2;
    let nodeA = -1;
    let nodeB = -1;
    let nodeShell = -1;

    for (let k = graph.offsets[node]; k < graph.offsets[node + 1]; k++) {
      const next = graph.neighbours[k];
      if (next === front.from) continue;
      // Only into fresh ground. Ranking purely by alignment sent both
      // branches into nodes the cascade had already burned, where they
      // arrived, found the disturbance ahead of them and died — so the event
      // starved two generations in. A front looks for somewhere to go.
      if (this.litSeq[next] >= 0) continue;
      let dx = p[next * 3] - p[node * 3];
      let dy = p[next * 3 + 1] - p[node * 3 + 1];
      let dz = p[next * 3 + 2] - p[node * 3 + 2];
      const m = Math.hypot(dx, dy, dz) || 1;
      const align = (dx * ix + dy * iy + dz * iz) / m;

      // The best way OFF this shell, tracked separately from the best way
      // onward. A link to another layer is poorly aligned with travel almost
      // by definition — it leaves sideways — so ranking everything together
      // buries it under the trajectory beside this one, which is the corridor
      // a sibling is already burning.
      if (family[next] !== shell && align > bestShell) {
        bestShell = align;
        nodeShell = next;
      }

      if (align > bestA) {
        bestB = bestA;
        nodeB = nodeA;
        bestA = align;
        nodeA = next;
      } else if (align > bestB) {
        bestB = align;
        nodeB = next;
      }
    }

    // A division takes the escape route where one exists.
    if (nodeShell >= 0 && nodeShell !== nodeA) {
      nodeB = nodeShell;
      bestB = bestShell;
    }

    if (nodeA >= 0) out.push(nodeA);

    // A fork has to fork.
    //
    // Ranked purely by alignment, the two best neighbours are usually the next
    // node along this trajectory and a node on the one beside it — nearly
    // parallel. Both children then run side by side through the same
    // neighbourhood and spend their lives arriving where the other has just
    // been: measured, 24 branches producing 17 merges, a cascade that doubled
    // on paper and went nowhere. Requiring the second branch to leave at a
    // real angle makes the two halves separate and travel, which is the
    // difference between a spreading stain and propagation.
    if (mayBranch && nodeB >= 0 && bestB > -0.35 && this.diverges(node, nodeA, nodeB)) {
      out.push(nodeB);
    }
    return out;
  }

  /** True when two outgoing edges part company rather than running together. */
  private diverges(node: number, a: number, b: number): boolean {
    const p = this.structure.graph.positions;
    let ax = p[a * 3] - p[node * 3];
    let ay = p[a * 3 + 1] - p[node * 3 + 1];
    let az = p[a * 3 + 2] - p[node * 3 + 2];
    let bx = p[b * 3] - p[node * 3];
    let by = p[b * 3 + 1] - p[node * 3 + 1];
    let bz = p[b * 3 + 2] - p[node * 3 + 2];
    const am = Math.hypot(ax, ay, az) || 1;
    const bm = Math.hypot(bx, by, bz) || 1;
    ax /= am;
    ay /= am;
    az /= am;
    bx /= bm;
    by /= bm;
    bz /= bm;
    return ax * bx + ay * by + az * bz < FORK_COS;
  }

  step(): void {
    if (this.state === 'held') {
      this.settle();
      return;
    }

    this.tick++;
    this.clock++;
    const { dt, speed, split, cutoff, maxFronts } = this.config;
    const advance = speed * dt;
    const next: Front[] = [];
    const picks: number[] = [];

    for (const front of this.fronts) {
      // One tick can carry a front across several edges.
      //
      // Criticality has to cross the structure inside its 700ms, and the
      // trajectories are sampled every tenth of a unit — at one edge per tick
      // a disturbance travelled a quarter of one curve and lit 0.8% of the
      // graph, which is a correct simulation of an event nobody can see. The
      // overshoot past a node is carried into the next edge rather than
      // discarded, so speed is a property of the disturbance and not of the
      // sampling.
      let live: Front | null = front;
      live.t += advance * live.invLen;

      for (let hop = 0; live && live.t >= 1 && hop < MAX_HOPS; hop++) {
        const overshoot = (live.t - 1) / live.invLen;

        const revisit = this.litSeq[live.to] >= 0;
        this.lit[live.to] = Math.max(this.lit[live.to], excite(live.energy));
        this.mark(live.to);

        if (revisit) {
          this.tally.merged++;
          live = null;
          break;
        }
        this.tally.arrivals++;

        if (this.state !== 'deviating') {
          live = null;
          break;
        }

        const mayBranch = live.sinceBranch >= BRANCH_GAP;
        const children = this.choose(live, picks, mayBranch);
        if (!children.length) {
          this.tally.deadEnd++;
          live = null;
          break;
        }

        const divides = children.length > 1;
        if (divides) {
          this.tally.branched++;
          if (this.structure.family[children[1]] !== this.structure.family[live.to]) {
            this.tally.crossShell++;
          }
        } else this.tally.continued++;

        const energy = divides ? live.energy * split : live.energy * TRAVEL_KEEP;
        if (energy < cutoff) {
          this.tally.spent++;
          live = null;
          break;
        }

        const carried = divides ? 0 : live.sinceBranch + 1;
        const at = live.to;
        const generation = live.generation + 1;

        if (divides) {
          // Both halves leave together and neither continues this tick's
          // traversal: a division is where the lineage ends.
          for (const child of children) {
            if (next.length >= maxFronts) break;
            const born = this.spawn(at, child, energy, generation, carried);
            born.t = overshoot * born.invLen;
            next.push(born);
          }
          live = null;
          break;
        }

        const onward = this.spawn(at, children[0], energy, generation, carried);
        onward.t = overshoot * onward.invLen;
        live = onward;
      }

      if (!live) continue;

      // Still in flight. The far end brightens as the disturbance approaches
      // it, so the segment lights from one end to the other.
      const reach = excite(live.energy) * Math.min(live.t, 1);
      if (reach > this.lit[live.to]) this.lit[live.to] = reach;
      if (next.length < maxFronts) next.push(live);
    }

    this.fronts = next;
    if (this.fronts.length > this.peak) this.peak = this.fronts.length;

    if (this.state === 'deviating' && this.tick >= this.config.arrestAfter) {
      this.state = 'arresting';
    }
    if (this.state === 'arresting') this.withdraw();

    this.compose();
  }

  /**
   * The correction: paths withdrawn last-born first.
   *
   * A frontier walks the causal sequence backwards, and any node lit after it
   * is put back to the approved state. Because the sequence is the order
   * causation actually happened, no node can be corrected before the node that
   * caused it — the cascade unwinds along its own history, which is the one
   * thing no natural process does.
   */
  private withdraw(): void {
    const elapsed = this.tick - this.config.arrestAfter;
    const through = Math.min(1, elapsed / this.config.arrestOver);
    const frontier = Math.ceil(this.sequence * (1 - through));

    for (let i = 0; i < this.litSeq.length; i++) {
      const seq = this.litSeq[i];
      if (seq < 0 || seq < frontier) continue;
      if (this.lit[i] <= 0) continue;
      // The instant of correction is the only violet in the scene: the
      // consequence of the world and the record disagreeing.
      // Above one, or the renderer never reads it as arrested.
      //
      // Deviation occupies 0..1 and arrest is what lies beyond it, so a flash
      // that merely inherited the node's own brightness stayed inside the
      // deviation range and the correction happened in cyan — the one moment
      // in the scene that is supposed to be violet, and it never fired.
      this.flash[i] = Math.max(this.flash[i], this.lit[i] * ARREST_FLASH);
      this.lit[i] = 0;
    }

    if (through >= 1) {
      // A front still travelling when the withdrawal finishes lit its
      // destination without ever arriving, so that node was never entered in
      // the causal record and the reverse sweep cannot reach it. It stayed lit
      // permanently, and the system reported HELD over forty-two trajectories
      // deviating above its own threshold — not a subtle lie about what it
      // cannot see, just a failure to finish. A completed correction leaves
      // nothing above the threshold by definition.
      this.lit.fill(0);
      this.fronts = [];
      this.state = 'held';
      this.quietUntil = this.clock + QUIET_AFTER_CORRECTION;
      this.corrections++;
      // The scar is at the ORIGIN, and nowhere else.
      //
      // Marking every corrected node left eleven percent of the structure
      // permanently lit after a single event, so three visits would haze the
      // whole field and the fourth would have nothing left to disturb. The
      // mark belongs where the record was contradicted: one point, microscopic,
      // unexplained, and it never rewinds.
      if (this.origin >= 0) {
        this.scar[this.origin] = Math.max(this.scar[this.origin], this.config.scar);
      }
    }
  }

  /** Held: nothing propagates, the arrest glow fades, the scars stay. */
  private settle(): void {
    let moving = false;
    for (let i = 0; i < this.flash.length; i++) {
      if (this.flash[i] <= 0.0005) continue;
      // Held a little longer, so the violet frontier is a body of light
      // sweeping back through the structure rather than a moving edge. The
      // withdrawal's own timing is untouched; this is how long the mark it
      // leaves takes to fade.
      this.flash[i] *= 0.962;
      moving = true;
    }
    if (moving) this.compose();
  }

  /** Contact decays everywhere except under the pointer. */
  relax(seconds: number): void {
    this.clock++;
    const { contact } = this;
    const fall = CONTACT_FALL * seconds;
    // Everything relaxes except what is under the cursor right now. The
    // region is re-raised each frame, so decaying all of it is correct and
    // avoids tracking which nodes were touched.
    for (let i = 0; i < contact.length; i++) {
      if (contact[i] <= 0) continue;
      contact[i] = Math.max(0, contact[i] - fall);
    }
    this.compose();
  }

  private compose(): void {
    const { energy, lit, flash, scar } = this;
    const drift = this.drift;
    const contact = this.contact;
    for (let i = 0; i < energy.length; i++) {
      let base = lit[i] > scar[i] ? lit[i] : scar[i];
      if (drift[i] > base) base = drift[i];
      if (contact[i] > base) base = contact[i];
      // Flash is added rather than blended, so a corrected node crosses 1 and
      // the renderer reads it as arrested instead of merely deviating.
      energy[i] = base + flash[i];
      // Rebuilt each frame from contact; the spill below adds to it.
      this.spread[i] = contact[i];
    }

    // Light spills onto the trajectories a disturbance runs beside.
    //
    // The simulation excites a few dozen nodes, and a few dozen one-pixel
    // segments in ten thousand is a hairline however bright it is made. This
    // does not change what is excited — it is how far the light from an
    // excited node reaches, which is the renderer's business. The result reads
    // as a corridor of disturbance rather than a scratch.
    const { offsets, neighbours } = this.structure.graph;
    for (let i = 0; i < energy.length; i++) {
      const v = lit[i] + flash[i] + contact[i];
      if (v <= 0.02) continue;
      const spilled = v * SPILL;
      // How much of that spill is the visitor standing there rather than the
      // system doing something. Same arithmetic, attributed.
      const presence = contact[i] * SPILL;
      for (let k = offsets[i]; k < offsets[i + 1]; k++) {
        const j = neighbours[k];
        if (energy[j] < spilled) energy[j] = spilled;
        if (this.spread[j] < presence) this.spread[j] = presence;
        // A trajectory the disturbance passed beside, never along. It is
        // nudged, it never crosses the threshold, and so it is never put back.
        if (this.litSeq[j] < 0) {
          const settled = spilled * DRIFT_KEEP;
          if (this.drift[j] < settled) this.drift[j] = settled;
        }
      }
    }
    if (this.state === 'held') {
      for (let i = 0; i < flash.length; i++) if (flash[i] > 0.0005) flash[i] *= 0.90;
    }
  }
}
