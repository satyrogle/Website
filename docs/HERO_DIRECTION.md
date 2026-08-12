# THE HERO — a ruptured planet and its debris

**LOCKED by Jacob, 2026-08-12 (v4).** Supersedes every earlier version. Read
before touching the hero. Nothing rendered so far is final.

## Success condition

A cold viewer must be able to say: *"I'm travelling through giant fragments
from one exploding planet, and by the end I understand the whole shattered
world and the direction of the blast."*

If they say "cool floating sci-fi chunks", "space rocks", "procedural
debris", or "glowing orb with pieces around it", the build has failed.

## The arc

Local mystery → global revelation.

- **Early:** what are these huge broken structures in the void?
- **Mid:** these fragments all belonged to the same body.
- **Final:** I have been travelling through the aftermath of a
  planetary-scale explosion.

## The body stays recognisable

At the wide reveal the viewer must perceive that this *was one spherical
planet*. Keep roughly **55–70% of the silhouette inferable**, with enormous
missing sections and multiple continent-scale slabs torn away. Large crust
plates still sit approximately in their original spherical positions while
other slabs have been thrown far down the blast direction.

Not neatly broken in half: partially cracked, partially blown open, giant
crustal wedges displaced, plates peeling back, interior escaping.

## Fragment hierarchy — critical

Everything currently has similar importance. It must not.

```
A  ONE recognisable ruptured planetary body
B  2–4 continent-scale crustal slabs, still visually related to it
C  10–20 major secondary chunks, obvious common origin
D  dozens of medium ejecta along the blast direction
E  sparse fine debris / particulate — never noisy
```

## Material language

Every fragment must feel torn from the same world.

- **Exterior crust:** very dark, dry, dead, cracked, heavy, almost black
  with extremely restrained warm response. No warm response across whole
  exterior faces — heat belongs only to fresh cut cross-sections, deep
  fissures and the internal rupture; the crust's old underside on a detached
  slab is dark burnt mass with embers, never a molten panel (Jacob,
  2026-08-12).
- **Geology, not noise:** the master planet — and therefore every slab cut
  from it — carries terrain-scale relief: ridges, basins, scarps, broken
  plateaus, crater-like depressions. Recognisable planetary surface
  language, sized to survive the wide reveal (Jacob, 2026-08-12).
- **NO GRID.** A repeating lattice across every surface is the single most
  damaging fault in the current build — it makes every piece read as a
  manufactured procedural object. If a semi-constructed read is wanted, do
  it through buried panel logic, strata, interrupted systems, partial
  engineered ribs *inside fracture zones* — never a grid on every surface.
- **Thickness:** major slabs must expose cross-sections. Kilometres of
  crust ripped apart, not cards, shells or shards.
- **Fracture light only:** glow belongs to fresh broken surfaces and
  exposed heat, never to every silhouette equally.

```
dark crust
  → glowing fracture seam
  → white-hot core edge
  → amber-hot inner material
  → cooler falloff deeper into the fragment
```

## The core

The light source is the planet's own interior energy escaping through a
failing shell. Partially occluded by shell fragments; escaping through
cracks, fissures and blown-open gaps; shaped light, never uniform flood.
Unstable, overpressured, too bright to fully look at. Never a bare white
ball, clean lamp, symmetric disc or ring.

## Blast funnel

Fragments share an intelligible explosive origin and a readable direction —
not a tunnel, not a straight line, not random scatter. Offset depth, angle
and scale heavily. The viewer should eventually grasp where the source is
and which way the debris went.

## Scroll dramaturgy

Open close to one enormous fragment — close enough to feel scale and
material, not so close it turns abstract. Travel fragment to fragment, each
a section stop, each revealing more of the catastrophe. Mid-journey the
common origin becomes apparent. Near the end pull wide to reveal the body,
the slabs and the corridor; then the core flares harder and fragments push
outward, so the catastrophe feels alive and continuing.

**The wide reveal stands on the blast side (Jacob, 2026-08-12, lifting the
earlier camera freeze for exactly this).** Square to the corridor, every
wound is edge-on and the body reads as an intact black sphere. The final
camera looks into the missing sections: at least two major wounds and the
slabs that came out of them share the frame, so a viewer can mentally
reassemble the original sphere. That relationship outranks any previous
camera coordinates.

Each stop needs clean negative space for editorial content, a readable
silhouette, and enough uniqueness to be memorable.

## Palette

Black void; charcoal blackened crust; white-hot to amber-gold rupture light;
near-white text with muted amber accents. No blues, no nebula gradients, no
cyberpunk palettes, no candy lava. Premium and brutal, not pretty.

## Motion

Slow heavy fragment drift, subtle rotational drift, tiny ejecta motion,
restrained thermal shimmer near hot seams. Massive objects: nothing wobbles.
Scroll is cinematic, processional, weighty, inevitable. The final flare is a
continuation of rupture, not a screen flash.

## Pipeline — authored geometry is approved

**Jacob, 2026-08-12, explicitly:** authored meshes do not violate the live-3D
requirement. Building fractured planetary geometry in Blender, exporting
glTF, and staging it in Three.js keeps everything real-time and explorable —
fly through it, rotate it, shade it, drift it, explode it further. That is
not pre-rendering, and the earlier objection to it was wrong.

Division of labour:

- **Blender (authored):** the ruptured body, continent slabs, major
  fragments, layered break surfaces, damaged topology, LOD variants.
- **Code (procedural):** debris placement, funnel distribution, drift,
  rotation, scroll rail, explosion continuation, molten shader, ejecta.

Do not reject authored geometry on ideological grounds. Procedural-only
primitives have now produced ribbons → cutting board, lamellae → hanging
anatomy, implicit field → skin disease, fragments → gridded boxes. A dying
planet is a form problem, and we know what it should look like.

This supersedes the `HERO GLB` vocabulary ban, which belonged to the retired
entity work and to pre-rendered assets, not to authored live geometry.

## Execution order — do not optimise the wrong layer first

1. Main body and major fragments read as **one ruptured planet**.
2. Material language: real crust, hot interior fracture.
3. Debris hierarchy and blast direction legible.
4. Scroll path legible fragment to fragment.
5. Final wide reveal monumental and conclusive.
6. Only then light, particles, secondary motion.

## Never

Abstract entities. A white-disc core. Cube/box fragments. Grid on every
surface. Debris as random clutter. A busy void. Equal glow on everything.
A small or quick final reveal. A space background with UI on top.
