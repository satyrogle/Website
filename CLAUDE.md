# Dark Lattice Website

## Product

Dark Lattice is a technology/game studio building systemic products and games around deterministic simulation, state, consequence and emergent behavior.

The website must embody that thesis while still explaining the company clearly.

## Experience law

The visitor should first experience:
- beauty,
- control,
- order,
- precision.

Unease should emerge through:
- causality,
- constraint,
- memory,
- reinterpretation,
- comprehension.

Internal shorthand:

**The interface can appear divine. The system becomes menacing through understanding.**

Do not use a cheap monster reveal, jumpscare, generic evil-AI language, or arbitrary horror transformation.

## Direction status

**THE CORRECTION: CHOSEN 2026-08-12. BUILD IN PROGRESS.**

`docs/CHOIR_BUILD_PLAN.md` is the build order and is authoritative for implementation (carrier locked by Jacob 2026-08-12: a one-way anisotropic flow field of dark blades forced around an off-centre forbidden volume — any halo/aureole exists only as perceptual gestalt, never as geometry; it supersedes `docs/CORRECTION_BUILD_PLAN.md`, whose sim and interaction canon it carries forward). `docs/decision/02-correction-dossier.md` holds the design detail. Read the plan before any hero, scene, camera, system or editorial work.

Reality is permitted to deviate briefly; the system enforces convergence to the recorded, approved state. The opening calm is late-understood as maintained, not natural. At the floor: `YOUR RECORD — ADJUSTMENTS APPLIED: N.`

The causal argument in `docs/ARCHITECTURE.md` — colour grammar, observation model, `V = D × C`, the false first action, YOUR RECORD, skip path, persistence, positioning — remains canonical and carries into THE CORRECTION. Only its INTAKE staging (descent/growth/cathedral) is retired.

Retired. Do not rebuild, re-propose, or audit against:
- THE INTAKE descent/growth/cathedral staging (founder-vetoed before build),
- False Façade / Anamorphic Threshold Guardian — `.claude/skills/dark-lattice-web/references/hero-concept.md` is kept as a record only,
- THE LATTICE / excess-order ascent,
- the central entity, the trench/strata/truss stage, the Signal Horizon terrain, the nine-movement structure.

Work `docs/CORRECTION_BUILD_PLAN.md` one step at a time. Jacob judges the two visual checkpoints on his own GPU. Audits and QA phases run after the build stands, not before.

Invariants that bind every edit:
- **Colour grammar.** Cyan is the world, amber is the model of the world (and therefore the divine face), violet is the consequence of their disagreement. Never redefined per section.
- **Banned vocabulary** in code, comments, commits, filenames and copy: `FULL FORM`, `MONOLITH`, `SEVEN MASSES`, `TUNNEL ENTITY`, `LATENT FORM`, `HERO GLB`. Use `face`, `mouth`, `descent`, `shaft`, `floor`, `cathedral`.
- **No rotational symmetry.** Zero cylindrical parameterisation anywhere in the pipeline; any capture frame that reads as concentric rings fails. That is how the retired tunnels died.

## Technical direction

`package.json` and `docs/ARCHITECTURE.md` are authoritative. They override this file, every planning document, and any skill that disagrees. **Never migrate frameworks or introduce an alternate rendering/animation architecture without explicit user approval.**

Locked stack:

- Vite + TypeScript. **No React.**
- Three.js + WebGL2 + GLSL for the realtime visual system.
- GSAP/ScrollTrigger for authored scroll and camera orchestration only.

Locked out until a specific requirement passes the YAGNI/architecture gate and Jacob approves it:

React, React Three Fiber, Drei, Motion, Lenis, Tailwind, shadcn, a UI library, a design system, or another animation/rendering framework.

Two traps this rule exists to prevent:

- **Indirect migration.** npm installs missing peer dependencies automatically, so a dev-tool install (`r3f-perf`, `leva`) silently pulls React/R3F into the tree and changes the architecture while reporting success. Read `peerDependencies` before installing anything.
- **Re-litigated experiments.** Lenis was already tried and removed — see the reasoning in `src/motion/ScrollDirector.ts`. Check whether a proposed dependency has already been rejected here.

If a development tuning panel is genuinely needed, the vanilla-compatible option is Tweakpane, not Leva. Until then, constants and config objects are enough.

Add a dependency only when the requirement demonstrably needs it. Inspect `package.json`, source structure and scripts before assuming versions, commands or architecture.

## Design invariants

- One dominant authored visual system.
- Strong negative space and hierarchy.
- Motion must express state, causality, depth, focus or comprehension.
- Glitch/noise/distortion must be rare and meaningful.
- Menace comes from the system, not decoration.
- Mobile is a deliberate recomposition, not a scaled desktop frame.
- Typography and company information remain readable.

Reject:
- generic SaaS card walls,
- dashboard chrome,
- purple/cyan gradient-on-black AI styling,
- excessive glassmorphism,
- glowing borders everywhere,
- generic portal rings,
- stock cyberpunk HUDs,
- runes/chains/skulls/tentacle clutter,
- particle storms,
- fantasy cathedral clutter — note THE INTAKE's `cathedral` is the amber reconstruction of the descent, never gothic set dressing,
- a fully obvious monster on first load,
- motion on every element.

## Company clarity

Directly reachable editorial content must explain:

1. Dark Lattice thesis
2. Desk42
3. Brawler
4. deterministic-systems technology/approach
5. studio/company
6. contact

A player, collaborator, press contact or endorsement assessor must understand the company without decoding the hero metaphor.

## Determinism

Authoritative interactive/system state must be:
- explicitly seeded where randomness exists,
- fixed-step where simulation timing matters,
- reproducible from the same seed + bounded input trace when that claim is made,
- free of `Math.random()` in important deterministic runtime logic.

GPU shader/reaction-diffusion output is visual state, not a cross-device deterministic authority.

## Application / Three.js boundary

The DOM/TypeScript layer owns:
- boot sequence and application lifecycle (`src/main.ts`),
- DOM UI and editorial content,
- navigation,
- accessibility,
- input and scroll progress,
- coarse experience state.

`ScrollDirector` is the single seam between the layers. It maps scroll onto narrative progress and drives GSAP/ScrollTrigger for authored camera and DOM timing.

Three.js owns:
- scene objects,
- camera,
- geometry and shaders,
- per-frame transforms,
- materials/uniforms,
- deterministic simulation,
- render-loop calculations,
- realtime visual simulation.

Per-frame numerical state stays inside the Three.js system. Do not route it through the DOM layer without a real DOM requirement.

Clean up owned listeners, loops, geometries, materials, textures and render targets when their lifecycle ends.

## Working rule

Small change:
1. inspect,
2. edit,
3. focused verification.

Large/visual/architectural change:
1. map repository,
2. establish goal/constraints/acceptance,
3. implement one vertical slice,
4. render and verify,
5. expand,
6. cold audit.

Use:
- `context-discipline` for broad/long work,
- `dark-lattice-web` for project design/Three.js/system rules,
- `dark-lattice-build` for a serious implementation pass,
- `systematic-debugging` when behavior is broken,
- `visual-verification` before frontend completion.

Use `repo-researcher` for wide read-only exploration.

Use `dark-lattice-auditor` as the final cold reviewer.
