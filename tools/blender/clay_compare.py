"""
Dark Lattice — render a shipped GLB in the workbench's own clay setup.

Same camera, same Workbench shading, same resolution as
make_workbench.py produces. The only difference between this and a
render of the .blend is what the exporter did, so anything missing here
was lost on the way out — and anything present here but absent on the
website was lost in the runtime instead.

    blender --background --factory-startup \
        --python tools/blender/clay_compare.py -- \
        --src public/models/DL_Aurora_v05.glb --out captures/v05/clay
"""

import argparse
import math
import os
import sys
from pathlib import Path

import bpy


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--root", default=os.getcwd())
    p.add_argument("--src", required=True)
    p.add_argument("--out", required=True)
    return p.parse_args(argv)


ARGS = parse_args()
ROOT = Path(ARGS.root).resolve()


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str((ROOT / ARGS.src).resolve()))
    scene = bpy.context.scene

    target = bpy.data.objects.new("T", None)
    target.location = (0.0, 0.0, -0.72)
    scene.collection.objects.link(target)

    cam_data = bpy.data.cameras.new("C")
    cam_data.sensor_fit = "VERTICAL"
    cam_data.angle_y = math.radians(38.0)
    cam_data.clip_start = 0.05
    cam_data.clip_end = 200.0
    cam = bpy.data.objects.new("C", cam_data)
    cam.location = (0.0, -13.2, 0.0)
    scene.collection.objects.link(cam)
    track = cam.constraints.new("TRACK_TO")
    track.target = target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"
    scene.camera = cam

    scene.render.resolution_x = 1440
    scene.render.resolution_y = 900
    scene.render.engine = "BLENDER_WORKBENCH"
    sh = scene.display.shading
    sh.light = "STUDIO"
    sh.color_type = "SINGLE"
    sh.single_color = (0.045, 0.05, 0.06)
    sh.show_cavity = True
    sh.cavity_type = "BOTH"
    scene.world = bpy.data.worlds.new("V")
    scene.world.use_nodes = False
    scene.world.color = (0.004, 0.008, 0.016)

    out = (ROOT / ARGS.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(out)
    bpy.ops.render.render(write_still=True)
    print(f"[clay] wrote {out}.png")


main()
