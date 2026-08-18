/**
 * comfy.mjs — bridge to the local ComfyUI ArtLab instance.
 *
 * Art-direction tooling only. This produces candidate IMAGES for Jacob to judge.
 * It does not touch `src/`, it is not a renderer, and nothing it makes is a
 * production asset. `docs/APPROVED_VISUAL_JOURNEY.md` still gates everything.
 *
 * The server is Jacob's own ArtLab install, documented at
 * `C:\Users\jacob\ComfyUI-Installs\ComfyUI\ARTLAB_TOOLKIT.md`, bound to
 * localhost only. We talk to it over its HTTP API rather than adding an MCP
 * server or a dependency: same reasoning as `tools/*.mjs` everywhere else in
 * this repo.
 *
 * Outputs are written into the dark-lattice repo, never into the ArtLab game
 * output directory, so website art direction and game assets stay separate.
 *
 *   node tools/comfy.mjs --ping
 *   node tools/comfy.mjs --free
 *   node tools/comfy.mjs --run workflow.json --out captures/frames/h1-opening
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

export const HOST = process.env.COMFY_HOST || 'http://127.0.0.1:8191';

const CLIENT_ID = 'dark-lattice-art-direction';

const argValue = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const argFlag = (name) => process.argv.includes(`--${name}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Server reachable, and what the card has left. */
export async function stats() {
  const res = await fetch(`${HOST}/system_stats`);
  if (!res.ok) throw new Error(`system_stats ${res.status}`);
  const d = await res.json();
  const dev = (d.devices || [])[0] || {};
  return {
    version: d.system?.comfyui_version,
    device: dev.name,
    vramFreeGB: (dev.vram_free || 0) / 1e9,
    vramTotalGB: (dev.vram_total || 0) / 1e9,
    ramFreeGB: (d.system?.ram_free || 0) / 1e9,
  };
}

/** Unload models and release VRAM. Safe: models reload on next prompt. */
export async function free() {
  const res = await fetch(`${HOST}/free`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unload_models: true, free_memory: true }),
  });
  return res.ok;
}

/** Submit an API-format workflow graph. Returns prompt_id. */
export async function submit(graph) {
  const res = await fetch(`${HOST}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: graph, client_id: CLIENT_ID }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // ComfyUI reports graph validation failures here, and they are the single
    // most common cause of a "silent" no-image run. Surface them loudly.
    const detail = JSON.stringify(body?.node_errors || body?.error || body, null, 2);
    throw new Error(`/prompt ${res.status}\n${detail}`);
  }
  if (!body.prompt_id) throw new Error(`no prompt_id in response: ${JSON.stringify(body)}`);
  return body.prompt_id;
}

/**
 * Wait for a prompt to finish. Polls /history rather than opening a websocket:
 * one fewer moving part, and a render measured in minutes does not need
 * sub-second progress.
 */
export async function waitFor(promptId, { timeoutMs = 900_000, pollMs = 2500, onTick } = {}) {
  const started = Date.now();
  let ticks = 0;
  for (;;) {
    const res = await fetch(`${HOST}/history/${promptId}`);
    if (res.ok) {
      const hist = await res.json();
      const entry = hist[promptId];
      if (entry) {
        const status = entry.status?.status_str;
        if (status === 'error') {
          const msgs = (entry.status?.messages || [])
            .filter(([k]) => k === 'execution_error')
            .map(([, v]) => `${v.node_type}: ${v.exception_message}`)
            .join('\n');
          throw new Error(`execution failed\n${msgs || JSON.stringify(entry.status)}`);
        }
        if (entry.status?.completed) return entry;
      }
    }
    if (Date.now() - started > timeoutMs) throw new Error(`timed out after ${timeoutMs}ms`);
    if (onTick && ++ticks % 8 === 0) onTick(Math.round((Date.now() - started) / 1000));
    await sleep(pollMs);
  }
}

/** Pull every image a finished prompt produced into `outDir`. */
export async function collect(entry, outDir, { prefix = '' } = {}) {
  await mkdir(outDir, { recursive: true });
  const saved = [];
  for (const nodeOut of Object.values(entry.outputs || {})) {
    for (const img of nodeOut.images || []) {
      const qs = new URLSearchParams({
        filename: img.filename,
        subfolder: img.subfolder || '',
        type: img.type || 'output',
      });
      const res = await fetch(`${HOST}/view?${qs}`);
      if (!res.ok) throw new Error(`/view ${res.status} for ${img.filename}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const name = prefix ? `${prefix}${path.extname(img.filename)}` : img.filename;
      const dest = path.join(outDir, name);
      await writeFile(dest, buf);
      saved.push({ dest, bytes: buf.length });
    }
  }
  return saved;
}

/** submit -> wait -> collect, with progress on stdout. */
export async function run(graph, outDir, opts = {}) {
  const id = await submit(graph);
  process.stdout.write(`  queued ${id}\n`);
  const entry = await waitFor(id, {
    ...opts,
    onTick: (s) => process.stdout.write(`  ...${s}s\n`),
  });
  const saved = await collect(entry, outDir, opts);
  for (const s of saved) process.stdout.write(`  wrote ${s.dest} (${(s.bytes / 1024).toFixed(0)} KB)\n`);
  return saved;
}

if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/') ||
    process.argv[1]?.endsWith('comfy.mjs')) {
  if (argFlag('ping')) {
    const s = await stats();
    console.log(`ComfyUI ${s.version} on ${HOST}`);
    console.log(`  ${s.device}`);
    console.log(`  VRAM ${s.vramFreeGB.toFixed(1)} / ${s.vramTotalGB.toFixed(1)} GB free`);
    console.log(`  RAM  ${s.ramFreeGB.toFixed(1)} GB free`);
  } else if (argFlag('free')) {
    console.log(await free() ? 'freed' : 'free failed');
    const s = await stats();
    console.log(`  VRAM ${s.vramFreeGB.toFixed(1)} / ${s.vramTotalGB.toFixed(1)} GB free`);
  } else if (argValue('run')) {
    const graph = JSON.parse(await readFile(argValue('run'), 'utf8'));
    const out = argValue('out', 'captures/comfy');
    await run(graph, path.resolve(out));
  } else {
    console.log('usage: node tools/comfy.mjs [--ping | --free | --run <graph.json> --out <dir>]');
  }
}
