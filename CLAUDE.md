# Dark Lattice site — genesis branch

This branch (`claude/genesis`) is an isolated rebuild, started
2026-08-18 at Jacob's instruction, deliberately unbound from the
process documents of the main repository. Its own README.md describes
what it is and how it is built.

Rules that bind edits here:

- Stack is Vite + TypeScript + Three.js + GSAP. No React, no framework
  migration, no scroll-smoothing library, no external requests (fonts
  are system fonts on purpose).
- One simulation, one authoritative state. Renderers observe; the
  ScrollDirector maps scroll to observational scale and never invents
  behaviour. A press travels input → state → visible consequence →
  record.
- Determinism language: seeded, fixed-step, replayable in the tested
  environment. Never claim more.
- Company copy states only what the studio can substantiate. No
  invented numbers, benchmarks or dates. Contact is
  contact@darklattice.co.uk.
- Jacob judges visuals by looking at them on his own GPU. Measurements
  diagnose; they do not accept.
