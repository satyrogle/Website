# Start the ArtLab ComfyUI without pinned host memory.
#
# The stock Start-ArtLab.ps1 uses ComfyUI defaults, which stage the whole model
# (Krea 2 turbo int8, 13.5 GB, plus a 5 GB text encoder) in PINNED RAM. On a
# 32 GB box that locks most of physical memory, the rest of the system pages
# to disk, sampling drops from ~3.5 s/it to ~17 s/it and the HTTP side stops
# answering. Seen 2026-09-02: commit 45 GB, 2.7 GB free, one image in 20 min.
#
#   powershell -NoProfile -File tools/artlab-start.ps1 > captures/artlab-start.log 2>&1
#
# --cache-none is NOT used: it makes every job re-run UNETLoader, the new model
# initialises against VRAM still held by the old one, and job 2 hangs forever.
# --fast-disk streams weights from the NVMe instead of unpinned RAM; --cpu-vae
# because the VAE decode after a frame otherwise fights the resident model for
# the last of the VRAM and spins at 100% forever (2026-09-02, three hours lost).
# Pass extra flags from bash via -Command, never -File: -File joins arrays with
# commas into one token and argparse rejects it.
# Never pipe this script into another command: the server it spawns inherits
# the pipe and the pipeline never returns.
param([string[]]$Extra = @())
$ErrorActionPreference = "Stop"
$root = "C:/Users/jacob/ComfyUI-Installs/ComfyUI"
$py = "$root/artlab-env/Scripts/python.exe"
$port = 8191
if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    "already listening on $port"
    exit 0
}
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outLog = "$root/logs/artlab-$stamp.out.log"
$errLog = "$root/logs/artlab-$stamp.err.log"
$argv2 = @(
    "main.py", "--listen", "127.0.0.1", "--port", "$port",
    "--user-directory", "$root/user-artlab",
    "--output-directory", "C:/Users/jacob/ComfyUI-Shared/output/ArtLab",
    "--database-url", "sqlite:///C:/Users/jacob/ComfyUI-Installs/ComfyUI/user-artlab/comfyui.db",
    "--preview-method", "auto",
    "--disable-pinned-memory", "--fast-disk", "--reserve-vram=2", "--cpu-vae"
) + $Extra
Start-Process -FilePath $py -ArgumentList $argv2 -WorkingDirectory "$root/ComfyUI-ArtLab" `
    -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog | Out-Null
$deadline = (Get-Date).AddSeconds(150)
do {
    Start-Sleep -Seconds 3
    $up = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
} while (-not $up -and (Get-Date) -lt $deadline)
if ($up) { "ready on $port  flags: $($argv2[-2..-1] -join ' ') $Extra  log: $errLog"; exit 0 }
"not ready after 150s, see $errLog"
exit 1
