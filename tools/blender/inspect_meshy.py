"""
Meshy candidate inventory.

Before anything is cut, decimated or fitted, this answers the questions
that decide HOW to process it:

  - is it one fused solid, or separable plates?
  - is the halo ring in there as its own island?
  - how much of the triangle budget is where?

Run headless:
    blender --background --factory-startup \
        --python tools/blender/inspect_meshy.py -- --src <glb>
"""

import argparse
import json
import os
import sys

import bpy


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--src", required=True)
    p.add_argument("--decimate", type=float, default=0.10)
    return p.parse_args(argv)


ARGS = parse_args()


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def main():
    clear()
    bpy.ops.import_scene.gltf(filepath=ARGS.src)

    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    print(f"[inventory] imported objects: {len(meshes)}")

    total_before = sum(len(o.data.polygons) for o in meshes)
    print(f"[inventory] faces before decimate: {total_before}")

    # Decimate FIRST. Splitting 1.5M triangles by loose parts is very
    # slow, and the island structure is identical either way.
    for obj in meshes:
        bpy.context.view_layer.objects.active = obj
        mod = obj.modifiers.new("dec", "DECIMATE")
        mod.ratio = ARGS.decimate
        bpy.ops.object.modifier_apply(modifier=mod.name)

    total_after = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
    print(f"[inventory] faces after decimate: {total_after}")

    # Separate into islands.
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [o for o in bpy.data.objects if o.type == "MESH"]:
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")

    parts = [o for o in bpy.data.objects if o.type == "MESH"]
    print(f"[inventory] loose parts: {len(parts)}")

    rows = []
    for obj in parts:
        bb = [obj.matrix_world @ v.co for v in obj.data.vertices]
        if not bb:
            continue
        xs = [v.x for v in bb]
        ys = [v.y for v in bb]
        zs = [v.z for v in bb]
        dims = (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
        biggest = max(dims) or 1.0
        rows.append({
            "name": obj.name,
            "faces": len(obj.data.polygons),
            "dims": [round(d, 3) for d in dims],
            # A ring is wide in two axes and near-zero in the third.
            "flatness": round(min(dims) / biggest, 3),
            "centre": [round((max(a) + min(a)) / 2, 3) for a in (xs, ys, zs)],
        })

    rows.sort(key=lambda r: -r["faces"])
    print("[inventory] parts by size:")
    for r in rows[:25]:
        print("   ", json.dumps(r))
    if len(rows) > 25:
        tail = sum(r["faces"] for r in rows[25:])
        print(f"    … {len(rows) - 25} more parts, {tail} faces total")


main()
