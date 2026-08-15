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

**THE CONTAINMENT: CHOSEN 2026-08-14. THE ENTITY IS THE HERO, AND IT IS THE WHOLE SUBJECT. THE PLANET IS RETIRED (2026-08-15).**

**`docs/CONTAINMENT_DIRECTION.md` is the lock (v5).** Chosen by Jacob 2026-08-14, superseding the ruptured-planet carrier as the hero. The inversion, and it is the whole brief:

```
CORRECTION = what you see
SUPPRESSION = what you eventually discover it is doing
```

The site opens on near-black with one enormous, extraordinarily ordered, **unclassifiable** structure — pale energetic trajectories, layered interference, impossible curvature. The visitor cannot say whether it is celestial, mathematical, biological or engineered. Disturbances propagate through it by branching fission; the system arrests them in reverse causal order and leaves a scar. The descent goes *into* the structure and finds no second subject waiting there: what the visitor comes to understand is that the harmony they were admiring is maintained — that every beautiful thing about it is a deviation being suppressed on a schedule. The revelation is ontological, not informational — comprehension, never a costume change, and nothing arrives to explain it.

**The wounded planet is RETIRED (2026-08-15, `CONTAINMENT_DIRECTION.md` amendment v5.2).** Not deleted from history, not relocated to Act III, not deferred — **out of the active direction**, and it may not be reintroduced anywhere without a new founder decision. `docs/HERO_DIRECTION.md` and `bc94903` are kept as a record of good engineering that is not being used. The entity alone carries beauty → comprehension → menace, because the entire thesis is already in one sentence: **the entity appears harmonious because deviation is being suppressed.** A planet left canonically "in Act III" is a planet some future agent starts building toward, which is how eleven carriers were consumed. Do no Blender or geology work on it.

Its old `## Never` list banned "Abstract entities", which had the effect of forbidding the thing the site is about. **That one ban is lifted.** Every other entry, and the symmetry law, still binds.

The diagnosis that killed the earlier abstract carriers — **visible primitives**: filaments read as spaghetti, a swept surface as a cutting board, lamellae as hanging anatomy — binds this direction harder than any before it, because the field is abstract by construction. The cure v5 names is **order**: the structure must read as one coherent system with impossible curvature, not as many strands. If the eye can classify the opening form, the direction has failed and dies at its kill test.

`docs/CHOIR_BUILD_PLAN.md` is **retired as a carrier** but remains authoritative for everything the carrier does not decide: colour grammar, the interaction canon (false first action, skip path, persistence, real `ADJUSTMENTS APPLIED: N`), determinism, integration bones and guardrails. `docs/decision/02-correction-dossier.md` holds the design detail. Read both before any hero, scene, camera, system or editorial work.

Reality is permitted to deviate briefly; the system enforces convergence to the recorded, approved state. The opening calm is late-understood as maintained, not natural. At the floor: `YOUR RECORD — ADJUSTMENTS APPLIED: N.`

The causal argument in `docs/ARCHITECTURE.md` — colour grammar, observation model, `V = D × C`, the false first action, YOUR RECORD, skip path, persistence, positioning — remains canonical and carries into THE CORRECTION. Only its INTAKE staging (descent/growth/cathedral) is retired.

Retired. Do not rebuild, re-propose, or audit against:
- THE INTAKE descent/growth/cathedral staging (founder-vetoed before build),
- False Façade / Anamorphic Threshold Guardian — `.claude/skills/dark-lattice-web/references/hero-concept.md` is kept as a record only,
- the trench/strata/truss stage, the Signal Horizon terrain, the nine-movement structure.

**Amended 2026-08-14.** This list previously retired "THE LATTICE / excess-order ascent" and "the central entity". Those entries are **withdrawn**, and the distinction matters: what was rejected was a *decorative* entity and a *decorative* tunnel — a scary final monster and a cool tunnel, neither of which the simulation drove. v5 does not restore them. It makes the structure the rendering of the causal graph that the correction system already steps, the tunnel the act of entering it, and the "entity" simply the total shape the visitor eventually comprehends. Nothing is added for its own sake; if a form is not produced by the authoritative simulation, it does not exist. Re-proposing the decorative versions remains forbidden.

**The active build order is `docs/CONTAINMENT_DIRECTION.md`'s kill criterion:
build Act I and the first mechanism beat only** — black → field → autonomous
fission → arrest → scar → `TOUCH IT` → visitor repeat → correction. No
editorial, no planet reveal, no new materials, no debris work. If that slice
does not produce beauty, order, and then the first suspicion that something
is *responding*, it dies there and `bc94903` remains the site.

`docs/PRODUCTION_PLAN.md` (2026-08-14) was written for the planet-as-hero
staging and is **paused**, not retired: its P1 (make one enforcement event
unmissable) is the same requirement v5 states, and its later phases resume if
and when the Act I slice passes. `CORRECTION_BUILD_PLAN.md` still governs
whatever neither decides. Jacob judges every named checkpoint on his own GPU;
if a kill criterion fires, stop and report rather than tune. Audits and QA
run after the build stands, not before.

**One authority.** The repository currently runs two correction realities:
the authoritative `PulseWorker` simulation, which nothing renders and whose
snapshot `consume()` calls "telemetry only", and `PlanetCorrection`, which
drives the visible planet. A visitor press is sent to both
(`SceneController.ts` — `correction.injectAt` and `client.inject`). This is
the architecture the company's own thesis forbids. Collapse it: one
deterministic state model, renderers that observe snapshots, and a press
that travels `input → authoritative state → visible consequence → record`
and nowhere else. Do not add a third simulation; the Act I field must read
the same snapshot.

Invariants that bind every edit:
- **Colour grammar.** Cyan is the world, amber is the model of the world (and therefore the divine face), violet is the consequence of their disagreement. Never redefined per section.
- **Banned vocabulary** in code, comments, commits, filenames and copy: `FULL FORM`, `MONOLITH`, `SEVEN MASSES`, `TUNNEL ENTITY`, `LATENT FORM`. Use `face`, `mouth`, `descent`, `shaft`, `floor`, `cathedral`. (`HERO GLB` was unbanned by `docs/HERO_DIRECTION.md` — it belonged to the retired entity work, not to authored live geometry.)
- **No rotational symmetry.** Zero cylindrical parameterisation anywhere in the pipeline; any capture frame that reads as concentric rings fails. That is how the retired tunnels died. On the planet this binds as: no perfect circles — crater rims are modulated per-azimuth on unshared axes, and no camera pose looks straight down the blast corridor, which is the pose that stacks the debris trail into concentric depth.
- **Light belongs to the break, not to the object.** Exterior crust is near-black geology; heat exists only on fresh cut faces, deep fissures and the internal rupture. Equal glow on every silhouette is the fault that made forty pieces read as lit assets.

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
