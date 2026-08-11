---
name: dark-lattice-build
description: Execute a substantial Dark Lattice website implementation pass against the existing repository and project design law. Use manually for a major hero, Three.js, system, responsive or editorial integration pass. Do not use for trivial local edits.
disable-model-invocation: true
---

# Dark Lattice Build

This is implementation, not open-ended ideation.

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

The direction is not yours to pick. **THE INTAKE is locked** — `docs/ARCHITECTURE.md` is the specification, and its build order says which step is next.

Locked does not mean implemented. `src/` predates the direction. Do not demolish the current implementation unasked, and do not start a later build step because an earlier one looks boring.

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
