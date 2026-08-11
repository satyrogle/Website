# Engineering and Simulation

## First rule

Inspect the repository and installed versions before changing architecture or using framework-specific APIs.

## Stack

Vite, TypeScript, Three.js, WebGL2, GLSL, GSAP/ScrollTrigger. **No React, no R3F.**

`package.json` and `docs/ARCHITECTURE.md` are authoritative over this file.

## Architecture boundary

The DOM/TypeScript layer owns:
- boot sequence and app lifecycle,
- DOM/editorial UI,
- accessibility/navigation,
- input and scroll progress,
- coarse state/configuration.

`ScrollDirector` is the seam: scroll progress in, authored GSAP camera and DOM timing out.

Three.js owns:
- realtime scene,
- camera,
- meshes/materials/uniforms,
- per-frame numerical state,
- render loop,
- render targets.

Per-frame data stays inside the Three.js system unless the DOM actually requires it.

## Three.js integration

Plain Three.js with explicit controller classes (`SceneController`, `CameraRig`, `LatticeModel`, `ReactionField`, `PostPipeline`, `QualityManager`). The frame loop is owned by `SceneController`.

Do not migrate to R3F. Translate framework-specific material to the vanilla equivalent:

```text
useFrame()         ->  the SceneController frame loop
React component    ->  a scene/controller class
React state        ->  mutable simulation state
Drei helper        ->  the Three.js object directly
JSX event handler  ->  the DOM event/controller layer
```

Avoid:
- one component/object per tiny fragment,
- duplicate render loops,
- unnecessary scene recreation,
- free-orbit camera when the experience needs authored framing,
- post-processing chains that rescue weak geometry.

## Camera

Author the camera around comprehension.

Pointer/parallax response should be:
- small,
- damped,
- bounded,
- incapable of breaking a required reveal/framing.

Mobile may need a different camera composition.

## Structural state

Represent important components as an explicit graph where useful.

Per node, maintain compact numerical state.

A damped graph-wave can use:

```text
u_next[i] =
    (2 - gamma) * u[i]
    - (1 - gamma) * u_prev[i]
    + c2_dt2 * sum_j(w_ij * (u[j] - u[i]))
    + impulse[i]
```

Use fixed-step simulation when reproducibility matters.

Map graph state to restrained consequences:
- small transform change,
- roughness/highlight shift,
- local material response,
- slight structural settling.

Do not visualize the graph as neon electricity.

## Memory

A slowly decaying memory term can preserve causal history:

```text
m_next[i] = exp(-lambda * dt) * m[i] + abs(u[i])
```

Use memory sparingly:
- residual wetness/darkness,
- internal seam visibility,
- temporary material trace.

Interaction should leave consequence without turning the page into a dashboard.

## Reaction–diffusion

Optional visual-only technique for a few close-range soft regions.

Gray–Scott form:

```text
dU/dt = Du * laplacian(U) - U*V*V + F*(1-U)
dV/dt = Dv * laplacian(V) + U*V*V - (F+k)*V
```

Rules:
- small bounded render targets,
- explicit parameters,
- seeded initialization if repeatable appearance matters,
- no runtime random reseeding,
- do not cover the whole structure,
- if it reads as shader art, reduce it.

Important:
GPU reaction-diffusion/material output is not authoritative cross-device deterministic state.

Authoritative system state remains CPU/fixed-step/explicit.

## Micro-motion

Use damped responses rather than perpetual looping animation.

Concept:

```text
x'' + 2*zeta*omega*x' + omega^2*x = F(t)
```

Motion should settle.

Use only a few meaningful cues.

## Determinism

When the project claims reproducibility:
- explicit seed,
- fixed step,
- bounded/quantized input where needed,
- explicit state,
- deterministic reset,
- no `Math.random()` in important simulation logic,
- same seed + input trace → same authoritative state.

Do not claim GPU pixel-identical reproducibility across hardware.

## Render-loop performance

Avoid avoidable per-frame allocation.

Reuse:
- vectors,
- colors,
- matrices,
- temporary arrays/objects.

Dispose owned:
- geometries,
- materials,
- textures,
- render targets,
- controls/listeners,
- renderer when permanently destroyed.

Use `renderer.info` for leak/performance investigation, looking for unbounded growth rather than assuming any non-zero cache is a leak.

## Canvas/resizing

Size from the real container.

Update renderer/camera only when dimensions change.

Treat DPR as a performance budget; cap/adapt where necessary.

Pause/reduce work when the hero is not visible if possible.
