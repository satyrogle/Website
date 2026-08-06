"""
Dark Lattice — entity scaffold.

Builds a modelling rig for the crowned convergence: every piece the site
expects, already at the right place, the right size, the right name and
the right orientation. You reshape the placeholders into the real thing;
the coordinates, naming and export settings are handled here.

WHY A SCAFFOLD. The site drives each piece individually — every crown
plate tears on its own stagger, the gyres counter-rotate, the kernel
recedes. That only works if the object NAMES match what the loader
looks for, and if the origin of each piece sits at the point it should
pivot about. Getting that right by hand is fiddly and easy to break; it
is also the only part of this job that is engineering rather than art.

HOW TO USE
  1. Blender ▸ Scripting ▸ Open ▸ this file ▸ Run.
  2. Model each `crown_NN` placeholder into a real armour plate.
     MODEL ONE PROPERLY FIRST, then Ctrl+L ▸ Link Object Data to the
     others and vary each one (scale, a chipped corner, edge damage).
     That is where coherence comes from — one design language repeated,
     not fourteen unrelated shapes.
  3. Keep every plate's ORIGIN where the scaffold put it (the plate's
     own centre). That is its tear pivot.
  4. Run `export_glb()` from the Python console, or re-run this file
     with EXPORT_ON_RUN = True.

WHAT NOT TO CHANGE
  - Object names. The loader matches on the `crown_`, `gyre_`, `pupil_`
    and `kernel` prefixes.
  - World scale and axis. +Z faces the camera, the throat sits at the
    origin, the crown spans about 9 units across. The site's camera rail
    and fog distances are authored against exactly this.
"""

import math
import os

import bpy
from mathutils import Euler, Vector

# ---------------------------------------------------------------------
#  Constants — these mirror src/scene/LatticeModel.ts. Change them here
#  and the site will disagree with the mesh, so don't, unless you are
#  changing both.
# ---------------------------------------------------------------------

COLLECTION = "DL_ENTITY"

MAJORS = 7
MAJOR_RADIUS = 2.0          # ring radius the plate centres sit on
MAJOR_LEAN = 0.60           # radians, leaned back into the throat
MAJOR_LEN = 3.2             # radial length of a plate
MAJOR_WIDTH = 2.5           # tangential width
MAJOR_THICK = 1.15

MINOR_RADIUS = 2.6          # infill shards, seated behind the gaps
MINOR_LEAN = 0.68
MINOR_SCALE = 0.53

# [outer radius, aperture, z] — the three counter-rotating rings.
GYRES = [(2.0, 1.58, -0.65), (1.62, 1.28, -1.15), (1.28, 1.0, -1.62)]

PUPIL_COUNT = 11
PUPIL_RADIUS = 0.8
PUPIL_Z = -1.9

KERNEL_RADIUS = 0.5
KERNEL_Z = -2.02

EXPORT_PATH = os.path.join("public", "models", "entity-v10.glb")
EXPORT_ON_RUN = False


# ---------------------------------------------------------------------
#  Helpers
# ---------------------------------------------------------------------

def fresh_collection(name):
    """Removes any previous scaffold so re-running is safe and idempotent."""
    existing = bpy.data.collections.get(name)
    if existing:
        for obj in list(existing.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(existing)

    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def add_block(collection, name, location, rotation, scale):
    """
    A bevelled block placeholder. Deliberately crude: it marks the volume
    a plate should occupy, not the plate. The bevel modifier is left
    unapplied so you can feel the silhouette while you work — apply or
    delete it once you replace the geometry.
    """
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    # Build a unit cube in the object's own space, so the ORIGIN stays at
    # the plate's centre — which is the pivot the tear animation uses.
    verts = [
        (-0.5, -0.5, -0.5), (0.5, -0.5, -0.5), (0.5, 0.5, -0.5), (-0.5, 0.5, -0.5),
        (-0.5, -0.5, 0.5), (0.5, -0.5, 0.5), (0.5, 0.5, 0.5), (-0.5, 0.5, 0.5),
    ]
    faces = [
        (0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1),
        (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0),
    ]
    mesh.from_pydata(verts, [], faces)
    mesh.update()

    obj.location = Vector(location)
    obj.rotation_euler = Euler(rotation, "XYZ")
    obj.scale = Vector(scale)

    bevel = obj.modifiers.new("Bevel", "BEVEL")
    bevel.width = 0.04
    bevel.segments = 2
    bevel.limit_method = "ANGLE"

    obj.select_set(False)
    return obj


def add_ring(collection, name, outer, aperture, z):
    """A gyre ring: an annulus you can facet, notch and thicken."""
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=9, radius=outer, depth=0.22, location=(0.0, 0.0, z)
    )
    obj = bpy.context.active_object
    obj.name = name

    solid = obj.modifiers.new("Aperture", "SOLIDIFY")
    solid.thickness = max(outer - aperture, 0.05)
    solid.offset = 1.0

    bevel = obj.modifiers.new("Bevel", "BEVEL")
    bevel.width = 0.03
    bevel.segments = 2
    bevel.limit_method = "ANGLE"

    for c in obj.users_collection:
        c.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def build():
    collection = fresh_collection(COLLECTION)
    step = math.tau / MAJORS

    # ---- Crown plates ------------------------------------------------
    # Near-regular placement with a small deliberate jitter. The site
    # tried both extremes procedurally: heavy scatter read as debris,
    # perfect regularity read as a flower. The truth is in between and
    # it is a judgement call per plate — which is exactly why this is a
    # scaffold and not a generator. Nudge these by hand.
    for i in range(MAJORS):
        theta = i * step + math.pi / 2
        topness = math.sin(theta) * 0.5 + 0.5
        scale = 0.98 + topness * 0.2

        add_block(
            collection,
            "crown_%02d" % (i + 1),
            location=(
                math.cos(theta) * MAJOR_RADIUS,
                math.sin(theta) * MAJOR_RADIUS,
                -0.4,
            ),
            # Z aligns the plate to its spoke, Y leans it into the throat.
            rotation=(0.0, -MAJOR_LEAN, theta),
            scale=(MAJOR_LEN * scale, MAJOR_WIDTH * scale, MAJOR_THICK),
        )

        # Infill shard, seated in the gap behind the majors. The big/small
        # pairing is where the silhouette's fidelity comes from — keep
        # these clearly smaller so the hierarchy stays legible.
        theta2 = theta + step * 0.5
        add_block(
            collection,
            "crown_%02d" % (i + 8),
            location=(
                math.cos(theta2) * MINOR_RADIUS,
                math.sin(theta2) * MINOR_RADIUS,
                -0.95,
            ),
            rotation=(0.0, -MINOR_LEAN, theta2),
            scale=(
                MAJOR_LEN * scale * MINOR_SCALE,
                MAJOR_WIDTH * scale * MINOR_SCALE,
                MAJOR_THICK * 0.5,
            ),
        )

    # ---- Gyre rings --------------------------------------------------
    for k, (outer, aperture, z) in enumerate(GYRES):
        add_ring(collection, "gyre_%02d" % (k + 1), outer, aperture, z)

    # ---- Pupil shards ------------------------------------------------
    for i in range(PUPIL_COUNT):
        theta = (i / PUPIL_COUNT) * math.tau
        add_block(
            collection,
            "pupil_%02d" % (i + 1),
            location=(
                math.cos(theta) * PUPIL_RADIUS,
                math.sin(theta) * PUPIL_RADIUS,
                PUPIL_Z,
            ),
            rotation=(0.0, -0.3, theta),
            scale=(0.62, 0.4, 0.2),
        )

    # ---- Kernel ------------------------------------------------------
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=2, radius=KERNEL_RADIUS, location=(0.0, 0.0, KERNEL_Z)
    )
    kernel = bpy.context.active_object
    kernel.name = "kernel"
    for c in kernel.users_collection:
        c.objects.unlink(kernel)
    collection.objects.link(kernel)

    print("[dark-lattice] scaffold built: %d objects in '%s'"
          % (len(collection.objects), COLLECTION))
    print("[dark-lattice] model ONE crown plate well, then link-duplicate "
          "and vary the rest — that is what makes it read as one suit of "
          "armour instead of a pile of shards.")
    return collection


# ---------------------------------------------------------------------
#  Export
# ---------------------------------------------------------------------

def export_glb(path=EXPORT_PATH):
    """
    Exports the scaffold collection to GLB with the settings the site
    expects. Modifiers are applied on export, so the bevels come through
    without you having to apply them destructively while modelling.
    """
    collection = bpy.data.collections.get(COLLECTION)
    if not collection:
        raise RuntimeError("No '%s' collection — run build() first." % COLLECTION)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.objects:
        obj.select_set(True)

    target = os.path.abspath(path)
    os.makedirs(os.path.dirname(target), exist_ok=True)

    bpy.ops.export_scene.gltf(
        filepath=target,
        export_format="GLB",
        use_selection=True,
        export_apply=True,      # bake modifiers
        export_yup=True,        # glTF is Y-up; the loader expects this
        export_materials="NONE",  # the site authors all material itself
        export_cameras=False,
        export_lights=False,
    )
    print("[dark-lattice] wrote %s" % target)
    return target


if __name__ == "__main__":
    build()
    if EXPORT_ON_RUN:
        export_glb()
