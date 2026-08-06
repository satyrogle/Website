/**
 * evidence.ts
 *
 * Every factual string on this site lives here so it can be checked
 * against source in one place.
 *
 * Sources:
 *   - Dark-Lattice-Cross-Engine-Reuse.md ("Honest Unity → Unreal
 *     picture" table, and "Strongest scalability wording")
 *   - CLAIM_LADDER_AND_LANGUAGE_GUARDRAILS.md (prohibited wording,
 *     approved replacements)
 *   - CURRENT_CASE_STATE.md (what is VERIFIED vs REPORTED vs UNKNOWN)
 *   - Dark_Lattice_Innovator_Founder_Business_Plan_v3_Controlled_Draft.md
 *
 * Rules enforced here:
 *   - No invented figures, dates, testimonials, partners or awards.
 *   - No "one proprietary engine" or "Dark Lattice Engine" wording.
 *   - Nothing marked REPORTED or UNKNOWN in the case-state register is
 *     presented as established fact.
 *   - The carry-over ranges are reproduced exactly, with the source's
 *     own caveat attached.
 */

export interface CarryOverRow {
  area: string;
  /** Lower bound of the stated range, percent. */
  low: number;
  /** Upper bound of the stated range, percent. */
  high: number;
  /** Exactly as written in the source table. */
  stated: string;
}

/**
 * The eleven-row Unity → Unreal carry-over table, reproduced verbatim
 * from the source document. Ranges are practical estimates, not
 * measurements — the caveat below travels with the table wherever it is
 * shown, and the bars are static geometry rather than animated counters.
 */
export const CARRY_OVER: CarryOverRow[] = [
  { area: 'Engine-specific gameplay code', low: 0, high: 20, stated: '0–20%' },
  { area: 'Algorithms and system logic', low: 80, high: 100, stated: '80–100%' },
  { area: 'Behaviour specifications', low: 80, high: 100, stated: '80–100%' },
  { area: 'Test cases / acceptance criteria', low: 70, high: 100, stated: '70–100%' },
  { area: 'Engine-independent game data', low: 80, high: 100, stated: '80–100%' },
  { area: 'Raw art assets', low: 70, high: 100, stated: '70–100%' },
  { area: 'Engine-specific shaders / VFX / UI', low: 10, high: 50, stated: '10–50%' },
  { area: 'Audio source assets', low: 90, high: 100, stated: '90–100%' },
  { area: 'Production workflows', low: 70, high: 100, stated: '70–100%' },
  { area: 'Commercial knowledge', low: 90, high: 100, stated: '90–100%' },
  { area: 'Company-owned IP', low: 100, high: 100, stated: '100% in principle' },
];

export const CARRY_OVER_CAVEAT =
  'These are practical ranges, not guaranteed engineering measurements. They describe a Unity-to-Unreal transition between two products, not a claim that any figure has been benchmarked.';

/** Verbatim from the source document's "Strongest scalability wording". */
export const SCALABILITY_STATEMENT =
  'Dark Lattice does not depend on copying one engine-specific codebase across every product. Its scalability comes from accumulating reusable technical knowledge, system architecture, proprietary implementations, production infrastructure, IP and market evidence across multiple releases. Where engine-specific code must be rewritten, the underlying problem has already been designed, tested and understood, reducing repeated discovery and development risk.';

export interface Claim {
  text: string;
  emphasis?: string;
}

/** What the supplied evidence supports. */
export const SUPPORTED: Claim[] = [
  {
    emphasis: 'Systems and specifications carry between engines; code often does not.',
    text: 'Rules, state definitions, data structures, equations, edge cases, expected behaviour, test cases and architecture decisions survive an engine change. Engine-specific gameplay code is assessed separately and largely rewritten.',
  },
  {
    emphasis: 'Desk42 is a single-player Windows PC game built in Unity.',
    text: 'The player operates inside an institutional claims system where evidence, policy, procedure, adjudication, queues, appeals and precedent create persistent consequences. Distribution is Steam PC first.',
  },
  {
    emphasis: 'Brawler is an action roguelite in development in Unreal Engine.',
    text: 'Its system-level proposition is a spatial simulation whose state is authoritative for movement, hazards, actor exposure and combat consequences, rather than a cosmetic effect layer.',
  },
  {
    emphasis: 'The reaction-diffusion methods are established; the implementation is ours.',
    text: 'Dark Lattice claims a gameplay implementation and toolchain built on established reaction-diffusion methods — not ownership of the underlying mathematics.',
  },
  {
    emphasis: 'Founder capability is demonstrable in public.',
    text: 'SatyBT is a founder-created behaviour-tree framework published under the MIT licence. It stands as inspectable evidence that the team can design, test, document, package and maintain reusable technical infrastructure.',
  },
  {
    emphasis: 'The commercial model is deliberately narrow.',
    text: 'Premium downloadable PC games through digital distribution, beginning with Desk42 and followed by Brawler. Reusable technology is an internal margin and execution advantage, not a product.',
  },
];

/** Claims Dark Lattice explicitly does not make. */
export const LIMITS: Claim[] = [
  {
    emphasis: 'Not one proprietary engine.',
    text: 'Dark Lattice does not sell, license or claim a named proprietary game engine. There is no separate customer, package, price, sales channel or licence revenue in the base case.',
  },
  {
    emphasis: 'Not direct code reuse across engines.',
    text: 'We do not claim that every line of code transfers between Unity and Unreal, and we do not claim that changing engine is cheap.',
  },
  {
    emphasis: 'Not a finished product.',
    text: 'The current Desk42 implementation is a bounded causal slice. It is not described as near-complete, production-ready or market-validated.',
  },
  {
    emphasis: 'No performance figures until measured.',
    text: 'No runtime benchmark, frame budget or simulation-scale figure is published here. Those follow a frozen build and recorded measurements, not an estimate.',
  },
  {
    emphasis: 'No market validation yet.',
    text: 'External playtests, store-page behaviour, wishlist data and purchase-intent work have not been completed. Comparable titles establish plausible categories and price bands; they do not evidence our demand.',
  },
  {
    emphasis: 'No price, date or scale commitments.',
    text: 'No release date, sales figure, final price, team size, partner, award or press claim appears on this site, because none is currently supported by inspected evidence.',
  },
];

export interface FoundationLayer {
  id: string;
  index: string;
  title: string;
  summary: string;
  body: string;
}

/** Movement 04 — the three layers the lattice separates into. */
export const FOUNDATION_LAYERS: FoundationLayer[] = [
  {
    id: 'source',
    index: '01',
    title: 'Source code',
    summary: 'What can transfer directly or through adaptation.',
    body: 'Pure logic — procedural generation, deterministic calculation, simulation maths, decision rules, state machines and data processing — can be ported or reimplemented relatively cleanly. Code written against a specific engine’s objects, UI, physics and editor tooling generally cannot. We treat this as the smallest of the three layers, and we size it honestly: for heavily engine-specific gameplay systems, direct carry-over is low.',
  },
  {
    id: 'design',
    index: '02',
    title: 'System design',
    summary: 'Rules, schemas, state models and architectural patterns.',
    body: 'The expensive part of the problem is not typing the implementation — it is deciding what the system must do. Rules, inputs and outputs, state definitions, equations, data structures, edge cases, expected behaviour, test cases, balancing assumptions and architecture decisions all survive an engine change intact. This is where the majority of accumulated value sits.',
  },
  {
    id: 'know-how',
    index: '03',
    title: 'Founder know-how',
    summary: 'The ability to reproduce and extend the systems efficiently.',
    body: 'Scoping, commissioning, IP control, build verification, playtesting, QA, release and feedback collection survive an engine change, as does everything the first product teaches about production duration, cost, player comprehension and route to market. The codebase may change. The company’s capability does not reset.',
  },
];

export interface Chapter {
  index: string;
  title: string;
  body: string;
}

/** Movement 05 — capability that accumulates. */
export const CHAPTERS: Chapter[] = [
  {
    index: '01',
    title: 'A capability that accumulates',
    body: 'Copying a premise does not reproduce an integrated architecture, its content grammar, its validation tools or the production know-how behind it. Each of those is cheap to describe and expensive to build. As they accumulate against each other, the distance between a description of the work and a reproduction of it grows.',
  },
  {
    index: '02',
    title: 'Every game leaves infrastructure behind',
    body: 'The next product does not begin from zero. We already know how the underlying systems should behave, what failed previously, how to test them, how to produce the product and how to take it to market. That is true even when the engine changes and the implementation is rewritten.',
  },
  {
    index: '03',
    title: 'Designed to ship commercially',
    body: 'The model is premium downloadable PC games sold through digital distribution, beginning with Desk42 on Steam and followed by Brawler. It does not depend on selling an engine, licensing a technology stack, obtaining a patent, winning a grant or entering enterprise simulation markets. A third product combining both systems is a roadmap direction, not a revenue dependency.',
  },
];

export interface GameState {
  id: string;
  name: string;
  role: string;
  prose: string;
  facts: [string, string][];
  connector?: string;
}

/** Movement 03 — three states of one system. */
export const GAME_STATES: GameState[] = [
  {
    id: 'desk42',
    name: 'Desk42',
    role: 'Persistent systems proof',
    prose:
      'An institutional claims system in which evidence, policy, procedure, adjudication, queues, appeals and precedent create consequences that persist. Hidden lived events are separated from official state, and scoped rulings propagate deterministically into later actions. Its role is to establish commercial execution and to harden the production foundation the later products build on.',
    facts: [
      ['Engine', 'Unity'],
      ['Platform', 'Windows PC, single player'],
      ['Distribution', 'Steam PC first'],
      ['Status', 'Bounded causal slice; not a finished product'],
    ],
    connector: 'persists into',
  },
  {
    id: 'brawler',
    name: 'Brawler',
    role: 'Reactive simulation',
    prose:
      'An action roguelite whose spatial field is authoritative for movement, hazards, actor exposure and combat consequences rather than decorative. The proposition is not the underlying mathematics, which is established prior art. It is the tactical statement: the player changes the environment, the environment changes the fight, and the player can exploit that deliberately.',
    facts: [
      ['Engine', 'Unreal Engine'],
      ['System', 'Deterministic reactive field'],
      ['Basis', 'Established reaction-diffusion methods'],
      ['Status', 'In development; benchmarks not published'],
    ],
    connector: 'combines into',
  },
  {
    id: 'roguelite',
    name: 'Roguelite',
    role: 'Persistent systems + reactive simulation',
    prose:
      'A third product may combine the persistent institutional causality proven in Desk42 with the environmental and agent simulation developed through Brawler. Scope and production commitment follow evidence from the first two products on demand, cost, production time and reusable capability — not the other way round.',
    facts: [
      ['Status', 'Roadmap direction'],
      ['Commitment', 'Conditional on prior evidence'],
      ['Dependency', 'Not a base-case revenue line'],
    ],
  },
];
