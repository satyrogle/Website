---
name: dark-lattice-web
description: Source of truth for Dark Lattice website art direction, editorial clarity, Vite/TypeScript/Three.js boundaries, deterministic visual systems, responsive behavior, performance and accessibility. Use for any website change that can materially affect the hero, visual language, realtime system, motion, company presentation or frontend architecture.
---

# Dark Lattice Web

Read only the references needed for the current task.

- Locked direction (THE INTAKE): `docs/ARCHITECTURE.md` in the repository root — read this before any hero, scene or system work
- Meaning and visual law: `references/philosophy-visual-law.md`
- Retired record, not a specification: `references/hero-concept.md`
- Stack, Three.js/system implementation: `references/engineering-simulation.md`
- Editorial, responsive, performance and accessibility: `references/content-performance-accessibility.md`
- Completion criteria: `references/acceptance-tests.md`

## Authority

`CLAUDE.md` is the project-level authority.

This skill provides detail.

If a generic external skill conflicts with Dark Lattice-specific visual or architectural constraints, preserve the project constraints unless the user explicitly changes them.

## Protocol

1. Inspect the current implementation.
2. Identify the single intended user-visible/system change.
3. Preserve existing architecture and strong visual choices unless the task requires replacing them.
4. Tie non-trivial visual behavior to a real mechanism:
   - geometry,
   - camera,
   - deterministic state,
   - spatial relationship,
   - material/light,
   - causal interaction.
5. Prefer one coherent visual proposition over multiple effects.
6. Implement geometry/layout/composition before using post-processing to polish it.
7. Keep editorial/company content legible.
8. Verify the running site.

## Anti-slop test

Before finishing, ask:

- Could this be mistaken for a generic AI landing page?
- Is one design idea dominant?
- Are effects compensating for weak composition?
- Does the menace come from understanding the system?
- Is mobile authored?
- Is text readable?
- Does each animation have a cause?
- Did the implementation add framework/library assumptions not present in the repo?

If a failure exists, simplify or correct it.
