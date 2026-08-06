# Dark Lattice — Crowned Convergence full build: defect register

Status: **FULL BUILD IMPLEMENTED — AWAITING FOUNDER QA**

Branch `claude/crowned-convergence-full-build-v1`. Not merged to `main`,
not deployed.

Severity scale, per the directive:

```text
P0  blocks site use
P1  major visual/runtime failure
P2  visible defect, shippable after correction
P3  polish
```

Automated QA: **28/28 checks pass** against the production preview build
(`tools/capture.mjs`), across 1440×900, 1920×1080, 1366×768, 390×844 and
360×800, plus reduced-motion, no-WebGL, no-JavaScript and evidence-open
paths. No runtime errors at any viewport. No horizontal overflow at any
viewport.

---

## P0 — blocks site use

**None open.**

Four P0s were found and fixed during integration. They are recorded here
because each was invisible in a screenshot and only surfaced by probing
the live runtime, which is worth knowing for future asset revisions:

| Was | Cause | Fix |
|---|---|---|
| Entity did not render at all | Meshes loaded from glTF already have parents, so the "add to group if unparented" guard never fired and nothing entered the scene | The whole glTF graph is added, hierarchy intact |
| Shader failed to link | `viewMatrix` used but not declared; `RawShaderMaterial` supplies no built-ins | Declared |
| Corridor rendered completely empty from 30% onward | Rings A/B/C were staged `exterior` (expiring at 0.30) but sit at z −0.56…−7.36, where the camera still travels past 60% | Windows widened, and the precise cut is now a behind-camera cull |
| Every multi-material part lost its authored role and staging | The glTF exporter splits objects with 2+ material slots into `_MESH`/`_MESH_1` primitives whose `userData` is empty — extras stay on the parent node | Extras resolve up the ancestor chain |

---

## P1 — major visual/runtime failure

**None open.**

Two P1s fixed during the build:

- **Entity double-transformed and culled itself out of frame.** The
  Blender export runs with `export_yup`, which already maps Blender
  `(x, y, z)` → glTF `(x, z, −y)`. The runtime rotated the group again.
  Cached depths came out in Blender's own axes and every part failed its
  visibility test. Rotation removed.
- **Threshold chamber out-brightened the Latent Form standing in front
  of it.** A single key intensity was applied to all material classes.
  Added per-class key gain — structural surfaces take 0.22 — and raised
  the Latent Form's rim.

---

## P2 — visible defect, shippable after correction

### P2-1 · Hero entity competes with the display type
At 1440×900 the crown sits behind `DARK LATTICE`, and the cavity — the
entity's strongest feature — is partly occluded by the second line. The
poster capture at 1600×900 (`public/fallback/crowned-convergence-hero.png`)
shows how much better the entity reads with the type out of the way.
**Suggested fix:** shift the hero camera target ~0.6 units right, or move
the display type up, so the cavity clears the descenders.

### P2-2 · Corridor interior reads lighter than "near-black"
Ring fins in the tunnel (40–60% progress) render as mid blue-grey rather
than the near-black the material brief specifies. The reaction field is
doing less of the work than intended and the key more.
**Suggested fix:** reduce `keyGain` for `MAT_RING` below the current 0.42
and raise the field's `patternGain` to compensate, so brightness is
earned by the reaction rather than by direct light.

### P2-3 · Latent Form is quiet at the finale
It reads as three dark masses with rim definition and a faint seam —
correct in kind, but with less presence than the destination of a
twelve-unit journey warrants. Reaction convergence toward the seam is
present but subtle.
**Suggested fix:** raise `MAT_LATENT` reaction weight (currently 0.30 in
the asset extras) and tighten the seam's emissive falloff.

### P2-4 · Crown yield is subtle to the point of being hard to notice
Per-mass translation is clamped to 0.04–0.14 m and rotation to 5°, per
directive 9.2. That is faithful to the spec, but across the 0.10–0.26
band the opening reads more as a lighting change than as a mass giving
way.
**Note:** this is a spec-versus-legibility tension, not a bug. Raising
the clamp would break the stated limits, so it needs a founder call.

---

## P3 — polish

### P3-1 · Reaction field is planar-projected on crown masses
Crown slabs sample the field by X/Z object-space projection, so a mass
whose face is near-parallel to the view axis shows a stretched pattern.
Not visible at the hero framing; would show on a close orbit, which the
site never performs.

### P3-2 · No mesh LOD
Single geometry tier by design — 5,400 triangles is far below the 12,000
threshold at which the directive calls for one tier plus runtime quality
scaling. Recorded only so the absence is understood as deliberate.

### P3-3 · Scroll recording is WebM, not MP4
`ffmpeg` is not on PATH in this environment. `tools/record.mjs` reports
this rather than silently writing a mislabelled file. MP4 will be
produced automatically wherever ffmpeg is available.

### P3-4 · Blender clay metrics from v06 remain outside their old targets
Cavity height, cavity offsets, Ring A hero visibility and the concealment
metric are all still off the v06 numerical gates. The directive
explicitly accepted these and deferred them; they are not blockers and
were not chased. Measurement harness remains in
`tools/blender/build_crowned_convergence.py` if they are revisited.

---

## Verification commands

```bash
npm run build
npx vite preview --port 4173 --strictPort
node tools/capture.mjs http://localhost:4173 captures
node tools/narrative.mjs http://localhost:4173 captures/narrative
```

Asset rebuild (requires Blender 5.1 on PATH or at the hardcoded path):

```bash
blender --background --python tools/blender/build_production_asset.py -- --root .
```
