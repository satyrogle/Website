import { computeFamilies, checksum, SECTIONS, TICKS, HINGE, BLADE } from '../core/Delta';
import type { Detent, Families, Sequence } from '../core/Delta';
import { readCausality } from '../core/causality';
import type { Causality } from '../core/causality';
import './plate.css';

/**
 * PLATE I — THE BODY OF THE RECORD.
 *
 * Bans on visual identity lifted by Jacob, 2026-09-03 (docs/IDENTITY.md).
 * The board is the identity: the illuminated diagram, the energy body,
 * the exploded mechanism, the observer drawn inside the geometry. This
 * is the site's own kernel drawn in that language.
 *
 * Nothing on the plate is drawn by hand. Forty-eight sections are the
 * spine. The two currents either side are the two futures; where they
 * part is the difference. The centres that light are the sections the
 * intervention actually reached, read out of src/core/causality.ts.
 * The eye's pupil sits at the detent. The cone is the difference over
 * time. The exploded stack is the sections displaced by their real
 * gaps. The equations are the rule, quoted from Delta.ts.
 *
 * DOM and SVG only: no Three.js, no canvas, no GPU. It renders on the
 * fallback path exactly as it renders anywhere else.
 */

const W = 1200;
const H = 1560;

/** the figure's axis */
const AX = 600;
const TOP = 300;
const BOT = 1230;
const yOf = (i: number): number => TOP + (i / (SECTIONS - 1)) * (BOT - TOP);

/** current amplitude: kernel offsets top out near 0.2, so this is ~46px */
const K_CURRENT = 230;

/**
 * Seven manuscript pigments, crown to root. Earth and mineral, not
 * neon: the board's chakra charts read as pigment on a page, and this
 * plate sits on graphite next to gold leaf.
 */
const PIGMENT = ['#7d5aa6', '#4a4f9c', '#3f7fa6', '#4f8f5e', '#d1b23a', '#c4692a', '#b3402e'];

function hexToRgb(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

/** pigment by position along the spine */
function pigmentAt(i: number): string {
  const t = (i / (SECTIONS - 1)) * (PIGMENT.length - 1);
  const k = Math.min(PIGMENT.length - 2, Math.floor(t));
  const f = t - k;
  const a = hexToRgb(PIGMENT[k]!);
  const b = hexToRgb(PIGMENT[k + 1]!);
  const m = (x: number, y: number) => Math.round(x + (y - x) * f);
  return `rgb(${m(a[0], b[0])},${m(a[1], b[1])},${m(a[2], b[2])})`;
}

const n = (v: number): string => (Math.round(v * 10) / 10).toString();

/** Catmull-Rom through the points, as cubic beziers: a current, not a zigzag. */
function smooth(pts: Array<[number, number]>): string {
  if (pts.length < 2) return '';
  let d = `M ${n(pts[0]![0])} ${n(pts[0]![1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${n(c1x)} ${n(c1y)}, ${n(c2x)} ${n(c2y)}, ${n(p2[0])} ${n(p2[1])}`;
  }
  return d;
}

const text = (
  x: number,
  y: number,
  s: string,
  cls = '',
  anchor: 'start' | 'middle' | 'end' = 'start'
): string =>
  `<text x="${n(x)}" y="${n(y)}" class="${cls}" text-anchor="${anchor}">${s}</text>`;

function fmtSections(a: number[]): string {
  if (a.length === 0) return 'none';
  // collapse runs: 18 19 20 21 -> §18–21
  const out: string[] = [];
  let s = a[0]!;
  let e = a[0]!;
  for (let k = 1; k <= a.length; k++) {
    const v = a[k];
    if (v !== undefined && v === e + 1) {
      e = v;
      continue;
    }
    out.push(s === e ? `§${s}` : `§${s}–${e}`);
    if (v !== undefined) {
      s = v;
      e = v;
    }
  }
  return out.join(' · ');
}

// ---------------------------------------------------------------- parts

function frame(): string {
  return (
    `<rect x="20" y="20" width="${W - 40}" height="${H - 40}" class="frame"/>` +
    `<rect x="32" y="32" width="${W - 64}" height="${H - 64}" class="frame-2"/>`
  );
}

/** Vitruvian construction: the circle and the square, faint. */
function construction(): string {
  const cy = 790;
  return (
    `<circle cx="${AX}" cy="${cy}" r="520" class="constr"/>` +
    `<rect x="${AX - 470}" y="${cy - 470}" width="940" height="940" class="constr"/>` +
    `<line x1="${AX}" y1="120" x2="${AX}" y2="${H - 120}" class="constr"/>` +
    `<line x1="80" y1="${cy}" x2="${W - 80}" y2="${cy}" class="constr"/>`
  );
}

/** The figure: a construction drawing, not a cartoon. Head, shoulders, hips, limbs. */
function figure(detent: Detent): string {
  const headY = 214;
  const pupilX = AX + detent * 11;
  return (
    // the pyramid at the crown, and the eye inside it
    `<path d="M ${AX} 132 L ${AX - 78} 268 L ${AX + 78} 268 Z" class="pyramid"/>` +
    `<circle cx="${AX}" cy="${headY}" r="46" class="figure"/>` +
    `<path d="M ${AX - 30} ${headY} Q ${AX} ${headY - 22} ${AX + 30} ${headY} Q ${AX} ${headY + 22} ${AX - 30} ${headY} Z" class="eye"/>` +
    `<circle cx="${n(pupilX)}" cy="${headY}" r="12" class="iris"/>` +
    `<circle cx="${n(pupilX)}" cy="${headY}" r="6" class="pupil"/>` +
    // shoulders, arms, hips, legs
    `<line x1="${AX - 128}" y1="292" x2="${AX + 128}" y2="292" class="figure"/>` +
    `<line x1="${AX - 128}" y1="292" x2="${AX - 214}" y2="700" class="figure"/>` +
    `<line x1="${AX + 128}" y1="292" x2="${AX + 214}" y2="700" class="figure"/>` +
    `<line x1="${AX - 56}" y1="840" x2="${AX + 56}" y2="840" class="figure"/>` +
    `<line x1="${AX - 56}" y1="840" x2="${AX - 92}" y2="1330" class="figure"/>` +
    `<line x1="${AX + 56}" y1="840" x2="${AX + 92}" y2="1330" class="figure"/>`
  );
}

/** The spine: 48 sections. Lit where reached, dashed where they never yield. */
function spine(c: Causality): string {
  let s = '';
  const visible = new Set(c.visible);
  for (let i = 0; i < SECTIONS; i++) {
    const y = yOf(i);
    const never = c.yieldBase[i]! < 0 && c.yieldAltered[i]! < 0;
    const lit = visible.has(i);
    const cls = i === BLADE ? 'vert vert-blade' : never ? 'vert-locked' : 'vert';
    const fill = lit ? pigmentAt(i) : never ? 'none' : '#0e1319';
    s += `<rect x="${AX - 13}" y="${n(y - 7)}" width="26" height="14" rx="2" class="${cls}" fill="${fill}"/>`;
    if (i % 6 === 0 || i === BLADE) {
      s += text(AX - 44, y + 4, String(i), i === BLADE ? 't-gold t-tiny' : 't-dim t-tiny', 'end');
    }
  }
  return s;
}

/** The two futures as currents either side of the spine; the rungs are the difference. */
function currents(fam: Families, detent: Detent, c: Causality): string {
  const base: Sequence = fam.baseline;
  const alt: Sequence = fam.altered.get(detent)!;
  const last = TICKS - 1;
  const gaps = fam.delta.get(detent)!.frames[last]!.gap;
  const widest = Math.max(...gaps);

  // RIBBONS, NOT LINES. A section that yielded sits at ~0.2 and its
  // neighbour that has not sits at 0, so a line through the offsets is
  // a sawtooth whipping side to side - a seismograph, not a current.
  // Filled from the spine's edge out to the offset, the same numbers
  // read as a band with body in it, wide where the stack has moved.
  const EDGE = 22;
  const pb: Array<[number, number]> = [];
  const pa: Array<[number, number]> = [];
  for (let i = 0; i < SECTIONS; i++) {
    const ob = Math.abs(base.frames[last]![i]!.offset);
    const oa = Math.abs(alt.frames[last]![i]!.offset);
    pb.push([AX - EDGE - ob * K_CURRENT, yOf(i)]);
    pa.push([AX + EDGE + oa * K_CURRENT, yOf(i)]);
  }
  const ribbon = (pts: Array<[number, number]>, edgeX: number): string =>
    `${smooth(pts)} L ${n(edgeX)} ${n(yOf(SECTIONS - 1))} L ${n(edgeX)} ${n(yOf(0))} Z`;
  let s =
    `<path d="${ribbon(pb, AX - EDGE)}" class="current-base"/>` +
    `<path d="${ribbon(pa, AX + EDGE)}" class="current-alt"/>`;

  // rungs: one per visibly reached section, opacity by its share of the widest gap
  if (widest > 0) {
    for (const i of c.visible) {
      const o = Math.max(0.25, gaps[i]! / widest);
      s += `<line x1="${n(pb[i]![0])}" y1="${n(yOf(i))}" x2="${n(pa[i]![0])}" y2="${n(yOf(i))}" class="rung" opacity="${o.toFixed(2)}"/>`;
    }
  }
  return s;
}

/** Leader lines from the spine to the numbered notes on the left. */
function leaders(c: Causality): string {
  const notes: Array<{ at: number; num: string; lines: string[] }> = [];

  notes.push({
    at: BLADE,
    num: 'I',
    lines: [`THE BLADE · §${BLADE}`, `THE HAND ENTERS AT T${HINGE}`]
  });

  if (c.visible.length > 0) {
    const mid = c.visible[Math.floor(c.visible.length / 2)]!;
    notes.push({
      at: mid,
      num: 'II',
      lines: [`REACHED · ${fmtSections(c.visible)}`, `${c.visible.length} OF ${SECTIONS} CENTRES LIT`]
    });
  }

  const never: number[] = [];
  for (let i = 0; i < SECTIONS; i++) if (c.yieldBase[i]! < 0 && c.yieldAltered[i]! < 0) never.push(i);
  if (never.length > 0) {
    const pick = never.find((i) => i > 30) ?? never[never.length - 1]!;
    notes.push({
      at: pick,
      num: 'III',
      lines: [`NEVER YIELD · ${fmtSections(never)}`, `${never.length} OF ${SECTIONS} STAY CLOSED`]
    });
  }

  const flips = c.flippedOn.length + c.flippedOff.length;
  notes.push({
    at: c.shifted[0] ?? BLADE + 2,
    num: 'IV',
    lines: [
      flips > 0 ? `FLIPPED · ${fmtSections([...c.flippedOn, ...c.flippedOff].sort((p, q) => p - q))}` : 'FLIPPED · NONE',
      `SHIFTED · ${c.shifted.length > 0 ? fmtSections(c.shifted) : 'NONE'}`
    ]
  });

  // lay the notes out so they never overlap: sorted by anchor, pushed apart
  notes.sort((p, q) => p.at - q.at);
  let s = '';
  let lastY = 0;
  for (const nt of notes) {
    const ay = yOf(nt.at);
    const ty = Math.max(ay, lastY + 58);
    lastY = ty;
    const x0 = AX - 13 - (nt.at === BLADE ? 0 : 0);
    s += `<path d="M ${n(x0 - 36)} ${n(ay)} L 340 ${n(ay)} L 328 ${n(ty)} L 300 ${n(ty)}" class="leader"/>`;
    s += `<circle cx="${n(x0 - 36)}" cy="${n(ay)}" r="2" class="leader-dot"/>`;
    s += text(108, ty + 4, nt.num, 't-gold');
    s += text(140, ty + 4, nt.lines[0]!, 't-bone');
    s += text(140, ty + 22, nt.lines[1]!, 't-dim t-tiny');
  }
  return s;
}

/** The future cone: the difference over time, from the physics page. */
function cone(fam: Families, detent: Detent): string {
  const x0 = 880;
  const w = 270;
  const mid = 400;
  const df = fam.delta.get(detent)!;
  let peak = 0;
  for (const f of df.frames) peak = Math.max(peak, f.peak);
  const kc = peak > 0 ? 52 / peak : 0;
  const xt = (t: number) => x0 + (t / (TICKS - 1)) * w;

  const top: Array<[number, number]> = [];
  const bot: Array<[number, number]> = [];
  for (let t = 0; t < TICKS; t += 3) {
    const p = df.frames[t]!.peak * kc;
    top.push([xt(t), mid - p]);
    bot.push([xt(t), mid + p]);
  }
  const hx = xt(HINGE);
  let s = text(x0, 322, 'FIG. 2 · THE FUTURE CONE', 't-fig');
  s += `<line x1="${x0}" y1="${mid}" x2="${x0 + w}" y2="${mid}" class="cone-base"/>`;
  if (peak > 0) {
    const d = smooth(top) + ' ' + smooth(bot.slice().reverse()).replace(/^M/, 'L') + ' Z';
    s += `<path d="${d}" class="cone"/>`;
  }
  s += `<line x1="${n(hx)}" y1="${mid - 62}" x2="${n(hx)}" y2="${mid + 62}" class="hinge"/>`;
  s += text(x0, mid + 84, 'T0', 't-dim t-tiny');
  s += text(hx, mid - 70, `HINGE T${HINGE}`, 't-dim t-tiny', 'middle');
  s += text(x0 + w, mid + 84, `T${TICKS}`, 't-dim t-tiny', 'end');
  s += text(x0, mid + 104, 'ONE WORLDLINE UNTIL THE HINGE. THEN TWO.', 't-dim t-tiny');
  return s;
}

/** Exploded along the difference: each section displaced by its real gap. */
function exploded(fam: Families, detent: Detent, c: Causality): string {
  const x0 = 880;
  const y0 = 560;
  const rowH = 8.6;
  const gaps = fam.delta.get(detent)!.frames[TICKS - 1]!.gap;
  const widest = Math.max(...gaps);
  const visible = new Set(c.visible);
  let s = text(x0, 540, 'FIG. 3 · EXPLODED BY THE GAPS', 't-fig');
  s += `<line x1="${x0}" y1="${y0 - 6}" x2="${x0}" y2="${n(y0 + SECTIONS * rowH)}" class="axis"/>`;
  for (let i = 0; i < SECTIONS; i++) {
    const dx = widest > 0 ? (gaps[i]! / widest) * 150 : 0;
    const y = y0 + i * rowH;
    const lit = visible.has(i);
    const fill = lit ? pigmentAt(i) : '#0e1319';
    const cls = i === BLADE ? 'slab vert-blade' : 'slab';
    s += `<rect x="${n(x0 + 6 + dx)}" y="${n(y)}" width="96" height="5.2" class="${cls}" fill="${fill}"/>`;
  }
  s += text(x0, y0 + SECTIONS * rowH + 22, `WIDEST GAP ${widest.toExponential(2)} · SHOWN TO SCALE`, 't-dim t-tiny');
  return s;
}

/** When each section gave way, in both futures. */
function ladder(c: Causality): string {
  const x0 = 880;
  const w = 270;
  const y0 = 1074;
  const rowH = 4.4;
  const xt = (t: number) => x0 + (t / (TICKS - 1)) * w;
  let s = text(x0, 1050, 'FIG. 4 · WHEN EACH SECTION GAVE WAY', 't-fig');
  const hx = xt(HINGE);
  s += `<line x1="${n(hx)}" y1="${y0 - 4}" x2="${n(hx)}" y2="${n(y0 + SECTIONS * rowH + 2)}" class="hinge"/>`;
  for (let i = 0; i < SECTIONS; i++) {
    const y = y0 + i * rowH;
    const b = c.yieldBase[i]!;
    const a = c.yieldAltered[i]!;
    if (b >= 0 && a >= 0 && a !== b) {
      s += `<line x1="${n(xt(b))}" y1="${n(y + 1.5)}" x2="${n(xt(a))}" y2="${n(y + 1.5)}" class="shift"/>`;
    }
    if (b >= 0) s += `<rect x="${n(xt(b) - 1)}" y="${n(y)}" width="2" height="3" class="tick-base"/>`;
    if (a >= 0) s += `<rect x="${n(xt(a) - 1)}" y="${n(y)}" width="2" height="3" class="tick-alt"/>`;
  }
  s += text(x0, y0 + SECTIONS * rowH + 22, 'BONE · THE FUTURE WITHOUT YOU', 't-dim t-tiny');
  s += text(x0, y0 + SECTIONS * rowH + 38, 'GOLD · THE FUTURE YOU CHOSE', 't-dim t-tiny');
  return s;
}

/** The rule, as written. Quoted from src/core/Delta.ts, not paraphrased. */
function equations(): string {
  const x = 108;
  let y = 1078;
  let s = text(x, 1050, 'FIG. 5 · THE RULE, AS WRITTEN', 't-fig');
  const lines = [
    'load   = inherited · transfer · (0.62 + 0.38 · clearance) + 0.22',
    'strain = 0.997 · strain + 0.005 · load',
    'yields when strain > threshold, and stays given',
    'offset += (target − offset) · 0.08'
  ];
  for (const l of lines) {
    s += text(x, y, l, 't-eq');
    y += 26;
  }
  s += text(x, y + 6, 'SRC/CORE/DELTA.TS · SEEDED · FIXED-STEP · NO RANDOMNESS AT RUNTIME', 't-dim t-tiny');
  return s;
}

function cartouche(seed: number, detent: Detent, fam: Families, c: Causality): string {
  const sum = checksum(fam.baseline);
  const d = detent > 0 ? '+1' : detent < 0 ? '−1' : '0';
  return (
    `<line x1="360" y1="1408" x2="${W - 360}" y2="1408" class="rule"/>` +
    text(AX, 1446, 'PLATE I · THE BODY OF THE RECORD', 't-title', 'middle') +
    text(
      AX,
      1476,
      `SEED ${seed} · FUTURE ${d} · CHECKSUM ${sum} · ${SECTIONS} SECTIONS · ${TICKS} TICKS · ${c.visible.length} LIT`,
      't-dim',
      'middle'
    ) +
    `<line x1="360" y1="1500" x2="${W - 360}" y2="1500" class="rule"/>`
  );
}

// ---------------------------------------------------------------- mount

export function plateSVG(seed: number, detent: Detent): string {
  const fam = computeFamilies(seed);
  const c = readCausality(fam.baseline, fam.altered.get(detent)!, fam.delta.get(detent)!);
  return (
    `<svg class="plate" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="plate-title plate-desc">` +
    `<title id="plate-title">Plate I, the body of the record, seed ${seed}</title>` +
    `<desc id="plate-desc">The delta kernel drawn as a standing figure. Forty-eight sections form the spine; the two futures run as currents either side; the sections the intervention reached are lit in pigment. Insets show the difference over time, the sections exploded by their gaps, the tick each section yielded, and the rule as written.</desc>` +
    frame() +
    construction() +
    text(60, 74, 'DARK LATTICE', 't-dim') +
    text(W - 60, 74, 'FIG. 1 · THE FIGURE', 't-fig', 'end') +
    figure(detent) +
    currents(fam, detent, c) +
    spine(c) +
    leaders(c) +
    cone(fam, detent) +
    exploded(fam, detent, c) +
    ladder(c) +
    equations() +
    cartouche(seed, detent, fam, c) +
    `</svg>`
  );
}

/** Render the plate into #plate-figure, if the page has one. */
export function mountPlate(seed: number, detent: Detent): void {
  const host = document.getElementById('plate-figure');
  if (!host) return;
  host.innerHTML = plateSVG(seed, detent);
  const tele = document.getElementById('telemetry');
  if (tele) tele.textContent = `SEED ${seed} · FUTURE ${detent > 0 ? '+1' : detent < 0 ? '-1' : '0'}`;
}
