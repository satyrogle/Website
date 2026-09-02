/**
 * THE DELTA KERNEL LAB.
 *
 * Draws what src/core/Delta.ts produced and what src/core/causality.ts
 * read out of it. It computes nothing of its own: every number on the
 * screen comes from the shipped kernel, so a wrong number here is a
 * wrong number there.
 *
 * The point of it. THE_DELTA.md says beauty is the shape the engine
 * produced, and that Z cannot be authored. Both are only checkable if
 * the engine's output is legible, and until now it was not: verify says
 * PASS, the delta act says nothing numeric, so every change to `advance`
 * has been judged by rebuilding the world and squinting at it.
 */

import {
  SECTIONS,
  TICKS,
  HINGE,
  BLADE,
  DETENTS,
  computeFamilies,
  checksum
} from '../../src/core/Delta';
import type { Detent, Families, Sequence } from '../../src/core/Delta';
import { readCausality, VISIBLE_FRACTION } from '../../src/core/causality';
import type { Causality } from '../../src/core/causality';

/** delta-verify.mjs prints this for the site's seed. The page re-derives it. */
const SITE_SEED = 20260818;
const SITE_BASELINE_CHECKSUM = 957537948;

const GROUND: RGB = [7, 9, 12];
const SLATE: RGB = [91, 127, 166];
const GOLD: RGB = [201, 162, 39];
const HOT: RGB = [255, 228, 163];
const RUST = '#c2603f';
const DIM = '#7d8894';
const RULE = '#1a222c';
const TEXT = '#c6cfd9';

type RGB = [number, number, number];

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

// ---------------------------------------------------------------- state

let seed = SITE_SEED;
let detent: Detent = 1;
let tick = TICKS - 1;
let fam: Families = computeFamilies(seed);
let caus: Causality = read();
let hover: { section: number; tick: number } | null = null;

function read(): Causality {
  const alt = fam.altered.get(detent)!;
  return readCausality(fam.baseline, alt, fam.delta.get(detent)!);
}

// ---------------------------------------------------------------- colour

function mix(a: RGB, b: RGB, t: number): RGB {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k)
  ];
}

/** ground -> hue -> hot. One ramp, two hues, so the eye compares them. */
function ramp(v: number, hue: RGB): RGB {
  return v < 0.5 ? mix(GROUND, hue, v * 2) : mix(hue, HOT, (v - 0.5) * 2);
}

const css = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`;

// ---------------------------------------------------------------- canvas

interface Surface {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
}

/** Size the backing store to the device, keep one logical coordinate space. */
function surface(id: string, w: number, h: number): Surface {
  const cv = $<HTMLCanvasElement>(id);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  cv.style.aspectRatio = `${w} / ${h}`;
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

const GUTTER = 34;
const AXIS = 20;

/**
 * A section x tick field, drawn at data resolution and scaled up with
 * smoothing off, so one cell is one datum and nothing is interpolated
 * into existence.
 */
function stratum(
  s: Surface,
  x: number,
  y: number,
  w: number,
  h: number,
  value: (section: number, t: number) => RGB
): void {
  const off = document.createElement('canvas');
  off.width = TICKS;
  off.height = SECTIONS;
  const octx = off.getContext('2d')!;
  const img = octx.createImageData(TICKS, SECTIONS);
  for (let i = 0; i < SECTIONS; i++) {
    for (let t = 0; t < TICKS; t++) {
      const c = value(i, t);
      const p = (i * TICKS + t) * 4;
      img.data[p] = c[0];
      img.data[p + 1] = c[1];
      img.data[p + 2] = c[2];
      img.data[p + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  s.ctx.imageSmoothingEnabled = false;
  s.ctx.drawImage(off, x, y, w, h);
  s.ctx.strokeStyle = RULE;
  s.ctx.lineWidth = 1;
  s.ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function label(s: Surface, text: string, x: number, y: number, colour = DIM, align: CanvasTextAlign = 'left'): void {
  s.ctx.fillStyle = colour;
  s.ctx.font = '10px ui-monospace, Menlo, Consolas, monospace';
  s.ctx.textAlign = align;
  s.ctx.textBaseline = 'middle';
  s.ctx.fillText(text, x, y);
}

/** The hinge and the current tick, marked on every field that has a time axis. */
function timeMarks(s: Surface, x: number, y: number, w: number, h: number): void {
  const hx = x + (HINGE / TICKS) * w;
  s.ctx.strokeStyle = 'rgba(125,136,148,0.5)';
  s.ctx.setLineDash([2, 3]);
  s.ctx.lineWidth = 1;
  s.ctx.beginPath();
  s.ctx.moveTo(hx, y);
  s.ctx.lineTo(hx, y + h);
  s.ctx.stroke();
  s.ctx.setLineDash([]);
  label(s, 'hinge', hx + 4, y + 8);

  const px = x + ((tick + 0.5) / TICKS) * w;
  s.ctx.strokeStyle = css(HOT);
  s.ctx.beginPath();
  s.ctx.moveTo(px, y);
  s.ctx.lineTo(px, y + h);
  s.ctx.stroke();
}

function tickAxis(s: Surface, x: number, y: number, w: number): void {
  // stop short of TICKS: the last number and the axis name are both
  // flush right and printed on top of each other.
  for (let t = 0; t < TICKS; t += 40) {
    const tx = x + (t / TICKS) * w;
    label(s, String(t), tx, y + 9, DIM, t === 0 ? 'left' : 'center');
  }
  label(s, `tick ${TICKS}`, x + w, y + 9, DIM, 'right');
}

function sectionAxis(s: Surface, y: number, h: number): void {
  // the blade's row is marked by colouring its number, not by adding a
  // word next to it: at 48 rows in 132px the word landed on top of the
  // next label and both became unreadable.
  for (let i = 0; i < SECTIONS; i += 6) {
    if (i === BLADE) continue;
    label(s, String(i), GUTTER - 6, y + ((i + 0.5) / SECTIONS) * h, DIM, 'right');
  }
  const by = y + ((BLADE + 0.5) / SECTIONS) * h;
  label(s, String(BLADE), GUTTER - 6, by, css(GOLD), 'right');
}

// ---------------------------------------------------------------- panels

function drawFutures(): void {
  const bandH = 132;
  const s = surface('c-futures', 960, bandH * 2 + 26 + AXIS);
  const w = 960 - GUTTER - 8;

  let peak = 0;
  const scan = (seq: Sequence) => {
    for (const f of seq.frames) for (const st of f) peak = Math.max(peak, Math.abs(st.offset));
  };
  scan(fam.baseline);
  scan(fam.altered.get(detent)!);
  if (peak <= 0) peak = 1;

  const band = (seq: Sequence, y: number, hue: RGB, name: string) => {
    stratum(s, GUTTER, y, w, bandH, (i, t) =>
      ramp(Math.abs(seq.frames[t]![i]!.offset) / peak, hue)
    );
    timeMarks(s, GUTTER, y, w, bandH);
    label(s, name, GUTTER + 6, y - 8, css(hue));
  };

  band(fam.baseline, 14, SLATE, 'BASELINE  ·  the future without you');
  band(
    fam.altered.get(detent)!,
    14 + bandH + 26,
    GOLD,
    detent === 0
      ? 'ALTERED  ·  neutral: this IS the baseline'
      : `ALTERED  ·  detent ${detent > 0 ? '+1' : '-1'} applied at tick ${HINGE}`
  );

  sectionAxis(s, 14, bandH);
  tickAxis(s, GUTTER, 14 + bandH * 2 + 26, w);
}

function drawDelta(): void {
  const h = 176;
  const s = surface('c-delta', 960, h + 16 + AXIS);
  const w = 960 - GUTTER - 8;
  const df = fam.delta.get(detent)!;

  let peak = 0;
  for (const f of df.frames) peak = Math.max(peak, f.peak);

  if (peak <= 0) {
    stratum(s, GUTTER, 10, w, h, () => GROUND);
    label(s, 'NEUTRAL OPENS NO GAP. There is no second future to subtract.', GUTTER + 10, 10 + h / 2, DIM);
    sectionAxis(s, 10, h);
    tickAxis(s, GUTTER, 10 + h + 16, w);
    return;
  }

  // log shading across four decades below the peak: a linear ramp puts
  // everything except the peak in the same black.
  const decades = 4;
  const shade = (g: number): number => {
    if (g <= 0) return 0;
    const d = Math.log10(g / peak);
    return d < -decades ? 0 : 1 + d / decades;
  };

  stratum(s, GUTTER, 10, w, h, (i, t) => ramp(shade(df.frames[t]!.gap[i]!), GOLD));
  timeMarks(s, GUTTER, 10, w, h);

  // the visibility floor, as an isoline the eye can find
  const floorV = shade(peak * VISIBLE_FRACTION);
  label(s, `floor = ${(VISIBLE_FRACTION * 100).toFixed(0)}% of peak`, GUTTER + w - 6, 20, DIM, 'right');
  void floorV;

  sectionAxis(s, 10, h);
  tickAxis(s, GUTTER, 10 + h + 16, w);

  const leg = $('delta-legend');
  const stops = [1, 0.75, 0.5, 0.25, 0].map(
    (v) =>
      `<span class="swatch"><i style="background:${css(ramp(v, GOLD))}"></i>${
        v === 1 ? 'peak' : v === 0 ? 'nothing' : `${Math.pow(10, -(1 - v) * decades).toExponential(0)}×`
      }</span>`
  );
  leg.innerHTML =
    stops.join('') +
    `<span class="swatch" style="color:${DIM}">log scale, ${decades} decades below peak ${peak.toExponential(2)}</span>`;
}

function drawReach(): void {
  const h = 168;
  const s = surface('c-reach', 960, h + 30 + AXIS);
  const w = 960 - GUTTER - 8;
  const gaps = fam.delta.get(detent)!.frames[TICKS - 1]!.gap;
  const widest = Math.max(...gaps);

  if (widest <= 0) {
    label(s, 'NEUTRAL: every gap is exactly zero.', GUTTER + 8, h / 2, DIM);
    return;
  }

  const decades = 8;
  const floor = widest * VISIBLE_FRACTION;
  const yOf = (g: number): number => {
    if (g <= 0) return h + 10;
    const d = Math.log10(g / widest);
    const k = d < -decades ? 0 : 1 + d / decades;
    return 10 + (1 - k) * h;
  };

  // decade grid
  s.ctx.strokeStyle = RULE;
  s.ctx.lineWidth = 1;
  for (let d = 0; d <= decades; d += 2) {
    const y = 10 + (d / decades) * h;
    s.ctx.beginPath();
    s.ctx.moveTo(GUTTER, y + 0.5);
    s.ctx.lineTo(GUTTER + w, y + 0.5);
    s.ctx.stroke();
    label(s, d === 0 ? 'peak' : `1e-${d}`, GUTTER - 6, y, d === 0 ? css(HOT) : DIM, 'right');
  }

  const bw = w / SECTIONS;
  for (let i = 0; i < SECTIONS; i++) {
    const g = gaps[i]!;
    const x = GUTTER + i * bw;
    const y = yOf(g);
    const visible = g >= floor;
    s.ctx.fillStyle = i === BLADE ? DIM : visible ? css(GOLD) : 'rgba(125,136,148,0.35)';
    if (i === caus.peakSection) s.ctx.fillStyle = css(HOT);
    s.ctx.fillRect(x + 0.5, y, Math.max(bw - 1.2, 1), 10 + h - y);
  }

  // the floor: everything under it is not a wall, it is float residue
  const fy = yOf(floor);
  s.ctx.strokeStyle = RUST;
  s.ctx.setLineDash([4, 3]);
  s.ctx.beginPath();
  s.ctx.moveTo(GUTTER, fy + 0.5);
  s.ctx.lineTo(GUTTER + w, fy + 0.5);
  s.ctx.stroke();
  s.ctx.setLineDash([]);
  label(s, 'visibility floor', GUTTER + w - 4, fy - 8, RUST, 'right');

  for (let i = 0; i < SECTIONS; i += 6) {
    label(s, String(i), GUTTER + (i + 0.5) * bw, h + 22, DIM, 'center');
  }
  label(s, 'section', GUTTER + w, h + 22, DIM, 'right');
  label(s, `peak · section ${caus.peakSection}`, GUTTER + (caus.peakSection + 1.5) * bw, 20, css(HOT), 'left');
}

function drawLadder(): void {
  const rowH = 5;
  const h = SECTIONS * rowH;
  const s = surface('c-ladder', 960, h + 26 + AXIS);
  const w = 960 - GUTTER - 8;
  const xOf = (t: number) => GUTTER + (t / TICKS) * w;

  const hx = xOf(HINGE);
  s.ctx.strokeStyle = 'rgba(125,136,148,0.4)';
  s.ctx.setLineDash([2, 3]);
  s.ctx.beginPath();
  s.ctx.moveTo(hx, 10);
  s.ctx.lineTo(hx, 10 + h);
  s.ctx.stroke();
  s.ctx.setLineDash([]);

  for (let i = 0; i < SECTIONS; i++) {
    const y = 10 + i * rowH + rowH / 2;
    const b = caus.yieldBase[i]!;
    const a = caus.yieldAltered[i]!;

    if (b < 0 && a < 0) {
      s.ctx.strokeStyle = 'rgba(26,34,44,0.9)';
      s.ctx.setLineDash([1, 4]);
      s.ctx.beginPath();
      s.ctx.moveTo(GUTTER, y + 0.5);
      s.ctx.lineTo(GUTTER + w, y + 0.5);
      s.ctx.stroke();
      s.ctx.setLineDash([]);
      continue;
    }

    if (b >= 0 && a >= 0 && a !== b) {
      s.ctx.strokeStyle = css(HOT);
      s.ctx.lineWidth = 1;
      s.ctx.beginPath();
      s.ctx.moveTo(xOf(b), y + 0.5);
      s.ctx.lineTo(xOf(a), y + 0.5);
      s.ctx.stroke();
    }
    if (b >= 0) {
      s.ctx.fillStyle = css(SLATE);
      s.ctx.fillRect(xOf(b) - 1, y - 1.5, 2, 3);
    }
    if (a >= 0) {
      s.ctx.fillStyle = i === BLADE ? DIM : css(GOLD);
      s.ctx.fillRect(xOf(a) - 1, y - 1.5, 2, 3);
    }
  }

  s.ctx.strokeStyle = RULE;
  s.ctx.strokeRect(GUTTER + 0.5, 10.5, w - 1, h - 1);
  sectionAxis(s, 10, h);
  tickAxis(s, GUTTER, 10 + h + 16, w);
}

// ---------------------------------------------------------------- readout

function fmtSet(a: number[]): string {
  return a.length === 0 ? 'none' : a.length > 8 ? `${a.length} sections` : `[${a.join(' ')}]`;
}

function drawReadout(): void {
  const flips = caus.flippedOn.length + caus.flippedOff.length;
  const rows: Array<[string, string, boolean]> = [
    ['visible', `${caus.visible.length}/${SECTIONS}`, caus.visible.length < 12],
    ['diverged', `${caus.divergedCount}/${SECTIONS}`, false],
    ['span', `${caus.visibleSpan}`, caus.visibleSpan < 12],
    ['flipped', `${flips}`, flips === 0],
    ['shifted', `${caus.shifted.length}`, false],
    ['falloff', caus.decayMean > 0 ? `${caus.decayMean.toFixed(3)}×` : '—', caus.decayMean > 0 && caus.decayMean < 0.6],
    ['amplification', caus.amplification > 0 ? `${caus.amplification.toFixed(2)}×` : '—', caus.amplification <= 1],
    ['in order', caus.visible.length ? (caus.frontMonotone ? 'yes' : 'no') : '—', !caus.frontMonotone && caus.visible.length > 0],
    ['retreated', `${caus.retreated.length}`, caus.retreated.length > 0],
    ['widest at tick', caus.visible.length ? `${caus.peakTick}` : '—', false],
    ['cause fades', caus.causeWashout > 0 ? `${caus.causeWashout.toFixed(0)}×` : '—', caus.causeWashout > 50]
  ];
  $('readout').innerHTML = rows
    .map(
      ([k, v, flag]) =>
        `<div class="kv"><dt>${k}</dt><dd class="${flag ? 'flag' : ''}">${v}</dd></div>`
    )
    .join('');

  const dn = $('detent-note');
  dn.textContent =
    detent === 0
      ? 'Neutral. The futures are identical, so there is no difference to stand inside.'
      : `One section displaced at tick ${HINGE}. Everything after is the rule running untouched.`;

  const tr = $('tick-read');
  tr.textContent = `t = ${tick}`;
  const tp = $('tick-phase');
  tp.textContent = tick < HINGE ? 'identical by construction' : hover ? `§${hover.section}` : 'diverging';
  tp.style.color = tick < HINGE ? DIM : TEXT;

  const flipTxt =
    flips === 0
      ? `<b>No section flips.</b> The intervention never pushes a section across a threshold it would not have crossed anyway, and never prevents one. The kernel's own comment calls thresholds "the amplifier ... the only reason a consequence can travel a long way from a small cause" &mdash; described, not firing.`
      : `<b>${flips} section${flips > 1 ? 's flip' : ' flips'}</b> across a threshold: the two futures contain a different set of events, not the same events at different times.`;
  const lv = $('ladder-verdict');
  lv.innerHTML = `${flipTxt} ${caus.shifted.length} section${caus.shifted.length === 1 ? '' : 's'} merely shift their yield tick: ${fmtSet(caus.shifted)}.`;
  lv.className = flips === 0 ? 'verdict' : 'verdict ok';

  const rv = $('reach-verdict');
  if (caus.visible.length === 0) {
    rv.innerHTML = 'Neutral opens nothing, so there is no reach to measure.';
    rv.className = 'verdict ok';
  } else {
    const pct = Math.round((caus.visibleSpan / SECTIONS) * 100);
    const wide = caus.visibleSpan >= 12;
    rv.innerHTML =
      `<b>${caus.visible.length} of ${SECTIONS} sections are visibly apart</b>, spanning ${caus.visibleSpan} (${pct}% of the stack), ` +
      `while ${caus.divergedCount} "diverge" above the kernel's epsilon &mdash; the difference between a wall and float residue with a section index. ` +
      `Past the peak the gap falls ${caus.decayMean.toFixed(3)}× per section${caus.decayMean < 0.6 ? ', so it halves and is gone within a few sections of the blade' : ''}.`;
    rv.className = wide ? 'verdict ok' : 'verdict';
  }

  const sum = checksum(fam.baseline);
  const known = seed === SITE_SEED;
  const ok = sum === SITE_BASELINE_CHECKSUM;
  $('foot').innerHTML =
    `<b>Seed ${seed}</b> · ${SECTIONS} sections · ${TICKS} ticks · hinge ${HINGE} · blade ${BLADE} · baseline checksum <b>${sum}</b>` +
    (known
      ? ` · <span class="${ok ? 'pass' : 'fail'}">${
          ok
            ? 'matches tools/delta-verify.mjs — this page is running the shipped kernel'
            : 'DOES NOT MATCH tools/delta-verify.mjs — the kernel changed'
        }</span>`
      : ' · no reference checksum for this seed') +
    `<br />Every value is read back out of the two computed futures by src/core/causality.ts. Nothing on this page is authored, and nothing here judges how any of it looks.`;
}

// ---------------------------------------------------------------- driving

function redraw(): void {
  drawFutures();
  drawDelta();
  drawReach();
  drawLadder();
  drawReadout();
}

function recompute(): void {
  fam = computeFamilies(seed);
  caus = read();
  redraw();
}

function buildDetents(): void {
  const host = $('detents');
  host.innerHTML = '';
  for (const d of DETENTS) {
    const b = document.createElement('button');
    b.className = 'detent';
    b.type = 'button';
    b.textContent = d > 0 ? '+1' : d < 0 ? '−1' : '0';
    b.setAttribute('aria-pressed', String(d === detent));
    b.addEventListener('click', () => {
      detent = d;
      caus = read();
      for (const other of Array.from(host.children)) other.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-pressed', 'true');
      redraw();
    });
    host.appendChild(b);
  }
}

function bind(): void {
  const seedInput = $<HTMLInputElement>('seed');
  const apply = () => {
    const v = Math.trunc(Number(seedInput.value));
    if (!Number.isFinite(v)) return;
    seed = v;
    recompute();
  };
  seedInput.addEventListener('change', apply);
  $('seed-').addEventListener('click', () => {
    seedInput.value = String(seed - 1);
    apply();
  });
  $('seed+').addEventListener('click', () => {
    seedInput.value = String(seed + 1);
    apply();
  });

  const tickInput = $<HTMLInputElement>('tick');
  tickInput.max = String(TICKS - 1);
  tickInput.value = String(tick);
  tickInput.addEventListener('input', () => {
    tick = Number(tickInput.value);
    redraw();
  });

  // reading a single cell: the instrument should answer "what is THAT"
  const dc = $<HTMLCanvasElement>('c-delta');
  dc.addEventListener('mousemove', (e) => {
    const r = dc.getBoundingClientRect();
    const scale = 960 / r.width;
    const x = (e.clientX - r.left) * scale;
    const y = (e.clientY - r.top) * scale;
    const w = 960 - GUTTER - 8;
    if (x < GUTTER || x > GUTTER + w || y < 10 || y > 186) {
      hover = null;
      return;
    }
    hover = {
      section: Math.min(SECTIONS - 1, Math.floor(((y - 10) / 176) * SECTIONS)),
      tick: Math.min(TICKS - 1, Math.floor(((x - GUTTER) / w) * TICKS))
    };
    const g = fam.delta.get(detent)!.frames[hover.tick]!.gap[hover.section]!;
    $('tick-phase').textContent = `§${hover.section} t${hover.tick} = ${g.toExponential(2)}`;
  });
  dc.addEventListener('mouseleave', () => {
    hover = null;
    drawReadout();
  });

  let raf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(redraw);
  });
}

buildDetents();
bind();
redraw();
