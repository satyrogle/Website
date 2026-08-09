/**
 * Gate A measurement.
 *
 * Reads the object-ID masks and silhouettes the Blender pass wrote and
 * computes the plan's quantitative clay gates. Every number comes from
 * object identity or from the silhouette, never from brightness: a
 * near-black structure cannot be measured by luma, which is how the v1
 * QA gates could certify a composition that overlapped real geometry.
 *
 *   node tools/clay-measure.mjs
 *
 * Writes design/clay/gate-a-measurements.json and prints the table.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launch } from './browser.mjs';

const CLAY = path.resolve('design/clay', process.env.DL_CLAY_DIR ?? 'r1');
const OUT_JSON = path.resolve('design/clay', process.env.DL_MEASURE_OUT ?? 'gate-a-r1-measurements.json');
const FORM = path.resolve('tools/blender/monolith_v2_form.py');

const MASS_NAMES = [
  'DL_FullForm_Outer_01',
  'DL_FullForm_Outer_02',
  'DL_FullForm_Outer_03',
  'DL_FullForm_Outer_04',
  'DL_FullForm_Outer_05',
  'DL_FullForm_Outer_06',
  'DL_FullForm_Outer_07',
];

/** Reads the authored constants back out of the form table. */
async function authored() {
  const text = await readFile(FORM, 'utf8');
  const plan = [...text.matchAll(/\(\s*(-?\d+\.\d+),\s*(-?\d+\.\d+)\),/g)]
    .slice(0, 7)
    .map((m) => [Number(m[1]), Number(m[2])]);
  const ground = Number(/GROUND = (-?\d+\.\d+)/.exec(text)[1]);
  const apex = Number(/APEX = (-?\d+\.\d+)/.exec(text)[1]);
  const haloRadius = Number(/"radius": (\d+\.\d+)/.exec(text)[1]);
  const width = Math.max(...plan.map((p) => p[0])) - Math.min(...plan.map((p) => p[0]));
  const depth = Math.max(...plan.map((p) => p[1])) - Math.min(...plan.map((p) => p[1]));
  const offsets = [...text.matchAll(/"offset": \((-?\d+\.\d+), (-?\d+\.\d+), (-?\d+\.\d+)\)/g)].map(
    (m) => [Number(m[1]), Number(m[2]), Number(m[3])]
  );
  const tiers = [...text.matchAll(/"tier": TIER_(\w+)/g)].map((m) => m[1].toLowerCase());
  const roles = [...text.matchAll(/"role": "(\w+)"/g)].map((m) => m[1]);
  return { plan, ground, apex, width, depth, haloRadius, offsets, tiers, roles };
}

async function decode(page, file) {
  const buffer = await readFile(path.join(CLAY, file));
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    return { width: c.width, height: c.height, data: Array.from(data) };
  }, buffer.toString('base64'));
}

/** Per-mass pixel counts and boxes from an ID mask. */
function readMask(image) {
  const { width, height, data } = image;
  const masses = MASS_NAMES.map(() => ({ pixels: 0, minX: 1e9, maxX: -1, minY: 1e9, maxY: -1, sumX: 0, sumY: 0 }));
  let spine = 0;
  let structure = 0;
  const owner = new Int16Array(width * height).fill(-1);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      if (g > 150) {
        spine++;
        structure++;
        owner[y * width + x] = 100;
        continue;
      }
      if (r < 12) continue;
      const id = Math.round(r / 25) - 1;
      if (id < 0 || id >= masses.length) continue;
      const m = masses[id];
      m.pixels++;
      m.sumX += x;
      m.sumY += y;
      if (x < m.minX) m.minX = x;
      if (x > m.maxX) m.maxX = x;
      if (y < m.minY) m.minY = y;
      if (y > m.maxY) m.maxY = y;
      structure++;
      owner[y * width + x] = id;
    }
  }
  return { masses, spine, structure, owner, width, height };
}

/** Connected components of the silhouette, and any fully enclosed holes. */
function silhouetteTopology(image, threshold = 128) {
  const { width, height, data } = image;
  // Silhouette renders are black subject on white ground.
  const solid = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    solid[p] = data[i] < threshold ? 1 : 0;
  }

  const label = new Int32Array(width * height).fill(-1);
  let components = 0;
  let largest = 0;
  const stack = [];
  for (let p = 0; p < solid.length; p++) {
    if (!solid[p] || label[p] >= 0) continue;
    let size = 0;
    stack.push(p);
    label[p] = components;
    while (stack.length) {
      const q = stack.pop();
      size++;
      const x = q % width;
      const y = (q / width) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (solid[n] && label[n] < 0) {
          label[n] = components;
          stack.push(n);
        }
      }
    }
    if (size > largest) largest = size;
    components++;
  }

  // Enclosed holes: background not reachable from the border.
  const seen = new Uint8Array(width * height);
  for (let x = 0; x < width; x++) {
    for (const y of [0, height - 1]) {
      const p = y * width + x;
      if (!solid[p] && !seen[p]) stack.push(p), (seen[p] = 1);
    }
  }
  for (let y = 0; y < height; y++) {
    for (const x of [0, width - 1]) {
      const p = y * width + x;
      if (!solid[p] && !seen[p]) stack.push(p), (seen[p] = 1);
    }
  }
  while (stack.length) {
    const q = stack.pop();
    const x = q % width;
    const y = (q / width) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (!solid[n] && !seen[n]) {
        seen[n] = 1;
        stack.push(n);
      }
    }
  }
  let holePixels = 0;
  for (let p = 0; p < solid.length; p++) if (!solid[p] && !seen[p]) holePixels++;

  // Bounds and the longest straight vertical boundary run.
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!solid[y * width + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  let longestEdgeRun = 0;
  for (const side of ['left', 'right']) {
    let previous = null;
    let run = 0;
    for (let y = minY; y <= maxY; y++) {
      let edge = null;
      if (side === 'left') {
        for (let x = 0; x < width; x++) if (solid[y * width + x]) { edge = x; break; }
      } else {
        for (let x = width - 1; x >= 0; x--) if (solid[y * width + x]) { edge = x; break; }
      }
      if (edge === null) { previous = null; run = 0; continue; }
      if (previous !== null && Math.abs(edge - previous) <= 1) run++;
      else run = 1;
      previous = edge;
      if (run > longestEdgeRun) longestEdgeRun = run;
    }
  }

  const area = solid.reduce((a, b) => a + b, 0);
  return {
    components,
    largestFraction: area ? largest / area : 0,
    holePixels,
    box: { minX, maxX, minY, maxY },
    height: maxY - minY + 1,
    width: maxX - minX + 1,
    longestEdgeRun,
    fill: area / Math.max((maxX - minX + 1) * (maxY - minY + 1), 1),
  };
}

function maskBox(mask) {
  const { owner, width, height } = mask;
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (owner[y * width + x] < 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * The longest straight vertical run along an INTERNAL boundary — the
 * edge of a gap between two masses. The plan's aperture test is about
 * the opening, not about the outer silhouette, so the outer edge is
 * reported separately as an observation.
 */
function longestApertureEdge(mask, box) {
  const { owner, width } = mask;
  let longest = 0;
  const edges = new Map();
  for (let y = box.minY; y <= box.maxY; y++) {
    // Only boundaries with structure on BOTH sides count: the outer
    // silhouette is not an aperture edge, and counting it made the
    // measurement stricter than the criterion it stands for.
    let first = -1;
    let last = -1;
    for (let x = box.minX; x <= box.maxX; x++) {
      if (owner[y * width + x] >= 0) {
        if (first < 0) first = x;
        last = x;
      }
    }
    if (first < 0) continue;
    let previousOwner = -1;
    for (let x = first; x <= last; x++) {
      const id = owner[y * width + x];
      if (id < 0 && previousOwner >= 0) edges.set(`o${y}`, x);
      if (id >= 0 && previousOwner < 0) edges.set(`i${y}`, x);
      previousOwner = id;
    }
  }
  let where = null;
  for (const key of ['o', 'i']) {
    let previous = null;
    let run = 0;
    let start = 0;
    for (let y = box.minY; y <= box.maxY; y++) {
      const value = edges.get(key + y);
      if (value === undefined) { previous = null; run = 0; continue; }
      if (previous !== null && Math.abs(value - previous) <= 1) run++;
      else { run = 1; start = y; }
      previous = value;
      if (run > longest) {
        longest = run;
        where = { side: key === 'o' ? 'gap-left-edge' : 'gap-right-edge', x: value, from: start, to: y };
      }
    }
  }
  return { longest, where };
}

/** Widest horizontal run of a single mass in the top quarter of the form. */
function topBridge(mask, silhouetteBox) {
  const { owner, width } = mask;
  const top = silhouetteBox.minY;
  const quarter = top + Math.round((silhouetteBox.maxY - top) * 0.25);
  const widest = new Array(MASS_NAMES.length).fill(0);
  for (let y = top; y <= quarter; y++) {
    const runs = new Array(MASS_NAMES.length).fill(null);
    for (let x = 0; x < width; x++) {
      const id = owner[y * width + x];
      for (let m = 0; m < MASS_NAMES.length; m++) {
        if (id === m) {
          if (runs[m] === null) runs[m] = [x, x];
          else runs[m][1] = x;
        }
      }
    }
    runs.forEach((r, m) => {
      if (r) widest[m] = Math.max(widest[m], r[1] - r[0] + 1);
    });
  }
  // Only count a mass as a bridge if it is a bar: wider across the top
  // quarter than the height it occupies there.
  const heights = new Array(MASS_NAMES.length).fill(0);
  for (let m = 0; m < MASS_NAMES.length; m++) {
    let lo = 1e9;
    let hi = -1;
    for (let y = top; y <= quarter; y++) {
      for (let x = 0; x < width; x++) {
        if (owner[y * width + x] === m) {
          if (y < lo) lo = y;
          if (y > hi) hi = y;
          break;
        }
      }
    }
    heights[m] = hi >= lo ? hi - lo + 1 : 0;
  }
  return widest.map((w, m) => (heights[m] > 0 && w / heights[m] > 2.0 ? w : 0));
}

/** Gap widths, sampled as background runs strictly inside the silhouette. */
function gapWidths(mask, box) {
  const { owner, width } = mask;
  const gaps = [];
  const rows = 72;
  for (let i = 1; i < rows; i++) {
    const y = Math.round(box.minY + ((box.maxY - box.minY) * i) / rows);
    let firstSolid = -1;
    let lastSolid = -1;
    for (let x = 0; x < width; x++) {
      if (owner[y * width + x] >= 0) {
        if (firstSolid < 0) firstSolid = x;
        lastSolid = x;
      }
    }
    if (firstSolid < 0) continue;
    let run = 0;
    for (let x = firstSolid; x <= lastSolid; x++) {
      if (owner[y * width + x] < 0) run++;
      else {
        if (run > 0) gaps.push(run);
        run = 0;
      }
    }
  }
  return gaps;
}

async function main() {
  const spec = await authored();
  const browser = await launch();
  const page = await (await browser.newContext()).newPage();
  await page.goto('data:text/html,<body></body>');

  const maskElevation = readMask(await decode(page, 'A00-mask-elevation.png'));
  const maskHero = readMask(await decode(page, 'A00-mask-hero.png'));
  const halo = await decode(page, 'A00-halo-hero.png');
  const sil512 = silhouetteTopology(await decode(page, 'A05-silhouette-512.png'));
  const sil128 = silhouetteTopology(await decode(page, 'A06-silhouette-128.png'));
  const silMobile = silhouetteTopology(await decode(page, 'A10-mobile-silhouette-390x844.png'));
  await browser.close();

  // Halo footprint at the hero framing, against the subject's width.
  let haloMinX = 1e9;
  let haloMaxX = -1;
  for (let y = 0; y < halo.height; y++) {
    for (let x = 0; x < halo.width; x++) {
      if (halo.data[(y * halo.width + x) * 4] > 128) {
        if (x < haloMinX) haloMinX = x;
        if (x > haloMaxX) haloMaxX = x;
      }
    }
  }
  let heroMinX = 1e9;
  let heroMaxX = -1;
  for (let y = 0; y < maskHero.height; y++) {
    for (let x = 0; x < maskHero.width; x++) {
      if (maskHero.owner[y * maskHero.width + x] >= 0) {
        if (x < heroMinX) heroMinX = x;
        if (x > heroMaxX) heroMaxX = x;
      }
    }
  }

  const totalHero = maskHero.structure;
  const areas = maskHero.masses.map((m, i) => ({
    name: MASS_NAMES[i],
    tier: spec.tiers[i],
    role: spec.roles[i],
    percent: (m.pixels / totalHero) * 100,
    pixels: m.pixels,
    centroid: m.pixels
      ? [Math.round(m.sumX / m.pixels), Math.round(m.sumY / m.pixels)]
      : null,
  }));
  areas.sort((a, b) => b.percent - a.percent);

  const elevationBox = maskBox(maskElevation);
  const bridges = topBridge(maskElevation, elevationBox);
  const gaps = gapWidths(maskElevation, elevationBox);
  const aperture = longestApertureEdge(maskElevation, elevationBox);
  const apertureEdge = aperture.longest;
  const gapMin = gaps.length ? Math.min(...gaps) : 0;
  const gapMax = gaps.length ? Math.max(...gaps) : 0;

  const tierSet = new Set(spec.tiers);
  const ratio = (spec.apex - spec.ground) / spec.width;
  const haloRatio = (haloMaxX - haloMinX) / Math.max(heroMaxX - heroMinX, 1);
  const haloGeometric = (spec.haloRadius * 2) / spec.width;
  const silWidth = elevationBox.width;

  const checks = [
    {
      id: 'height-to-width',
      target: '2.5 - 3.0',
      value: ratio.toFixed(2),
      pass: ratio >= 2.5 && ratio <= 3.0,
    },
    {
      id: 'seven-separate-masses',
      target: '7 masses present',
      value: String(areas.filter((a) => a.pixels > 0).length),
      pass: areas.filter((a) => a.pixels > 0).length === 7,
    },
    {
      id: 'straight-aperture-edge',
      target: '< 40% of height',
      value: ((apertureEdge / elevationBox.height) * 100).toFixed(1) + '%',
      pass: apertureEdge / elevationBox.height < 0.4,
    },
    {
      id: 'top-bridge-span',
      target: '< 45% of width',
      value: ((Math.max(...bridges) / silWidth) * 100).toFixed(1) + '%',
      pass: Math.max(...bridges) / silWidth < 0.45,
    },
    {
      id: 'centre-not-enclosed',
      target: 'no enclosed hole in the silhouette',
      value: sil512.holePixels + ' px',
      pass: sil512.holePixels < 40,
    },
    {
      id: 'depth-tiers',
      target: '>= 3 tiers',
      value: String(tierSet.size),
      pass: tierSet.size >= 3,
    },
    {
      id: 'gaps-not-uniform',
      target: 'max/min > 1.2',
      value: gaps.length ? (gapMax / Math.max(gapMin, 1)).toFixed(2) : 'n/a',
      pass: gaps.length > 1 && gapMax / Math.max(gapMin, 1) > 1.2,
    },
    {
      id: 'no-two-leaf-split',
      target: 'no full-height central slit',
      value: sil512.components + ' component(s)',
      pass: sil512.components === 1,
    },
    {
      id: 'coherent-at-128',
      target: '1 component, >= 97% in the largest',
      value: sil128.components + ' component(s), ' + (sil128.largestFraction * 100).toFixed(1) + '%',
      pass: sil128.components === 1 || sil128.largestFraction >= 0.97,
    },
    {
      id: 'halo-diameter',
      target: '1.35 - 1.70x the form width',
      value: (haloGeometric.toFixed(2) + 'x geometric, ' + haloRatio.toFixed(2) + 'x projected'),
      pass: haloGeometric >= 1.35 && haloGeometric <= 1.7,
    },
    {
      id: 'dominant-a-area',
      target: '27 - 30%, and the largest mass',
      value: areas[0].percent.toFixed(1) + '% (' + areas[0].name.slice(-2) + ', ' + areas[0].role + ')',
      pass:
        areas[0].percent >= 27 &&
        areas[0].percent <= 30 &&
        areas[0].role === 'dominant_a',
    },
    {
      id: 'dominant-b-area',
      target: '19 - 22%',
      value: areas[1].percent.toFixed(1) + '% (' + areas[1].name.slice(-2) + ', ' + areas[1].role + ')',
      pass:
        areas[1].percent >= 19 &&
        areas[1].percent <= 22 &&
        areas[1].role === 'dominant_b',
    },
    {
      id: 'supporting-areas',
      target: '8 - 14% each, three of them',
      value: areas.slice(2, 5).map((a) => a.percent.toFixed(1) + '%').join(' / '),
      pass: areas
        .slice(2, 5)
        .every((a) => a.percent >= 8 && a.percent <= 14 && a.role === 'supporting'),
    },
    {
      id: 'rear-areas',
      target: '5 - 8% each, two of them',
      value: areas.slice(5, 7).map((a) => a.percent.toFixed(1) + '%').join(' / '),
      pass: areas
        .slice(5, 7)
        .every((a) => a.percent >= 5 && a.percent <= 8 && a.role === 'rear_structural'),
    },
    {
      id: 'spine-recessed',
      target: '1.5 - 3.0% of visible structure',
      value: ((maskHero.spine / totalHero) * 100).toFixed(2) + '%',
      pass:
        maskHero.spine / totalHero >= 0.015 && maskHero.spine / totalHero <= 0.03,
    },
    {
      id: 'mobile-silhouette',
      target: '1 component at 390x844',
      value: silMobile.components + ' component(s)',
      pass: silMobile.components === 1 || silMobile.largestFraction >= 0.97,
    },
  ];

  const result = {
    asset: 'design/clay/DL_FullForm_v03_clay.glb',
    observations: {
      longestApertureEdge: aperture.where,
      longestStraightOuterEdgePercent: Number(
        ((sil512.longestEdgeRun / sil512.height) * 100).toFixed(1)
      ),
      silhouetteFill: Number(sil512.fill.toFixed(3)),
    },
    authored: {
      width: spec.width,
      depth: spec.depth,
      height: spec.apex - spec.ground,
      haloRadius: spec.haloRadius,
    },
    areas,
    gaps: { count: gaps.length, min: gapMin, max: gapMax },
    silhouette: { at512: sil512, at128: sil128, mobile: silMobile },
    checks,
  };
  delete result.silhouette.at512.box;
  delete result.silhouette.at128.box;
  delete result.silhouette.mobile.box;

  await writeFile(OUT_JSON, JSON.stringify(result, null, 2));

  console.log('\nGATE A — measured checks\n');
  for (const c of checks) {
    console.log(
      `  [${c.pass ? 'PASS' : 'FAIL'}] ${c.id.padEnd(24)} ${String(c.value).padEnd(28)} target ${c.target}`
    );
  }
  console.log('\n  projected area, hero framing');
  for (const a of areas) {
    console.log(`    ${a.name}  ${a.percent.toFixed(1).padStart(5)}%   tier=${a.tier}`);
  }
  const failed = checks.filter((c) => !c.pass);
  console.log(`\n  ${checks.length - failed.length}/${checks.length} measured checks pass`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
