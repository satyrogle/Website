/**
 * THE GRAIN — the plain.
 *
 * Third attempt, and the one that follows the diagnosis instead of guessing.
 *
 * What failed twice: masses built from box primitives. They read as loose
 * blocks at every size and count. And heightfield masses with the plate layer
 * STRIPPED OUT for budget, which read as smooth lumps, because the plate layer
 * is the entire reason this material looks like stone. Removing it and then
 * concluding the method did not work was the mistake.
 *
 * So: every mass is a full F3 heightfield with a coarser plate layer, one
 * seeded run of the same generator each. 15 to 20k triangles apiece.
 *
 * ?view=face shows the near mass close up.
 */
import {
  AmbientLight,
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

const SEEDS = [20260831, 4417, 90210, 777123, 313, 55501, 8888, 24601];
const COUNT = 22;
const PLACE_SEED = 20260831;
const GROUND_Y = -1.55;
const RAKE_AZIMUTH = -82;
const RAKE_ELEVATION = 10;

const faceView = new URLSearchParams(location.search).get('view') === 'face';

const canvas = document.querySelector<HTMLCanvasElement>('#grain')!;
const status = document.querySelector<HTMLElement>('#status')!;

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = AgXToneMapping;
renderer.toneMappingExposure = faceView ? 0.52 : 0.7;
renderer.outputColorSpace = SRGBColorSpace;
// Without cast shadows nothing is planted: every mass looked like it was
// hovering a few metres above a grey floor. A raking light also throws long
// shadows, which is most of what the approved plain's ground reads as.
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;

// The air is LIGHTER than the stone. That contrast is the whole read: dark
// masses standing as silhouettes inside mid-dark air. Matching air to rock
// gives an empty black frame with nothing in it.
const AIR = new Color('#1a1f25');

const scene = new Scene();
scene.background = AIR;
scene.fog = new FogExp2(AIR.getHex(), faceView ? 0.010 : 0.0026);

const camera = new PerspectiveCamera(faceView ? 42 : 34, 1, 0.4, 1600);

scene.add(new HemisphereLight(0xaebdd6, 0x05070a, 0.14));
scene.add(new AmbientLight(0x0d1116, 0.1));

const rake = new DirectionalLight(0xfcfbf7, 9.5);
{
  const az = (RAKE_AZIMUTH * Math.PI) / 180;
  const el = (RAKE_ELEVATION * Math.PI) / 180;
  rake.position.set(
    Math.cos(el) * Math.sin(az) * 500,
    Math.sin(el) * 500,
    Math.cos(el) * Math.cos(az) * 500,
  );
}
rake.castShadow = true;
rake.shadow.mapSize.set(2048, 2048);
rake.shadow.camera.near = 1;
rake.shadow.camera.far = 1400;
rake.shadow.camera.left = -320;
rake.shadow.camera.right = 320;
rake.shadow.camera.top = 320;
rake.shadow.camera.bottom = -320;
rake.shadow.bias = -0.0012;
scene.add(rake);
scene.add(rake.target);

const slate = new MeshStandardMaterial({
  color: new Color(0.03, 0.032, 0.036),
  roughness: 0.6,
  metalness: 0,
  flatShading: true,
});

// clearly lighter than black, or the masses float in grey with no horizon
const ground = new Mesh(
  new PlaneGeometry(4000, 4000),
  new MeshStandardMaterial({
    // lighter than black so there is a floor, darker than the air so the
    // horizon reads the right way round
    color: new Color(0.026, 0.028, 0.031),
    roughness: 0.95,
  }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
ground.position.y = GROUND_Y;
scene.add(ground);

function buildTrack(): Mesh {
  const pts: number[] = [];
  const idx: number[] = [];
  const N = 200;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const z = 60 - t * 520;
    const x = Math.sin(t * 3.4) * 26 + Math.sin(t * 1.1 + 1.6) * 48 - 6;
    const w = 0.5;
    pts.push(x - w, GROUND_Y + 0.03, z, x + w, GROUND_Y + 0.03, z);
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
      color: new Color(0.10, 0.104, 0.11),
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

const t0 = performance.now();

(async () => {
  const masses = await Promise.all(
    SEEDS.map((s) => load(`./models/grain-far-${s}.glb`)),
  );
  const near = faceView ? await load('./models/grain-near-20260831.glb') : null;

  let tris = 0;
  const paint = (o: Object3D) =>
    o.traverse((c) => {
      const m = c as Mesh;
      if (!m.isMesh) return;
      m.material = slate;
      m.castShadow = true;
      m.receiveShadow = true;
      const p = m.geometry.getAttribute('position');
      tris += (m.geometry.index ? m.geometry.index.count : p.count) / 3;
    });

  if (faceView && near) {
    near.position.set(0, 0, 0);
    scene.add(near);
    paint(near);
    camera.position.set(11.4, 4.9, 21.5);
    camera.lookAt(11.4, 4.9, 0);
  } else {
    // DEPTH BANDS, not a ring. A ring puts every mass at one apparent size in
    // one horizontal stripe: no near, no far, and therefore no scale.
    const field = new Group();
    const rnd = lcg(PLACE_SEED);
    for (let i = 0; i < COUNT; i++) {
      const src = masses[i % masses.length]!;
      const inst = src.clone(true);
      const t = (i + rnd() * 0.8) / COUNT;
      // nothing closer than about ninety metres: from a forty metre camera a
      // nearer mass is seen from above and reads as a plateau, not a monument
      const z = 62 - Math.pow(t, 0.8) * 470;
      const spread = 40 + t * 300;
      let x = (rnd() - 0.5) * 2 * spread;
      // keep the near ones out of the middle so the view down the plain is open
      if (t < 0.3 && Math.abs(x) < 30) x += x < 0 ? -34 : 34;
      inst.position.set(x, 0, z);
      inst.rotation.y = rnd() * Math.PI * 2;
      const s = 0.7 + rnd() * 0.75;
      inst.scale.set(s, 0.8 + rnd() * 0.7, s);
      field.add(inst);
    }
    scene.add(field);
    paint(field);

    camera.position.set(6, 26, 176);
    camera.lookAt(-10, 4, -200);
  }

  status.textContent = `${faceView ? 1 : COUNT} masses · ${Math.round(tris / 1000)}k triangles · ${Math.round(performance.now() - t0)}ms`;
  resize();
})().catch((e) => {
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
