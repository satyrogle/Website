"""
Dark Lattice — read the workbench without touching it.

Dumps every object's collection, transform, bounds and lock state as
JSON so a saved arrangement can be diffed against what it was built
from. Read-only: it opens the file, prints, and exits.

    blender --background --factory-startup \
        --python tools/blender/inspect_workbench.py -- \
        --blend assets/blender/DL_Entity_Workbench.blend
"""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--blend", required=True)
    return p.parse_args(argv)


ARGS = parse_args()


def main():
    bpy.ops.wm.open_mainfile(filepath=str(Path(ARGS.blend).resolve()))

    out = {"objects": {}, "collections": {}}

    for col in bpy.data.collections:
        out["collections"][col.name] = sorted(o.name for o in col.objects)

    for obj in bpy.data.objects:
        lo = Vector((1e9, 1e9, 1e9))
        hi = Vector((-1e9, -1e9, -1e9))
        if obj.type == "MESH":
            for corner in obj.bound_box:
                w = obj.matrix_world @ Vector(corner)
                for i in range(3):
                    lo[i] = min(lo[i], w[i])
                    hi[i] = max(hi[i], w[i])
        entry = {
            "type": obj.type,
            "loc": [round(v, 4) for v in obj.location],
            "rot": [round(math.degrees(v), 3) for v in obj.rotation_euler],
            "scale": [round(v, 5) for v in obj.scale],
            "hide_select": bool(obj.hide_select),
            "hide_viewport": bool(obj.hide_viewport),
            "collections": sorted(c.name for c in obj.users_collection),
        }
        if obj.type == "MESH":
            entry["faces"] = len(obj.data.polygons)
            entry["bounds"] = [round(v, 3) for v in (hi - lo)]
            entry["centre"] = [round(v, 3) for v in ((lo + hi) / 2.0)]
        out["objects"][obj.name] = entry

    cam = bpy.context.scene.camera
    if cam:
        out["camera"] = {
            "name": cam.name,
            "loc": [round(v, 4) for v in cam.location],
            "sensor_fit": cam.data.sensor_fit,
            "angle_y_deg": round(math.degrees(cam.data.angle_y), 3),
        }

    print("###JSON###")
    print(json.dumps(out))


main()
