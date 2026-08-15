/**
 * Act I kill test — black, the field, the first mechanism beat, and TOUCH IT.
 *
 * Deliberately outside the site's boot sequence: this page exists to answer
 * one question, and it is deleted whole if the answer is no. It does not ship
 * (no entry in `vite.config.ts`), so it cannot leak into a build.
 */

import * as THREE from 'three';
import { synthesiseContainment, DEFAULT_CONTAINMENT } from './scene/containment/ContainmentSynth';
import { ContainmentField } from './scene/containment/ContainmentField';
import { Fission, DEFAULT_FISSION } from './scene/containment/Fission';
import { Record } from './scene/containment/Record';
import { Visit } from './scene/containment/Visit';
import { RecordPanel } from './content/RecordPanel';
import { sampleDescent, POSES } from './scene/containment/Descent';
import { Halation } from './scene/containment/Halation';
import { SheetMass } from './scene/containment/SheetMass';
import { SheetRidges } from './scene/containment/SheetRidges';

const canvas = document.getElementById('slice') as HTMLCanvasElement;
const readout = document.getElementById('readout') as HTMLDivElement;
const invite = document.getElementById('invite') as HTMLDivElement;
const skip = document.getElementById('skip') as HTMLAnchorElement;
const descend = document.getElementById('descend') as HTMLButtonElement;
const panel = new RecordPanel(document.getElementById('record') as HTMLElement);
const poseLabel = document.getElementById('pose') as HTMLDivElement;
const showPoses = new URLSearchParams(window.location.search).has('poses');
const rail = document.getElementById('rail') as HTMLDivElement;

/**
 * A camera fly-through is exactly the motion this query exists to prevent, so
 * the reduced-motion path does not travel at all: the visitor stays at OBSERVE,
 * the machine still works, and the floor is offered as a control instead of as
 * a destination. Not a degraded version of the descent — a different route to
 * the same two things, which is what the canon asks of every alternate path.
 */
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The rail has no length until the first mechanism beat is over.
 *
 * Scroll drove the descent from page load, so a visitor who scrolled on
 * arrival met the arrest somewhere between CROSS and REVEAL — the mechanism
 * demonstrated at a camera position that cannot read it, and the opening
 * composition never held long enough to be the thing the descent is later
 * entering.
 *
 * Not a scroll lock: there is simply nowhere to go yet, because the descent
 * does not exist until the structure has been seen doing something. The page
 * is one screen, then it is six. Clamping progress instead would have banked
 * scroll and snapped the camera the moment it released.
 */
const RAIL_LENGTH = '620vh';
rail.style.height = '0';

function openRail(): void {
  if (reduced) return;
  rail.style.height = RAIL_LENGTH;
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setClearColor(0x000000, 1);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
const halation = new Halation(window.innerWidth, window.innerHeight);

const structure = synthesiseContainment(DEFAULT_CONTAINMENT);
const field = new ContainmentField(structure);
const fission = new Fission(structure, DEFAULT_FISSION);
// The file is opened before anything is drawn: the visit index decides how
// this visit's record will fail, and the count the visitor sees on arrival is
// whatever the system was already holding against them.
const visit = new Visit(Date.now());
const record = new Record(structure.graph.positions, structure.seeds, visit.seed, visit.index);
// Level 1 first: the silhouette occludes, and everything else depth-tests
// against it.
const mass = new SheetMass();
// Level 2 between the silhouette and the fibres. Without a scale in between,
// a surface has no material.
const ridges = new SheetRidges(structure);
scene.add(mass.object, ridges.object, field.object);

/**
 * Where the visitor is on the rail, 0 at OBSERVE and 1 at REVEAL.
 *
 * Read from scroll, then eased toward: a camera bolted rigidly to the
 * scrollbar transmits every notch of a mouse wheel as a jolt, and the descent
 * has to feel like travel rather than like a slider. The easing is a lag, not
 * an animation — let go and it stops.
 */
let progress = 0;
let eased = 0;

const readProgress = (): number => {
  if (reduced) return 0;
  const travel = document.documentElement.scrollHeight - window.innerHeight;
  return travel > 0 ? Math.min(Math.max(window.scrollY / travel, 0), 1) : 0;
};

function applyCamera(t: number): void {
  const state = sampleDescent(t);
  camera.position.set(state.position[0], state.position[1], state.position[2]);
  camera.lookAt(state.target[0], state.target[1], state.target[2]);
  if (camera.fov !== state.fov) {
    camera.fov = state.fov;
    camera.updateProjectionMatrix();
  }
  field.setRecession(state.near, state.far);
  // Development scaffolding, off by default.
  //
  // Naming the beat on screen tells the visitor what they are supposed to be
  // feeling instead of testing whether the camera and the structure manage to
  // communicate it themselves — which is the only question this page exists to
  // answer. `?poses` brings it back for authoring.
  if (showPoses) poseLabel.textContent = state.pose;
}

applyCamera(0);

window.addEventListener(
  'scroll',
  () => {
    if (!panel.open) progress = readProgress();
  },
  { passive: true }
);

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const ratio = renderer.getPixelRatio();
  halation.resize(w * ratio, h * ratio);
}
resize();
window.addEventListener('resize', resize);

/** Simulation ticks elapsed, so the record times events by its own clock. */
let clock = 0;

/**
 * Nodes bucketed by position, so a region query is a lookup rather than a scan.
 */
const CELL = 0.55;
const buckets = new Map<number, number[]>();
{
  const p = structure.graph.positions;
  const key = (x: number, y: number, z: number): number =>
    ((Math.floor(x / CELL) + 512) * 1024 + (Math.floor(y / CELL) + 512)) * 1024 +
    (Math.floor(z / CELL) + 512);
  for (let i = 0; i < structure.graph.nodeCount; i++) {
    const k = key(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    const b = buckets.get(k);
    if (b) b.push(i);
    else buckets.set(k, [i]);
  }
}

/** How far around the ray hit the visitor's presence is felt. */
const TOUCH_RADIUS = 0.75;

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

interface Contact {
  region: number[];
  lead: number;
  sheet: number;
}

/**
 * What the visitor is pointing at.
 *
 * A real ray against the surfaces, not a search among the graph. The old
 * version took every junction within a 72px radius and resolved ties by depth,
 * which at this density succeeded at 100% of pixels on screen and could answer
 * seventy pixels from the cursor with a node seven world units from the one
 * being aimed at. There was nowhere to miss and no relationship between where
 * the visitor pointed and what replied.
 *
 * The sheets occlude, so the ray lands on the frontmost lobe — which is the
 * one being looked at. Everything within a short radius of the hit is the
 * region; the nearest node to it leads.
 */
function contactUnder(clientX: number, clientY: number): Contact | null {
  const rect = canvas.getBoundingClientRect();
  ndc.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -(((clientY - rect.top) / rect.height) * 2 - 1)
  );
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(mass.object, false);
  if (!hits.length) return null;

  const hit = hits[0];
  const sheet = mass.sheetAt(hit);
  const { x, y, z } = hit.point;

  const p = structure.graph.positions;
  const r2 = TOUCH_RADIUS * TOUCH_RADIUS;
  const region: number[] = [];
  let lead = -1;
  let bestD = Infinity;

  const bx = Math.floor(x / CELL);
  const by = Math.floor(y / CELL);
  const bz = Math.floor(z / CELL);
  const reach = Math.ceil(TOUCH_RADIUS / CELL);
  for (let i = -reach; i <= reach; i++) {
    for (let j = -reach; j <= reach; j++) {
      for (let k = -reach; k <= reach; k++) {
        const b = buckets.get(((bx + i + 512) * 1024 + (by + j + 512)) * 1024 + (bz + k + 512));
        if (!b) continue;
        for (const n of b) {
          const d = (p[n * 3] - x) ** 2 + (p[n * 3 + 1] - y) ** 2 + (p[n * 3 + 2] - z) ** 2;
          if (d > r2) continue;
          region.push(n);
          // A cascade has to start somewhere it can branch.
          if (d < bestD && structure.graph.offsets[n + 1] - structure.graph.offsets[n] >= 3) {
            bestD = d;
            lead = n;
          }
        }
      }
    }
  }

  if (lead < 0) return null;
  return { region, lead, sheet };
}

/**
 * Seeds ordered by where they land on screen.
 *
 * The structure runs past every edge of the frame, so most of it is not in
 * shot: seeded by graph order the system's own event happened out at the
 * right-hand margin as a short arc, which is a correct simulation of something
 * nobody watched. The visitor has to SEE the thing they are then asked to
 * repeat.
 */
const framed = (() => {
  const p = structure.graph.positions;
  const v = new THREE.Vector3();
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return Array.from(structure.seeds)
    .map((node) => {
      v.set(p[node * 3], p[node * 3 + 1], p[node * 3 + 2]).project(camera);
      return { node, offCentre: Math.hypot(v.x, v.y), inFront: v.z < 1 };
    })
    .filter((s) => s.inFront)
    .sort((a, b) => a.offCentre - b.offCentre)
    .map((s) => s.node);
})();

/**
 * Event index. Advances per disturbance so successive cascades are different
 * journeys, and it is an integer rather than a clock reading — the whole run
 * is reproducible from it.
 */
let event = 0;

/**
 * Pending events, held until the cascade they started has been corrected.
 *
 * A disturbance's peak path count is not known when it begins, and the file
 * records what the event turned out to be rather than what it looked like at
 * ignition.
 */
let pending: { node: number; source: 'SYSTEM' | 'VISITOR'; tick: number } | null = null;

function disturb(node: number, source: 'SYSTEM' | 'VISITOR'): boolean {
  if (!fission.ignite(node, 0x9e37 + event * 2654435761)) return false;
  pending = { node, source, tick: clock };
  event++;
  return true;
}

/** The count the system holds against this visitor: this visit and every one before. */
const heldAgainst = (): number => visit.priorAdjustments + fission.adjustments;

/** The system's own event, at a site the visitor can actually watch. */
const ignite = (): boolean => {
  const order = framed.length ? framed : Array.from(structure.seeds);
  if (!order.length) return false;
  return disturb(order[event % order.length], 'SYSTEM');
};

/**
 * The false first action.
 *
 * Eight seconds without the visitor and the system injects a deviation itself,
 * corrects it, and files it as theirs. The lie is in `Record`, not here, and
 * it is inspectable rather than theatrical: both logs are kept whole and are
 * only ever diffed at the floor. The visitor may act before the eight seconds
 * are up, in which case the first entry is honestly their own.
 */
const IDLE_BEFORE_SYSTEM_ACTS = 8000;
let idle = IDLE_BEFORE_SYSTEM_ACTS;
let acted = false;
let invited = false;
/** Set once the visitor has asked for the work. Nothing further is simulated. */
let left = false;
/** Set once the way down has been offered. It is not offered twice. */
let descended = false;
/** Set once the descent exists. Requires the visitor to have acted. */
let railOpen = false;

/**
 * The way out, recorded.
 *
 * Three things have to happen before the visitor leaves, and the order matters
 * only in that all of them must be done synchronously — the navigation begins
 * as soon as this handler returns and nothing deferred will run.
 *
 * The important one is cancelling the false first action. A visitor who asks
 * for the work at three seconds must not be charged at eight with a deviation
 * the system supplied on their behalf; a record that fabricates an entry for
 * someone who already left is not incomplete, it is fraudulent, and the
 * distinction is the whole argument.
 *
 * No `preventDefault`. There is no confirmation and no penalty: the press
 * writes the truth and the browser goes where the link says.
 */
/**
 * The floor.
 *
 * Offered only once the visitor has produced the phenomenon themselves, and
 * never reached by the skip path — a record panel that opens for someone who
 * declined would be pointing at nothing, and "your record" would be a lie of a
 * different and much cheaper kind.
 *
 * In the finished descent this is the deepest point rather than a control. The
 * button is scaffolding; what it opens is not.
 */
function openFloor(): void {
  panel.show({
    adjustments: heldAgainst(),
    residual: fission.residual,
    physical: record.physical.map((e) => ({
      source: e.source,
      node: e.node,
      tick: e.tick,
      paths: e.paths,
    })),
    recorded: record.recorded.map((e) => ({
      source: e.source,
      node: e.node,
      tick: e.tick,
      paths: e.paths,
      divergence: e.divergence,
    })),
    statement: record.statement,
    visits: visit.index + 1,
  });
}

descend.addEventListener('click', openFloor);

skip.addEventListener('click', () => {
  acted = true;
  idle = 0;
  left = true;
  record.skip();
  visit.commit(record.recorded, fission.adjustments, true, record.statement);
});

/**
 * Where the pointer is, resolved once a frame rather than per event.
 *
 * `nodeUnder` walks every junction, and a mouse can fire pointermove far more
 * often than the display refreshes.
 */
let pointer: { x: number; y: number } | null = null;
canvas.addEventListener('pointermove', (e) => {
  pointer = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerleave', () => {
  pointer = null;
});

canvas.addEventListener('pointerdown', (e) => {
  if (panel.open || left) return;
  const hit = contactUnder(e.clientX, e.clientY);
  const node = hit ? hit.lead : null;
  // A press on empty black is not an action.
  //
  // Setting `acted` before checking meant a single click on the void inside
  // the first eight seconds cancelled the false first action, and the system
  // then never demonstrated anything — the visitor sat in front of a still
  // image having silently disarmed the beat the whole slice is built on. The
  // timer's claim is "you did nothing, so I acted for you", and a miss is
  // still doing nothing.
  if (node === null) return;
  if (!disturb(node, 'VISITOR')) return;
  acted = true;
  if (invited) {
    // The invitation has been taken. It does not come back.
    invite.classList.remove('is-open');
  }
});

/**
 * Fixed step, decoupled from the frame.
 *
 * The cascade's timing is a claim about the system, not about the display: 700
 * milliseconds of growth has to be 700 milliseconds on a 60 Hz laptop and on a
 * 165 Hz monitor. Accumulated and clamped, so a background tab that returns
 * after ten seconds does not run ten seconds of catch-up in one frame.
 */
const STEP_MS = DEFAULT_FISSION.dt * 1000;
let carried = 0;
let last = performance.now();

function frame(now: number): void {
  const delta = Math.min(now - last, 250);
  last = now;

  const manual = (window as unknown as { __manual?: boolean }).__manual === true;

  if (!manual && !acted && !left && idle > 0) {
    idle -= delta;
    if (idle <= 0) ignite();
  }

  // The capture harness drives the simulation tick by tick to reach named
  // moments of the cascade; while it does, this loop must not also advance it.
  carried += delta;
  while (carried >= STEP_MS) {
    if (!manual && !left) {
      fission.step();
      clock++;
    }
    carried -= STEP_MS;
  }

  // An event is filed when its correction completes, not when it starts.
  if (pending && fission.phase === 'held' && fission.peakFronts > 0) {
    record.log(pending.source, pending.node, pending.tick, fission.peakFronts);
    pending = null;
    visit.commit(record.recorded, fission.adjustments, false, record.statement);
    // The descent opens once the visitor has produced the phenomenon
    // THEMSELVES, not when the system demonstrated it.
    //
    // Before that they are observing a structure; after it they are
    // investigating one, and the camera movement has a reason. Opening at the
    // autonomous event let someone descend having only watched, which makes
    // the travel a thing the page does rather than a thing they decided to do.
    if (!railOpen && record.physical.some((e) => e.source === 'VISITOR')) {
      railOpen = true;
      openRail();
    }

    // On the reduced-motion path the floor is a control, because there is no
    // descent to arrive at the bottom of.
    if (reduced && !descended && record.physical.some((e) => e.source === 'VISITOR')) {
      descended = true;
      descend.hidden = false;
      descend.classList.add('is-open');
    }
  }

  // The invitation waits for the demonstration to finish. Offered while the
  // first cascade is still running it would read as a control for it.
  if (!invited && !manual && record.physical.length > 0 && fission.phase === 'held') {
    invited = true;
    invite.classList.add('is-open');
  }

  // Presence is the input. Being near a trajectory disturbs it, and when that
  // disturbance passes what the system can ignore, it answers — no press
  // required. A press still works, and is simply a faster way to the same
  // place.
  if (!panel.open && !left && !manual) {
    const seconds = delta / 1000;
    const under = pointer ? contactUnder(pointer.x, pointer.y) : null;
    if (under === null) fission.release();
    else fission.hover(under.region, under.lead, under.sheet, seconds);
    fission.relax(seconds);

    const provoked = fission.provoked;
    if (provoked >= 0 && disturb(provoked, 'VISITOR')) {
      acted = true;
      if (invited) invite.classList.remove('is-open');
    }
  }

  // Eased toward the scroll position. Frame-rate independent: the coefficient
  // is a half-life in milliseconds, not a per-frame fraction, or the descent
  // is faster on a 165 Hz monitor than on a 60 Hz one.
  const follow = 1 - Math.pow(0.5, delta / 90);
  eased += (progress - eased) * follow;
  if (Math.abs(progress - eased) < 0.0002) eased = progress;
  applyCamera(eased);

  field.setEnergy(fission.energy);
  ridges.setEnergy(fission.energy);

  // The chrome reports the system's own file, and nothing else.
  //
  // It said "1 ATTRIBUTED, 1 UNPERFORMED" for a while, which hands the visitor
  // the whole argument in the first ten seconds: they learn the system has
  // charged them with something they did not do before they have even acted.
  // The divergence is kept whole in `Record` and stays inspectable — it is
  // simply not announced. It belongs at the floor, under YOUR RECORD, where
  // the two logs are diffed and the visitor finds it themselves. Every line
  // here is true from inside the file; that is exactly what makes it a lie.
  readout.textContent = [
    `STATE: ${fission.phase === 'held' ? 'HELD' : fission.phase.toUpperCase()}`,
    `PATHS: ${String(fission.active).padStart(3, ' ')}`,
    `ADJUSTMENTS APPLIED: ${heldAgainst()}`,
    `RECORD: ${heldAgainst() === 0 ? 'CLEAN' : 'COMPLIANT'}`,
  ].join('\n');

  // The floor is the deepest point of the descent, not a button. Reached by
  // arriving, and only ever with something to refer to — which is guaranteed,
  // because the system will have acted on its own long before the bottom.
  if (!reduced && !panel.open && eased > 0.995 && record.physical.length > 0) {
    openFloor();
  }

  halation.render(renderer, scene, camera, {
    setEmissiveOnly: (on: boolean) => {
      field.setEmissiveOnly(on);
      ridges.setEmissiveOnly(on);
    },
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// For the capture harness.
(window as unknown as { __slice: unknown }).__slice = {
  structure,
  field,
  camera,
  fission,
  record,
  visit,
  skip,
  descend,
  panel,
  openFloor,
  openRail,
  poses: POSES,
  halation,
  mass,
  ridges,
  applyCamera,
  progressNow: () => eased,
  heldAgainst,
  ignite,
  contactUnder,
  nodeUnder: (x: number, y: number) => contactUnder(x, y)?.lead ?? null,
  disturb,
  invite,
};
