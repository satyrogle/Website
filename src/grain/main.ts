/**
 * THE GRAIN — the plain, with live tuning.
 *
 * Every mass is one seeded run of the same generator: a folded body with the
 * laminae carved out of it by an erosion field, plus a plate layer standing off
 * the surface. That plate layer is the whole reason it reads as stone, and
 * stripping it for budget is what made the first two attempts fail.
 *
 * The panel exists because composition is Jacob's call and I was guessing at it
 * from screenshots. Drag it, hit copy, and the numbers get baked in as defaults.
 *
 * ?view=face shows the near mass close up.
 */
import {
  AmbientLight,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  FogExp2,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
  AgXToneMapping,
  SRGBColorSpace,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { buildPanel, type Group as PanelGroup } from './panel';

// Four OUTCOMES of one break, two seeds each, all built by the same
// heightfield method. Eight rotations of one silhouette read as repetition
// and no slider fixed it, because it was the content and not the framing.
// Photoscanned CC0 rock from Poly Haven. A day of generators produced shrubs,
// then loose blocks, then leaves. These are photographs of stone. The scanned
// surface detail is kept; the albedo is overridden to our near-black slate,
// because scanned coastal rock is grey-brown and this world is not.
//
// EVALUATION ONLY at this size: 27MB of source meshes. If it works they get
// decimated and re-exported to a web budget.
const MODELS = [
  'rock_face_01', 'rock_face_02', 'namaqualand_cliff_01',
  'namaqualand_cliff_02', 'mountainside',
];
const scanUrl = (id: string) => `./scans/${id}/${id}_1k.gltf`;
const PLACE_SEED = 20260831;
const GROUND_Y = -1.55;

const faceView = new URLSearchParams(location.search).get('view') === 'face';

// Integers throughout, so the sliders are honest and the copied values paste
// back cleanly. Anything that needs a fraction carries its scale in its name.
const P: Record<string, number> = {
  camY: 15, camZ: 168, camTargetY: 11, camTargetZ: -220, fov: 34,
  fogDensity: 26, airLight: 26, exposure: 70, groundLight: 26,
  lightAz: -82, lightEl: 10, lightInt: 95, ambient: 14,
  count: 30, nearZ: 40, depth: 300, spreadNear: 55, spreadFar: 220,
  widthMin: 42, widthSpan: 46, heightMin: 90, heightSpan: 130,
};

const GROUPS: PanelGroup[] = [
  {
    title: 'camera',
    fields: [
      { key: 'camY', label: 'height', min: 2, max: 90, step: 1 },
      { key: 'camZ', label: 'stand off', min: 40, max: 400, step: 2 },
      { key: 'camTargetY', label: 'aim height', min: -20, max: 60, step: 1 },
      { key: 'camTargetZ', label: 'aim depth', min: -600, max: 0, step: 5 },
      { key: 'fov', label: 'lens (fov)', min: 12, max: 70, step: 1 },
    ],
  },
  {
    title: 'air',
    fields: [
      { key: 'fogDensity', label: 'fog x1e-4', min: 2, max: 90, step: 1 },
      { key: 'airLight', label: 'air value', min: 4, max: 80, step: 1 },
      { key: 'groundLight', label: 'ground value', min: 2, max: 90, step: 1 },
      { key: 'exposure', label: 'exposure x1e-2', min: 15, max: 180, step: 1 },
    ],
  },
  {
    title: 'light',
    fields: [
      { key: 'lightAz', label: 'rake azimuth', min: -90, max: -20, step: 1 },
      { key: 'lightEl', label: 'rake elevation', min: 2, max: 60, step: 1 },
      { key: 'lightInt', label: 'rake strength x1e-1', min: 5, max: 300, step: 5 },
      { key: 'ambient', label: 'ambient x1e-2', min: 0, max: 90, step: 1 },
    ],
  },
  {
    title: 'masses',
    fields: [
      { key: 'count', label: 'count', min: 4, max: 60, step: 1, heavy: true },
      { key: 'nearZ', label: 'nearest', min: -40, max: 140, step: 2, heavy: true },
      { key: 'depth', label: 'depth of field', min: 120, max: 900, step: 10, heavy: true },
      { key: 'spreadNear', label: 'spread near', min: 10, max: 200, step: 5, heavy: true },
      { key: 'spreadFar', label: 'spread far', min: 40, max: 600, step: 10, heavy: true },
      { key: 'widthMin', label: 'width min x1e-2', min: 15, max: 150, step: 1, heavy: true },
      { key: 'widthSpan', label: 'width span x1e-2', min: 0, max: 150, step: 1, heavy: true },
      { key: 'heightMin', label: 'height min x1e-2', min: 30, max: 300, step: 5, heavy: true },
      { key: 'heightSpan', label: 'height span x1e-2', min: 0, max: 250, step: 5, heavy: true },
    ],
  },
];

const canvas = document.querySelector<HTMLCanvasElement>('#grain')!;
const status = document.querySelector<HTMLElement>('#status')!;

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = AgXToneMapping;
renderer.outputColorSpace = SRGBColorSpace;
// Without cast shadows nothing is planted and every mass hovers above the floor.
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;

const scene = new Scene();
const AIR = new Color();
const camera = new PerspectiveCamera(34, 1, 0.4, 1600);

const hemi = new HemisphereLight(0xaebdd6, 0x05070a, 0.14);
const amb = new AmbientLight(0x0d1116, 0.1);
scene.add(hemi, amb);

const rake = new DirectionalLight(0xfcfbf7, 9.5);
rake.castShadow = true;
rake.shadow.mapSize.set(2048, 2048);
rake.shadow.camera.near = 1;
rake.shadow.camera.far = 1600;
rake.shadow.camera.left = -360;
rake.shadow.camera.right = 360;
rake.shadow.camera.top = 360;
rake.shadow.camera.bottom = -360;
rake.shadow.bias = -0.0012;
scene.add(rake, rake.target);

const slate = new MeshStandardMaterial({
  color: new Color(0.03, 0.032, 0.036),
  roughness: 0.6,
  metalness: 0,
  flatShading: true,
});
const groundMat = new MeshStandardMaterial({ color: new Color(), roughness: 0.95 });

const ground = new Mesh(new PlaneGeometry(4000, 4000), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = GROUND_Y;
ground.receiveShadow = true;
scene.add(ground);

function buildTrack(): Mesh {
  const pts: number[] = [];
  const idx: number[] = [];
  const N = 200;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const z = 60 - t * 520;
    const x = Math.sin(t * 3.4) * 26 + Math.sin(t * 1.1 + 1.6) * 48 - 6;
    pts.push(x - 0.5, GROUND_Y + 0.03, z, x + 0.5, GROUND_Y + 0.03, z);
    if (i < N - 1) {
      const a = i * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new Mesh(
    g,
    new MeshStandardMaterial({
      color: new Color(0.1, 0.104, 0.11),
      roughness: 0.8,
      side: DoubleSide,
    }),
  );
}
scene.add(buildTrack());

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1103515245, s) + 12345) >>> 0;
    return s / 4294967296;
  };
}

const draco = new DRACOLoader();
draco.setDecoderPath('./draco/');
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);
const load = (u: string): Promise<Object3D> =>
  new Promise((res, rej) => loader.load(u, (g) => res(g.scene), undefined, rej));

let sources: Object3D[] = [];
let field: Group | null = null;
let tris = 0;

function paint(o: Object3D) {
  o.traverse((c) => {
    const m = c as Mesh;
    if (!m.isMesh) return;
    // keep the scan's normal and roughness maps, take our own colour
    const src = m.material as MeshStandardMaterial | MeshStandardMaterial[];
    const one = Array.isArray(src) ? src[0] : src;
    if (one instanceof MeshStandardMaterial) {
      const mat = one.clone();
      mat.color.copy(slate.color);
      mat.roughness = 0.72;
      mat.metalness = 0;
      mat.map = null;
      m.material = mat;
    } else {
      m.material = slate;
    }
    m.castShadow = true;
    m.receiveShadow = true;
    const p = m.geometry.getAttribute('position');
    tris += (m.geometry.index ? m.geometry.index.count : p.count) / 3;
  });
}

function rebuildField() {
  if (field) {
    scene.remove(field);
    field = null;
  }
  tris = 0;
  const g = new Group();
  const rnd = lcg(PLACE_SEED);
  const n = Math.round(P.count!);
  for (let i = 0; i < n; i++) {
    const inst = sources[Math.floor(rnd() * sources.length)]!.clone(true);
    // Depth bands, never a ring. A ring puts every mass at one apparent size in
    // a single stripe: no near, no far, and so no scale at all.
    const t = (i + rnd() * 0.8) / n;
    const z = P.nearZ! - Math.pow(t, 0.8) * P.depth!;
    const spread = P.spreadNear! + t * P.spreadFar!;
    let x = (rnd() - 0.5) * 2 * spread;
    if (t < 0.3 && Math.abs(x) < 30) x += x < 0 ? -34 : 34;
    inst.position.set(x, 0, z);
    inst.updateMatrixWorld(true);
    inst.rotation.y = rnd() * Math.PI * 2;
    // UNIFORM scale only. Non-uniform scaling destroys scanned geometry, which
    // is what turned these into wisps. And the scans are natively a few metres
    // while the plain expects tens, so each one is normalised to a target
    // height from its own bounding box first.
    const box = new Box3().setFromObject(inst);
    const nativeH = Math.max(box.max.y - box.min.y, 0.001);
    const target = (P.heightMin! + rnd() * P.heightSpan!) / 100 * 14;
    const s = target / nativeH;
    inst.scale.setScalar(s);
    // sit it on the ground whatever its own origin was
    inst.position.y = -box.min.y * s + GROUND_Y;
    g.add(inst);
  }
  scene.add(g);
  field = g;
  paint(g);
  status.textContent = `${n} masses · ${Math.round(tris / 1000)}k triangles`;
}

function apply() {
  AIR.setRGB(P.airLight! / 400, (P.airLight! + 2) / 400, (P.airLight! + 6) / 400);
  scene.background = AIR;
  // The air is lighter than the stone. That contrast is the whole read: dark
  // masses as silhouettes inside mid-dark air.
  scene.fog = new FogExp2(AIR.getHex(), P.fogDensity! * 1e-4);
  groundMat.color.setRGB(
    P.groundLight! / 900,
    (P.groundLight! + 1) / 900,
    (P.groundLight! + 3) / 900,
  );
  renderer.toneMappingExposure = P.exposure! / 100;

  const az = (P.lightAz! * Math.PI) / 180;
  const el = (P.lightEl! * Math.PI) / 180;
  rake.position.set(
    Math.cos(el) * Math.sin(az) * 500,
    Math.sin(el) * 500,
    Math.cos(el) * Math.cos(az) * 500,
  );
  rake.intensity = P.lightInt! / 10;
  hemi.intensity = P.ambient! / 100;
  amb.intensity = P.ambient! / 140;

  camera.fov = P.fov!;
  camera.position.set(6, P.camY!, P.camZ!);
  camera.lookAt(-10, P.camTargetY!, P.camTargetZ!);
  camera.updateProjectionMatrix();
}

const t0 = performance.now();

async function boot() {
  if (faceView) {
    const near = await load('./models/grain-near-20260831.glb');
    scene.add(near);
    paint(near);
    Object.assign(P, {
      camY: 5, camZ: 22, camTargetY: 5, camTargetZ: 0,
      fov: 42, exposure: 52, fogDensity: 100,
    });
    apply();
    camera.position.set(11.4, 4.9, 21.5);
    camera.lookAt(11.4, 4.9, 0);
    status.textContent = `1 mass · ${Math.round(tris / 1000)}k triangles`;
    resize();
    return;
  }

  sources = await Promise.all(MODELS.map((m) => load(scanUrl(m))));
  buildPanel(
    GROUPS,
    P,
    (_key, heavy) => {
      if (heavy) rebuildField();
      apply();
    },
    'grain-tuning-v1',
  );
  rebuildField();
  apply();
  status.textContent += ` · ${Math.round(performance.now() - t0)}ms`;
  resize();
}

boot().catch((e) => {
  status.textContent = `failed: ${String(e)}`;
});

function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

function frame() {
  requestAnimationFrame(frame);
  renderer.render(scene, camera);
}
resize();
frame();
