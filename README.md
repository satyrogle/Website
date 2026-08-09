# Dark Lattice

The studio site. Two parts, deliberately different from each other.

**Part one — cinematic prologue.** A WebGL sequence in three states:
Full Form, Tunnel, Latent Form. It carries the brand metaphor and one
argument only: *a change made in one state survives into the next.*

**Part two — editorial proof.** Desk42, Brawler, what carries forward,
and the evidence boundary. Plain reading ground, no canvas behind it.

The 3D sequence **ends** after the Latent Form. Once the editorial
section begins the canvas is faded out, the render loop is stopped, and
it only restarts if the visitor scrolls back into the prologue.

Static output. `dist/` uploads to ordinary hosting. See
[DEPLOYMENT.md](DEPLOYMENT.md).

---

## The entity

One enormous vertical alien architectural monolith. Roughly 2.8 times
taller than its main width, strongly asymmetrical, near-black obsidian,
frontal, standing in a pure void with a halo behind it.

It is **not** a crown, a face, a creature, an iris, a turbine or a
portal, and nothing in the runtime treats it as one.

### The asset

The single active production model is:

```text
public/models/DL_Monolith_v01.glb
```

Nothing else ships in `public/models`. Superseded candidates live in
`references/models-archive/` and are not part of the build.

It is generated rather than hand-modelled, so it is reproducible from
source:

```bash
npm run asset
```

| Part | Role | Count |
| --- | --- | --- |
| `DL_FullForm_Outer_01..07` | `outer_mass` | 7 |
| `DL_FullForm_Spine` | `inner_spine` | 1 |
| `DL_Tunnel_Rib_XX` | `tunnel_rib` | 13 |
| `DL_Tunnel_Wall_XX` | `tunnel_wall` | 4 |
| `DL_Latent_Core_XX` | `latent_core` | 3 |
| `DL_Halo` | `halo` | 1 |

The seven outer masses are separate meshes with real air gaps between
them. They open **once**, during the approach, by their own authored
vector — each translating 2–4% of the overall width and rotating no more
than three degrees — and the opening remains. No mass circles a hub and
nothing explodes outward.

Every part carries its contract in glTF `extras` (`dl_role`,
`dl_material_class`, `dl_stage_from` / `dl_stage_to`, `dl_reaction`,
`dl_projection`, `dl_open_translation`, `dl_open_rotation`). The runtime
reads those and nothing else, so restaging a mass is an asset change
rather than a TypeScript change.

### Material

Most of the building is one of four structural blacks. Light is earned:
teal and cyan along active fissures, restrained violet only where
retained state is being communicated, and a cold edge response where the
geometry turns away. Amber belongs to the halo alone and never touches a
structural surface.

## The one causal demonstration

A single Gray–Scott field is created and seeded exactly once, and
nothing in the choreography may clear or reseed it.

1. During the Full Form beat one identifiable cyan disturbance is placed
   on the masses flanking the inner spine.
2. The visitor can cause it with a press inside the entity's side of the
   frame. If they do nothing it happens automatically after 1.5s.
3. Pointer movement across the copy does nothing. There is exactly one
   disturbance per visit.
4. Through the tunnel it stays recognisable as a travelling scar.
5. At the Latent Form it resolves into a restrained violet concentration.

Retained consequence may rise and never falls. That is enforced in
`DarkLatticeMonolithModel.setRetained`, and the field's `resize` is inert
once seeded so a quality demotion cannot erase the trace.

## Structure

```text
index.html            prologue + editorial
evidence.html         the documentary record
src/
  main.ts                       boot: poster first, then the live scene
  motion/PrologueDirector.ts    scroll → progress, beats, canvas pausing
  scene/SceneController.ts      renderer, loop, the disturbance
  scene/DarkLatticeMonolithModel.ts
  scene/CameraRig.ts            the straight rail and the lens shift
  scene/Lighting.ts             the arc, as data
  scene/ReactionField.ts        the field that is never reseeded
  shaders/monolith.*.glsl       one shader for every part
tools/
  build-monolith.mjs   generates the production GLB
  capture.mjs          QA harness and the composition gates
  prologue.mjs         state captures across viewports
  frames.mjs           composition targets, poster and social image
  archive/             the retired Meshy/Blender pipeline
```

Prologue progress maps as `0.00–0.22` Full Form, `0.22–0.72` opening and
tunnel travel, `0.72–0.94` Latent Form, `0.94–1.00` canvas fade. There
are four runtime states: `full`, `opening`, `tunnel`, `latent`.

The camera runs a straight rail. x and y never leave the axis and z only
decreases; the subject is moved off centre by offsetting the projection —
a lens shift, not a pan — so the building is always seen from directly in
front of it. Portrait uses the same technique vertically to raise the
subject and leave the copy a band below it.

## Loading and fallback

Poster first. The hero composition is on screen as a still image
immediately, the DOM is usable from first paint, and the live canvas
crossfades in when it is ready. There is no loading screen and no
progress number.

| Path | Behaviour |
| --- | --- |
| No WebGL2 | Canvas removed, poster stays, all copy intact |
| No JavaScript | Prologue lays out as ordinary stacked blocks |
| Reduced motion | Three composed stills, cut between; no travel |
| Prologue off screen | Render loop stopped, canvas gone |
| Tab hidden | Render loop stopped |

## Commands

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # tsc --noEmit && vite build
npm run preview      # serve dist on 4173
```

```bash
npm run asset                                             # rebuild the GLB
node tools/frames.mjs   http://localhost:4173              # targets, poster, OG
node tools/prologue.mjs http://localhost:4173              # state captures
node tools/capture.mjs  http://localhost:4173 captures/qa  # QA + gates
```

The capture tools drive a real GPU by default. A software rasteriser has
already hidden a `pow(0, y)` difference that rendered the entity as a
solid black silhouette on real hardware while the headless capture of the
same commit looked correct. Set `DL_SOFTWARE=1` only where no GPU is
available.

## Content rules

Nothing on the public page claims a release date, price, sales figure,
player number, review, award, partner, publisher, team size or benchmark,
because none is supported by inspected evidence. There are no fabricated
product screenshots: where no validated capture exists, each product
shows an explicitly labelled DOM/CSS **System example** instead.

The third game is not presented as a product. It appears only on
`evidence.html`, described as a possible future direction that is not
committed.

`evidence.html` carries no percentage ranges. Carry-over between engines
is described qualitatively — *usually rewritten*, *partly reusable*,
*largely retained*, *retained* — because no methodology or source
supports a number. The page is readable without WebGL and prints.
