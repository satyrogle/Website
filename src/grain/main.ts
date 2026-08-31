/**
 * THE GRAIN — F3 surface probe.
 *
 * One vertical slice, nothing more: does the mass built in Blender survive the
 * trip into WebGL and still read as folded, shattered rock? Separate page and
 * separate entry so the existing act is untouched while this is answered.
 *
 * The Blender render is the look target. This is the thing that ships.
 */
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  AgXToneMapping,
  SRGBColorSpace,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

const MODEL = './models/grain-f3-20260831.glb';

// Straight from the generator's own constants, so the probe and the render
// look at the same thing.
const WALL_W = 26;
const EYE = 4.9;

// Matched to the locked frame, not invented. Void and carbon from the colour
// grammar; the rake skims the face so only outward plate edges catch it.
const VOID = new Color('#020304');
const FOG = new Color('#0b0e12');
const RAKE_AZIMUTH = -82;   // degrees. Same law as the Blender scene: near
const RAKE_ELEVATION = 10;  // parallel to the wall, or it floodlights it.

const canvas = document.querySelector<HTMLCanvasElement>('#grain')!;
const status = document.querySelector<HTMLElement>('#status')!;

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = AgXToneMapping;
renderer.toneMappingExposure = 0.52;
renderer.outputColorSpace = SRGBColorSpace;

const scene = new Scene();
scene.background = VOID;
scene.fog = new FogExp2(FOG.getHex(), 0.012);

const camera = new PerspectiveCamera(42, 1, 0.5, 900);

// Ambient has to stay low or it floodlights the face and the rake buys
// nothing, which is the same mistake that cost hours in Blender.
const sky = new HemisphereLight(0xaebdd6, 0x05070a, 0.13);
scene.add(sky);
scene.add(new AmbientLight(0x0d1116, 0.10));

const rake = new DirectionalLight(0xfcfbf7, 13.0);
{
  const az = (RAKE_AZIMUTH * Math.PI) / 180;
  const el = (RAKE_ELEVATION * Math.PI) / 180;
  rake.position.set(
    Math.cos(el) * Math.sin(az) * 100,
    Math.sin(el) * 100,
    Math.cos(el) * Math.cos(az) * 100,
  );
}
scene.add(rake);

const slate = new MeshStandardMaterial({
  // low albedo and a hard rake: the same trade the Blender scene needed.
  // Raising light without dropping albedo just washes the whole face out.
  color: new Color(0.030, 0.032, 0.036),
  roughness: 0.60,
  metalness: 0.0,
  flatShading: true,
});

const root = new Group();
scene.add(root);

// orbit, kept deliberately crude: this is a probe, not the experience
let yaw = 0;
let pitch = 0.06;
let dist = 30;
let target = new Vector3();
let dragging = false;
let lastX = 0;
let lastY = 0;

canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointerup', (e) => {
  dragging = false;
  canvas.releasePointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  yaw -= (e.clientX - lastX) * 0.005;
  pitch = Math.max(-1.1, Math.min(1.1, pitch - (e.clientY - lastY) * 0.004));
  lastX = e.clientX;
  lastY = e.clientY;
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    dist = Math.max(4, Math.min(160, dist * (1 + Math.sign(e.deltaY) * 0.12)));
  },
  { passive: false },
);

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
  camera.position.set(
    target.x + Math.sin(yaw) * Math.cos(pitch) * dist,
    target.y + Math.sin(pitch) * dist,
    target.z + Math.cos(yaw) * Math.cos(pitch) * dist,
  );
  camera.lookAt(target);
  renderer.render(scene, camera);
}

const draco = new DRACOLoader();
draco.setDecoderPath('./draco/');
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);

const t0 = performance.now();
loader.load(
  MODEL,
  (gltf) => {
    let tris = 0;
    gltf.scene.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      m.material = slate;
      const pos = m.geometry.getAttribute('position');
      tris += (m.geometry.index ? m.geometry.index.count : pos.count) / 3;
    });
    root.add(gltf.scene);

    // Frame the face the way the approved F3 does: standing at the foot of
    // the wall, not looking at the whole object. These are the Blender scene's
    // own coordinates, not a bounding box fit: the box includes a skirt that
    // runs nine metres underground and dragged the camera below the floor.
    const box = new Box3().setFromObject(root);
    target.set(WALL_W * 0.44, EYE, 0);
    dist = 21.5;
    yaw = 0;
    pitch = 0;

    const b = box.min.toArray().concat(box.max.toArray()).map((v) => Math.round(v));
    console.info('grain bounds', b.join(' '));

    const ms = Math.round(performance.now() - t0);
    status.textContent =
      `${Math.round(tris / 1000)}k triangles · ${ms}ms · drag to orbit, wheel to zoom`;
    resize();
  },
  undefined,
  (err) => {
    status.textContent = `failed to load: ${String(err)}`;
  },
);

resize();
frame();
