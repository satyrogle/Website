"""Read the layout of an approved frame as numbers.

The layout is Jacob's and it lives in the picture. This pulls out the few
numbers the build has to hit so they come from the image, not from my eye:

  - where the field's top edge sits, as a fraction of frame height
  - the V of darkness: its apex, and its half width at each height
  - the column of light above the field: centre, width, how it fades
  - the colour of the lit wheat and of its brightest heads

  artlab-env/Scripts/python.exe tools/measure-frame.py docs/frames/f1-the-room-candidate.jpg
"""
import sys

import numpy as np
from PIL import Image

path = sys.argv[1]
im = Image.open(path).convert("RGB")
rgb = np.asarray(im).astype(np.float32) / 255.0
H, W, _ = rgb.shape
lum = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
print(f"{path}  {W}x{H}")

# ---- the field's top edge: rows where the outer thirds turn bright
outer = np.concatenate([lum[:, : W // 3], lum[:, -W // 3 :]], axis=1)
row_mean = outer.mean(axis=1)
field_rows = np.where(row_mean > 0.12)[0]
top = int(field_rows.min()) if field_rows.size else -1
print(f"field top edge at row {top} = {top / H:.3f} of height (from top)")
# how soft is that edge: rows from 20% to 80% of the field's plateau level
plateau = np.median(row_mean[top + 40 : top + 200]) if top >= 0 else 0
r20 = int(np.argmax(row_mean > plateau * 0.2))
r80 = int(np.argmax(row_mean > plateau * 0.8))
print(f"edge softness: {r80 - r20} rows = {(r80 - r20) / H:.3f} of height  (plateau {plateau:.2f})")

# ---- the V: for each field row, the dark run around the centre
print("the V of darkness (half width as fraction of frame width):")
apex = None
for frac in (0.98, 0.9, 0.8, 0.7, 0.6, 0.5):
    r = int(top + (H - top) * frac) if top >= 0 else int(H * frac)
    r = min(r, H - 1)
    row = lum[r]
    c = W // 2
    thr = 0.06
    l = c
    while l > 0 and row[l] < thr:
        l -= 1
    rr = c
    while rr < W - 1 and row[rr] < thr:
        rr += 1
    half = (rr - l) / 2 / W
    print(f"  row {r} ({r / H:.2f} of height): half width {half:.3f}")
    if half < 0.01 and apex is None:
        apex = r
# find the apex: lowest row where the centre is still dark
centre_dark = np.where(lum[:, W // 2 - 4 : W // 2 + 4].mean(axis=1) < 0.06)[0]
if centre_dark.size:
    print(f"centre column dark down to row {centre_dark.max()} = {centre_dark.max() / H:.3f} of height")

# ---- the column of light above the field
sky = lum[: max(top, 1)]
col_mean = sky.mean(axis=0)
peak = int(np.argmax(col_mean))
above = np.where(col_mean > col_mean.max() * 0.5)[0]
print(f"light column: centre {peak / W:.3f} of width, half-max width {(above.max() - above.min()) / W:.3f} of width")
for frac in (0.02, 0.15, 0.3, 0.45):
    r = int(H * frac)
    print(f"  at {frac:.2f} of height: peak lum {lum[r].max():.2f}, mean {lum[r].mean():.3f}")

# ---- colour
field = rgb[top + 40 :, :][lum[top + 40 :, :] > 0.15]
bright = rgb[lum > np.percentile(lum, 99)]
print("lit wheat mean rgb :", np.round(field.mean(axis=0), 3), " lum", round(float(lum[top + 40 :][lum[top + 40 :] > 0.15].mean()), 3))
print("brightest 1% rgb   :", np.round(bright.mean(axis=0), 3))
print("frame: black share (<0.03)", f"{100 * (lum < 0.03).mean():.0f}%", " above 0.5:", f"{100 * (lum > 0.5).mean():.1f}%")
