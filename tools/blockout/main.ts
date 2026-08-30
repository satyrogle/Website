import * as THREE from 'three';
import { computeFamilies, SECTIONS, TICKS } from '../../src/core/Delta';
import { mulberry32 } from '../../src/core/rng';
import {
  FORM_H,
  prongCentre,
  surfacePoint,
  cutPlaneX
} from '../../src/world/monumentForm';

/**
 * Z BLOCKOUT — DISPOSABLE. Not the production renderer, not imported by
 * src/main.ts, not in the production build. Delete when judged.
 *
 * SECOND SPATIAL RULE UNDER TEST — Jacob, 2026-08-30. The first layout
 * placed sections on the time axis as a line, and the field measured
 * 285 x 3907 x 295: a shaft, because a chain has no width. The proposed
 * fix of re-plumbing the kernel into a branching network was REFUSED -
 * changing the maths because the composition needs it is exactly
 * backwards for this project. The hero already is a coordinate system:
 *
 *   Z POSITION = HERO POSITION + STRESS DIRECTION x DELTA MAGNITUDE
 *
 * - base position: a real anchor inside the Split Spire's own volume,
 *   from monumentForm.ts - the same maths that places the stone.
 * - direction: outward through the half's surface at the anchor. The
 *   repo has no 3D stress tensor (the kernel is one-dimensional), so
 *   this is the honest proxy for the principal direction: a piece under
 *   pressure exits through its nearest free surface. Stated, not
 *   pretended.
 * - magnitude: the kernel's real baseline-vs-altered gap, unchanged.
 *
 * The kernel is NOT modified for this experiment. If this still cannot
 * make an inhabitable volume, branching topology gets reconsidered.
 */

const SEED = 20260818;
const fam = computeFamilies(SEED);
const delta = fam.delta.get(1)!;
const finalGaps = delta.frames[TICKS - 1]!.gap;

const widest = Math.max(...finalGaps);
// the same "actually visible" rule delta-verify uses
const VISIBLE = widest * 0.01;
const visibleIdx = finalGaps.map((g, i) => [g, i] as const).filter(([g]) => g > VISIBLE);

/**
 * The widest computed gap opens this far, in hero units. The one global
 * scale in the experiment: the monument is 195 tall and ~62 wide, so 150
 * lets the biggest consequence carry a piece well clear of the body
 * without leaving the neighbourhood entirely.
 */
const GAP_SCALE = 150 / widest;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070a);
scene.fog = new THREE.FogExp2(0x05070a, 0.004);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.2, 4000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

// enough light to read form, nothing more
scene.add(new THREE.HemisphereLight(0x8fa4bb, 0x05070a, 1.15));
const key = new THREE.DirectionalLight(0xdfe8f2, 1.5);
key.position.set(-160, 320, 210);
scene.add(key);

const plateMat = new THREE.MeshStandardMaterial({
  color: 0x1b2027,
  roughness: 0.82,
  metalness: 0.15,
  flatShading: true
});
// the piece as it stands in the ALTERED future - very slightly lighter,
// only so the pair can be told apart while judging. Not a design choice.
const movedMat = plateMat.clone();
movedMat.color = new THREE.Color(0x232a33);

/**
 * ANCHORS. Section i is the slab of the monument at height band i - the
 * same reading X gives it (cross-sections of the hero). Within its band
 * each slab's centre sits INSIDE one half's real volume: between the cut
 * plane and the outer surface, at a seeded arc position. Side and
 * in-section position come from the seeded stream, the same class of
 * derivation the kernel uses for its material. Nothing is placed by hand.
 */
const rng = mulberry32((SEED ^ 0x2b10c) | 0);
const slabH = FORM_H / SECTIONS;

/**
 * THE BODY STAYS A BODY. The first hero-anchored pass rendered each
 * section as one small tray on one seeded side, so the monument
 * dissolved into a rack of floating shelves - photographed 2026-08-30.
 * A cross-section of the Split Spire at height t is BOTH halves at
 * their full real extent, so each band renders both, sized by the form
 * maths, and consecutive bands touch. Where nothing changed the stone
 * reads as one solid mass, which is what makes the seven departures
 * legible as departures.
 *
 * The mobile piece per band is the slab on the seeded side - the same
 * class of derivation the kernel uses for material. It departs as a
 * SINGLE copy along its spall direction, leaving its socket open:
 * Jacob's sketch, literally. The gap between its empty socket and
 * where it now hangs IS the distance between the two futures.
 */
interface Band {
  gap: number;
  mobile: 0 | 1;
  dir: THREE.Vector3;
}
const bands: Band[] = [];
const field = new THREE.Group();
let placed = 0;

for (let i = 0; i < SECTIONS; i++) {
  const t = (i + 0.5) / SECTIONS;
  const mobile = (rng() < 0.5 ? 0 : 1) as 0 | 1;
  const u = rng();
  const gap = finalGaps[i]!;

  const dirs: THREE.Vector3[] = [];
  for (const side of [0, 1] as const) {
    const c = prongCentre(t, side);
    const sp = surfacePoint(t, side, u);
    // outward through the skin at the seeded arc point: the spall
    // direction proxy (no 3D stress tensor exists; a loaded piece
    // exits through its nearest free surface)
    dirs.push(new THREE.Vector3(sp.x - c.x, 0, sp.z - c.z).normalize());

    // the half's real extent at this height, from the form maths
    const inner = cutPlaneX(t, side);
    const outer = sp.x; // x of the surface at u ~ outer reach direction
    const reach = Math.abs(surfacePoint(t, side, 0.5).x - inner);
    const depth = Math.abs(surfacePoint(t, side, 0).z) * 2;
    const w = Math.max(2, reach);
    const d = Math.max(2, depth);
    const cx = inner + Math.sign(outer - inner || (side === 0 ? -1 : 1)) * (w / 2);

    const geo = new THREE.BoxGeometry(w, slabH * 0.98, d);
    const m = new THREE.Mesh(geo, side === mobile && gap > VISIBLE ? movedMat : plateMat);
    m.position.set(cx, t * FORM_H, 0);
    if (side === mobile && gap > 0) {
      // the departure: hero position + spall direction x real delta
      m.position.addScaledVector(dirs[side]!, gap * GAP_SCALE);
    }
    field.add(m);
  }
  bands.push({ gap, mobile, dir: dirs[mobile]! });
  if (gap > VISIBLE) placed++;
}
scene.add(field);

// THE SEAM, at the hero's own cleft: x = 0 down the slit axis. This is
// the one line the visitor has followed since the hero frame, in its
// real location. Crude billboard box, not the real treatment.
{
  const g = new THREE.BoxGeometry(1.2, FORM_H, 1.2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xd9b070 }));
  m.position.set(0, FORM_H / 2, 0);
  scene.add(m);
}

/**
 * INSIDE-CAMERA STATIONS, at the field's real features. The visitor's
 * own axis is the cleft - they entered through the seam - so most
 * stations stand in or near the slit and look out into the opened
 * volume. Nothing is framed from outside.
 */
const sorted = [...visibleIdx].sort((a, b) => b[0] - a[0]);
const widestIdx = sorted[0]![1];
const widestBand = bands[widestIdx]!;
const widestY = ((widestIdx + 0.5) / SECTIONS) * FORM_H;
// the middle of the widest departure: between the open socket and the
// piece now hanging in space
const socket = new THREE.Vector3(cutPlaneX((widestIdx + 0.5) / SECTIONS, widestBand.mobile), widestY, 0);
const widestMid = socket.clone().addScaledVector(widestBand.dir, (widestBand.gap * GAP_SCALE) / 2);

const views: Array<{ name: string; pos: THREE.Vector3; look: THREE.Vector3 }> = [
  {
    name: 'in the cleft at mid height, looking up the seam',
    pos: new THREE.Vector3(0.5, FORM_H * 0.42, 3),
    look: new THREE.Vector3(-4, FORM_H * 0.95, -14)
  },
  {
    name: 'standing in the widest opening, looking back at the body',
    pos: widestMid.clone(),
    look: new THREE.Vector3(0, widestY + 8, 0)
  },
  {
    // from just past the departed piece, looking back through its open
    // socket at the body and the seam: the piece's edge is foreground,
    // the wound it left is the subject. A first placement looked OUTWARD
    // along the departure into fog and framed nothing (2026-08-30).
    name: 'beside the departed piece, looking back through its socket',
    pos: socket.clone().addScaledVector(widestBand.dir, widestBand.gap * GAP_SCALE * 1.18).add(new THREE.Vector3(0, 9, 14)),
    look: new THREE.Vector3(0, widestY - 6, 0)
  },
  {
    // IN THE SLIT at the flare - the doorway itself. The first
    // placement sat at x ~ 8.7, which is inside the right half's stone
    // at that height: backface-culled, a pure black frame (2026-08-30).
    // The open air down here is the slit, x within +/-4.7.
    name: 'in the doorway at the foot, looking up the slit',
    pos: new THREE.Vector3(1.4, FORM_H * 0.07, 3),
    look: new THREE.Vector3(-3, FORM_H * 0.9, -8)
  },
  {
    name: 'high in the slit, looking down into the opened volume',
    pos: new THREE.Vector3(-0.5, FORM_H * 0.86, 2),
    look: new THREE.Vector3(30, FORM_H * 0.15, 40)
  },
  {
    name: 'among the departed pieces, oblique across the field',
    pos: widestMid.clone().add(new THREE.Vector3(-14, 10, 18)),
    look: new THREE.Vector3(10, FORM_H * 0.55, -30)
  }
];

const hud = document.getElementById('hud')!;
let current = 0;

function setView(i: number): void {
  current = ((i % views.length) + views.length) % views.length;
  const v = views[current]!;
  camera.position.copy(v.pos);
  camera.lookAt(v.look);
  hud.textContent =
    `Z BLOCKOUT · hero-anchored · disposable\n` +
    `view ${current + 1}/${views.length}  ${v.name}\n` +
    `${placed} visible gaps of ${SECTIONS} sections\n` +
    `[arrow keys or click to change view]`;
  renderer.render(scene, camera);
}

addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setView(current + 1);
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setView(current - 1);
});
addEventListener('click', () => setView(current + 1));
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  setView(current);
});

setView(0);

// capture handle: photograph stations without clicking through
(window as unknown as Record<string, unknown>).__bo = {
  view: (i: number) => {
    setView(i);
    return views[current]!.name;
  },
  count: views.length,
  // measure, never guess
  debug: () => {
    const box = new THREE.Box3().setFromObject(field);
    const size = box.getSize(new THREE.Vector3());
    let nearest = Infinity;
    field.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        nearest = Math.min(nearest, camera.position.distanceTo(o.position));
      }
    });
    return {
      fieldSize: [Math.round(size.x), Math.round(size.y), Math.round(size.z)],
      cam: camera.position.toArray().map((v) => Math.round(v)),
      nearestPlate: Math.round(nearest),
      plates: field.children.length
    };
  },
  stats: () => ({
    visibleGaps: placed,
    sections: SECTIONS,
    widest,
    ratio: widest / Math.min(...visibleIdx.map((v) => v[0]))
  })
};

// static frame: nothing here animates. The question is compositional.
