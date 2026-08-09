"""
Builds the Full Form v2 workbench from the authored form data.

    blender --background --python tools/blender/build_monolith_v2.py

Writes:
    assets/blender/DL_Monolith_Workbench_v2.blend
    design/clay/DL_FullForm_v02_clay.glb

Method: one hollow mother volume, fractured by six authored planes into
seven masses, each displaced along its own vector. The mother volume is
kept in the workbench so the fracture can be re-cut by hand.
"""

import bpy
import bmesh
import math
import os
import sys

from mathutils import Vector

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import monolith_v2_form as form  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
BLEND_OUT = os.path.join(ROOT, "assets", "blender", "DL_Monolith_Workbench_v3.blend")
GLB_OUT = os.path.join(ROOT, "design", "clay", "DL_FullForm_v03_clay.glb")

COLLECTIONS = [
    "00_REFERENCE",
    "01_MOTHER_VOLUME",
    "02_OUTER_MASSES",
    "03_INNER_SPINE",
    "04_TUNNEL",
    "05_LATENT",
    "06_HALO_GUIDE",
    "07_CAMERA_GUIDES",
    "08_EXPORT",
    "99_ARCHIVE",
]


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for name in COLLECTIONS:
        bpy.context.scene.collection.children.link(bpy.data.collections.new(name))


def link(obj, collection_name):
    for collection in obj.users_collection:
        collection.objects.unlink(obj)
    bpy.data.collections[collection_name].objects.link(obj)


def make_object(name, verts, faces, collection):
    mesh = bpy.data.meshes.new(name + "_MESH")
    mesh.from_pydata([form.to_blender(v) for v in verts], [], faces)
    mesh.validate(verbose=False)
    for polygon in mesh.polygons:
        polygon.use_smooth = False
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    link(obj, collection)
    return obj


def tube(name, rings_outer, rings_inner, heights, collection):
    """
    A closed hollow prism: outer wall, inner wall, and an annulus cap at
    each end. Manifold, so it can be cut with a boolean.
    """
    n = len(form.PLAN)
    verts = []
    outer = []
    inner = []
    for level, y in enumerate(heights):
        o_row = []
        i_row = []
        for j in range(n):
            x, z = rings_outer[level][j]
            o_row.append(len(verts))
            verts.append((x, y, z))
        for j in range(n):
            x, z = rings_inner[level][j]
            i_row.append(len(verts))
            verts.append((x, y, z))
        outer.append(o_row)
        inner.append(i_row)

    faces = []
    for i in range(len(heights) - 1):
        for j in range(n):
            k = (j + 1) % n
            faces.append([outer[i][j], outer[i][k], outer[i + 1][k], outer[i + 1][j]])
            faces.append([inner[i][k], inner[i][j], inner[i + 1][j], inner[i + 1][k]])
    last = len(heights) - 1
    for j in range(n):
        k = (j + 1) % n
        faces.append([outer[0][k], outer[0][j], inner[0][j], inner[0][k]])
        faces.append([outer[last][j], outer[last][k], inner[last][k], inner[last][j]])
    return make_object(name, verts, faces, collection)


def solid(name, rings, heights, collection):
    """A closed solid prism from a stack of authored rings."""
    n = len(form.PLAN)
    verts = []
    levels = []
    for level, y in enumerate(heights):
        row = []
        for j in range(n):
            x, z = rings[level][j]
            row.append(len(verts))
            verts.append((x, y, z))
        levels.append(row)
    faces = []
    for i in range(len(heights) - 1):
        for j in range(n):
            k = (j + 1) % n
            faces.append([levels[i][j], levels[i][k], levels[i + 1][k], levels[i + 1][j]])
    faces.append(list(reversed(levels[0])))
    faces.append(list(levels[-1]))
    return make_object(name, verts, faces, collection)


def build_mother():
    heights = [level[0] for level in form.LEVELS]
    outer = [form.outer_ring(y) for y in heights]
    void = [form.void_ring(y) for y in heights]
    obj = tube("DL_MotherVolume", outer, void, heights, "01_MOTHER_VOLUME")

    # Shear the crown and the base before fracturing, so every mass
    # inherits the same broken top and the same compressed bottom rather
    # than each being capped level.
    crown_point, crown_normal = form.CROWN_CUT
    base_point, base_normal = form.BASE_CUT
    carve(obj, crown_point, crown_normal, False, "crown")
    carve(obj, base_point, base_normal, True, "base")

    recess = build_recess_cutter()
    apply_boolean(obj, recess, "DIFFERENCE", "recess")
    bpy.data.objects.remove(recess, do_unlink=True)

    obj["dl_note"] = "authored mother volume; the seven masses are cut from this"
    return obj


def apply_boolean(obj, cutter, operation, name):
    modifier = obj.modifiers.new(name, "BOOLEAN")
    modifier.operation = operation
    modifier.solver = "EXACT"
    modifier.object = cutter
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    obj.modifiers.remove(modifier)
    obj.data = mesh
    for polygon in obj.data.polygons:
        polygon.use_smooth = False


def build_recess_cutter():
    """
    The hero recess: an irregular frontal profile swept back and tapered,
    so the channel narrows as it goes in and never shows parallel sides.
    """
    spec = form.RECESS
    profile = spec["profile"]
    cx = sum(p[0] for p in profile) / len(profile)
    cy = sum(p[1] for p in profile) / len(profile)
    taper = spec["taper"]

    verts = []
    front = []
    back = []
    for x, y in profile:
        front.append(len(verts))
        verts.append((x, y, spec["z_front"]))
    for x, y in profile:
        back.append(len(verts))
        verts.append((cx + (x - cx) * taper, cy + (y - cy) * taper, spec["z_back"]))

    n = len(profile)
    faces = []
    for j in range(n):
        k = (j + 1) % n
        faces.append([front[j], front[k], back[k], back[j]])
    faces.append(list(reversed(front)))
    faces.append(list(back))

    obj = make_object("DL_RecessCutter", verts, faces, "99_ARCHIVE")
    return obj


def half_space_box(name, point, normal, keep_positive):
    """
    A half-space as a large box with one face lying on the plane.

    Cutting a cube with bisect_plane and capping it with triangle_fill
    can leave a non-manifold cell, and an EXACT boolean against a
    non-manifold operand produces garbage rather than an error — which is
    how a mass silently lost most of its volume. A box is manifold by
    construction, so the intersection is always well defined.
    """
    n = Vector(form.to_blender(normal)).normalized()
    if not keep_positive:
        n = -n
    co = Vector(form.to_blender(point))

    mesh = bpy.data.meshes.new(name + "_MESH")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=60.0)
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    link(obj, "99_ARCHIVE")
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = n.to_track_quat("Z", "Y")
    obj.location = co + n * 30.0
    return obj


def carve(obj, point, normal, keep_positive, label):
    box = half_space_box(label + "_BOX", point, normal, keep_positive)
    apply_boolean(obj, box, "INTERSECT", label)
    bpy.data.objects.remove(box, do_unlink=True)


def build_masses(mother):
    objects = []
    for index, mass in enumerate(form.MASSES):
        source = mother.copy()
        source.data = mother.data.copy()
        bpy.context.scene.collection.objects.link(source)
        source.name = mass["name"]

        for cut_index, keep_positive in mass["path"]:
            _, point, normal = form.CUTS[cut_index]
            carve(source, point, normal, keep_positive, "cut%d" % cut_index)

        link(source, "02_OUTER_MASSES")

        source.location = Vector(form.to_blender(mass["offset"]))
        source["dl_role"] = "outer_mass"
        source["dl_material_class"] = "MAT_OBSIDIAN"
        source["dl_visibility_stage"] = "full"
        source["dl_stage_from"] = 0.0
        source["dl_stage_to"] = 0.56
        source["dl_projection"] = "planar"
        source["dl_mass_role"] = mass["role"]
        source["dl_depth_tier"] = mass["tier"]
        source["dl_index"] = index
        source["dl_note"] = mass["note"]
        objects.append(source)
    return objects


def build_spine():
    spec = form.SPINE
    heights = [level[0] for level in spec["levels"]]
    rings = [form.spine_ring(y) for y in heights]
    obj = solid(spec["name"], rings, heights, "03_INNER_SPINE")
    # The spine takes the same base shear as the masses, or its foot
    # protrudes below the form's sheared bottom.
    base_point, base_normal = form.BASE_CUT
    carve(obj, base_point, base_normal, True, "spine_base")
    obj["dl_role"] = "inner_spine"
    obj["dl_material_class"] = "MAT_SPINE"
    obj["dl_visibility_stage"] = "full"
    obj["dl_stage_from"] = 0.0
    obj["dl_stage_to"] = 0.62
    obj["dl_projection"] = "planar"
    return obj


def build_halo_guide():
    spec = form.HALO
    cx, cy, cz = spec["centre"]
    radius = spec["radius"]
    segments = 96
    verts = [(cx, cy, cz)]
    for j in range(segments):
        a = 2.0 * math.pi * j / segments
        verts.append((cx + math.cos(a) * radius, cy + math.sin(a) * radius, cz))
    faces = [[0, 1 + j, 1 + (j + 1) % segments] for j in range(segments)]
    obj = make_object(spec["name"], verts, faces, "06_HALO_GUIDE")
    obj["dl_role"] = "halo"
    obj["dl_material_class"] = "MAT_HALO"
    obj["dl_visibility_stage"] = "full"
    obj["dl_stage_from"] = 0.0
    obj["dl_stage_to"] = 0.36
    obj["dl_projection"] = "none"
    obj.hide_render = True
    return obj


def build_camera_guide():
    hero = form.HERO_CAMERA
    data = bpy.data.cameras.new("DL_HeroCamera")
    data.sensor_fit = "VERTICAL"
    data.angle_y = math.radians(hero["fov"])
    data.shift_x = -hero["shift"]
    camera = bpy.data.objects.new("DL_HeroCamera", data)
    bpy.context.scene.collection.objects.link(camera)
    link(camera, "07_CAMERA_GUIDES")
    camera.location = Vector(form.to_blender(hero["position"]))

    target = bpy.data.objects.new("DL_HeroTarget", None)
    target.location = Vector(form.to_blender(hero["target"]))
    bpy.context.scene.collection.objects.link(target)
    link(target, "07_CAMERA_GUIDES")

    constraint = camera.constraints.new("TRACK_TO")
    constraint.target = target
    constraint.track_axis = "TRACK_NEGATIVE_Z"
    constraint.up_axis = "UP_Y"
    return camera


def report(masses):
    print("\n--- Full Form v2 ---")
    total = 0
    for obj in masses:
        tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
        total += tris
        print(
            "  %-24s %5d tris  %5d verts  tier=%-5s role=%s"
            % (obj.name, tris, len(obj.data.vertices), obj["dl_depth_tier"], obj["dl_mass_role"])
        )
    print("  outer mass triangles: %d" % total)


def main():
    reset_scene()
    mother = build_mother()
    masses = build_masses(mother)
    build_spine()
    build_halo_guide()
    camera = build_camera_guide()
    bpy.context.scene.camera = camera

    mother.hide_render = True
    mother.hide_viewport = True

    report(masses)

    os.makedirs(os.path.dirname(BLEND_OUT), exist_ok=True)
    os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)
    print("wrote %s" % BLEND_OUT)

    export = [o for o in bpy.data.objects if o.type == "MESH" and not o.hide_render]
    for obj in bpy.data.objects:
        obj.select_set(obj in export)
    bpy.ops.export_scene.gltf(
        filepath=GLB_OUT,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_normals=True,
        export_materials="NONE",
    )
    print("wrote %s" % GLB_OUT)


main()
