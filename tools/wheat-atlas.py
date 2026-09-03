"""Pack generated wheat ears into a texture atlas.

Cutting heads out of the approved frame did not work: real heads in a real
field overlap, and the few that stood alone were slivers. So the ears are
generated one at a time on pure black (docs/prompts/wheat-ear.txt), where
they separate cleanly: alpha comes straight from luminance.

Each ear is trimmed to its own bounding box, scaled to fit a 256x512 cell,
and placed with its BASE on the cell's bottom edge, so the shader can hang
the cell from the top of a stem and know where the ear begins. Twelve cells
in a 4x3 grid: 1024x1536.

  artlab-env/Scripts/python.exe tools/wheat-atlas.py \
      "C:/Users/jacob/ComfyUI-Shared/output/ArtLab/THE_FIELD" wheat-ear public/field/wheat-heads.png

Deterministic for a given set of input files.
"""
import glob
import os
import sys

import numpy as np
from PIL import Image

src_dir, prefix, out = sys.argv[1], sys.argv[2], sys.argv[3]
files = sorted(glob.glob(os.path.join(src_dir, prefix + "*.png")))[:12]
print(len(files), "ears")

CW, CH = 256, 512
COLS, ROWS = 4, 3
atlas = np.zeros((ROWS * CH, COLS * CW, 4), dtype=np.float32)
kept = 0
for f in files:
    rgb = np.asarray(Image.open(f).convert("RGB")).astype(np.float32) / 255.0
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    # alpha from luminance against black; soft so awns keep their hair width
    alpha = np.clip((lum - 0.035) / 0.16, 0, 1) ** 0.9
    ys, xs = np.where(alpha > 0.08)
    if ys.size < 500:
        print("  skip (empty):", os.path.basename(f))
        continue
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    # the ear must be a tall thing; a wide blob is a failed generation
    if (y1 - y0) < (x1 - x0) * 1.8:
        print("  skip (not an ear):", os.path.basename(f))
        continue
    crop = rgb[y0:y1, x0:x1]
    a = alpha[y0:y1, x0:x1]
    # unpremultiply from black so the texture colour is the ear's own colour
    col = np.clip(crop / np.maximum(a[..., None], 0.25), 0, 1)
    h, w = a.shape
    scale = min((CH - 8) / h, (CW - 8) / w)
    nh, nw = max(2, int(h * scale)), max(2, int(w * scale))
    tile = np.asarray(Image.fromarray((col * 255).astype(np.uint8)).resize((nw, nh), Image.LANCZOS)).astype(np.float32) / 255
    ta = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize((nw, nh), Image.LANCZOS)).astype(np.float32) / 255
    cy, cx = (kept // COLS) * CH, (kept % COLS) * CW
    oy = cy + CH - 4 - nh           # base on the bottom edge
    ox = cx + (CW - nw) // 2
    atlas[oy : oy + nh, ox : ox + nw, :3] = tile
    atlas[oy : oy + nh, ox : ox + nw, 3] = ta
    kept += 1
    if kept == COLS * ROWS:
        break

print(kept, "cells filled")
os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
Image.fromarray((atlas * 255).astype(np.uint8), "RGBA").save(out)
bg = np.full_like(atlas[..., :3], 0.35)
comp = atlas[..., :3] * atlas[..., 3:4] + bg * (1 - atlas[..., 3:4])
Image.fromarray((comp * 255).astype(np.uint8)).resize((512, 768)).save(os.path.splitext(out)[0] + "-preview.jpg", quality=85)
print("wrote", out, "cells", kept)
