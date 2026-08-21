# Dark Lattice Hero Corruption — Locked Implementation Spec

## Intent
A single diagonal **surface corruption / disease stroke** on one hero face.

It must vaguely remember a 3–4 claw rhythm, but it is **not a literal scratch, tear, gouge, crack, or wound**. The effect is a material-state failure: an uneven brush gesture made from roughness changes, shallow diseased relief, clustered breakup, and sparse matrix-like particles.

## Visual hierarchy
1. From landing distance: one strange diagonal blemish, easy to miss.
2. Mid-distance: it resolves into an irregular diseased brush band.
3. Close: 3–4 broken parallel currents appear inside it.
4. Very close: particulate/data-like pinpricks and micro-streaks become visible.

## Channel priority
- Roughness: 50%
- Normal / shallow bump: 25%
- clustered breakup: 15%
- albedo: 7%
- emission: 3%

## Hard prohibitions
- Do not cut the mesh.
- Do not change the hero silhouette.
- Do not use boolean gouges.
- Do not make four clean slash marks.
- Do not use blood, red, orange, lava, molten metal, or exposed silver.
- Do not make the entire band glow.
- Do not use a repeating procedural noise that tiles visibly.
- Do not cover both hero blades.
- Do not create a decal that looks pasted on.

## Placement
One outer hero face only. Lower-left to upper-right diagonal, crossing roughly 55–70% of that face's width and 35–50% of its height. The ends taper and dissolve.

## Acceptance test
PASS only if:
- silhouette is identical with shader on/off;
- at thumbnail size the hero is still holy/clean;
- at medium size the diagonal corruption becomes readable;
- at close range the band contains broken claw-memory currents;
- less than ~5% of the affected pixels are emissive;
- the effect still reads if emission is completely disabled;
- no viewer would describe it as "three scratches cut into the monument".

FAIL if:
- it looks like a tiger literally scratched stone;
- it resembles lava cracks;
- it reads as a decal/logo;
- it becomes a bright focal point stronger than the fissure;
- it makes the hero look diseased everywhere instead of locally corrupted.
