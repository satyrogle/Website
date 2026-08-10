# Causal Pulse — spike v1

**Status: READY FOR REVIEW.** Branch `claude/causal-pulse-spike-v1`, based on
`checkpoint/cinema-render-source`. Not merged, not deployed.

One question:

> Can a visitor cause one local event that visibly travels through the entity,
> physically affects it, decays, and leaves a later retained state?

**Answer: yes for cause, travel and decay. Partly for the retained state** — it
persists and is measurable, but it does not differentiate spatially. See
Defect 1.

---

## What was not touched

The production site is unchanged. `index.html`, `src/scene/*`, `src/shaders/*`,
`src/motion/*`, `src/content/*` and `public/models/DL_Aurora_v13.glb` are
byte-identical to the base commit. The lab is a separate Vite entry
(`causal-pulse.html`) sharing no module with the production entry.

No blockout was requested or produced. No SDF, no target fields, no WebGPU, no
second compute backend, no renderer migration.

Run it:

```bash
npm run dev -- --port 5342
```

then open `/causal-pulse.html`. Click the mass.

---

## Pipeline

```text
DL_Aurora_v13.glb  (read-only, 282,183 vertices, 39 primitives)
        │
        │  tools/build-causal-graph.mjs
        ▼
graph.bin + vertex-map.bin + graph-manifest.json
        │
        ├──────────────────────────────┐
        ▼                              ▼
PulseWorker (authoritative)      PulseSceneBridge
fixed 120Hz timestep             clones geometry, adds aGraphNode
wave / diffusion / memory        never modifies the source asset
        │                              │
        └────► RGBA state texture ─────┘
                       │
                       ▼
            PulseMaterial (lab-local)
```

The Worker is the authority. The GPU visualises what comes out of it and never
feeds back in.

---

## Graph

Vertices are clustered on a voxel grid keyed by primitive, so a cluster can
never span two parts. Cell size is binary-searched to hit the requested node
count. Structural role is read from the part names, not guessed.

| | |
|---|---|
| Nodes | 6,158 (target 6,144) |
| Edges | 39,259 — 20,726 topology, 17,493 contact, 1,040 bridge |
| Degree | min 1, median 11, mean 12.75, max 55, **0 isolated** |
| Components | 2 — body 6,011 (97.6%) reaching 7/8 roles, halo 147 |
| Stability | λmax ≤ 76.1 → diffusion dt < 0.0263, wave dt < 0.2292 |

Three edge kinds, because one rule could not do the job:

- **topology** — shared triangle edges within a part. The object's real structure.
- **contact** — between parts whose surfaces touch, gated by segment occupancy.
- **bridge** — sparse, role-gated junctions between parts that should conduct but
  do not touch closely enough. Capped at 6 per part pair, so parts join at a few
  identifiable points rather than through a cloud of weak links. Because weight
  falls off with distance, the pulse visibly slows crossing one.

The **halo is deliberately excluded** from the bridge allowlist. It is a
free-floating ring several units off the structure, and wiring it in would be
inventing a connection the object does not have.

---

## Simulation

Fixed 120Hz timestep. Explicit integration with the stability bound read from
the manifest — the constructor throws rather than running an unstable timestep.

```text
wave        v += (c²·Lu − γ·v)·dt ;  u += v·dt      symplectic Euler
diffusion   s += (κ·Ls − λ·s)·dt
memory      m  = max(m, gain_u·|u| + gain_s·s)      monotonic
```

| Parameter | Value | Why |
|---|---|---|
| `waveSpeed` | 20 | c·dt = 0.167 against a 0.229 bound |
| `waveDamping` | 0.3 | at 1.6 the front lost 100× within 16 hops and never crossed |
| `diffusionRate` | 1.2 | κ·dt = 0.010 against a 0.0263 bound |
| `memoryFromWave` | 50 | 0.55 left 0.5% of nodes with any trace |
| `memoryFloor` | 0.015 | deadband against numerical ringing |

---

## Measured results

`node tools/causal-pulse-validate.mjs` — all nine checks pass.

| | |
|---|---|
| Pulse reaches | 5,402 / 6,158 nodes (87.7%) |
| Median front arrival by hop band | 0.05 → 0.17 → 0.37 → 1.46 → 1.62 → 1.87 s |
| Arrival vs geodesic / euclidean | r = 0.848 / 0.840 |
| **Halo energy and memory** | **0.000e+0 / 0.000e+0** |
| Retained memory | 87.8% of nodes, mean 0.044, **0 monotonicity violations** |
| Transient decay | peak \|u\| 1.5e-2 → 1.8e-3 |
| Determinism | identical checksum twice; different node → different checksum |

**The halo is the decisive evidence.** 147 nodes, 5.06 units from the strike,
unconnected by construction. It receives exactly zero energy and zero memory
while 5,402 body nodes are reached. Anything computed in screen space, or
expanding as a sphere, would light it. Nothing does.

### Simulation cost

`node tools/causal-pulse-bench.mjs`, Node 24, this machine:

| Nodes | step mean | step p95 | share of a 120Hz tick |
|---|---|---|---|
| 4,109 | 0.198 ms | 0.245 ms | 2.9% |
| 6,158 | 0.329 ms | 0.461 ms | 5.5% |
| 8,161 | 0.411 ms | 0.536 ms | 6.4% |

All three are comfortably inside the 2.0 ms budget. 6,144 is the shipped default
because it is the smallest that reached 87% of the object; 8,192 is affordable
if the visual case for it appears.

**Frame time is NOT measured here.** Captures render through SwiftShader and
report 100–220 ms/frame, which is the software renderer, not a GPU. Frame-rate
QA needs the page open on the 3060.

---

## Three measurement corrections

Each produced a confident, clean-looking, wrong answer. Recorded so they are not
re-derived.

1. **A fixed amplitude threshold for arrival is confounded by node degree.** A
   low-degree node concentrates the same energy and trips early; a hub dilutes
   it and trips late. This reported propagation as *anti*-structural (r = −0.24).
2. **Global time-to-peak is confounded by reflection.** Over several seconds the
   wave crosses the object repeatedly, so the largest excursion is set by
   resonance rather than arrival. Reported no correlation at all (r = 0.06).
3. **Hop count is not path length** on an unevenly tessellated mesh — a finely
   clustered region costs more hops for the same physical distance. Geodesic
   distance by summed edge length is the metric a wave actually follows.

The working estimator is first crossing of a fraction of each node's *own*
eventual peak: scale-free like time-to-peak, but it fires on the leading edge.

A fourth, in the graph tool: `Matrix4.compose` reads a quaternion's
`_x/_y/_z/_w` internals, so a plain `{x,y,z,w}` composes silently to NaN. Every
primitive collapsed to exactly one cluster and the summary line looked
plausible. There is now a finite/extent assertion.

---

## Known defects

**1 — P1. The retained trace does not differentiate spatially.** Retained memory
is nearly uniform: mean 0.044, falling only from 0.047 at 1–2u to 0.038 at 4–6u,
against 1.0 at the strike. Rendered, that is a hot core plus a flat violet wash
over the whole object rather than a record of *where the pulse went*. The
perceptual lift (`pow(m, 0.55)`) makes the uniformity visible; it does not
create structure that is not in the data.

Cause: on a compact, well-connected object the wave reaches almost everywhere at
similar amplitude. Candidate fixes, none attempted: deposit from local strain
(`|u_i − u_j|` across edges) rather than displacement, so only nodes that
actually flexed record anything; or make deposition depend on arrival order.

**2 — P2. The cyan transient is brief and small.** `activeNodes` (s > 0.01) is
in single digits within a second of the strike, so the "active now" channel is
mostly the wave term. The three-beat reading of cause → travel → retain rests
mainly on the lit/unlit boundary, not on a colour change.

**3 — P2. No frame-rate evidence.** See above. SwiftShader only.

**4 — P3. The halo is inert and unexplained.** Correct behaviour, but a visitor
sees a large ring that never responds and has no way to know that is the point.

**5 — P3. Camera is fixed.** No orbit. The far side of the entity cannot be
inspected, so the propagation asymmetry can only be judged from one angle.

---

## Files

```text
tools/build-causal-graph.mjs          graph generation
tools/causal-pulse-validate.mjs       headless acceptance, 9 checks
tools/causal-pulse-bench.mjs          step cost by graph size
tools/causal-pulse-capture.mjs        storyboard + fallback captures

src/labs/causal-pulse/
  CausalPulseApp.ts                   boot, interaction, frame loop
  graph/GraphAsset.ts                 binary decode, versioned
  graph/GraphLoader.ts                fetch + validate + nearest node
  simulation/CausalPulseSimulation.ts authoritative maths
  simulation/PulseWorker.ts           fixed-step clock, snapshot publishing
  simulation/PulseClient.ts           main-thread handle
  rendering/PulseMaterial.ts          lab-local shader
  rendering/PulseSceneBridge.ts       geometry binding, asserts against manifest
  rendering/PulseInspector.ts         measured readout

causal-pulse.html                     isolated lab entry
public/generated/causal-pulse/        graph.bin, vertex-map.bin, manifest
captures/causal-pulse/                storyboard, both viewports, no-WebGL
```

Graph binaries are gitignored and regenerate deterministically. The manifest is
committed, because it is the record of what the spike was measured against.

---

## What this does not claim

- Not a physical simulation of anything. A numerical model on a graph derived
  from a mesh.
- The entity is a **test substrate**, not approved art. It was used to answer
  whether computational behaviour improves the object, nothing more.
- No performance claim on real hardware.
- Nothing here is integrated with the site's scroll, movements or copy, and no
  decision about homepage structure follows from it.
