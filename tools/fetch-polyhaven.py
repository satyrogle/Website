"""Pull CC0 photoscanned rock from Poly Haven.

A day of writing generators produced masses that read as shrubs, then loose
blocks, then leaves. These are photographs of actual stone turned into
geometry, which is a shorter route to rock than any procedure I wrote.

What it costs: the plain's masses stop being seeded runs of one rule, so "same
rule, different outcome" is no longer literally true of the assets. That was a
nice property and it is not the product. The determinism claim lives in the
simulation, not in how the rocks were made.

Licence: Poly Haven publishes everything CC0. Source files land in assets/ and
are not shipped; the web meshes get decimated and re-exported separately.

  python tools/fetch-polyhaven.py [id ...]
"""
import io
import json
import os
import sys
import urllib.request

DEFAULT = [
    "rock_face_01",
    "rock_face_02",
    "namaqualand_cliff_01",
    "namaqualand_cliff_02",
    "mountainside",
]
RES = os.environ.get("PH_RES", "1k")
ROOT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "polyhaven"
)


# Their CDN returns 403 to the default Python-urllib agent.
UA = {"User-Agent": "dark-lattice-asset-fetch/1.0 (+contact via polyhaven CC0)"}


def get(url: str, dest: str) -> None:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        while True:
            chunk = r.read(1 << 16)
            if not chunk:
                break
            f.write(chunk)


def fetch(asset_id: str) -> int:
    req = urllib.request.Request(
        f"https://api.polyhaven.com/files/{asset_id}", headers=UA
    )
    with urllib.request.urlopen(req, timeout=40) as r:
        data = json.load(io.TextIOWrapper(r, encoding="utf-8"))

    node = data["gltf"][RES]["gltf"]
    out = os.path.join(ROOT, asset_id)
    os.makedirs(out, exist_ok=True)

    jobs = [(node["url"], os.path.join(out, os.path.basename(node["url"])))]
    for rel, v in node.get("include", {}).items():
        jobs.append((v["url"], os.path.join(out, *rel.replace("\\", "/").split("/"))))

    total = 0
    for url, dest in jobs:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        if not os.path.exists(dest):
            get(url, dest)
        total += os.path.getsize(dest)
    print(f"{asset_id:24s} {len(jobs):3d} files  {total / 1e6:6.1f} MB")
    return total


if __name__ == "__main__":
    ids = sys.argv[1:] or DEFAULT
    grand = sum(fetch(i) for i in ids)
    print(f"total {grand / 1e6:.1f} MB at {RES} into {ROOT}")
