# Phase 0 — Repository truth ledger

Adjudication artifact, 2026-08-12. Read-only findings, tagged KNOWN (verified
by reading code/git), INFERRED, or UNKNOWN. Scope: what THE CORRECTION's paper
evaluation and kill test depend on.

## Stack and branch state

- KNOWN — Stack is Vite 6 + TypeScript 5.9 + three 0.170 + gsap 3.15. No
  React, R3F, Motion, Lenis, Tailwind, shadcn anywhere in the tree. `npm run
  build` (tsc + vite) passes clean on the current commit.
- KNOWN — Current branch `claude/signal-horizon-v1` = main tip `d58e047` plus
  docs-only commits (latest `7d95b53`: INTAKE lock + bundle stack correction).
  The branch name predates the direction and is stale; the content is correct.
- KNOWN — Direction docs state: THE INTAKE is locked in `docs/ARCHITECTURE.md`
  and CLAUDE.md, and is under founder review (not landing). Adjudication is
  running paper-only, scoped by the founder to THE CORRECTION. Canonical docs
  stay untouched until a decision receipt exists.

## Current hero (what is actually on screen)

- KNOWN — `src/scene/LatticeModel.ts` is "ENTITY v7: THE CROWNED CONVERGENCE",
  fully procedural (mergeGeometries from primitives; no GLTFLoader anywhere in
  current `src/`). It is the last state of the retired entity lineage.
- KNOWN — `src/scene/ReactionField.ts` is GPU Gray–Scott in ping-ponged
  half-float render targets — visual state, unrelated to the causal-pulse
  subsystem. `ScrollDirector` owns scroll→narrative banding on native scroll.

## The spike engine (what THE CORRECTION reuses)

- KNOWN — Branch `claude/causal-pulse-spike-v1` exists **locally only** (never
  pushed; no origin counterpart). It branches off the same main tip `d58e047`.
  **Risk: one disk failure loses the engine. Recommend pushing the branch.**
- KNOWN — `src/labs/causal-pulse/simulation/CausalPulseSimulation.ts` (335
  lines): damped wave + diffusion over a CSR graph Laplacian, plain typed
  arrays, symplectic Euler, fixed dt = 1/120, CFL stability check at
  construction, zero randomness, FNV-1a checksum over quantised state.
- KNOWN — The graph is an injected constructor parameter (`CausalGraph` CSR
  bundle + `StabilityBounds`). The engine knows nothing about meshes. Feeding
  it an arbitrary in-memory node/edge list is trivial at this layer.
- KNOWN — The only existing graph *producer* (`tools/build-causal-graph.mjs`,
  ~855 lines, deterministic, no RNG) is specific to `DL_Aurora_v13.glb` — the
  retired entity mesh. **THE CORRECTION must not use it.** A new small
  deterministic generator (seeded irregular scatter + proximity edges, CSR
  output, stability bound via power iteration or max-weighted-degree bound) is
  required and cheap.
- KNOWN — Worker architecture exists and ports as-is: `PulseWorker.ts` steps
  the sim on a fixed-timestep accumulator and publishes transferable
  snapshots; `PulseClient.ts` is the one-snapshot-at-a-time main-thread handle.
  The channel is one-directional by design (state out, inject messages in).
- KNOWN — **The engine is purely passive.** No constraints, no quantisation
  (outside checksum rounding), no feedback, no corrective forces. Retained
  memory is bookkeeping that never re-enters dynamics. The correction operator
  (admissible band, hysteresis, projection, correction-energy accounting) is
  genuinely new code layered on top.
- KNOWN — Validation culture exists and extends: `causal-pulse-validate.mjs`
  (9 headless acceptance checks incl. determinism), `-calibrate.mjs` (derives
  display mapping from scripted strikes into the manifest), `-bench.mjs`
  (step-cost across graph sizes). Prior graph ran ~6,158 nodes comfortably.
- KNOWN — Isolation convention exists: `causal-pulse.html` is a separate Vite
  entry sharing no module with production `index.html`. The CORRECTION spike
  copies this convention exactly.

## Capture and evidence tooling

- KNOWN — All seven browser tools (`capture/deliver/diagnose/og/record/
  sequence/shot.mjs`) hardcode headless Chromium with SwiftShader software-GL
  flags. **No real-GPU capture path exists in tooling.** README documents the
  limitation; project law (from the pow(0,y)=NaN incident) is that SwiftShader
  captures are not GPU truth.
- Consequence for the kill test: judged frames must come from a real browser
  on the 3060 (dev server + real Chrome), or from a ~10-line `shot.mjs`
  variant with the SwiftShader flags removed and `headless: false`. Specced in
  04, not built.
- KNOWN — No Playwright config exists and none is needed (`playwright` is used
  as a library from node scripts; no test runner). npm scripts are only
  dev/build/preview; all tools run via `node tools/x.mjs`.

## Working-tree hygiene (adjacent, already chipped)

- KNOWN — `public/generated/causal-pulse/{graph.bin,vertex-map.bin}` (~1.9 MB)
  are orphaned local outputs of the spike branch's builder, untracked,
  unreferenced by current `src/`, and not gitignored. `.env.local` and the
  501 MB `references/models-archive/` are likewise untracked and unignored.
  A separate task exists to fix `.gitignore`. Do not commit these.

## Unknowns that remain (none block paper)

- UNKNOWN — Real per-step cost of the correction operator on the target graph
  (bench tooling exists to answer this in minutes during the spike).
- UNKNOWN by design — First-frame beauty and enforcement legibility. These are
  Level-1/2 questions; no amount of paper resolves them. The kill test exists
  because of exactly this.
