"""
Entity v6 blockout — THE STRATIFIED GATE.

Run headless:
  "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" -b -P tools/blender/entity_v6.py

Direction (founder concept board, Aug 2026): salvages 07 "The Stratified
Will" (stacked slabs, light leaking between strata), 08/01 (fractal-
engraved facets — done in the site shader, not here), and the thin gold
halo present in every frame.

Pipeline per the founder's spec:
  - SIX artist-authored slabs. Every number below is authored, not
    random; Geometry Nodes are deliberately not used to find the
    silhouette.
  - Boolean modifier for the tunnel cavity and edge wedge cuts.
  - Bevel modifier, then Weighted Normal modifier.
  - Mirror symmetry is inherent in the authored profiles (bilateral in
    X by construction).
  - Built-in glTF exporter -> public/models/entity-v6.glb.

The stack splits for the tear as JAWS: top three slabs rise, bottom
three drop (the site drives this from each object's name).
"""

import bpy
import math
import os

ROOT = r"C:\Users\jacob\dark-lattice"
GLB_OUT = os.path.join(ROOT, "public", "models", "entity-v6.glb")
RENDER_DIR = os.path.join(ROOT, "captures", "blender")

# ----------------------------------------------------------------------
#  Clean scene
# ----------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ----------------------------------------------------------------------
#  Authored slab profiles (bottom-y, top-y, halfwidth-bottom,
#  halfwidth-top, depth, z-offset). The stack fills the familiar kite
#  envelope (±2.35 x, ±4.4 y) so the site's portal footprint holds.
# ----------------------------------------------------------------------
SLABS = [
    ("slab_top_1", 3.10, 4.40, 0.62, 0.07, 1.00, 0.05),
    ("slab_top_2", 1.72, 3.02, 1.58, 0.66, 1.30, -0.04),
    ("slab_top_3", 0.06, 1.64, 2.35, 1.62, 1.52, 0.02),
    ("slab_bot_3", -1.64, -0.06, 2.35, 1.62, 1.52, 0.02),
    ("slab_bot_2", -3.02, -1.72, 1.58, 0.66, 1.30, -0.04),
    ("slab_bot_1", -4.40, -3.10, 0.62, 0.07, 1.00, 0.05),
]
# Note: bot slabs mirror the top profiles about y=0 — the halfwidths are
# listed top-edge-first for the top slabs and bottom-edge-first for the
# bottom ones below, handled in build_slab().


def build_slab(name, y0, y1, hw0, hw1, depth, zoff):
    """A trapezoidal prism: cross-section authored in XY, extruded in Z.

    hw0 is the half-width at y0 (the lower edge), hw1 at y1 (the upper).
    """
    verts = []
    faces = []
    hz = depth * 0.5
    for z in (-hz + zoff, hz + zoff):
        verts.extend([
            (-hw0, y0, z),
            (hw0, y0, z),
            (hw1, y1, z),
            (-hw1, y1, z),
        ])
    faces = [
        (0, 1, 2, 3),
        (7, 6, 5, 4),
        (0, 4, 5, 1),
        (1, 5, 6, 2),
        (2, 6, 7, 3),
        (3, 7, 4, 0),
    ]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    return obj


def cutter_box(name, size, loc, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    c = bpy.context.active_object
    c.name = name
    c.scale = size
    bpy.ops.object.transform_apply(scale=True)
    c.display_type = "WIRE"
    c.hide_render = True
    return c


def kite_prism(name, sx, sy, depth):
    """The tunnel cavity. Built from the octagonal cylinder primitive —
    guaranteed manifold, which a hand-wound mesh was not: the original
    version had inconsistent face winding and the EXACT boolean silently
    refused to cut anything."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=1.0, depth=depth, location=(0, 0, 0))
    obj = bpy.context.active_object
    obj.name = name
    obj.rotation_euler = (0, 0, math.radians(22.5))
    obj.scale = (sx, sy, 1.0)
    bpy.ops.object.transform_apply(rotation=True, scale=True)
    obj.display_type = "WIRE"
    obj.hide_render = True
    return obj


# ----------------------------------------------------------------------
#  Build the six slabs
# ----------------------------------------------------------------------
slabs = []
for (name, y0, y1, hwa, hwb, depth, zoff) in SLABS:
    if name.startswith("slab_top"):
        obj = build_slab(name, y0, y1, hwa, hwb, depth, zoff)
    else:
        # Bottom slabs: wide edge at the top of the slab.
        obj = build_slab(name, y0, y1, hwb, hwa, depth, zoff)
    slabs.append(obj)

# ----------------------------------------------------------------------
#  Cutters — authored, mirrored in X by explicit ± placement
# ----------------------------------------------------------------------
cavity = kite_prism("cut_cavity", 1.05, 2.05, 6.0)

wedges = []
# Chamfer wedges clipping the outer corners of the waist slabs.
for side in (-1, 1):
    wedges.append(cutter_box(
        f"cut_wedge_waist_{'r' if side > 0 else 'l'}",
        (1.4, 1.4, 4.0),
        (side * 2.95, 0.0, 0.0),
        (0, 0, math.radians(side * 24)),
    ))
    # Shoulder nicks on the second slabs.
    wedges.append(cutter_box(
        f"cut_nick_top_{'r' if side > 0 else 'l'}",
        (0.8, 0.8, 4.0),
        (side * 1.9, 2.55, 0.0),
        (0, 0, math.radians(side * -18)),
    ))
    wedges.append(cutter_box(
        f"cut_nick_bot_{'r' if side > 0 else 'l'}",
        (0.8, 0.8, 4.0),
        (side * 1.9, -2.55, 0.0),
        (0, 0, math.radians(side * 18)),
    ))

# Shallow front panel recesses on the waist slabs (inset faces).
panels = []
for sy in (0.85, -0.85):
    panels.append(cutter_box(
        f"cut_panel_{'t' if sy > 0 else 'b'}",
        (2.6, 0.52, 0.34),
        (0.0, sy, 0.95),
    ))

# ----------------------------------------------------------------------
#  Apply booleans + bevel + weighted normals per slab
# ----------------------------------------------------------------------
for obj in slabs:
    bpy.context.view_layer.objects.active = obj

    for cutter in [cavity] + wedges + panels:
        mod = obj.modifiers.new(name=f"bool_{cutter.name}", type="BOOLEAN")
        mod.operation = "DIFFERENCE"
        mod.object = cutter
        mod.solver = "EXACT"

    bev = obj.modifiers.new(name="bevel", type="BEVEL")
    bev.width = 0.035
    bev.segments = 2
    bev.limit_method = "ANGLE"
    bev.angle_limit = math.radians(40)

    wn = obj.modifiers.new(name="weighted_normals", type="WEIGHTED_NORMAL")
    wn.keep_sharp = True

    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)

# Remove cutters.
for cutter in [cavity] + wedges + panels:
    bpy.data.objects.remove(cutter, do_unlink=True)

# ----------------------------------------------------------------------
#  Review-render dressing (halo + lights are NOT exported)
# ----------------------------------------------------------------------
bpy.ops.mesh.primitive_torus_add(
    major_radius=1.95, minor_radius=0.012, location=(0, 5.15, 0),
    rotation=(math.radians(96), 0, 0),
)
halo = bpy.context.active_object
halo.name = "review_halo"

mat = bpy.data.materials.new("review_slab")
mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.018, 0.02, 0.026, 1)
bsdf.inputs["Roughness"].default_value = 0.42
for obj in slabs:
    obj.data.materials.append(mat)

halo_mat = bpy.data.materials.new("review_halo_gold")
halo_mat.use_nodes = True
hb = halo_mat.node_tree.nodes["Principled BSDF"]
hb.inputs["Base Color"].default_value = (1.0, 0.78, 0.42, 1)
if "Emission Color" in hb.inputs:
    hb.inputs["Emission Color"].default_value = (1.0, 0.8, 0.45, 1)
    hb.inputs["Emission Strength"].default_value = 8.0
halo.data.materials.append(halo_mat)

# Workbench renders are deterministic headless; studio cavity shading is
# the honest way to review hard-surface form.
scene.render.engine = "BLENDER_WORKBENCH"
shading = scene.display.shading
shading.light = "STUDIO"
shading.color_type = "SINGLE"
shading.single_color = (0.28, 0.30, 0.34)
shading.show_cavity = True
shading.cavity_type = "BOTH"
scene.display.render_aa = "8"
scene.render.resolution_x = 1400
scene.render.resolution_y = 1400
scene.render.film_transparent = False
world = bpy.data.worlds.new("void")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.012, 0.014, 0.018, 1)

cam_data = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

os.makedirs(RENDER_DIR, exist_ok=True)


def aim(cam_obj, target=(0, 0, 0)):
    from mathutils import Vector
    direction = Vector(target) - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


cam.location = (0, 0.15, 15.5)
aim(cam)
scene.render.filepath = os.path.join(RENDER_DIR, "v6-front.png")
bpy.ops.render.render(write_still=True)

cam.location = (9.5, 3.4, 11.5)
aim(cam)
scene.render.filepath = os.path.join(RENDER_DIR, "v6-三quarter.png".replace("三", "three-"))
bpy.ops.render.render(write_still=True)

# ----------------------------------------------------------------------
#  Export — slabs only
# ----------------------------------------------------------------------
bpy.data.objects.remove(halo, do_unlink=True)
bpy.data.objects.remove(cam, do_unlink=True)

os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format="GLB", export_apply=True)

print("V6_BLOCKOUT_OK", GLB_OUT)
