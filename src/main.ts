import { detectCapabilities, prefersReducedMotion } from './core/capabilities';
import { ExperienceState, seedFromLocation } from './core/ExperienceState';
import { LatticeWorld } from './world/LatticeWorld';
import { JourneyRenderer } from './render/JourneyRenderer';
import { ScrollDirector } from './motion/ScrollDirector';
import { InputController } from './input/InputController';
import { EvidenceRecorder } from './record/EvidenceRecorder';
import { ContentController } from './content/ContentController';

/**
 * Boot. One deterministic state model, one world, one camera journey:
 * the exterior mass, the descent through the strata, the core where the
 * frame and its law are visible. Hero copy paints before any of this
 * runs; the world fades in once the first frame exists.
 *
 * ?seed=N     replaces the default seed
 * ?harness=1  disables auto-stepping and exposes window.__dl
 * ?bare=1     hides the DOM for world-only captures
 */

const FIXED_STEP = 1 / 60;
const MAX_CATCHUP_STEPS = 4;
const REDUCED_STEP_EVERY = 8;

function boot(): void {
  const params = new URLSearchParams(window.location.search);
  const harness = params.has('harness');

  const caps = detectCapabilities();
  const recorder = new EvidenceRecorder();

  const canvas = document.querySelector<HTMLCanvasElement>('#world');
  if (!caps.webgl || !canvas) {
    document.body.classList.add('no-webgl');
    new ContentController(false, 0);
    recorder.noWorld();
    return;
  }

  const state = new ExperienceState(seedFromLocation());
  state.reducedMotion = prefersReducedMotion();

  let world: LatticeWorld;
  let renderer: JourneyRenderer;
  try {
    world = new LatticeWorld(state.seed, (e) => recorder.add(e));
    renderer = new JourneyRenderer(canvas, world, caps.lowTier ? 1.25 : 1.75);
  } catch (err) {
    console.error('World failed to start; the still page stands.', err);
    document.body.classList.add('no-webgl');
    new ContentController(false, 0);
    recorder.noWorld();
    return;
  }

  new ContentController(true, world.nodeCount);
  new ScrollDirector(state);
  new InputController(world, renderer, () => {
    recorder.notice(
      'T+' + String(world.tick).padStart(6, '0') + ' · STILL TAKING THE LAST MARK'
    );
  });

  const telemetry = document.querySelector<HTMLElement>('#telemetry');

  canvas.addEventListener('webglcontextlost', () => {
    document.body.classList.add('no-webgl');
    document.body.classList.remove('world-ready');
    recorder.add({
      kind: 'removed',
      tick: world.tick,
      text: 'WEBGL CONTEXT LOST',
      status: 'OFFLINE'
    });
  });

  recorder.add({
    kind: 'seed',
    tick: 0,
    text:
      'SEED ' +
      state.seed +
      ' · ' +
      world.nodeCount.toLocaleString('en-GB') +
      ' NODES · FIXED STEP 60 HZ',
    status: 'ONLINE'
  });

  if (harness) {
    document.body.classList.add('world-ready');
    (window as unknown as Record<string, unknown>).__dl = {
      seed: state.seed,
      stepTo: (n: number): number => world.stepTo(n),
      snapshot: (): { tick: number; sum: number } => ({
        tick: world.tick,
        sum: world.checksum()
      }),
      placeMark: (ndcX: number, ndcY: number): boolean => {
        const p = renderer.path.markPoint(renderer.camera, ndcX, ndcY);
        return world.placeMark(p.x, p.y, p.z);
      },
      records: (): number => document.querySelectorAll('#record-list li').length,
      // review affordance: sweep the lid's presence without a rebuild,
      // so its strength is chosen from rendered frames rather than from
      // a number written into a spec
      setLid: (amount: number): void => renderer.setLid(amount),
      setDraw: (amount: number): void => renderer.setDraw(amount),
      setStrata: (amount: number): void => renderer.setStrata(amount),
      setShaft: (amount: number): void => renderer.setShaft(amount),
      setChoirDim: (amount: number): void => renderer.setChoirDim(amount),
      setFog: (density: number): void => renderer.setFog(density),
      setBite: (amount: number): void => renderer.setBite(amount)
    };
    const renderOnly = (): void => {
      requestAnimationFrame(renderOnly);
      renderer.update(state.progress, 1 / 60, false);
    };
    requestAnimationFrame(renderOnly);
    return;
  }

  let accumulator = 0;
  let last = performance.now();
  let frame = 0;
  let running = true;

  const loop = (now: number): void => {
    requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!running) return;
    frame++;

    if (state.reducedMotion) {
      if (frame % REDUCED_STEP_EVERY === 0) world.step();
    } else {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= FIXED_STEP && steps < MAX_CATCHUP_STEPS) {
        world.step();
        accumulator -= FIXED_STEP;
        steps++;
      }
      if (accumulator > FIXED_STEP) accumulator = FIXED_STEP;
    }

    renderer.update(state.progress, dt, state.reducedMotion);

    if (frame === 1) document.body.classList.add('world-ready');
    if (telemetry && frame % 20 === 0) {
      telemetry.textContent =
        'SEED ' + state.seed + ' · T+' + String(world.tick).padStart(6, '0');
    }
  };

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) last = performance.now();
  });

  requestAnimationFrame(loop);
}

boot();
