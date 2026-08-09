# V2 baseline

Recovery baseline for `claude/cinematic-editorial-rebuild-v2`, created per
Phase 0 of the v2 plan. Nothing here is a design decision; it records what
v1 left behind, what is being kept, and what is being replaced.

## Provenance

| Item | Value |
| --- | --- |
| v1 branch | `claude/cinematic-editorial-rebuild-v1` |
| v1 commit | `4304873ee35736944835242a98402864f8591b72` |
| v1 commit subject | Rebuild site as cinematic prologue and editorial proof |
| v2 branch | `claude/cinematic-editorial-rebuild-v2` |
| v2 branch point | identical to the v1 commit above |
| v1 remote state | pushed to `origin`; not merged, not deployed |

v1 is preserved unchanged. It is not rewritten, rebased or force-pushed,
and remains recoverable at the SHA above.

## Preserved reference assets

| Asset | Path | Size | sha256 (first 16) |
| --- | --- | --- | --- |
| v1 production monolith | `public/models/DL_Monolith_v01.glb` | 830,868 B | `904beeb2ea37c4b9` |
| Previous entity (Aurora) | `references/models-archive/DL_Aurora_v13.glb` | 7,804,764 B | `3fa9018543cc889d` |

`DL_Monolith_v01.glb` stays in `public/models` and remains the asset the
runtime loads until a v2 asset is approved at Gate B. It is tracked in git
at the SHA above, so it is preserved regardless of what replaces it.

The remaining superseded candidates are on disk in
`references/models-archive/` and are deliberately untracked.

## Archived v1 output

| Item | Path |
| --- | --- |
| v1 QA report (42/42, real GPU) | `docs/v1-baseline/qa-report.json` |
| v1 composition frames | `docs/v1-baseline/frames/*.png` |

These are the artefacts the v1 pass produced. They are kept as evidence of
what was measured, not as approved targets — the review is explicit that
they were implementation outputs rather than founder-approved images.

## v1 architecture retained in v2

Kept, and not to be re-litigated during the gated rebuild:

- bounded cinematic prologue: Full Form → Tunnel → Latent Form, one sticky
  stage, scroll-linked progress, native scrolling, canvas fade at the end;
- editorial ground after the prologue on an opaque surface, with the
  render loop stopped whenever the prologue is off screen;
- removal of the `/100` counter, movement numbering and percentage loader,
  with no replacement HUD;
- poster-first loading, usable DOM at first paint, repeatable poster and
  social capture from the live composition;
- corrected public content: two products, qualitative transfer wording, no
  unsupported commercial claims;
- `evidence.html` as a separate printable documentary page;
- one causal idea only — a change made in one state survives into the next;
- the asset-driven runtime contract: roles `outer_mass`, `inner_spine`,
  `tunnel_rib`, `tunnel_wall`, `latent_core`, `halo`, with stage window,
  reaction weight, projection and opening vectors carried as glTF extras.

## v1 work being replaced in v2

- the box/pier/lintel/jamb geometry generator as the source of the hero
  asset;
- the Full Form, tunnel and Latent Form macro geometry it produced;
- the analytic `uTrace` UV overlay as the mechanism of retained state;
- luma-threshold subject detection in the QA gates.

`tools/build-monolith.mjs` is archived to
`tools/archive/build-monolith-v1-box-grammar.mjs`. It is retained only as a
reproducible record of the rejected v1 geometry and no longer produces the
active production asset.

## v2 asset pipeline

| Path | Role |
| --- | --- |
| `tools/blender/build_monolith_v2.py` | authored form data → workbench + clay export |
| `tools/blender/render_clay_v2.py` | clay and mask renders for the visual gates |
| `assets/blender/DL_Monolith_Workbench_v2.blend` | the workbench, hand-editable |
| `design/clay/` | gate deliverables: renders, masks, measurements |

Silhouette and mass placement come from an explicit authored table in
`tools/blender/monolith_v2_form.py`. No random value decides the
silhouette, the mass boundaries or the depth tiers.

## Gate state

| Gate | State |
| --- | --- |
| Phase 0 — baseline and preservation | complete |
| Gate A — Full Form clay | awaiting founder review |
| Gate B — tunnel and Latent continuity clay | not started |
| Gate C — material, lighting, retained state | not started |
| Gate D — prologue composition | not started |
| Gate E — product proof and editorial site | not started |
| Gate F — hardening and bug-hunting handoff | not started |
