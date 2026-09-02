# THE SEED SEARCH — one million worlds

Run 2026-09-02 from a machine with no GPU, which is why it measures and
does not judge. `node tools/seed-search.mjs 1000000` · 4 threads · 717s.

**Nothing here is a decision.** The seed is a look decision and belongs
to Jacob. This narrows a million worlds to a shortlist and says what
each one is like.

## Why there was a search at all

`src/core/Delta.ts` calls thresholds the amplifier: *"a section sitting
just under its threshold is where a change of one part in a thousand
becomes a section moving ... the only reason a consequence can travel a
long way from a small cause."*

On the site's seed it never fires. `src/core/causality.ts` reads it out:

```
sections FLIPPED across a threshold        0
sections whose yield tick merely SHIFTED   4
sections diverged (kernel epsilon)        24 of 48
sections VISIBLY diverged (>=1% of peak)   7 of 48
span the consequence covers                7 sections = 15% of the stack
```

`tools/delta-verify.mjs` passes anyway, because its gate is
`derived.length > 0` and the tail of that field is 2e-9 — float residue
with a section index. The material is drawn from the seed, so which
sections sit just under their thresholds is a property of the world.
The rule is not broken. This world is dull.

## What was swept

1,000,000 seeds from 20260818. Every world is one the shipped kernel
produces today: no constant changed, no rule re-implemented.

```
eligible (passes the seed-dependent shipped gates)   507,524 / 1,000,000
eligible worlds scoring above the site's             402,196
most flips found anywhere                            4  (in ONE world)
widest span found anywhere                          30
eligible by flip count   0=494,062  1=12,642  2=785  3=34  4+=1
```

Scored on five things from THE_DELTA sections 6 and 7, each taken on
the **weaker of the two detents** — a world that is dramatic one way
and dead the other gives half the visitors nothing. Weights are in the
script and every component is printed, so disagreeing with the
weighting is something you can act on rather than something buried in a
sort.

## The shortlist

All five pass the real `tools/delta-verify.mjs`, run as a temp copy
with its seed line rewritten. Re-check any of them with
`node tools/seed-search.mjs --verify <seed>`.

| seed | score | flips | span | travel | variety | contrast | character |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **20405553** | 0.731 | 2 | 25 | 0.89 | 1.97 | 0.00 | the balanced one: real flips AND a wide, slowly-dying field |
| 21105522 | 0.715 | 3 | 16 | 0.67 | 1.91 | 0.03 | the eventful one: most flips of any high scorer |
| 20422216 | 0.706 | 2 | 27 | 0.81 | 1.78 | 0.00 | the long one |
| 20976575 | 0.673 | 0 | 28 | 0.86 | 1.93 | **1.00** | no flips, but the two detents build genuinely different rooms |
| 20786978 | 0.587 | **4** | — | — | — | — | the only 4-flip world in a million |
| `20260818` | 0.309 | 0 | 7 | 0.56 | 1.85 | 0.09 | **the site today** |

Against the site's seed, 20405553 is 8 visible sections spanning 25
rather than 7 spanning 7, with a gap profile that falls 0.89x per
section instead of 0.56x, and two sections that genuinely yield in one
future and never in the other.

## The finding worth more than the seed

**The intervention relaxes away.** Once a section has yielded the rule
is

```ts
s.offset += (target - s.offset) * 0.08;
```

which is a relaxation toward a target set by load and stiffness, and a
relaxation forgets its initial condition. Measured:

```
measured relaxation of the cause per tick   0.9200
the rule's own coefficient                  1 - 0.08
the blade's gap fades                       247x from its peak to the end
0.92^180 (hinge to end)                     3e-7
```

Three consequences, all of them visible in the sweep:

1. **Flips are rare** — 0.1% of eligible worlds have two or more. A
   cause has to produce a threshold crossing *before* it fades, or it
   leaves no trace at all.
2. **The two detents converge.** Of the top 500 worlds in a million,
   exactly **one** has both a flip and a detent contrast above 0.5.
   That anti-correlation held identically at 20k, 50k and 1M, which is
   what a structural property looks like rather than a sampling
   artefact. More seeds will not fix it. If the choice between -1 and
   +1 needs to matter more, that is a rule change — the displacement
   would have to latch rather than relax — and it is Jacob's call.
3. **Reading Z from the final frame is right.** This looked like a bug
   and is not one. The peak-difference frame is 4x wider in absolute
   terms but has *fewer* visible sections (3 against 7), because at the
   peak the blade dominates so completely that a 1% floor excludes
   everything else. By the last frame the cause has washed out and what
   still stands apart is what the world did, not what the visitor did.
   `DeltaAct` indexing `(TICKS - 1)` is correct.

## To look at any of these

`lab.html` (or the generated single file from
`node tools/lab-standalone.mjs`) takes a seed in its control rail and
draws the two futures, the difference, the reach profile and the yield
ladder for it. Type a candidate in and compare.
