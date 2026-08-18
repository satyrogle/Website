"""
h1-blockout.py — ONE crude camera proof for H1, THE LOAD.

Authorised by Jacob 2026-08-18 as a blockout only. No materials beyond one flat
near-black, no detailed modelling, no geometry nodes, no GLB export, no website
integration. Primitive masses, a camera, depth, and one lighting rule.

    LIGHT = LOAD

Nothing emits because it looks good. A contact patch exists only where two
masses genuinely overlap, and its AREA and BRIGHTNESS are both scaled by how
much mass is bearing through it:

    small load   -> almost dark
    medium load  -> thin pale compressed interface
    extreme load -> broad, extremely bright compression territory

Run headless so an open Blender session is never touched:

    blender -b -P tools/blender/h1-blockout.py
"""

import bpy
import math
from mathutils import Vector

W, H = 1440, 900
OUT = bpy.path.abspath("//") or ""
OUT_PATH = r"C:\Users\jacob\dark-lattice\captures\hybrids\greybox\h1a-blender"

# ---------------------------------------------------------------- scene reset
# Background mode starts from the factory file, so this only clears the default
# cube/camera/light and never an artist's work.
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "GPU"
scene.cycles.samples = 128
scene.cycles.use_denoising = True
scene.cycles.volume_bounces = 2
scene.cycles.transparent_max_bounces = 8
scene.render.resolution_x = W
scene.render.resolution_y = H
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = OUT_PATH
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"

prefs = bpy.context.preferences.addons["cycles"].preferences
try:
    prefs.compute_device_type = "CUDA"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = (d.type == "CUDA")
except Exception as exc:  # falls back to CPU rather than failing the proof
    print("GPU setup skipped:", exc)


# ---------------------------------------------------------------- materials
def flat_dark():
    m = bpy.data.materials.new("mass")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.115, 0.115, 0.125, 1)
    b.inputs["Roughness"].default_value = 0.88
    if "Specular IOR Level" in b.inputs:
        b.inputs["Specular IOR Level"].default_value = 0.18
    return m


def emitter(strength):
    m = bpy.data.materials.new("contact_%0.1f" % strength)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (1.0, 0.98, 0.95, 1)
    e.inputs["Strength"].default_value = strength
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(e.outputs["Emission"], o.inputs["Surface"])
    return m


MASS_MAT = flat_dark()


def mass(name, loc, scale, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=2, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    o.rotation_euler = tuple(math.radians(r) for r in rot)
    o.data.materials.append(MASS_MAT)
    return o


def contact(name, loc, scale, rot, strength):
    """A compression interface. Area and brightness both carry the load."""
    bpy.ops.mesh.primitive_cube_add(size=2, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    o.rotation_euler = tuple(math.radians(r) for r in rot)
    o.data.materials.append(emitter(strength))
    return o


# ---------------------------------------------------------------- the world
# Nothing is axis aligned and nothing closes. Every mass is cropped by a frame
# edge or dissolved by distance, so there is no silhouette, roof, floor or edge
# of the world anywhere in shot.

# Camera sits at (0, -260, 40) on a 38mm lens: half-FOV 25.3 deg horizontal,
# 16.5 vertical. Visible half-width at depth d is 0.473d. Every placement below
# is computed against that so the sight lines are real, not hoped for.

# NEAR — colossal, hangs into frame from the top right, cropped on two edges.
# Centre is deliberately off-frame: we only ever see part of it.
mass("A_near", (70, -140, 55), (40, 40, 40), rot=(5, -4, 13))

# Takes A's weight. Rises from the bottom edge, cropped by bottom and right.
mass("B_bearing", (55, -60, -40), (60, 50, 55), rot=(-3, 6, -8))

# EXTREME LOAD -> broad, extremely bright compression territory.
# A's underside at z=15 meets B's top at z=15, over y -110..-100. Three
# overlapping patches at different angles so it reads as a crushed area
# rather than a panel someone placed.
contact("K_AB_0", (70, -105, 15.0), (34, 9.0, 1.2), (4, -3, 12), 60.0)
contact("K_AB_1", (44, -108, 14.2), (17, 7.0, 0.9), (6, 2, 20), 38.0)
contact("K_AB_2", (96, -101, 15.6), (13, 6.0, 0.8), (2, -5, 5), 26.0)

# MIDDLE DISTANCE — far enough back to read as another region of the same
# world, not another object in the same room.
mass("C_far", (-70, 250, 20), (60, 50, 70), rot=(4, 6, -9))
mass("D_far_upper", (-62, 238, 105), (34, 30, 18), rot=(-5, 3, 15))
# MEDIUM LOAD -> thin pale compressed interface.
contact("K_CD", (-65, 243, 89.0), (13, 9, 0.5), (2, 4, 11), 6.5)

# FURTHEST — barely present through the haze. Gives the void depth without
# ever giving it a floor.
mass("E_deep", (60, 900, -60), (120, 90, 140), rot=(2, -3, 6))
mass("F_deep_upper", (52, 872, 96), (36, 30, 16), rot=(-4, 2, -12))
# SMALL LOAD -> almost dark.
contact("K_EF", (55, 878, 80.5), (16, 11, 0.45), (1, -2, 9), 1.3)

# ---------------------------------------------------------------- atmosphere
# Haze exists to state distance, never to rescue the composition. It is thin
# enough that every mass still reads as a solid at its own depth.
world = bpy.data.worlds.new("void")
scene.world = world
world.use_nodes = True
nt = world.node_tree
nt.nodes.clear()
bg = nt.nodes.new("ShaderNodeBackground")
bg.inputs["Color"].default_value = (0.10, 0.13, 0.20, 1)
bg.inputs["Strength"].default_value = 0.045
vs = nt.nodes.new("ShaderNodeVolumeScatter")
vs.inputs["Color"].default_value = (0.82, 0.86, 0.95, 1)
vs.inputs["Density"].default_value = 0.0019
vs.inputs["Anisotropy"].default_value = 0.32
out = nt.nodes.new("ShaderNodeOutputWorld")
nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
nt.links.new(vs.outputs["Volume"], out.inputs["Volume"])

# ---------------------------------------------------------------- camera
# Slightly below the near mass and looking up: the weight is overhead.
cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 38
cam_data.clip_end = 5000
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
cam.location = Vector((0, -260, 40))
cam.rotation_euler = (math.radians(93.5), 0, math.radians(-2))
scene.camera = cam

print("rendering H1 blockout %dx%d -> %s" % (W, H, OUT_PATH))
bpy.ops.render.render(write_still=True)
print("done")
