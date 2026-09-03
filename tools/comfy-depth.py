"""Generate THE FIELD conditioned on our own depth map.

Krea 2 turbo runs at cfg 1.0, which means every negative prompt written for it
so far did precisely nothing. This path uses SDXL at cfg 5 with the union
ControlNet in depth mode, so composition comes from tools/field-layout.py and
the model supplies only material and light.

The graph is tools/comfy/sdxl-controlnet.json, recovered from an image this
machine rendered in August, so the node wiring is known good. This script
swaps the control image, the prompts, the seed and the strength.

  artlab-env/Scripts/python.exe tools/comfy-depth.py \
      --control layout-s7-depth.png --prompt-file docs/prompts/f1-material.txt \
      --prefix "THE_FIELD/f1-cn" --count 3

--control names a file already copied into the ArtLab input folder.
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
GRAPH = os.path.join(HERE, "comfy", "sdxl-controlnet.json")
INPUT_DIR = "C:/Users/jacob/ComfyUI-Installs/ComfyUI/ComfyUI-ArtLab/input"

POSITIVE, NEGATIVE, SAMPLER, CONTROL_IMG, APPLY, SAVE = "2", "3", "5", "10", "13", "7"


def api(path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(HOST + path, data=data,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def wait_for(prompt_id, limit_s):
    t0 = time.time()
    while time.time() - t0 < limit_s:
        entry = api(f"/history/{prompt_id}").get(prompt_id)
        if entry:
            st = entry.get("status", {})
            if st.get("status_str") == "error":
                msgs = st.get("messages", [])
                raise RuntimeError(f"ComfyUI error: {msgs[-1] if msgs else st}")
            files = [os.path.join(im.get("subfolder", ""), im["filename"])
                     for o in entry.get("outputs", {}).values()
                     for im in o.get("images", [])]
            if files:
                return files
        time.sleep(4)
    raise TimeoutError(f"no output after {limit_s:.0f}s for {prompt_id}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--control", required=True, help="filename inside the ArtLab input dir")
    ap.add_argument("--prompt-file", required=True)
    ap.add_argument("--negative-file", default="docs/prompts/f1-negative.txt")
    ap.add_argument("--prefix", default="THE_FIELD/f1-cn")
    ap.add_argument("--count", type=int, default=3)
    ap.add_argument("--seed", type=int, default=20260951)
    ap.add_argument("--steps", type=int, default=30)
    ap.add_argument("--cfg", type=float, default=5.0)
    ap.add_argument("--strength", type=float, default=0.85, help="controlnet strength")
    ap.add_argument("--end-percent", type=float, default=0.75)
    ap.add_argument("--base", help="image base in the input dir; enables img2img")
    ap.add_argument("--denoise", type=float, default=0.78)
    ap.add_argument("--timeout", type=float, default=900)
    a = ap.parse_args()
    sys.stdout.reconfigure(line_buffering=True)

    if not os.path.exists(os.path.join(INPUT_DIR, a.control)):
        print(f"control image not in {INPUT_DIR}: {a.control}", file=sys.stderr)
        return 2
    text = open(a.prompt_file, encoding="utf-8").read().strip()
    neg = open(a.negative_file, encoding="utf-8").read().strip() if os.path.exists(a.negative_file) else ""

    try:
        api("/system_stats")
    except (urllib.error.URLError, ConnectionError) as e:
        print(f"ArtLab not listening: {e}", file=sys.stderr)
        return 2

    base = json.load(open(GRAPH, encoding="utf-8"))
    # the recovered graph is img2img off a scale base; we want txt2img under
    # depth control, so the sampler gets a fresh latent at full denoise
    if a.base:
        # our own light design is the starting point; the model repaints it
        base["20"]["inputs"]["image"] = a.base
        base["21"]["inputs"].update({"width": 1280, "height": 720})
        latent, denoise = ["22", 0], a.denoise
    else:
        base["30"] = {"class_type": "EmptyLatentImage",
                      "inputs": {"width": 1280, "height": 720, "batch_size": 1}}
        for dead in ("20", "21", "22"):
            base.pop(dead, None)
        latent, denoise = ["30", 0], 1.0

    print(f"{a.count} images  control {a.control}  cfg {a.cfg}  steps {a.steps}  "
          f"cn {a.strength} to {a.end_percent}")

    for i in range(a.count):
        g = json.loads(json.dumps(base))
        seed = a.seed + i
        g[POSITIVE]["inputs"]["text"] = text
        g[NEGATIVE]["inputs"]["text"] = neg
        g[CONTROL_IMG]["inputs"]["image"] = a.control
        g[APPLY]["inputs"].update({"strength": a.strength, "start_percent": 0.0,
                                   "end_percent": a.end_percent})
        g[SAMPLER]["inputs"].update({"seed": seed, "steps": a.steps, "cfg": a.cfg,
                                     "denoise": denoise, "latent_image": latent})
        g[SAVE]["inputs"]["filename_prefix"] = f"{a.prefix}-s{seed}"

        t0 = time.time()
        pid = api("/prompt", {"prompt": g, "client_id": "dark-lattice-depth"})["prompt_id"]
        files = wait_for(pid, a.timeout)
        print(f"  seed {seed}  {time.time() - t0:5.0f}s  {', '.join(files)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
