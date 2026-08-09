"""
Dark Lattice — three readings of the Crowned Convergence.

WHY THIS EXISTS

Every entity so far — v05, v06, the whole radial lineage before them —
arranged plates in a FLAT RING around a central hole. That topology is
a wreath, and it reads as a wreath, a flower or a turbine no matter how
the individual plates are shaped or how the placement is jittered. Six
versions proved that the hard way.

The reference board is not a ring. It is a SPHERE encrusted with
plates, with a cavity bored into the front of it. The plates wrap the
whole visible hemisphere; the hole is a feature cut into that mass, not
the thing the plates are arranged around. That single structural
difference is what every previous version was missing.

All three variants below share that structure, the same sphere, the
same cavity, the same core and halo, and the same cameras — so they are
directly comparable. They differ only in how the shell is broken up,
which is the actual open question:

    A  CRUST      many small plates, tightly packed, low relief
    B  TIERED     fewer plates in concentric size tiers toward the core
    C  SHATTERED  few large fragments, wide gaps, deep relief

Plate centres come from a Fibonacci sphere — deterministic, evenly
spread, and with no rotational period for the eye to lock onto. It is
not random and it is not radial.

Run:
    blender --background --factory-startup --python tools/blender/variants.py
"""

import math
import os

import bpy
from mathutils import Euler, Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SHOT_DIR = os.path.join(ROOT, "captures", "variants")

# Shared across all three, so the comparison is honest.
SPHERE_RADIUS = 2.35
CAVITY_HALF_ANGLE = math.radians(24.0)   # cone bored into the front
# The entity faces -Y: the viewer stands there, the cavity opens toward
# them, and the core sits inside at +Y. Halo stays overhead at +Z.
CAVITY_APEX_Y = 0.55
CORE_DEPTH = 0.20
HALO_RADIUS = 2.62
HALO_HEIGHT = 2.30

# name, plate count, plate scale, relief (how far plates stand off the
# shell), thickness, tier count
VARIANTS = [
    ("A-crust", 96, 0.42, 0.06, 0.16, 1),
    ("B-tiered", 46, 0.62, 0.13, 0.26, 3),
    ("C-shattered", 24, 0.98, 0.26, 0.42, 1),
]


def rand(seed: float) -> float:
    """Deterministic hash. Same entity every run, on every machine."""
    value = math.sin(seed * 127.1 + 311.7) * 43758.5453
    return value - math.floor(value)


def clear() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if bpy.context.scene.world is None:
        bpy.context.scene.world = bpy.data.worlds.new("world")


def fibonacci_sphere(count: int):
    """
    Evenly distributed points on a sphere with no repeating angular
    period — the golden-angle spiral. This is what stops the plates
    reading as rows or as a wreath.
    """
    points = []
    golden = math.pi * (3.0 - math.sqrt(5.0))
    for i in range(count):
        y = 1.0 - (i / max(count - 1, 1)) * 2.0
        radius = math.sqrt(max(1.0 - y * y, 0.0))
        theta = golden * i
        points.append(Vector((math.cos(theta) * radius, y, math.sin(theta) * radius)))
    return points


def plate(name: str, direction: Vector, size: float, thickness: float,
          relief: float, seed: float, collection) -> bpy.types.Object:
    """
    One armour plate, seated on the shell and lying along the local
    surface. Built as an irregular prism, then oriented so its face
    follows the sphere — that is what makes the set read as an
    encrustation rather than as objects floating near a ball.
    """
    sides = 5 + int(rand(seed * 3.1) * 2)
    verts = []
    for i in range(sides):
        angle = (i / sides) * math.tau + rand(seed * 7.7) * 1.4
        jitter = 0.66 + rand(seed * 9.3 + i * 2.7) * 0.62
        verts.append((math.cos(angle) * size * jitter,
                      math.sin(angle) * size * jitter * 0.82))

    shape = bpy.data.meshes.new(name)
    top = [(x, y, thickness * 0.5) for x, y in verts]
    bottom = [(x * 0.82, y * 0.82, -thickness * 0.5) for x, y in verts]
    faces = [tuple(range(sides)), tuple(reversed(range(sides, sides * 2)))]
    for i in range(sides):
        j = (i + 1) % sides
        faces.append((i, j, sides + j, sides + i))
    shape.from_pydata(top + bottom, [], faces)
    shape.validate()

    obj = bpy.data.objects.new(name, shape)
    collection.objects.link(obj)

    # Seat it on the shell, face outward, then tilt slightly so the
    # crust is uneven — plates that all lie perfectly flush read as a
    # golf ball.
    obj.location = direction * (SPHERE_RADIUS + relief)
    quat = direction.to_track_quat("Z", "Y")
    tilt = Euler(((rand(seed * 5.3) - 0.5) * 0.5,
                  (rand(seed * 11.9) - 0.5) * 0.5,
                  rand(seed * 13.7) * math.tau), "XYZ")
    obj.matrix_world = (
        Matrix.Translation(obj.location)
        @ quat.to_matrix().to_4x4()
        @ tilt.to_matrix().to_4x4()
    )

    bevel = obj.modifiers.new("Bevel", "BEVEL")
    bevel.width = 0.012
    bevel.segments = 2
    bevel.limit_method = "ANGLE"
    return obj


def build_shell(collection) -> bpy.types.Object:
    """The dark mass the plates sit on, with the cavity bored out."""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=SPHERE_RADIUS * 0.97)
    shell = bpy.context.active_object
    shell.name = "shell"

    # Cone bored into the -Y face. Rotating +90 degrees about X maps the
    # cone's narrow end to +Y, so the apex sits deep inside the mass and
    # the mouth opens toward the viewer.
    depth = SPHERE_RADIUS * 2.6
    bpy.ops.mesh.primitive_cone_add(
        vertices=28,
        radius1=0.02,
        radius2=math.tan(CAVITY_HALF_ANGLE) * depth,
        depth=depth,
        rotation=(math.pi * 0.5, 0.0, 0.0),
        location=(0.0, CAVITY_APEX_Y - depth * 0.5, 0.0),
    )
    cutter = bpy.context.active_object
    boolean = shell.modifiers.new("Cavity", "BOOLEAN")
    boolean.operation = "DIFFERENCE"
    boolean.object = cutter
    boolean.solver = "EXACT"
    bpy.context.view_layer.objects.active = shell
    bpy.ops.object.modifier_apply(modifier=boolean.name)
    bpy.data.objects.remove(cutter, do_unlink=True)

    for c in list(shell.users_collection):
        c.objects.unlink(shell)
    collection.objects.link(shell)
    return shell


def build_core(collection) -> None:
    """
    Recessed convergence: concentric rings stepping down to a kernel.
    On the board this is the brightest thing in the composition and the
    reason the eye goes to the centre.
    """
    for index, (radius, y) in enumerate(
        [(1.05, -1.05), (0.82, -0.68), (0.61, -0.30), (0.43, 0.02)]
    ):
        bpy.ops.mesh.primitive_torus_add(
            align="WORLD", major_radius=radius, minor_radius=0.055,
            major_segments=26, minor_segments=6, location=(0.0, y, 0.0),
        )
        ring = bpy.context.active_object
        ring.name = "core_ring_%02d" % index
        # Rings face the viewer and counter-rotate against each other.
        ring.rotation_euler = Euler((math.pi * 0.5, 0.0, index * 0.4), "XYZ")
        for c in list(ring.users_collection):
            c.objects.unlink(ring)
        collection.objects.link(ring)

    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=2, radius=0.30, location=(0.0, CORE_DEPTH, 0.0)
    )
    kernel = bpy.context.active_object
    kernel.name = "kernel"
    for c in list(kernel.users_collection):
        c.objects.unlink(kernel)
    collection.objects.link(kernel)


def build_halo(collection) -> None:
    bpy.ops.mesh.primitive_torus_add(
        align="WORLD", major_radius=HALO_RADIUS, minor_radius=0.020,
        major_segments=96, minor_segments=8,
        location=(0.0, 0.0, HALO_HEIGHT),
    )
    halo = bpy.context.active_object
    halo.name = "halo"
    # Barely off horizontal, so it reads as a thin ellipse from the
    # rail rather than as a circle drawn over the frame.
    halo.rotation_euler = Euler((0.13, 0.05, 0.0), "XYZ")
    for c in list(halo.users_collection):
        c.objects.unlink(halo)
    collection.objects.link(halo)


def build(name: str, count: int, size: float, relief: float,
          thickness: float, tiers: int):
    clear()
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)

    build_shell(collection)
    build_core(collection)
    build_halo(collection)

    # Plates cover the whole shell. Anything inside the cavity cone is
    # skipped, so the hole stays a hole.
    placed = 0
    for index, direction in enumerate(fibonacci_sphere(count)):
        # The cavity opens along -Y, so plates pointing that way are the
        # ones the bore removes.
        if direction.y < -math.cos(CAVITY_HALF_ANGLE * 1.25):
            continue

        seed = index * 1.37 + 0.21
        # Tiering steps plate size down toward the cavity, which is what
        # makes variant B read as layers rather than a uniform crust.
        toward_cavity = (1.0 - direction.y) * 0.5
        if tiers > 1:
            tier = min(int(toward_cavity * tiers), tiers - 1)
            scale = size * (1.0 - tier * 0.22)
        else:
            scale = size * (0.78 + rand(seed * 2.3) * 0.5)

        plate("plate_%03d" % index, direction, scale, thickness,
              relief * (0.6 + rand(seed * 4.1) * 0.8), seed, collection)
        placed += 1

    return collection, placed


# ---------------------------------------------------------------------
#  Review renders — identical for every variant
# ---------------------------------------------------------------------

def camera(location, look_at, lens):
    cam = bpy.data.objects.get("cam")
    if cam is None:
        data = bpy.data.cameras.new("cam")
        cam = bpy.data.objects.new("cam", data)
        bpy.context.scene.collection.objects.link(cam)
    cam.data.lens = lens
    cam.location = Vector(location)
    direction = Vector(look_at) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam


def render(path, silhouette=False, size=(1000, 1000)):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.filepath = path
    scene.render.image_settings.file_format = "PNG"
    shading = scene.display.shading
    if silhouette:
        shading.light = "FLAT"
        shading.color_type = "SINGLE"
        shading.single_color = (0.0, 0.0, 0.0)
        shading.show_cavity = False
        scene.world.color = (0.82, 0.84, 0.87)
    else:
        shading.light = "STUDIO"
        shading.color_type = "SINGLE"
        shading.single_color = (0.26, 0.29, 0.34)
        shading.show_cavity = True
        shading.cavity_type = "BOTH"
        shading.curvature_ridge_factor = 2.0
        shading.curvature_valley_factor = 1.6
        scene.world.color = (0.025, 0.03, 0.04)
    scene.display.render_aa = "8"
    bpy.ops.render.render(write_still=True)


def main():
    os.makedirs(SHOT_DIR, exist_ok=True)
    summary = []
    for name, count, size, relief, thickness, tiers in VARIANTS:
        _collection, placed = build(name, count, size, relief, thickness, tiers)

        camera((0.0, -10.8, 0.35), (0.0, 0.0, 0.15), 62)
        render(os.path.join(SHOT_DIR, f"{name}-front.png"))

        camera((6.6, -8.2, 4.6), (0.0, 0.0, 0.15), 62)
        render(os.path.join(SHOT_DIR, f"{name}-three-quarter.png"))

        camera((0.0, -10.8, 0.35), (0.0, 0.0, 0.15), 62)
        render(os.path.join(SHOT_DIR, f"{name}-silhouette.png"),
               silhouette=True, size=(640, 640))

        summary.append((name, placed))
        print(f"VARIANT {name} plates={placed}")

    for name, placed in summary:
        print("BUILT", name, placed)


if __name__ == "__main__":
    main()
