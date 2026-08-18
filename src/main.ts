import { detectCapabilities, prefersReducedMotion } from './core/capabilities';
import { ExperienceState, seedFromLocation } from './core/ExperienceState';
import { SimulationKernel } from './sim/SimulationKernel';
import { ObservationModel } from './render/ObservationModel';
import { SceneRenderer } from './render/SceneRenderer';
import { ScrollDirector } from './motion/ScrollDirector';
import { InputController } from './input/InputController';
import { EvidenceRecorder } from './record/EvidenceRecorder';
import { ContentController } from './content/ContentController';

/**
 * Boot. One deterministic state model, one simulation, renderers that
 * observe snapshots. If WebGL2 is missing the editorial page stands on
 * its own; the world is a supplement, never the container.
 */

const FIXED_STEP = 1 / 60;
const MAX_CATCHUP_STEPS = 3;
const REDUCED_STEP_EVERY = 8; // frames per sim step under reduced motion

function boot(): void {
  const caps = detectCapabilities();
  const recorder = new EvidenceRecorder();
  const agentDim = caps.lowTier ? 320 : 512;

  if (!caps.webgl) {
    new ContentController(false, agentDim * agentDim);
    recorder.noWorld();
    return;
  }

  const canvas = document.querySelector<HTMLCanvasElement>('#world');
  if (!canvas) {
    new ContentController(false, agentDim * agentDim);
    recorder.noWorld();
    return;
  }

  let sceneRenderer: SceneRenderer;
  let kernel: SimulationKernel;
  const state = new ExperienceState(seedFromLocation());
  state.reducedMotion = prefersReducedMotion();

  try {
    sceneRenderer = new SceneRenderer(canvas, caps.lowTier ? 1.25 : 1.75);
    kernel = new SimulationKernel(sceneRenderer.renderer, {
      seed: state.seed,
      agentDim,
      onEvent: (e) => recorder.add(e)
    });
    sceneRenderer.attachKernel(kernel);
  } catch (err) {
    console.error('World failed to start; static page stands.', err);
    document.body.classList.add('no-webgl');
    new ContentController(false, agentDim * agentDim);
    recorder.noWorld();
    return;
  }

  new ContentController(true, kernel.agentCount);
  const observation = new ObservationModel(state, () => kernel.focusPoint());
  new ScrollDirector(state);
  new InputController(kernel, observation);

  recorder.add({
    kind: 'seed',
    tick: 0,
    text:
      'SEED ' +
      state.seed +
      ' · WORLD ONLINE · FIXED STEP 60 HZ · ' +
      kernel.agentCount.toLocaleString('en-GB') +
      ' AGENTS'
  });

  // warm the world so the opening frame is a formed structure,
  // not a scatter of newborn agents
  for (let i = 0; i < 420; i++) kernel.step();

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
      if (frame % REDUCED_STEP_EVERY === 0) kernel.step();
    } else {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= FIXED_STEP && steps < MAX_CATCHUP_STEPS) {
        kernel.step();
        accumulator -= FIXED_STEP;
        steps++;
      }
      if (accumulator > FIXED_STEP) accumulator = FIXED_STEP;
    }

    observation.update(dt);
    sceneRenderer.render(kernel, observation.view);
  };

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) last = performance.now();
  });

  requestAnimationFrame(loop);
}

boot();
