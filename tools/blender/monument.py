# Authored monument geometry: the escape from cubes.
# Run headless:
#   "C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" \
#     --background --python tools/blender/monument.py
# Exports public/models/monument.glb: one continuous hewn monolith with
# strata displacement and the two journey wounds, ready for the
# engraving shader and an erosion pass in-engine. This replaces the
# instanced-cube cladding as the monument's body.
import bpy
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "models", "monument.glb")

# clean scene
bpy.ops.wm.read_factory_settings(use_empty=True)

# the stele: 42 x 195 x 42 world units to match the world's constants
bpy.ops.mesh.primitive_cube_add(size=1)
mono = bpy.context.active_object
mono.name = "Monument"
mono.scale = (21.0, 97.5, 21.0)
mono.location = (0.0, 97.5, 0.0)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# density for displacement
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.subdivide(number_cuts=64)
bpy.ops.object.mode_set(mode="OBJECT")

# strata: horizontal banding, stretched noise
strata = bpy.data.textures.new("Strata", type="CLOUDS")
strata.noise_scale = 6.5
d1 = mono.modifiers.new("Strata", "DISPLACE")
d1.texture = strata
d1.strength = 0.9
d1.direction = "X"

wear = bpy.data.textures.new("Wear", type="CLOUDS")
wear.noise_scale = 22.0
d2 = mono.modifiers.new("Wear", "DISPLACE")
d2.texture = wear
d2.strength = 0.45

# the two journey wounds, carved as boolean bites
for name, loc, r in (("WoundA", (5.0, 140.0, 20.0), 6.5), ("WoundB", (-5.0, 65.0, 20.0), 6.0)):
    bpy.ops.mesh.primitive_ico_sphere_add(radius=r, subdivisions=3, location=loc)
    w = bpy.context.active_object
    w.name = name
    b = mono.modifiers.new(name, "BOOLEAN")
    b.operation = "DIFFERENCE"
    b.object = w

bpy.context.view_layer.objects.active = mono
for m in list(mono.modifiers):
    bpy.ops.object.modifier_apply(modifier=m.name)
for o in list(bpy.data.objects):
    if o.name.startswith("Wound"):
        bpy.data.objects.remove(o, do_unlink=True)

bpy.ops.object.shade_smooth()

os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format="GLB", use_selection=False)
print("EXPORTED", os.path.abspath(OUT))
