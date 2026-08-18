# RETIRED — False Façade / Anamorphic Threshold Guardian

## Status

**RETIRED 2026-08-11.** Superseded by THE INTAKE, which was itself retired by the
2026-08-17 refoundation. There is no locked visual direction: see `CLAUDE.md` and
`docs/APPROVED_VISUAL_JOURNEY.md`. `docs/ARCHITECTURE.md` is stack authority
only and never named the direction.

This file is a graveyard record, kept so the direction is not accidentally reinvented. It is not a specification. Do not build it, propose it, or audit against it.

The rest of this document is preserved as written when it was a candidate.

## Core idea

One monumental structure is distributed through depth.

From the opening camera it reads as severe architecture.

At one authored reveal viewpoint, the same fixed geometry aligns in screen space into an incomplete threshold-guardian silhouette.

The geometry does not morph into a creature.

The camera and the visitor's interpretation change.

## Reading

At reveal, architectural functions may gain a second reading:
- buttresses → folded wing-like masses,
- lower supports → crouched limb-like masses,
- central recess → faceted head,
- central vertical structure → sternum/rib axis,
- negative spaces → sparse biological/gill-like cues.

Do not explain a full body.

Target partial readability, not a fully classifiable monster.

## Sequence

### Distance
- near-black/controlled field,
- architecture first,
- huge negative space,
- restrained light,
- almost no movement.

### Approach
- controlled camera movement,
- surface/construction becomes legible,
- causal interaction may inject small structural state.

### Reveal
- deliberate authored camera alignment,
- no geometry morph,
- negative space does much of the reading,
- one rare internal accent may appear.

### Comprehension
Move beyond perfect alignment.

The whole creature reading weakens.

Close range may reveal only 2–3 biological contradictions:
- membrane under a joint,
- tiny contraction,
- soft pattern reorganisation,
- support settling like anatomy.

### Return
Return toward architectural reading.

The object is visually similar to the beginning, but the visitor's mental model has changed.

Suggested line:
**The structure did not change. Your model of it did.**

## Essential tests

Fail if:
- opening already looks like a monster,
- reveal requires a cinematic geometry morph,
- creature is completely classifiable,
- architecture and creature feel like separate assets,
- biology is decorative rather than comprehension-changing,
- post FX are doing the work geometry/camera should do.

## Projective construction

If this concept is locked, define an authored reveal camera and screen-space target anchors.

For a desired normalized-device coordinate point:

```text
p_world = inverse(P_reveal * V_reveal) * p_ndc
p_world /= p_world.w
```

In Three.js, use the version-appropriate unprojection mechanism after verifying the installed API.

Prefer a restrained number of strong primary masses over hundreds of arbitrary pieces.
