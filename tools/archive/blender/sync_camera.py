"""
Dark Lattice — sync the workbench camera to the site's hero camera.

Camera only. No geometry, no collections, no transforms are touched.

The workbench was built against DESKTOP_PATH[0] as it stood at the time.
The hero standoff was later pulled from 13.2 to 11.8 and an 18% lens
shift was added, and this file was not updated — so the entity was being
art-directed through a lens 1.4 units further back and centred, while
the website showed something closer and off-centre. A plate parked near
the camera is exactly where that divergence hurts most: at 4.47 units it
read as a modest crest, at 3.07 it fills the top of the frame.
"""

import argparse, math, os, sys
from pathlib import Path
import bpy

argv = sys.argv
argv = argv[argv.index("--") + 1:] if "--" in argv else []
p = argparse.ArgumentParser()
p.add_argument("--root", default=os.getcwd())
p.add_argument("--blend", default="assets/blender/DL_Entity_Workbench.blend")
# DESKTOP_PATH[0]: glTF position [0,0,11.8] -> Blender y -11.8.
p.add_argument("--standoff", type=float, default=11.8)
# HERO_LENS_SHIFT, as a fraction of frame width. Blender measures shift
# in units of the LARGER render dimension, which at 1440x900 is width,
# so the number carries across directly. Negative moves the subject
# right, matching a negative setViewOffset X in three.js.
p.add_argument("--shift", type=float, default=0.18)
a = p.parse_args(argv)

blend = Path(a.root).resolve() / a.blend
bpy.ops.wm.open_mainfile(filepath=str(blend))
cam = bpy.data.objects.get("DL_HeroCam")
if cam is None:
    raise SystemExit("No DL_HeroCam")
before = tuple(round(v, 2) for v in cam.location)
cam.location = (0.0, -a.standoff, 0.0)
cam.data.sensor_fit = "VERTICAL"
cam.data.angle_y = math.radians(38.0)
cam.data.shift_x = -a.shift
bpy.context.scene.render.resolution_x = 1440
bpy.context.scene.render.resolution_y = 900
print(f"[camera] {before} -> {tuple(round(v,2) for v in cam.location)}, "
      f"shift_x {cam.data.shift_x:+.3f}")
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
print(f"[camera] saved {blend}")
