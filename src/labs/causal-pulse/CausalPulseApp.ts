/**
 * Causal Pulse spike — isolated laboratory route.
 *
 * One question: does a caused disturbance that travels through the real entity,
 * decays, and leaves a permanent trace make the object meaningfully more
 * compelling? Nothing here touches the production site.
 */

import {
  PerspectiveCamera, Raycaster, Scene, Vector2, Vector3, WebGLRenderer,
} from 'three';

import { loadCausalGraph, nearestNode } from './graph/GraphLoader';
import { PulseClient, type PulseSnapshot } from './simulation/PulseClient';
import { createPulseMaterial, createStateTexture } from './rendering/PulseMaterial';
import { loadAndBindEntity, uploadState } from './rendering/PulseSceneBridge';
import { PulseInspector } from './rendering/PulseInspector';

const ENTITY_URL = `${import.meta.env.BASE_URL}models/DL_Aurora_v13.glb`;
const AUTO_INJECT_AFTER_MS = 2000;

function fail(message: string): void {
  const banner = document.getElementById('lab-error');
  if (banner) {
    banner.textContent = message;
    banner.hidden = false;
  }
  console.error('[causal-pulse]', message);
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('lab-canvas') as HTMLCanvasElement | null;
  const panel = document.getElementById('lab-inspector');
  const status = document.getElementById('lab-status');
  if (!canvas || !panel || !status) throw new Error('lab shell markup missing');

  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x010204, 1);

  if (!renderer.capabilities.isWebGL2) {
    fail('This spike needs WebGL2. The production site is unaffected.');
    return;
  }

  const scene = new Scene();
  const camera = new PerspectiveCamera(38, 1, 0.1, 200);

  const resize = (): void => {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize, { passive: true });

  status.textContent = 'loading graph…';
  const { manifest, graph, vertexNodeIndex } = await loadCausalGraph();

  const client = new PulseClient();
  client.start();
  await client.ready;
  if (client.error) { fail(client.error); return; }

  const calibration = manifest.retainedDisplay;
  if (!calibration) {
    fail('graph-manifest.json has no retainedDisplay — run "node tools/causal-pulse-calibrate.mjs"');
    return;
  }

  const stateTexture = createStateTexture(client.textureSize);
  const material = createPulseMaterial(stateTexture, {
    textureSize: client.textureSize,
    retainedLow: calibration.low,
    retainedHigh: calibration.high,
  });

  status.textContent = 'loading entity…';
  const entity = await loadAndBindEntity(ENTITY_URL, manifest, vertexNodeIndex, material);
  scene.add(entity.root);

  // Frame the entity from its own measured bounds rather than a guessed number.
  const bounds = { min: new Vector3(Infinity, Infinity, Infinity), max: new Vector3(-Infinity, -Infinity, -Infinity) };
  for (let i = 0; i < graph.nodeCount; i++) {
    const p = new Vector3(graph.positions[i * 3], graph.positions[i * 3 + 1], graph.positions[i * 3 + 2]);
    bounds.min.min(p);
    bounds.max.max(p);
  }
  const centre = bounds.min.clone().add(bounds.max).multiplyScalar(0.5);
  const radius = bounds.max.distanceTo(bounds.min) * 0.5;
  camera.position.set(centre.x + radius * 0.35, centre.y + radius * 0.28, centre.z + radius * 1.65);
  camera.lookAt(centre);
  resize();

  const inspector = new PulseInspector(panel);
  inspector.update({
    backend: 'WebGL2',
    nodes: manifest.graph.nodes,
    edges: manifest.graph.edges,
    meanDegree: manifest.graph.degree.mean,
    sourceSha: manifest.source.sha256,
  });

  // ------------------------------------------------------------ interaction
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const haloRole = manifest.roles.indexOf('halo');
  let interacted = false;
  let firstFrameAt = 0;
  const autoInject = new URLSearchParams(location.search).get('auto') !== '0';

  const injectAt = (node: number, label: string): void => {
    client.inject(node, 1);
    status.textContent = label;
  };

  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const hit = raycaster.intersectObjects(entity.meshes, false)[0];
    if (!hit) { status.textContent = 'no surface there — try the mass itself'; return; }

    // The halo is a separate graph component by design; striking it would do
    // nothing, so the strike is snapped to the structure the visitor can see.
    const node = nearestNode(graph, hit.point.x, hit.point.y, hit.point.z, haloRole);
    interacted = true;
    injectAt(node, `struck node ${node} (${manifest.roles[graph.role[node]]})`);
  });

  // ------------------------------------------------------------- frame loop
  const frameTimes: number[] = [];
  let previousFrame = performance.now();
  let held: PulseSnapshot | null = null;

  document.addEventListener('visibilitychange', () => client.setRunning(!document.hidden));

  const render = (): void => {
    requestAnimationFrame(render);

    const now = performance.now();
    const frameMs = now - previousFrame;
    previousFrame = now;
    frameTimes.push(frameMs);
    if (frameTimes.length > 240) frameTimes.shift();

    if (firstFrameAt === 0) firstFrameAt = now;

    // A deterministic disturbance if the visitor does nothing, so the page is
    // never a still object waiting to be poked. Suppressible with ?auto=0 so
    // the capture harness can record a genuine before-state.
    if (autoInject && !interacted && now - firstFrameAt > AUTO_INJECT_AFTER_MS) {
      interacted = true;
      const shardRole = manifest.roles.indexOf('shard');
      let node = 0;
      let bestDegree = -1;
      for (let i = 0; i < graph.nodeCount; i++) {
        if (graph.role[i] !== shardRole) continue;
        const degree = graph.offsets[i + 1] - graph.offsets[i];
        if (degree > bestDegree) { bestDegree = degree; node = i; }
      }
      injectAt(node, `automatic disturbance at node ${node} — click the mass to strike it yourself`);
    }

    const snapshot = client.take();
    if (snapshot) {
      uploadState(stateTexture, snapshot.data);
      if (held) client.release(held);
      held = snapshot;

      const sorted = [...frameTimes].sort((a, b) => a - b);
      inspector.update({
        tick: snapshot.tick,
        simulatedSeconds: snapshot.metrics.simulatedSeconds,
        injections: snapshot.injections,
        reachedNodes: snapshot.metrics.reachedNodes,
        activeNodes: snapshot.metrics.activeNodes,
        retainingNodes: snapshot.metrics.retainingNodes,
        meanRetained: snapshot.metrics.meanRetained,
        maxRetained: snapshot.metrics.maxRetained,
        checksum: snapshot.checksum,
        stepMs: snapshot.stepMs,
        frameMs,
        frameP95: sorted[Math.floor(sorted.length * 0.95)] ?? frameMs,
      });
    }

    renderer.render(scene, camera);
  };

  status.textContent = 'ready — click the mass';
  render();

  // Exposed for the capture harness, which needs to drive a deterministic
  // strike rather than guessing at pixel coordinates.
  Object.assign(window, {
    __causalPulse: {
      inject: (node: number) => { interacted = true; injectAt(node, `scripted strike at ${node}`); },
      state: () => held && {
        ...held.metrics, checksum: held.checksum, injections: held.injections,
      },
      nodeCount: graph.nodeCount,
    },
  });
}

boot().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
