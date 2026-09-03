"""Repaint an existing frame in a named art style, composition untouched.

Qwen-Image-Edit 2511 with the 4-step Lightning LoRA. It takes the frame as a
reference in the conditioning, so it restyles what is already there instead of
inventing a new picture. That is the whole point here: the layout is Jacob's
and must survive the restyle exactly.

  python tools/comfy-restyle.py --image captures/field/pool-v2.png \
      --prompts docs/prompts/hades-restyle.txt --prefix "THE_FIELD/hades"

Prompts in the file are separated by a line containing only ---. One image per
prompt, seeded from --seed upward. cfg is 1.0 with the Lightning LoRA, so a
negative prompt does nothing; say what you want, not what you do not.

Outputs land under the running server's output directory; /history reports the
real subfolder and filename, so trust the printed paths.
"""
import argparse
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

HOST = "http://127.0.0.1:8191"

UNET = "qwen_image_edit_2511_int8_convrot.safetensors"
LORA = "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors"
CLIP = "qwen_2.5_vl_7b_fp8_scaled.safetensors"
VAE = "qwen_image_vae.safetensors"


def api(path: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(HOST + path, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def upload(path: str) -> str:
    """Put the frame in the server's input folder and return the name it took."""
    name = os.path.basename(path)
    with open(path, "rb") as f:
        blob = f.read()
    boundary = "----dl" + uuid.uuid4().hex
    ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
    parts = [
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{name}\"\r\n"
        f"Content-Type: {ctype}\r\n\r\n".encode(),
        blob,
        f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n"
        f"--{boundary}--\r\n".encode(),
    ]
    body = b"".join(parts)
    req = urllib.request.Request(
        HOST + "/upload/image", data=body, headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        got = json.load(r)
    sub = got.get("subfolder") or ""
    return f"{sub}/{got['name']}" if sub else got["name"]


def graph(image_name: str, prompt: str, seed: int, w: int, h: int, steps: int, prefix: str, denoise: float) -> dict:
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": UNET, "weight_dtype": "default"}},
        "2": {"class_type": "LoraLoaderModelOnly", "inputs": {"model": ["1", 0], "lora_name": LORA, "strength_model": 1.0}},
        "3": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["2", 0], "shift": 3.0}},
        "4": {"class_type": "CLIPLoader", "inputs": {"clip_name": CLIP, "type": "qwen_image"}},
        "5": {"class_type": "VAELoader", "inputs": {"vae_name": VAE}},
        "6": {"class_type": "LoadImage", "inputs": {"image": image_name}},
        "7": {"class_type": "ImageScale", "inputs": {"image": ["6", 0], "upscale_method": "lanczos", "width": w, "height": h, "crop": "disabled"}},
        "8": {"class_type": "TextEncodeQwenImageEditPlus", "inputs": {"clip": ["4", 0], "prompt": prompt, "vae": ["5", 0], "image1": ["7", 0]}},
        "9": {"class_type": "TextEncodeQwenImageEditPlus", "inputs": {"clip": ["4", 0], "prompt": "", "vae": ["5", 0], "image1": ["7", 0]}},
        "10": {"class_type": "VAEEncode", "inputs": {"pixels": ["7", 0], "vae": ["5", 0]}},
        "11": {"class_type": "KSampler", "inputs": {
            "model": ["3", 0], "positive": ["8", 0], "negative": ["9", 0], "latent_image": ["10", 0],
            "seed": seed, "steps": steps, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": denoise}},
        "12": {"class_type": "VAEDecode", "inputs": {"samples": ["11", 0], "vae": ["5", 0]}},
        "13": {"class_type": "SaveImage", "inputs": {"images": ["12", 0], "filename_prefix": prefix}},
    }


def wait_for(prompt_id: str, limit_s: float) -> list[str]:
    t0 = time.time()
    while time.time() - t0 < limit_s:
        entry = api(f"/history/{prompt_id}").get(prompt_id)
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
    ap.add_argument("--image", required=True)
    ap.add_argument("--prompts", required=True, help="file of prompts separated by a --- line")
    ap.add_argument("--prefix", default="restyle")
    ap.add_argument("--seed", type=int, default=20260903)
    ap.add_argument("--width", type=int, default=1328)
    ap.add_argument("--height", type=int, default=752)
    ap.add_argument("--steps", type=int, default=4)
    ap.add_argument("--denoise", type=float, default=1.0)
    ap.add_argument("--timeout", type=float, default=1800)
    a = ap.parse_args()
    sys.stdout.reconfigure(line_buffering=True)

    with open(a.prompts, encoding="utf-8") as f:
        prompts = [p.strip() for p in f.read().split("\n---") if p.strip()]

    try:
        stats = api("/system_stats")
    except (urllib.error.URLError, ConnectionError) as e:
        print(f"ArtLab is not listening on {HOST}: {e}", file=sys.stderr)
        return 2
    dev = stats.get("devices", [{}])[0]
    print(f"ArtLab up: {dev.get('name', '?')}  vram free {dev.get('vram_free', 0) / 1e9:.1f} GB")

    name = upload(a.image)
    print(f"uploaded {a.image} as {name}")
    print(f"{len(prompts)} restyles  {a.width}x{a.height}  steps {a.steps}  denoise {a.denoise}")

    for i, text in enumerate(prompts):
        seed = a.seed + i
        label = f"{a.prefix}-{chr(ord('a') + i)}"
        g = graph(name, text, seed, a.width, a.height, a.steps, label, a.denoise)
        t0 = time.time()
        pid = api("/prompt", {"prompt": g, "client_id": "dark-lattice-restyle"})["prompt_id"]
        files = wait_for(pid, a.timeout)
        print(f"  {label}  {time.time() - t0:5.0f}s  {', '.join(files)}")
        print(f"    {text.splitlines()[0][:100]}")

    print("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
