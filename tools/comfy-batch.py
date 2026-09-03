"""Run a prompt through the local ArtLab ComfyUI (Krea 2 turbo) as a seeded batch.

The graph in tools/comfy/krea2-t2i.json was recovered from a PNG that this
machine already rendered, so every model name and sampler setting in it is
known to work on the 3060. This script only swaps the prompt, the seed, the
size and the output prefix, and waits for the files.

Krea 2 turbo runs at cfg 1.0, so the negative prompt does nothing; only the
positive text counts, and it should be natural language, 30 to 200 words.

  python tools/comfy-batch.py --prompt-file docs/prompts/f1-room.txt \
      --prefix "THE_FIELD/f1-room" --count 6 --seed 20260901

Outputs land under whatever --output-directory the running server was started
with. The instance found up on 2026-09-01 writes to
C:/Users/jacob/ComfyUI-Shared/output/DarkLatticeSky/<prefix>_*.png, not ArtLab.
/history reports subfolder and filename, so trust that over this docstring.
Start the server first if it is not up:
  powershell -File "C:/Users/jacob/ComfyUI-Installs/ComfyUI/Start-ArtLab.ps1"

Nothing here reads an image. Jacob looks at the batch; the picked frame is the
only one that ever gets opened by Claude.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

HOST = "http://127.0.0.1:8191"
HERE = os.path.dirname(os.path.abspath(__file__))
GRAPH = os.path.join(HERE, "comfy", "krea2-t2i.json")

# node ids inside krea2-t2i.json
POSITIVE, NEGATIVE, LATENT, SAMPLER, SAVE = "4", "5", "6", "7", "9"


def api(path: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(HOST + path, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def wait_for(prompt_id: str, limit_s: float) -> list[str]:
    t0 = time.time()
    while time.time() - t0 < limit_s:
        hist = api(f"/history/{prompt_id}")
        entry = hist.get(prompt_id)
        if entry:
            status = entry.get("status", {})
            if status.get("status_str") == "error":
                msgs = status.get("messages", [])
                raise RuntimeError(f"ComfyUI reported an error: {msgs[-1] if msgs else status}")
            files = []
            for node_out in entry.get("outputs", {}).values():
                for im in node_out.get("images", []):
                    sub = im.get("subfolder", "")
                    files.append(os.path.join(sub, im["filename"]) if sub else im["filename"])
            if files:
                return files
        time.sleep(4)
    raise TimeoutError(f"no output after {limit_s:.0f}s for {prompt_id}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt", help="positive prompt text")
    ap.add_argument("--prompt-file", help="file holding the positive prompt")
    ap.add_argument("--prefix", default="DL_batch", help="SaveImage prefix; a slash makes a subfolder")
    ap.add_argument("--count", type=int, default=4)
    ap.add_argument("--seed", type=int, default=20260901, help="first seed; each image adds 1")
    ap.add_argument("--width", type=int, default=1536)
    ap.add_argument("--height", type=int, default=864)
    ap.add_argument("--steps", type=int, default=8)
    ap.add_argument("--timeout", type=float, default=900, help="seconds to wait per image")
    a = ap.parse_args()
    sys.stdout.reconfigure(line_buffering=True)  # progress must reach a tee/log as it happens

    if a.prompt_file:
        with open(a.prompt_file, encoding="utf-8") as f:
            text = f.read().strip()
    elif a.prompt:
        text = a.prompt
    else:
        ap.error("give --prompt or --prompt-file")
    if a.width % 16 or a.height % 16:
        ap.error("width and height must be multiples of 16")

    try:
        stats = api("/system_stats")
    except (urllib.error.URLError, ConnectionError) as e:
        print(f"ArtLab is not listening on {HOST}: {e}", file=sys.stderr)
        print('start it: powershell -File "C:/Users/jacob/ComfyUI-Installs/ComfyUI/Start-ArtLab.ps1"', file=sys.stderr)
        return 2
    dev = stats.get("devices", [{}])[0]
    print(f"ArtLab up: {dev.get('name', '?')}  vram free {dev.get('vram_free', 0) / 1e9:.1f} GB")

    with open(GRAPH, encoding="utf-8") as f:
        base = json.load(f)

    print(f"{a.count} images  {a.width}x{a.height}  steps {a.steps}  seeds {a.seed}..{a.seed + a.count - 1}")
    print(f"prompt ({len(text.split())} words): {text[:120]}...")

    for i in range(a.count):
        g = json.loads(json.dumps(base))
        seed = a.seed + i
        g[POSITIVE]["inputs"]["text"] = text
        g[NEGATIVE]["inputs"]["text"] = ""
        g[LATENT]["inputs"].update({"width": a.width, "height": a.height, "batch_size": 1})
        g[SAMPLER]["inputs"].update({"seed": seed, "steps": a.steps})
        g[SAVE]["inputs"]["filename_prefix"] = f"{a.prefix}-s{seed}"

        t0 = time.time()
        pid = api("/prompt", {"prompt": g, "client_id": "dark-lattice-batch"})["prompt_id"]
        files = wait_for(pid, a.timeout)
        print(f"  seed {seed}  {time.time() - t0:5.0f}s  {', '.join(files)}")

    print("done. files are relative to the running server's output directory (see /history)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
