/**
 * THE GRAIN — the plain.
 *
 * F3 on its own is a wall filling the screen, because that is what F3 is: the
 * close up, frame three of six. It only means anything after the plain it sits
 * in. This builds the plain.
 *
 * Every mass is a separate run of the same seeded generator. Eight distinct
 * distance-tier meshes at 8k triangles each, instanced with seeded placement,
 * plus one full-detail mass in the near ground. That is "same rule, different
 * outcome" as the literal build method rather than a claim about one.
 *
 * ?view=face shows the near mass close up instead.
 */
import {
  AmbientLight,
  Color,
  DirectionalLight,
  DoubleSide,
  FogExp2,
  Group,
  Mesh,
  MeshStandardMaterial,
  HemisphereLight,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
  AgXToneMapping,
  SRGBColorSpace,
  BufferGeometry,
  BufferAttribute,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

const FAR_SEEDS = [20260831, 4417, 90210, 777123, 313, 55501, 8888, 24601];
const NEAR = './models/grain-near-20260831.glb';
const FAR_COUNT = 26;
const PLACE_SEED = 20260831;

const WALL_W = 26;
const GROUND_Y = -1.55;
const RAKE_AZIMUTH = -82;
const RAKE_ELEVATION = 10;

const faceView = new URLSearchParams(location.search).get('view') === 'face';

const canvas = document.querySelector<HTMLCanvasElement>('#grain')!;
const status = document.querySelector<HTMLElement>('#status')!;

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = AgXToneMapping;
renderer.toneMappingExposure = faceView ? 0.52 : 0.85;
renderer.outputColorSpace = SRGBColorSpace;

const scene = new Scene();
// The fog is LIGHTER than the stone. That contrast is the entire F1 read:
// dark masses standing as silhouettes inside mid-dark air. Matching the fog
// to the rock, as this did at first, leaves an empty black frame.
const AIR = new Color('#1c2127');
scene.background = AIR;
// Atmosphere is the term every dead carrier was missing. The far masses have
// to be eaten by it, or the plain reads as a diorama instead of a distance.
scene.fog = new FogExp2(AIR.getHex(), faceView ? 0.010 : 0.0030);

const camera = new PerspectiveCamera(faceView ? 42 : 26, 1, 0.5, 2000);

// Ambient stays low or it floodlights the faces and the rake buys nothing,
// which is the mistake that cost hours in Cycles before it cost any here.
scene.add(new HemisphereLight(0xaebdd6, 0x05070a, 0.13));
scene.add(new AmbientLight(0x0d1116, 0.1));

const rake = new DirectionalLight(0xfcfbf7, 13.0);
{
  const az = (RAKE_AZIMUTH * Math.PI) / 180;
  const el = (RAKE_ELEVATION * Math.PI) / 180;
  rake.position.set(
    Math.cos(el) * Math.sin(az) * 400,
    Math.sin(el) * 400,
    Math.cos(el) * Math.cos(az) * 400,
  );
}
scene.add(rake);

const slate = new MeshStandardMaterial({
  color: new Color(0.03, 0.032, 0.036),
  roughness: 0.6,
  metalness: 0,
  flatShading: true,
});

const groundMat = new MeshStandardMaterial({
  color: new Color(0.012, 0.013, 0.015),
  roughness: 0.92,
  metalness: 0,
});
const ground = new Mesh(new PlaneGeometry(3000, 3000), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = GROUND_Y;
scene.add(ground);

// the track: F1's only scale cue, and it has to stay a thread
function buildTrack(): Mesh {
  const pts: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const N = 160;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const z = 140 - t * 620;
    const x = Math.sin(t * 4.1) * 34 + Math.sin(t * 1.3 + 2.0) * 62 - 10;
    const w = 0.55;
    pts.push(x - w, GROUND_Y + 0.02, z, x + w, GROUND_Y + 0.02, z);
    uv.push(0, t, 1, t);
    if (i < N - 1) {
      const a = i * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new Mesh(
    g,
    new MeshStandardMaterial({
      color: new Color(0.10, 0.105, 0.112),
      roughness: 0.75,
      side: DoubleSide,
    }),
  );
}
scene.add(buildTrack());

// seeded placement: the plain has to be identical every load
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

function load(url: string): Promise<Object3D> {
  return new Promise((res, rej) =>
    loader.load(url, (g) => res(g.scene), undefined, rej),
  );
}

const t0 = performance.now();

(async () => {
  const fars = await Promise.all(
    FAR_SEEDS.map((s) => load(`./models/grain-far-${s}.glb`)),
  );
  const near = await load(NEAR);

  let tris = 0;
  const count = (o: Object3D) =>
    o.traverse((c) => {
      const m = c as Mesh;
      if (!m.isMesh) return;
      m.material = slate;
      const p = m.geometry.getAttribute('position');
      tris += (m.geometry.index ? m.geometry.index.count : p.count) / 3;
    });

  const field = new Group();
  const rnd = lcg(PLACE_SEED);
  for (let i = 0; i < FAR_COUNT; i++) {
    const src = fars[i % fars.length]!;
    const inst = src.clone(true);
    // spread ahead of the camera, never behind it, and thinning with distance
    const ring = 105 + Math.pow(rnd(), 0.62) * 400;
    const ang = (rnd() - 0.5) * 2.3;
    inst.position.set(
      Math.sin(ang) * ring - 20,
      0,
      -Math.cos(ang) * ring + 40,
    );
    inst.rotation.y = rnd() * Math.PI * 2;
    const sc = 0.55 + rnd() * 1.15;
    inst.scale.set(sc, 0.7 + rnd() * 0.85, sc);
    field.add(inst);
  }
  scene.add(field);
  count(field);

  // the near mass: cropped by the left edge, the one that has not finished
  // enters from the left and is cropped by the edge, still ending inside the
  // frame so it stays a member of the population rather than becoming terrain
  near.position.set(-72, 0, 62);
  near.rotation.y = 0.52;
  scene.add(near);
  count(near);

  if (faceView) {
    camera.position.set(WALL_W * 0.44 - 72, 4.9, 62 + 21.5);
    camera.lookAt(WALL_W * 0.44 - 72, 4.9, 62);
  } else {
    // F1: high, long lens, looking down and along
    // F1: high, long lens, looking down and along. Mass in the lower two
    // thirds, upper third flat fog, horizon around a third from the top.
    camera.position.set(10, 42, 205);
    camera.lookAt(-22, -6, -150);
  }

  const ms = Math.round(performance.now() - t0);
  status.textContent = `${FAR_COUNT + 1} masses · ${Math.round(tris / 1000)}k triangles · ${ms}ms`;
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
