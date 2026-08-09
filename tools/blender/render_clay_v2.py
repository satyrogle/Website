"""
Gate A clay renders.

    blender --background assets/blender/DL_Monolith_Workbench_v2.blend \
            --python tools/blender/render_clay_v2.py

Clay only: no material, no fissures, no emission, no post. The gate is
about silhouette, mass hierarchy and depth, so anything that could carry
the form on colour or light is deliberately absent.

Also writes the object-ID masks the measurement pass uses, so mass areas
and overlaps are read from object identity rather than from brightness.
"""

import bpy
import math
import os
import sys

from mathutils import Vector

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import monolith_v2_form as form  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT = os.path.join(ROOT, "design", "clay")

CLAY = (0.52, 0.52, 0.53, 1.0)
TIER_COLOUR = {
    form.TIER_FRONT: (0.97, 0.97, 0.97, 1.0),
    form.TIER_MID: (0.52, 0.52, 0.52, 1.0),
    form.TIER_REAR: (0.07, 0.07, 0.07, 1.0),
}


def masses():
    return [bpy.data.objects[m["name"]] for m in form.MASSES]


def spine():
    return bpy.data.objects[form.SPINE["name"]]


def halo():
    return bpy.data.objects[form.HALO["name"]]


def subject():
    return masses() + [spine()]


def set_visible(objects):
    wanted = set(o.name for o in objects)
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            obj.hide_render = obj.name not in wanted


def bounds(objects):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            for i in range(3):
                lo[i] = min(lo[i], world[i])
                hi[i] = max(hi[i], world[i])
    return lo, hi


def render_camera():
    if "DL_RenderCamera" in bpy.data.objects:
        return bpy.data.objects["DL_RenderCamera"]
    data = bpy.data.cameras.new("DL_RenderCamera")
    data.sensor_fit = "VERTICAL"
    obj = bpy.data.objects.new("DL_RenderCamera", data)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def look_at(camera, position, target):
    camera.location = Vector(position)
    direction = Vector(target) - Vector(position)
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def frame(camera, objects, azimuth, elevation, fov, res_x, res_y, margin=1.12):
    """Places the camera on an authored azimuth/elevation and fits the subject."""
    lo, hi = bounds(objects)
    centre = (lo + hi) * 0.5

    az = math.radians(azimuth)
    el = math.radians(elevation)
    # Runtime frame direction, then into Blender's axes.
    direction = Vector(
        form.to_blender((math.cos(el) * math.cos(az), math.sin(el), math.cos(el) * math.sin(az)))
    ).normalized()

    up = Vector((0.0, 0.0, 1.0))
    right = direction.cross(up).normalized()
    true_up = right.cross(direction).normalized()

    half_w = 0.0
    half_h = 0.0
    half_d = 0.0
    for obj in objects:
        for corner in obj.bound_box:
            p = (obj.matrix_world @ Vector(corner)) - centre
            half_w = max(half_w, abs(p.dot(right)))
            half_h = max(half_h, abs(p.dot(true_up)))
            half_d = max(half_d, abs(p.dot(direction)))

    fov_y = math.radians(fov)
    aspect = res_x / res_y
    fov_x = 2.0 * math.atan(math.tan(fov_y * 0.5) * aspect)
    distance = max(half_h / math.tan(fov_y * 0.5), half_w / math.tan(fov_x * 0.5))
    distance = distance * margin + half_d

    camera.data.angle_y = fov_y
    camera.data.shift_x = 0.0
    look_at(camera, centre + direction * distance, centre)
    return camera


def hero_frame(camera):
    hero = form.HERO_CAMERA
    camera.data.angle_y = math.radians(hero["fov"])
    camera.data.shift_x = -hero["shift"]
    look_at(camera, form.to_blender(hero["position"]), form.to_blender(hero["target"]))
    return camera


def set_background(colour):
    """
    Workbench takes its render background from the world, and a file
    opened with no world renders on black whatever the viewport shading
    says. Every pass sets it explicitly.
    """
    scene = bpy.context.scene
    if scene.world is None:
        scene.world = bpy.data.worlds.new("DL_World")
    scene.world.use_nodes = False
    scene.world.color = colour
    scene.display.shading.background_type = "WORLD"
    scene.render.film_transparent = False


def shading():
    return bpy.context.scene.display.shading


def clay_mode():
    s = shading()
    s.light = "STUDIO"
    s.studio_light = "Default"
    s.color_type = "SINGLE"
    s.single_color = CLAY[:3]
    s.show_cavity = True
    s.cavity_type = "BOTH"
    s.curvature_ridge_factor = 1.4
    s.curvature_valley_factor = 1.4
    s.show_shadows = True
    s.shadow_intensity = 0.42
    s.show_object_outline = False
    bpy.context.scene.view_settings.view_transform = "Standard"
    set_background((0.012, 0.012, 0.014))


def flat_mode(background):
    s = shading()
    s.light = "FLAT"
    s.color_type = "OBJECT"
    s.show_cavity = False
    s.show_shadows = False
    s.show_object_outline = False
    bpy.context.scene.view_settings.view_transform = "Raw"
    set_background(background)


def set_colours(mapping, default=(0.0, 0.0, 0.0, 1.0)):
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            obj.color = mapping.get(obj.name, default)


def render(name, res_x, res_y):
    scene = bpy.context.scene
    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)
    print("wrote %s.png" % name)


def main():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.view_settings.look = "None"
    scene.display.render_aa = "16"
    os.makedirs(OUT, exist_ok=True)

    camera = render_camera()
    scene.camera = camera
    subj = subject()
    set_visible(subj)

    # ---- Clay elevations -------------------------------------------
    clay_mode()
    frame(camera, subj, 90.0, 0.0, 32.0, 1440, 900, margin=1.06)
    render("A01-front-1440x900", 1440, 900)

    frame(camera, subj, 132.0, 6.0, 32.0, 1440, 900)
    render("A02-three-quarter-left", 1440, 900)

    frame(camera, subj, 48.0, 6.0, 32.0, 1440, 900)
    render("A03-three-quarter-right", 1440, 900)

    frame(camera, subj, 0.0, 0.0, 32.0, 1440, 900)
    render("A04-side", 1440, 900)

    # ---- Silhouettes -----------------------------------------------
    flat_mode((1.0, 1.0, 1.0))
    set_colours({}, default=(0.0, 0.0, 0.0, 1.0))
    frame(camera, subj, 90.0, 0.0, 32.0, 512, 512, margin=1.06)
    render("A05-silhouette-512", 512, 512)
    render("A06-silhouette-128", 128, 128)

    frame(camera, subj, 90.0, 0.0, 32.0, 390, 844, margin=1.06)
    render("A10-mobile-silhouette-390x844", 390, 844)

    # ---- Gaps only --------------------------------------------------
    # Masses flat white on black: everything that is not structure reads
    # as black, so the only visible lines inside the silhouette are the
    # air gaps between masses.
    flat_mode((0.0, 0.0, 0.0))
    set_colours({o.name: (1.0, 1.0, 1.0, 1.0) for o in masses()}, default=(0.0, 0.0, 0.0, 1.0))
    set_visible(masses())
    frame(camera, masses(), 90.0, 0.0, 32.0, 1440, 900)
    render("A07-gaps-only", 1440, 900)

    # ---- Depth tiers -------------------------------------------------
    flat_mode((0.62, 0.62, 0.64))
    set_visible(subj)
    set_colours(
        {o.name: TIER_COLOUR[o["dl_depth_tier"]] for o in masses()},
        default=(0.30, 0.02, 0.30, 1.0),
    )
    frame(camera, subj, 90.0, 0.0, 32.0, 1440, 900)
    render("A08-depth-tiers", 1440, 900)

    # ---- Object-ID masks ---------------------------------------------
    # Black ground: the measurement pass reads identity out of the pixel
    # values, so anything non-zero in the background is a false mass.
    flat_mode((0.0, 0.0, 0.0))
    ids = {}
    for index, obj in enumerate(masses()):
        value = (index + 1) * 25 / 255.0
        ids[obj.name] = (value, 0.0, 0.0, 1.0)
    ids[spine().name] = (0.0, 200 / 255.0, 0.0, 1.0)
    set_colours(ids, default=(0.0, 0.0, 0.0, 1.0))

    frame(camera, subj, 90.0, 0.0, 32.0, 1440, 900)
    render("A00-mask-elevation", 1440, 900)

    hero_frame(camera)
    render("A00-mask-hero", 1440, 900)

    # Halo guide footprint at the hero framing, for the composition
    # overlay and the diameter check.
    set_visible([halo()])
    set_colours({halo().name: (1.0, 1.0, 1.0, 1.0)}, default=(0.0, 0.0, 0.0, 1.0))
    halo().hide_render = False
    hero_frame(camera)
    render("A00-halo-hero", 1440, 900)

    # ---- Hero clay ---------------------------------------------------
    set_visible(subj)
    clay_mode()
    hero_frame(camera)
    render("A09-hero-type-safe-zone", 1440, 900)


main()
