"""THE FIELD - compose the frame ourselves, as a depth map.

Four batches of prompt writing produced four different failures: postcard
sunbeams, a flat wall of plants, an identical plume repeated ten thousand
times, and a flowerbed at night. Each fix broke something that was working,
because the composition was coming out of a lottery.

So the composition stops being the model's job. This script places every
structural decision by hand:

    - the black faceted stone at the left and right edges
    - a real perspective recession, from plants at arm's length to specks
    - clumps with genuine empty voids between them
    - plant heights that vary from ankle to well above the camera
    - where the light pools, as a separate mask

and writes them out as a depth map. ControlNet depth then holds the layout
while SDXL supplies only material and light. Anything approved this way is
reachable by construction, because the geometry is ours.

Depth convention: white is near, black is far, which is what the union
ControlNet expects.

  artlab-env/Scripts/python.exe tools/field-layout.py --seed 7 --out captures/field/layout

Writes <out>-depth.png (the control image) and <out>-preview.png (a human
readable version, never fed to anything).
"""
import argparse
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 1280, 720
FOCAL = 900.0          # px
CAM_H = 1.6            # m, eye height
NEAR, FAR = 3.2, 260.0  # m
VANISH = H * 0.46      # px, where the ground plane converges


def project(x, y, z):
    """World metres to screen pixels. Camera at origin looking down +z."""
    return W * 0.5 + FOCAL * x / z, VANISH + FOCAL * (CAM_H - y) / z


def depth_value(z):
    """Near white, far black, with most of the range spent up close where
    the eye actually reads depth."""
    t = (math.log(z) - math.log(NEAR)) / (math.log(FAR) - math.log(NEAR))
    return max(0.0, 1.0 - t) ** 0.85


class Field:
    """One seeded field. Same seed, same field, which is the whole thesis."""

    def __init__(self, seed):
        self.rng = random.Random(seed)
        self.clumps = self._clumps()
        self.plants = self._plants()

    def _clumps(self):
        """Clusters of growth with voids between them. Density falls with
        distance so the far field reads as scattered specks, not a carpet."""
        r = self.rng
        out = []
        z = NEAR + 1.5
        while z < FAR:
            # the frame's half width at distance z, in metres: everything must
            # be placed against this or near clumps overflow and far ones
            # huddle in the middle. That single error made the first layout
            # a wall of blobs.
            half = z * (W * 0.5) / FOCAL
            for _ in range(2 if z < 12 else r.randint(4, 9)):
                out.append({
                    "x": r.uniform(-half * 1.25, half * 1.25),
                    "z": z * r.uniform(0.88, 1.12),
                    "r": half * r.uniform(0.06, 0.20),
                    "n": r.randint(5, 14) if z < 14 else r.randint(30, 90),
                })
            z *= r.uniform(1.07, 1.19)      # gaps grow: voids by construction
        return out

    def _plants(self):
        """Every plant differs: height, thickness, lean, and whether it still
        has a head. Uniformity is what made the last batch read as an array."""
        r = self.rng
        out = []
        for c in self.clumps:
            for _ in range(c["n"]):
                a = r.uniform(0, math.tau)
                rad = c["r"] * math.sqrt(r.random())
                z = c["z"] + math.sin(a) * rad
                if z < NEAR:
                    continue
                # bimodal height: a majority mid, a minority towering
                h = r.uniform(1.2, 2.6) if r.random() < 0.78 else r.uniform(2.8, 5.4)
                out.append({
                    "x": c["x"] + math.cos(a) * rad,
                    "z": z,
                    "h": h * r.uniform(0.25, 1.0) if r.random() < 0.18 else h,
                    "lean": r.uniform(-0.30, 0.30),
                    "thick": r.uniform(0.010, 0.030),
                    "head": r.random() < 0.72,
                    "bent": r.random() < 0.16,
                })
        out.sort(key=lambda p: -p["z"])     # painter's algorithm, far first
        return out

    def light_pools(self):
        """Two or three wide areas, everything else dark. The pools are placed
        in world space so they sit ON the field rather than over the picture."""
        r = self.rng
        return [{"x": r.uniform(-14, 14), "z": r.uniform(6, 90),
                 "r": r.uniform(7, 20)} for _ in range(r.randint(2, 3))]


def draw_plant(d, p, shade):
    """A stalk and, usually, a head. Deliberately not one silhouette: the
    eye must not be able to name the repeated element."""
    bx, by = project(p["x"], 0.0, p["z"])
    lean = p["lean"] * (2.0 if p["bent"] else 1.0)
    tx, ty = project(p["x"] + lean, p["h"], p["z"])
    if by < -50 or ty > H + 50 or bx < -200 or bx > W + 200:
        return
    wpx = max(1.0, FOCAL * p["thick"] / p["z"])
    if p["bent"]:
        mx, my = project(p["x"] + lean * 0.35, p["h"] * 0.80, p["z"])
        d.line([(bx, by), (mx, my), (tx, ty)], fill=shade, width=int(wpx))
    else:
        d.line([(bx, by), (tx, ty)], fill=shade, width=int(wpx))
    if p["head"]:
        hl = FOCAL * (p["h"] * 0.16) / p["z"]
        hw = max(1.0, FOCAL * (p["thick"] * 3.2) / p["z"])
        d.polygon([(tx, ty - hl), (tx + hw, ty + hl * 0.55),
                   (tx, ty + hl * 0.30), (tx - hw, ty + hl * 0.55)], fill=shade)


def basalt(d, rng, shade):
    """Sheer faceted stone holding the outer edges. Straight segments only:
    this is the entrance's material, not rock texture."""
    for side in (-1, 1):
        edge = 0 if side < 0 else W
        inner = W * (0.10 + rng.uniform(-0.02, 0.04))
        x = edge + side * -0  # anchor at the frame edge
        pts = [(x, -20)]
        y = -20
        while y < H + 20:
            y += rng.uniform(200, 420)
            off = inner * rng.uniform(0.5, 1.2)
            pts.append((edge + (off if side < 0 else -off), min(y, H + 20)))
        pts += [(x, H + 20)]
        d.polygon(pts, fill=shade)


def render(seed, out):
    f = Field(seed)
    rng = random.Random(seed * 31 + 7)

    depth = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(depth)

    # ground plane: a gradient so the field has a floor to stand on
    for y in range(int(VANISH), H):
        z = FOCAL * CAM_H / max(y - VANISH, 0.5)
        d.line([(0, y), (W, y)], fill=int(255 * depth_value(min(z, FAR)) * 0.10))

    for p in f.plants:
        d.point((0, 0))  # keeps the draw object hot; no-op
        draw_plant(d, p, int(255 * depth_value(p["z"])))

    # the far band sits at infinity: pure black, no horizon drawn
    basalt(d, rng, 252)

    depth = depth.filter(ImageFilter.GaussianBlur(0.6))
    depth.save(out + "-depth.png")

    # preview: depth tinted gold with the light pools shown, for human eyes
    a = np.asarray(depth).astype(np.float32) / 255.0
    pool = np.zeros((H, W), np.float32)
    ys, xs = np.mgrid[0:H, 0:W]
    for lp in f.light_pools():
        px, py = project(lp["x"], 0.6, lp["z"])
        pr = max(40.0, FOCAL * lp["r"] / lp["z"])
        pool += np.exp(-(((xs - px) ** 2 + (ys - py) ** 2) / (2 * pr * pr)))
    pool = np.clip(pool, 0, 1)
    # plants carry the light; the floor stays dark even inside a pool
    lit = np.clip(a * (0.22 + 2.6 * pool), 0, 1.35)
    haze = 0.05 * pool + 0.02
    r_ = np.clip(lit * 255 + haze * 90, 0, 255)
    g_ = np.clip(lit * 214 + haze * 66, 0, 255)
    b_ = np.clip(lit * 132 + haze * 40, 0, 255)
    rgb = Image.fromarray(np.stack([r_, g_, b_], -1).astype(np.uint8))
    rgb.filter(ImageFilter.GaussianBlur(16)).save(out + "-base.png")
    rgb.save(out + "-preview.png")

    print(f"seed {seed}  {len(f.plants)} plants in {len(f.clumps)} clumps  "
          f"-> {out}-depth.png")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", default="captures/field/layout")
    a = ap.parse_args()
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    render(a.seed, a.out)
