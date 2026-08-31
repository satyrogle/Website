"""F6 THE RETURN — composited from the locked F1.

One change only: the tall nearly intact mass on the left is now split along the
crack that is already in that picture, with a thin cooling line inside it.
Deterministic: fixed seed, no clocks. Re-running gives the identical file.
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "docs", "frames", "f1-the-plain.png")
OUT_DIR = os.path.join(ROOT, "docs", "frames")

# The existing crack down the left mass, traced off the locked F1 at full res.
PATH = [(167, 198), (178, 272), (189, 348), (199, 424),
        (209, 498), (219, 562), (227, 608)]

SEED = 20260831


def lcg(seed):
    s = seed
    while True:
        s = (1103515245 * s + 12345) % (2 ** 31)
        yield s / (2 ** 31)


def build_noise(n=26):
    g = lcg(SEED)
    return [next(g) for _ in range(n)]


NOISE = build_noise()


def smooth_noise(t):
    f = t * (len(NOISE) - 1)
    i = int(f)
    fr = f - i
    a = NOISE[i]
    b = NOISE[min(i + 1, len(NOISE) - 1)]
    return a + (b - a) * (fr * fr * (3 - 2 * fr))


def point_at(t):
    """Position along the polyline, t in 0..1."""
    seg = t * (len(PATH) - 1)
    i = min(int(seg), len(PATH) - 2)
    fr = seg - i
    x0, y0 = PATH[i]
    x1, y1 = PATH[i + 1]
    return x0 + (x1 - x0) * fr, y0 + (y1 - y0) * fr


def envelope(t):
    """Uneven, broken, brightest just above the middle. Never uniform."""
    fade_in = min(1.0, t / 0.10)
    fade_out = min(1.0, (1.0 - t) / 0.22)
    hump = 0.45 + 0.55 * math.sin(math.pi * min(1.0, max(0.0, (t - 0.04) / 0.88)))
    broken = 0.28 + 0.72 * smooth_noise(t)
    return fade_in * fade_out * hump * broken


def render(peak_rgb, glow_gain, name):
    base = Image.open(SRC).convert("RGB")
    W, H = base.size

    core = Image.new("L", (W, H), 0)
    glow = Image.new("L", (W, H), 0)
    dark = Image.new("L", (W, H), 0)
    dc, dg, dd = ImageDraw.Draw(core), ImageDraw.Draw(glow), ImageDraw.Draw(dark)

    steps = 900
    prev = point_at(0.0)
    for s in range(1, steps + 1):
        t = s / steps
        cur = point_at(t)
        e = envelope(t)
        v = int(max(0, min(255, e * 255)))
        dc.line([prev, cur], fill=v, width=1)
        dg.line([prev, cur], fill=int(v * 0.85), width=3)
        # the crack itself has opened, so it reads a touch deeper than in F1
        dd.line([prev, cur], fill=int(140 * min(1.0, e * 1.6 + 0.35)), width=2)
        prev = cur

    glow = glow.filter(ImageFilter.GaussianBlur(5.5))
    halo = glow.filter(ImageFilter.GaussianBlur(14))
    dark = dark.filter(ImageFilter.GaussianBlur(1.2))

    # deepen the opening first, so the light sits inside a real gap
    shade = ImageChops.invert(dark.point(lambda p: int(p * 0.42)))
    base = ImageChops.multiply(base, Image.merge("RGB", (shade, shade, shade)))

    def tint(mask, rgb, gain):
        r, g, b = rgb
        return Image.merge("RGB", (
            mask.point(lambda p: int(min(255, p * r / 255 * gain))),
            mask.point(lambda p: int(min(255, p * g / 255 * gain))),
            mask.point(lambda p: int(min(255, p * b / 255 * gain))),
        ))

    base = ImageChops.add(base, tint(halo, peak_rgb, glow_gain * 0.16))
    base = ImageChops.add(base, tint(glow, peak_rgb, glow_gain * 0.42))
    base = ImageChops.add(base, tint(core, peak_rgb, 1.0))

    out = os.path.join(OUT_DIR, name)
    base.save(out)

    # report the hottest pixel so the no-white rule can be checked
    px = base.load()
    hottest = (0, 0, 0)
    for y in range(120, 700, 2):
        for x in range(120, 300, 2):
            r, g, b = px[x, y]
            if r - b > 25 and r + g + b > sum(hottest):
                hottest = (r, g, b)
    print(f"{name:34s} hottest warm pixel rgb{hottest}")


# Jacob picked the dimmest of three on 2026-08-31: "go with A."
# The two he did not pick, kept as the record of the choice:
#   render((186, 104, 46), 1.30, ...)   mid
#   render((205, 118, 54), 1.65, ...)   warmer
render((168, 92, 40), 1.00, "f6-the-return.png")
print("done")
