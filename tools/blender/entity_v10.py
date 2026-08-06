"""
Dark Lattice — ENTITY v10: a shell that cracked open.

THE MISTAKE THIS FILE CORRECTS
Every previous crown arranged separate shards in a ring around a hole.
That is the definition of petals, and every version of it read as a
flower no matter how the placement was tuned — scattered, regular, or
anything between. The silhouette render made it obvious in two seconds.

The reference sheet is not a ring of shards. It is a MASS that has
broken, with the fragments still holding their shared form. So this
builds one closed body, opens a throat through it, and then CUTS it
into fragments. Because every fragment is carved from the same shell,
they fit each other exactly — the seams line up, the curvature agrees,
the silhouette closes. That is coherence by construction, and it is not
something placement can imitate.

There is no randomness here. The body's outline comes from an authored
harmonic profile, and the fracture uses an authored table of angles.

Run headless:
    blender --background --factory-startup --python tools/blender/entity_v10.py

Outputs:
    public/models/entity-v10.glb
    captures/blender/v10-silhouette.png   the real test
    captures/blender/v10-lit.png
    captures/blender/v10-three-quarter.png
"""

import math
import os

import bpy
import bmesh
from mathutils import Euler, Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
GLB_OUT = os.path.join(ROOT, "public", "models", "entity-v10.glb")
SHOT_DIR = os.path.join(ROOT, "captures", "blender")
COLLECTION = "DL_ENTITY"


# =====================================================================
#  THE BODY PROFILE
#
#  Radius as a function of the angle around the entity's face, with
#  0 = +X (right) and 90 = +Y (up). Authored, not sampled:
#
#   CROWN_BIAS  lifts the top and pulls in the base, so the mass is a
#               crown rather than a ball — this is what stops the
#               outline being a circle.
#   HARMONICS   three sine terms whose amplitudes and phases are chosen
#               (not rolled) to put the bulges and the notches where a
#               composition wants them. Coprime frequencies, so the
#               outline never repeats around the ring.
# =====================================================================

BASE_RADIUS = 3.15
CROWN_LIFT = 0.42      # how much taller the top is than the base
HARMONICS = [
    # (frequency, amplitude, phase degrees)
    (3.0, 0.170, 24.0),
    (5.0, 0.095, 200.0),
    (8.0, 0.052, 95.0),
]

# Named points. The crown's spikes are placed here, one line each,
# rather than emerging from a noise function — a spike belongs where
# the composition wants it. Sine harmonics can only make smooth bumps;
# these are narrow and sharp, and they are the reason the outline has
# somewhere to look. (angle degrees, height, angular width degrees)
SPIKES = [
    ( 96.0, 0.62, 11.0),   # the crest — tallest, just off centre
    ( 72.0, 0.46, 10.0),
    (118.0, 0.38, 10.5),
    ( 50.0, 0.28, 12.0),
    (142.0, 0.25, 12.0),
    ( 24.0, 0.18, 13.0),
    (170.0, 0.15, 13.0),
    (320.0, 0.14, 14.0),   # one low answer on the right, for balance
]

SHELL_THICKNESS = 0.34

# The throat: a cone bored through the body, opening toward the camera.
THROAT_APEX_Z = -2.45
THROAT_RADIUS = 2.30
THROAT_FAR_Z = 5.0

# =====================================================================
#  THE FRACTURE
#
#  Seed points for an authored Voronoi. Each seed claims the shell it
#  is nearest to, so the fragments are irregular polygonal patches that
#  tile the body exactly — real fracture. Cutting full-height wedges
#  instead (the first attempt) gave every fragment the same
#  pole-to-pole gore and the mass read as a melon.
#
#  The distribution is the composition: seeds crowd the crest so the
#  eye finds small detailed pieces where it looks first, and thin out
#  toward the base so the underside stays a few large calm masses.
#
#  (angle degrees, z, radial factor)
# =====================================================================

SEEDS = [
    ( 96.0,  1.15, 0.86),   # crest cluster — small, busy
    ( 78.0,  0.35, 0.90),
    (112.0,  0.55, 0.88),
    ( 60.0,  1.05, 0.86),
    (130.0,  1.20, 0.85),
    ( 34.0,  0.30, 0.90),
    (152.0, -0.35, 0.90),
    (183.0,  0.75, 0.88),   # flanks — medium
    (212.0, -0.95, 0.91),
    (243.0,  0.40, 0.90),
    (271.0, -1.05, 0.91),   # base — few, large, calm
    (300.0,  0.55, 0.89),
    (330.0, -0.55, 0.90),
    (  8.0,  0.95, 0.87),
]

# Per-fragment outward nudge, opening the seams. Small on purpose: the
# reference is a mass with hairline cracks, not an exploded diagram.
# Sliding fragments far apart made the crest read as a fan of cards.
PUSH_CREST = 0.075
PUSH_BASE = 0.02

GYRES = [(2.00, 1.58, -0.65), (1.62, 1.28, -1.15), (1.28, 1.00, -1.62)]
PUPIL_COUNT = 11
PUPIL_RADIUS = 0.80
PUPIL_Z = -1.90
KERNEL_Z = -2.02


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if bpy.context.scene.world is None:
        bpy.context.scene.world = bpy.data.worlds.new("review_world")


def make_collection(name):
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def profile_radius(angle_rad):
    """The authored outline. One place to tune the whole silhouette."""
    r = BASE_RADIUS
    # Crown bias: taller above, tucked below.
    r *= 1.0 + CROWN_LIFT * math.sin(angle_rad) * 0.5 - 0.13 * (1.0 - math.sin(angle_rad)) * 0.5
    for freq, amp, phase in HARMONICS:
        r *= 1.0 + amp * math.sin(freq * angle_rad + math.radians(phase))

    # Named spikes, added on top of the smooth outline.
    deg = math.degrees(angle_rad) % 360.0
    spike = 0.0
    for centre, height, width in SPIKES:
        delta = abs((deg - centre + 180.0) % 360.0 - 180.0)
        spike += height * math.exp(-((delta / width) ** 2))
    return r * (1.0 + spike)


def build_body():
    """
    The closed mass, before it breaks: an icosphere pushed onto the
    authored profile, flattened in depth so it reads as a face rather
    than a ball, then given wall thickness.
    """
    # Resolution is a trade. Too fine and the surface reads as a
    # triangle grid (a texture, not a form); too coarse and the
    # authored spikes get averaged away between vertices — at
    # subdivision 3 the mesh has a vertex every ~15 degrees and the
    # spikes simply vanished. Subdivision 4 resolves them, and the
    # planar decimate below puts the large flat facets back.
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=1.0)
    body = bpy.context.active_object
    body.name = "DL_body"

    mesh = body.data
    for v in mesh.vertices:
        co = v.co
        angle = math.atan2(co.y, co.x)
        r = profile_radius(angle)
        # Depth: enough Z for the throat to have real depth, but not so
        # much that the entity is a ball. 0.62 flattened it to a disc.
        v.co = Vector((co.x * r, co.y * r, co.z * r * 0.80))

    # Planar decimate: merges coplanar neighbours into large flat
    # facets, which is what turns a smooth deformed sphere into cut
    # crystal. Done before solidify and fracture so everything
    # downstream works on the lighter, faceted mesh.
    planar = body.modifiers.new("Facet", "DECIMATE")
    planar.decimate_type = "DISSOLVE"
    planar.angle_limit = math.radians(9.0)
    bpy.ops.object.modifier_apply(modifier=planar.name)

    solid = body.modifiers.new("Shell", "SOLIDIFY")
    solid.thickness = SHELL_THICKNESS
    solid.offset = -1.0
    bpy.ops.object.modifier_apply(modifier=solid.name)

    return body


def bore_throat(body):
    """Opens the funnel the camera flies down."""
    bpy.ops.mesh.primitive_cone_add(
        vertices=32,
        radius1=0.02,
        radius2=THROAT_RADIUS,
        depth=THROAT_FAR_Z - THROAT_APEX_Z,
        location=(0.0, 0.0, (THROAT_FAR_Z + THROAT_APEX_Z) * 0.5),
    )
    cutter = bpy.context.active_object
    cutter.name = "DL_throat_cutter"

    boolean = body.modifiers.new("Throat", "BOOLEAN")
    boolean.operation = "DIFFERENCE"
    boolean.object = cutter
    boolean.solver = "EXACT"

    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier=boolean.name)

    bpy.data.objects.remove(cutter, do_unlink=True)
    return body


def seed_points():
    """The authored seeds, lifted onto the body's own profile."""
    points = []
    for angle_deg, z, factor in SEEDS:
        a = math.radians(angle_deg)
        r = profile_radius(a) * factor
        points.append(Vector((math.cos(a) * r, math.sin(a) * r, z)))
    return points


def voronoi_fragment(body, seeds, index, collection, name):
    """
    Carves one Voronoi cell out of the body.

    For each other seed, the perpendicular bisector plane between the
    two is a wall of this cell; bisecting the mesh and discarding the
    far side leaves exactly the region nearer to this seed. Doing it
    with bmesh rather than booleans keeps it fast and exact, and the
    cut edges are filled so each fragment comes out a closed solid.
    """
    piece = body.copy()
    piece.data = body.data.copy()
    piece.name = name
    piece.data.name = name
    collection.objects.link(piece)

    here = seeds[index]

    bm = bmesh.new()
    bm.from_mesh(piece.data)

    for j, other in enumerate(seeds):
        if j == index:
            continue
        offset = other - here
        distance = offset.length
        if distance < 1e-6:
            continue
        # Skip distant seeds: their bisector cannot touch this cell, and
        # every skipped plane is a bisect we do not pay for.
        if distance > 9.0:
            continue

        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        result = bmesh.ops.bisect_plane(
            bm,
            geom=geom,
            plane_co=(here + other) * 0.5,
            plane_no=offset.normalized(),
            clear_outer=True,   # drop the half nearer `other`
            clear_inner=False,
        )
        cut_edges = [
            e for e in result.get("geom_cut", [])
            if isinstance(e, bmesh.types.BMEdge)
        ]
        if cut_edges:
            bmesh.ops.holes_fill(bm, edges=cut_edges)

    bm.to_mesh(piece.data)
    bm.free()

    if len(piece.data.vertices) == 0:
        bpy.data.objects.remove(piece, do_unlink=True)
        return None
    return piece


def sector_cutter(a0_deg, a1_deg, name):
    """
    A pie-slice solid spanning [a0, a1], tall enough in Z to cut clean
    through the shell. This is the knife; the shell is what matters.
    """
    a0 = math.radians(a0_deg)
    a1 = math.radians(a1_deg)
    steps = max(2, int((a1_deg - a0_deg) / 6.0))
    far = 12.0
    depth = 12.0

    rim = []
    for i in range(steps + 1):
        a = a0 + (a1 - a0) * (i / steps)
        rim.append(Vector((math.cos(a) * far, math.sin(a) * far, 0.0)))

    verts, faces = [], []
    n = len(rim)
    # Front fan, back fan, then the walls.
    verts.append(Vector((0.0, 0.0, depth)))
    for p in rim:
        verts.append(Vector((p.x, p.y, depth)))
    verts.append(Vector((0.0, 0.0, -depth)))
    for p in rim:
        verts.append(Vector((p.x, p.y, -depth)))

    top_c, bot_c = 0, n + 1
    for i in range(n - 1):
        faces.append((top_c, 1 + i, 1 + i + 1))
        faces.append((bot_c, bot_c + 1 + i + 1, bot_c + 1 + i))
    for i in range(n - 1):
        faces.append((1 + i, bot_c + 1 + i, bot_c + 1 + i + 1, 1 + i + 1))
    # Close the two radial walls so the cutter is a sealed solid —
    # an open cutter makes the exact boolean solver produce garbage.
    faces.append((top_c, bot_c, bot_c + 1, 1))
    faces.append((top_c, n, bot_c + n, bot_c))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    mesh.validate(verbose=False)
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)

    # Normals must face outward or DIFFERENCE/INTERSECT invert.
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)

    return obj


def fracture(body, collection):
    """Breaks the body into its Voronoi fragments and discards it."""
    seeds = seed_points()
    pieces = []

    for index in range(len(seeds)):
        piece = voronoi_fragment(
            body, seeds, index, collection, "crown_%02d" % (index + 1)
        )
        if piece is None:
            continue

        # Origin to the fragment's own centre — that is its tear pivot,
        # and the site rotates each plate about it.
        bpy.ops.object.select_all(action="DESELECT")
        piece.select_set(True)
        bpy.context.view_layer.objects.active = piece
        bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="MEDIAN")
        piece.select_set(False)

        # Open the seam, radially, so neighbours part along their shared
        # face rather than shearing across it. Crest fragments lift a
        # little more than the base, which keeps the mass closed
        # underneath and lets the crown breathe.
        centre = piece.location.copy()
        radial = Vector((centre.x, centre.y, 0.0))
        if radial.length > 1e-5:
            lift = (math.sin(math.atan2(centre.y, centre.x)) * 0.5 + 0.5)
            push = PUSH_BASE + (PUSH_CREST - PUSH_BASE) * lift
            piece.location += radial.normalized() * push

        bevel = piece.modifiers.new("Bevel", "BEVEL")
        bevel.width = 0.02
        bevel.segments = 2
        bevel.limit_method = "ANGLE"
        bevel.angle_limit = math.radians(35.0)
        bevel.harden_normals = True

        wn = piece.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
        wn.keep_sharp = True

        pieces.append(piece)

    bpy.data.objects.remove(body, do_unlink=True)
    return pieces


def build_gyre(collection, name, outer, aperture, z):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=9, radius=outer, depth=0.22, location=(0.0, 0.0, z)
    )
    obj = bpy.context.active_object
    obj.name = name

    solid = obj.modifiers.new("Aperture", "SOLIDIFY")
    solid.thickness = max(outer - aperture, 0.05)
    solid.offset = 1.0

    bevel = obj.modifiers.new("Bevel", "BEVEL")
    bevel.width = 0.025
    bevel.segments = 2
    bevel.limit_method = "ANGLE"

    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def build_interior(collection):
    for k, (outer, aperture, z) in enumerate(GYRES):
        build_gyre(collection, "gyre_%02d" % (k + 1), outer, aperture, z)

    for i in range(PUPIL_COUNT):
        theta = (i / PUPIL_COUNT) * math.tau
        bpy.ops.mesh.primitive_cube_add(size=1.0)
        shard = bpy.context.active_object
        shard.name = "pupil_%02d" % (i + 1)
        shard.scale = Vector((0.34, 0.20, 0.14))
        shard.location = Vector((
            math.cos(theta) * PUPIL_RADIUS,
            math.sin(theta) * PUPIL_RADIUS,
            PUPIL_Z,
        ))
        shard.rotation_euler = Euler((0.0, -0.30, theta), "XYZ")
        for c in list(shard.users_collection):
            c.objects.unlink(shard)
        collection.objects.link(shard)

    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=2, radius=0.5, location=(0.0, 0.0, KERNEL_Z)
    )
    kernel = bpy.context.active_object
    kernel.name = "kernel"
    for c in list(kernel.users_collection):
        c.objects.unlink(kernel)
    collection.objects.link(kernel)


# ---------------------------------------------------------------------
#  Review renders
# ---------------------------------------------------------------------

def setup_camera(location, look_at=Vector((0.0, 0.0, 0.0)), fov_deg=42.0):
    cam = bpy.data.objects.get("review_cam")
    if cam is None:
        cam_data = bpy.data.cameras.new("review_cam")
        cam_data.lens_unit = "FOV"
        cam = bpy.data.objects.new("review_cam", cam_data)
        bpy.context.scene.collection.objects.link(cam)
    cam.data.angle = math.radians(fov_deg)
    cam.location = Vector(location)

    direction = (look_at - cam.location)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam
    return cam


def render_to(path, silhouette=False):
    scene = bpy.context.scene
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.filepath = path
    scene.render.image_settings.file_format = "PNG"
    scene.render.engine = "BLENDER_WORKBENCH"

    shading = scene.display.shading
    if silhouette:
        shading.light = "FLAT"
        shading.color_type = "SINGLE"
        shading.single_color = (0.02, 0.02, 0.02)
        shading.show_cavity = False
        scene.world.color = (0.85, 0.87, 0.9)
    else:
        shading.light = "STUDIO"
        shading.color_type = "SINGLE"
        shading.single_color = (0.28, 0.31, 0.36)
        shading.show_cavity = True
        shading.cavity_type = "BOTH"
        shading.curvature_ridge_factor = 1.8
        shading.curvature_valley_factor = 1.4
        scene.world.color = (0.03, 0.035, 0.045)

    scene.display.render_aa = "8"
    bpy.ops.render.render(write_still=True)


def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    collection = bpy.data.collections.get(COLLECTION)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.objects:
        obj.select_set(True)

    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="NONE",
        export_cameras=False,
        export_lights=False,
    )
    return path


def main():
    clear_scene()
    collection = make_collection(COLLECTION)

    body = build_body()
    bore_throat(body)
    pieces = fracture(body, collection)
    build_interior(collection)

    os.makedirs(SHOT_DIR, exist_ok=True)

    setup_camera((0.0, 0.0, 15.0))
    render_to(os.path.join(SHOT_DIR, "v10-silhouette.png"), silhouette=True)
    render_to(os.path.join(SHOT_DIR, "v10-lit.png"), silhouette=False)

    setup_camera((11.5, 6.5, 14.0))
    render_to(os.path.join(SHOT_DIR, "v10-three-quarter.png"), silhouette=False)

    export_glb(GLB_OUT)
    print("[dark-lattice] fragments: %d, objects: %d"
          % (len(pieces), len(collection.objects)))
    print("[dark-lattice] wrote %s (%.1f KB)"
          % (GLB_OUT, os.path.getsize(GLB_OUT) / 1024.0))


if __name__ == "__main__":
    main()
