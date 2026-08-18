---
name: dark-lattice-build
description: Execute a substantial Dark Lattice website implementation pass against the existing repository and project design law. Use manually for a major hero, Three.js, system, responsive or editorial integration pass. Do not use for trivial local edits.
disable-model-invocation: true
---

# Dark Lattice Build

This is implementation, not open-ended ideation.

## STOP — the approval gate

**This skill is closed until a visual journey is approved.**

Read `docs/APPROVED_VISUAL_JOURNEY.md` first. While its status line reads
anything other than `APPROVED`, do not touch:

```text
src/
proofs/src/
gate-b/src/
architectures/
tools/blender/
public/models/
```

Approval is not inferred from positive language, enthusiasm, or a frame that
looks good. It exists only when Jacob's exact phrase is written into that file:

```text
DARK LATTICE <H1/H2/H3> VISUAL JOURNEY APPROVED
```

Open while the gate is closed: bug fixes, accessibility, performance, editorial
content, legal pages, tooling, capture harnesses.

**Do not build a small proof to illustrate a proposal.** Thirteen carriers died
because code preceded an approved picture, and a proof is the same move at a
smaller size. Art direction belongs to `dark-lattice-web`.

When the gate opens, technology is chosen at Gate 6 of the execution kit by the
cheapest method that preserves the approved image, and recorded in
`docs/TECHNICAL_FIDELITY_DECISION.md`. Never chosen for prestige.

## Gate 0 — establish truth

Read:
- `${CLAUDE_PROJECT_DIR}/CLAUDE.md`
- relevant `dark-lattice-web` references.

Use `repo-researcher` for broad inspection.

Map important facts:

```text
KNOWN
INFERRED
UNKNOWN
```

Before coding verify:
- package manager/scripts,
- actual Vite/TypeScript/Three/GSAP versions,
- current Three.js integration,
- current hero/layout,
- styling/animation approach,
- routes/company content,
- existing tests/browser tooling,
- current build/run procedure.

Do not install anything merely because a skill, plan or instruction file mentions it. If a document and the repository disagree, the repository wins — say so and stop rather than installing toward the document.

Before any install, read the package's `peerDependencies`. npm installs missing peers automatically, so an install can migrate the architecture (React, R3F) while reporting success.

Resolve implementation-critical UNKNOWNs.

## Gate 1 — contract

Write a short internal contract:

```text
Goal:
Constraints:
Acceptance:
Non-goals:
```

The direction is not yours to pick. It comes from the approved frames recorded in
`docs/APPROVED_VISUAL_JOURNEY.md`, and the build order is the execution kit's
Gates 6 to 9 in `docs/DARK_LATTICE_THREE_HYBRIDS_EXECUTION_KIT.md`.

`docs/ARCHITECTURE.md` is authority for the **stack only** — Vite, TypeScript,
Three.js, GSAP, and the layer boundary. It is not the visual direction. THE
INTAKE staging it describes was retired, and so were `docs/CONTAINMENT_DIRECTION.md`,
`docs/PRODUCTION_PLAN.md` and `docs/CORRECTION_BUILD_PLAN.md` as build orders.
Do not build toward any of them.

Approved does not mean implemented. `src/` predates every current direction. Do
not demolish the existing implementation unasked, and do not start a later gate
because an earlier one looks boring.

## Gate 2 — YAGNI

Before new architecture/dependencies:

1. Is it required?
2. Can browser/language/platform solve it?
3. Can existing dependency solve it?
4. Can current project primitive be extended?
5. Can it remain local/simple?
6. Add minimum new mechanism only if necessary.

## Gate 3 — vertical slice

Implement the smallest end-to-end slice that proves:
- integration,
- visual/system behavior,
- lifecycle,
- verification path.

Do not first build a large abstraction layer.

For a visual hero:
1. composition/geometry,
2. camera,
3. authoritative state,
4. material response,
5. post FX last.

Do not hide bad composition under bloom/fog/shaders.

## Gate 4 — verify the slice

Run:
- focused build/static checks,
- actual browser,
- screenshot/interaction appropriate to the feature.

If it fails, debug before expanding.

## Gate 5 — expand

Add remaining behavior incrementally.

Keep:
- authoritative deterministic state outside GPU-only visual effects,
- per-frame state inside the Three.js system rather than the DOM layer,
- resource ownership/cleanup explicit,
- mobile/reduced-motion/fallback viable.

## Gate 6 — editorial clarity

Ensure the site directly explains:
- thesis,
- Desk42,
- Brawler,
- technology,
- studio,
- contact.

Do not let cinema bury the company.

## Gate 7 — completion

Use `visual-verification`.

Clean:
- dead experiments created by the change,
- duplicate logic,
- obsolete temporary paths.

Run final:
- production build,
- available lint/typecheck/tests,
- browser evidence.

Then delegate a cold final review to `dark-lattice-auditor`.

Do not declare completion while BLOCKER/HIGH audit findings remain.
