/**
 * sheet.mjs — build a self-contained contact sheet from a list of images.
 *
 * Images are inlined as data URIs so the file opens by double-clicking, with no
 * server and no relative-path resolution. Replaces the ad-hoc inline versions.
 *
 *   node tools/sheet.mjs --out captures/x/sheet.html --title "..." \
 *     --img "path.png|LABEL|caption" --img "..."
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const argAll = (name) => {
  const out = [];
  process.argv.forEach((a, i) => { if (a === `--${name}`) out.push(process.argv[i + 1]); });
  return out;
};
const arg = (name, d = null) => argAll(name)[0] ?? d;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const CSS = `html{background:#050506}
body{margin:0;padding:40px 0 80px;font:13px/1.5 ui-sans-serif,system-ui,sans-serif;color:#E9EEF2}
header{max-width:1280px;margin:0 auto 40px;padding:0 16px}
h1{font-size:15px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;margin:0 0 6px}
header p{margin:0;color:#6f7b85;max-width:66ch}
figure{max-width:1280px;margin:0 auto 56px;padding:0 16px}
img{display:block;width:100%;height:auto;background:#000}
figcaption{margin-top:12px;display:flex;gap:18px;align-items:baseline}
.k{font-weight:600;letter-spacing:.1em;white-space:nowrap}
.n{color:#8b96a0}
.bad{color:#FF493D}`;

const out = arg('out', 'captures/sheet.html');
const title = arg('title', 'contact sheet');
const note = arg('note', '');

let html = `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style>`;
html += `<header><h1>${esc(title)}</h1>${note ? `<p>${esc(note)}</p>` : ''}</header>`;

for (const spec of argAll('img')) {
  const [file, label = '', caption = ''] = spec.split('|');
  const b64 = (await readFile(path.resolve(file))).toString('base64');
  const cap = esc(caption).replace(/FAULT:/g, '<span class="bad">FAULT:</span>');
  html += `<figure><img src="data:image/png;base64,${b64}">`
    + `<figcaption><span class="k">${esc(label)}</span><span class="n">${cap}</span></figcaption></figure>`;
}

await mkdir(path.dirname(path.resolve(out)), { recursive: true });
await writeFile(path.resolve(out), html);
console.log(`${out}  ${(html.length / 1048576).toFixed(1)} MB`);
