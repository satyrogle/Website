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
    p.add_argument("--weld", type=float, default=0.0)
    p.add_argument("--render", default="")
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

    # Optional weld BEFORE anything else.
    #
    # glTF splits vertices per face to carry flat normals, so an imported
    # mesh usually shares no topology at all. Decimating that first — as
    # this script used to do unconditionally, on the claim that "the
    # island structure is identical either way" — is simply false: on an
    # unwelded mesh it shattered a 94k-face model into 13,786 loose parts,
    # 13,761 of them a single triangle. Weld first if you want the real
    # island structure.
    if ARGS.weld > 0.0:
        for obj in meshes:
            bpy.ops.object.select_all(action="DESELECT")
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.mesh.remove_doubles(threshold=ARGS.weld)
            bpy.ops.object.mode_set(mode="OBJECT")
        print(f"[inventory] welded at {ARGS.weld}: "
              f"{sum(len(o.data.polygons) for o in meshes)} faces")

    if ARGS.decimate < 0.999:
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

    if ARGS.render:
        import math
        from pathlib import Path
        from mathutils import Vector

        out = Path(ARGS.render)
        out.mkdir(parents=True, exist_ok=True)
        allv = [obj.matrix_world @ v.co
                for obj in parts for v in obj.data.vertices]
        lo = Vector((min(v.x for v in allv), min(v.y for v in allv),
                     min(v.z for v in allv)))
        hi = Vector((max(v.x for v in allv), max(v.y for v in allv),
                     max(v.z for v in allv)))
        size = hi - lo
        mid = (lo + hi) * 0.5

        scene = bpy.context.scene
        scene.render.resolution_x = 1000
        scene.render.resolution_y = 1000
        cd = bpy.data.cameras.new("cam")
        cd.lens_unit = "FOV"
        cd.angle = math.radians(36.0)
        cam = bpy.data.objects.new("cam", cd)
        scene.collection.objects.link(cam)
        scene.camera = cam
        scene.world = bpy.data.worlds.new("w")
        scene.world.use_nodes = True
        scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0, 0, 0, 1)
        dist = max(size) * 2.1

        for name, loc in [
            ("front.png", (mid.x, mid.y - dist, mid.z)),
            ("threequarter.png", (mid.x + dist * 0.6, mid.y - dist * 0.75, mid.z + size.z * 0.3)),
            ("top.png", (mid.x, mid.y - 0.01, mid.z + dist)),
        ]:
            cam.location = loc
            cam.rotation_euler = (mid - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
            scene.render.engine = "BLENDER_WORKBENCH"
            sh = scene.display.shading
            sh.light = "STUDIO"
            sh.color_type = "SINGLE"
            sh.single_color = (0.10, 0.11, 0.13)
            sh.show_cavity = True
            sh.cavity_type = "BOTH"
            scene.render.filepath = str(out / name)
            bpy.ops.render.render(write_still=True)
            print(f"[inventory] rendered {name}")

    rows.sort(key=lambda r: -r["faces"])
    print("[inventory] parts by size:")
    for r in rows[:25]:
        print("   ", json.dumps(r))
    if len(rows) > 25:
        tail = sum(r["faces"] for r in rows[25:])
        print(f"    … {len(rows) - 25} more parts, {tail} faces total")


main()
