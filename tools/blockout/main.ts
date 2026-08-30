import * as THREE from 'three';
import { computeFamilies, SECTIONS, TICKS } from '../../src/core/Delta';
import { mulberry32 } from '../../src/core/rng';

/**
 * Z BLOCKOUT — DISPOSABLE. Not the production renderer, not imported by
 * src/main.ts, not in the production build. Delete when judged.
 *
 * ONE QUESTION: can the kernel's real gaps produce an inhabited asymmetric
 * space, or do they produce seven slabs and a lot of nothing?
 *
 * So everything here is honest about the DATA and deliberately crude about
 * everything else. Plate positions come from computeDelta's final frame -
 * the real difference between the baseline and the +1 intervention. Nothing
 * is nudged to compose better. If the frame is empty, that is the answer,
 * and inventing a nicer arrangement would destroy the only thing this is
 * for.
 *
 * What is NOT claimed here: materials, lighting, plate silhouettes, scale,
 * the seam. All of that is the approved-frame's job and none of it is
 * decided by this.
 */

const SEED = 20260818;
const fam = computeFamilies(SEED);
const delta = fam.delta.get(1)!;
const finalGaps = delta.frames[TICKS - 1]!.gap;

const widest = Math.max(...finalGaps);
// the same "actually visible" rule delta-verify uses: anything under a
// hundredth of the widest gap is a difference you could not see
const VISIBLE = widest * 0.01;
const visibleIdx = finalGaps.map((g, i) => [g, i] as const).filter(([g]) => g > VISIBLE);

/** the stack runs along Y; this is the spacing between sections */
const RISE = 80;
/** the widest computed gap becomes this many world units of open space */
const GAP_SCALE = 300 / widest;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070a);
scene.fog = new THREE.FogExp2(0x05070a, 0.0016);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.5, 6000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

// enough light to read form, nothing more. This is a blockout: if it only
// works under a beauty rig it does not work.
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

/**
 * THE DIFFERENCE VECTOR. The kernel gives a scalar difference per section;
 * which DIRECTION a pair separates along is not something it computes, so
 * it is seeded per section rather than authored per plate. Multi-axis on
 * purpose - THE_DELTA section 7 requires the field to open around the
 * camera rather than into two parallel walls, and a single shared axis is
 * exactly how it would become a corridor.
 */
const UP = new THREE.Vector3(0, 1, 0);
const rng = mulberry32((SEED ^ 0x2b10c) | 0);
const dirs: THREE.Vector3[] = [];
const sizes: Array<[number, number]> = [];
for (let i = 0; i < SECTIONS; i++) {
  dirs.push(
    new THREE.Vector3(rng() * 2 - 1, (rng() * 2 - 1) * 0.55, rng() * 2 - 1).normalize()
  );
  sizes.push([70 + rng() * 130, 60 + rng() * 110]);
}

const field = new THREE.Group();
let placed = 0;

for (let i = 0; i < SECTIONS; i++) {
  const gap = finalGaps[i]!;
  const [w, d] = sizes[i]!;
  const y = (i - SECTIONS / 2) * RISE;
  const dir = dirs[i]!;
  const half = (gap * GAP_SCALE) / 2;

  // the pair: baseline and altered. Where the gap is nothing they sit on
  // top of each other and read as one plate, which is the rule made
  // literal rather than drawn.
  // A PLATE FACES ACROSS THE VECTOR IT SEPARATES ALONG. The first pass
  // laid every plate flat and stacked them 26 apart, which built a rack
  // of shelves 120-310 wide with 20 units of headroom - the camera could
  // only ever be sandwiched between two horizontal faces. Orienting the
  // thin axis along the difference vector is what makes the pair read as
  // two walls with a space between them.
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
  for (const sign of [-1, 1]) {
    const geo = new THREE.BoxGeometry(w, 4 + rng() * 4, d);
    const m = new THREE.Mesh(geo, plateMat);
    m.position.set(dir.x * half * sign, y + dir.y * half * sign, dir.z * half * sign);
    m.quaternion.copy(q);
    m.rotateY(rng() * Math.PI);
    field.add(m);
  }
  if (gap > VISIBLE) placed++;
}
scene.add(field);

// the causal seam, crudely: one thin vertical line so the frame has the
// scale cue it will eventually get properly. Not the real seam treatment.
{
  const g = new THREE.BoxGeometry(1.6, SECTIONS * RISE, 1.6);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xd9b070 }));
  m.position.set(18, 0, -30);
  scene.add(m);
}

/**
 * INSIDE-CAMERA STATIONS. Placed at the field's real features rather than
 * chosen for flattery: the widest computed gap, the tightest visible one,
 * and two points among the stack. If the composition only works from a
 * viewpoint nothing in the data suggests, it does not work.
 */
const sorted = [...visibleIdx].sort((a, b) => b[0] - a[0]);
const widestIdx = sorted[0]?.[1] ?? 0;
const tightestIdx = sorted[sorted.length - 1]?.[1] ?? 0;

/**
 * The empty middle of a section's pair - the two plates sit at +/- half
 * along the difference vector, so the space BETWEEN them is where a
 * visitor inhabiting the difference actually stands. A first pass put the
 * camera a fixed short distance along the difference vector and buried it
 * inside a plate: the plates are 120-310 wide and the offset was 10.
 */
function between(i: number): THREE.Vector3 {
  return new THREE.Vector3(0, (i - SECTIONS / 2) * RISE, 0);
}
const yOf = (i: number): number => (i - SECTIONS / 2) * RISE;

const views: Array<{ name: string; pos: THREE.Vector3; look: THREE.Vector3 }> = [
  {
    name: 'standing in the widest opening, looking along the stack',
    pos: between(widestIdx).add(new THREE.Vector3(12, 0, 8)),
    look: new THREE.Vector3(40, yOf(widestIdx) + 340, -120)
  },
  {
    name: 'the widest opening, looking across it',
    pos: between(widestIdx).add(new THREE.Vector3(-20, 6, 30)),
    look: new THREE.Vector3(320, yOf(widestIdx) + 40, -280)
  },
  {
    name: 'in the tight region, where the walls nearly touch',
    pos: between(tightestIdx).add(new THREE.Vector3(8, 0, -14)),
    look: new THREE.Vector3(-260, yOf(tightestIdx) + 180, 300)
  },
  {
    name: 'low in the stack, looking up through it',
    pos: new THREE.Vector3(24, yOf(Math.floor(SECTIONS * 0.22)), -18),
    look: new THREE.Vector3(-70, yOf(SECTIONS - 4), -120)
  },
  {
    name: 'high in the stack, looking down through it',
    pos: new THREE.Vector3(-30, yOf(Math.floor(SECTIONS * 0.82)), 26),
    look: new THREE.Vector3(90, yOf(2), 140)
  },
  {
    name: 'mid-field, oblique across the difference vectors',
    pos: new THREE.Vector3(-16, 10, 34),
    look: new THREE.Vector3(300, -260, -340)
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
    `Z BLOCKOUT · disposable\n` +
    `view ${current + 1}/${views.length}  ${v.name}\n` +
    `${placed} visible gaps of ${SECTIONS} sections\n` +
    `widest/narrowest visible: ${(widest / Math.min(...visibleIdx.map((v2) => v2[0]))).toFixed(1)}x\n` +
    `[arrow keys or click to change view]`;
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
});

setView(0);
renderer.render(scene, camera);

// capture handle, so views can be photographed without clicking through
(window as unknown as Record<string, unknown>).__bo = {
  view: (i: number) => {
    setView(i);
    renderer.render(scene, camera);
    return views[current]!.name;
  },
  count: views.length,
  // measure, never guess: where the geometry actually is, and where the
  // camera actually is inside it
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
