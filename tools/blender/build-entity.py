"""
build-entity.py — one body, not five objects.

Run headless:

    blender --background --factory-startup --python tools/blender/build-entity.py

Writes `public/models/entity.glb` and `public/models/entity.json`.

Jacob, on the five-sheet version: "I see five ghostly translucent vanes... the
macro silhouette is still countable because the macro geometry itself is five
separate sheets." Correct, and not fixable by arranging them better. Five
objects arranged together is five objects.

So this is ONE surface. A single open spine sweeps around an off-centre
absence; the width pulses along it so lobes grow out of the same body rather
than being placed beside it; the twist rolls continuously so the sheet presents
its face in one region and its edge in another, which is what makes a fold read
as a fold. Every major part flows into another major part because they are the
same sheet at different values of u. There is nothing to count.

One aperture is cut through the largest lobe. Negative space inside the body,
not just around it — that is what stops a silhouette reading as a blob and it
is the strongest single tool for making a shape look designed.

The geometry is authored here and the trajectory system reads the same control
data from the JSON, so the veins lie on the surface by construction and the two
cannot drift apart.
"""

import bpy
import bmesh
import json
import math
import os
from mathutils import Vector

# --- the shape -----------------------------------------------------------
#
# Open: the ends are six units apart and never meet. A closed curve wraps a
# centre and anything wrapping a centre is a torus however it is dressed.
SPINE = [
    (-6.5, 3.2, -2.2),
    (-3.4, 3.9, -0.6),
    (0.2, 4.1, 0.8),
    (3.6, 3.0, 1.4),
    (5.4, 0.9, 0.9),
    (4.4, -1.6, -0.2),
    (1.6, -3.0, -0.9),
    (-1.9, -3.2, -0.2),
    (-4.2, -1.9, 1.3),
]

# Pulsing, so lobes grow from the body. Four of them, none the same size.
WIDTH = [0.35, 1.50, 0.90, 1.95, 1.10, 2.25, 1.00, 1.70, 0.40]

# Continuous roll. Face here, edge there; without it the whole sheet presents
# the same way to the camera and reads as one flat vane.
TWIST = [0.0, 0.7, 1.5, 2.5, 3.5, 4.7, 5.7, 6.7, 7.5]

# How far the cross-section bows out of its own plane, per control point.
BILLOW = [0.30, 0.62, 0.44, 0.80, 0.50, 0.88, 0.46, 0.70, 0.28]

# The aperture, in surface coordinates. Cut through the largest lobe.
APERTURE = {"u": 0.735, "v": 0.02, "ru": 0.062, "rv": 0.56}

# Tessellation. Coarse, the aperture boundary comes out as a visible staircase:
# the ellipse is tested per face, so the cut can only follow the grid. Fine
# enough and it reads as a cut edge.
ALONG = 440
ACROSS = 84

THICKNESS = 0.085
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "public", "models")


def catmull(values, t):
    n = len(values) - 1
    s = min(max(t, 0.0), 1.0) * n
    i = min(int(math.floor(s)), n - 1)
    f = s - i
    p0 = values[max(i - 1, 0)]
    p1 = values[i]
    p2 = values[i + 1]
    p3 = values[min(i + 2, n)]
    return 0.5 * (
        2 * p1
        + (-p0 + p2) * f
        + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f
        + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f
    )


def spine_at(t):
    return Vector(
        (
            catmull([p[0] for p in SPINE], t),
            catmull([p[1] for p in SPINE], t),
            catmull([p[2] for p in SPINE], t),
        )
    )


# One reference up, chosen off every axis so no frame degenerates.
UP = Vector((0.28, 0.52, 0.81)).normalized()


def frame_at(t):
    point = spine_at(t)
    step = 0.0015
    tangent = (spine_at(min(1.0, t + step)) - spine_at(max(0.0, t - step))).normalized()
    right = tangent.cross(UP).normalized()
    normal = right.cross(tangent).normalized()

    angle = catmull(TWIST, t)
    c, s = math.cos(angle), math.sin(angle)
    rolled_right = right * c + normal * s
    rolled_normal = normal * c - right * s
    return point, tangent, rolled_right.normalized(), rolled_normal.normalized()


def surface_point(u, v):
    point, _tangent, right, normal = frame_at(u)
    half = catmull(WIDTH, u)
    bow = catmull(BILLOW, u)
    return point + right * (v * half) + normal * (bow * half * (1.0 - v * v))


def inside_aperture(u, v):
    du = (u - APERTURE["u"]) / APERTURE["ru"]
    dv = (v - APERTURE["v"]) / APERTURE["rv"]
    return du * du + dv * dv < 1.0


def build():
    mesh = bpy.data.meshes.new("entity")
    bm = bmesh.new()

    grid = []
    for i in range(ALONG + 1):
        u = i / ALONG
        row = []
        for j in range(ACROSS + 1):
            v = (j / ACROSS) * 2.0 - 1.0
            row.append(bm.verts.new(surface_point(u, v)))
        grid.append(row)
    bm.verts.ensure_lookup_table()

    for i in range(ALONG):
        u = (i + 0.5) / ALONG
        for j in range(ACROSS):
            v = ((j + 0.5) / ACROSS) * 2.0 - 1.0
            # The aperture is a hole in the body, so the faces are simply not
            # made. Cutting it after the fact with a boolean leaves a rim of
            # degenerate triangles that shade badly at a grazing angle, which
            # is the only angle this material is ever seen at.
            if inside_aperture(u, v):
                continue
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))

    # Anything the aperture orphaned.
    loose = [vert for vert in bm.verts if not vert.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")

    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new("entity", mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    # Thickness, so the body occludes and has an edge to catch light. A sheet
    # with no depth has no silhouette from the side.
    solidify = obj.modifiers.new("solidify", "SOLIDIFY")
    solidify.thickness = THICKNESS
    solidify.offset = 0.0
    solidify.use_rim = True

    shade = obj.modifiers.new("smooth", "SMOOTH")
    shade.factor = 0.4
    shade.iterations = 2

    bpy.ops.object.modifier_apply(modifier="solidify")
    bpy.ops.object.modifier_apply(modifier="smooth")

    for polygon in obj.data.polygons:
        polygon.use_smooth = True

    return obj


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.objects):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def main():
    clear()
    obj = build()

    os.makedirs(OUT_DIR, exist_ok=True)
    glb = os.path.abspath(os.path.join(OUT_DIR, "entity.glb"))
    bpy.ops.export_scene.gltf(
        filepath=glb,
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_normals=True,
        export_materials="NONE",
    )

    lo = [min(v.co[i] for v in obj.data.vertices) for i in range(3)]
    hi = [max(v.co[i] for v in obj.data.vertices) for i in range(3)]

    # The trajectory system reads exactly these numbers and uses the same
    # parametric maths, so the veins lie on the body by construction.
    manifest = {
        "spine": SPINE,
        "width": WIDTH,
        "twist": TWIST,
        "billow": BILLOW,
        "aperture": APERTURE,
        "up": [UP.x, UP.y, UP.z],
        "thickness": THICKNESS,
        "bounds": {"min": lo, "max": hi},
        "triangles": len(obj.data.polygons),
        "vertices": len(obj.data.vertices),
    }
    with open(os.path.join(OUT_DIR, "entity.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)

    span = [hi[i] - lo[i] for i in range(3)]
    print(
        "ENTITY %d verts, %d tris, spans %.1f x %.1f x %.1f"
        % (len(obj.data.vertices), len(obj.data.polygons), span[0], span[1], span[2])
    )


main()
