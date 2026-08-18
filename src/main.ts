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
 * observe snapshots. Hero copy paints before any of this runs; the
 * world warms up in the background and fades in once it has formed,
 * which is the loading state, stated honestly.
 *
 * ?seed=N     replaces the default seed
 * ?flat=1     disables glow, atmosphere, grain and pulse (static-frame audit)
 * ?harness=1  disables auto-stepping and exposes window.__dl for the
 *             quality harness (replay and first-action tests)
 */

const MAX_CATCHUP_STEPS = 3;
const REDUCED_STEP_EVERY = 8;
const WARMUP_TICKS = 420;
const WARMUP_CHUNK = 42;

function boot(): void {
  const params = new URLSearchParams(window.location.search);
  const harness = params.has('harness');
  const flat = params.has('flat');

  const caps = detectCapabilities();
  const recorder = new EvidenceRecorder();
  // one seeded world, identical on every device; weaker hardware runs
  // the same world at half rate and lower resolution, never a smaller one
  const agentDim = 512;
  const FIXED_STEP = caps.lowTier ? 1 / 30 : 1 / 60;

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
  let observation: ObservationModel;
  const state = new ExperienceState(seedFromLocation());
  state.reducedMotion = prefersReducedMotion();

  try {
    sceneRenderer = new SceneRenderer(canvas, caps.lowTier ? 1.25 : 1.75, flat);
    kernel = new SimulationKernel(sceneRenderer.renderer, {
      seed: state.seed,
      agentDim,
      onEvent: (e) => {
        recorder.add(e);
        if (e.kind === 'placed' && e.x !== undefined && e.y !== undefined) {
          sceneRenderer.pulseAt(e.x, e.y, observation.view.time);
        }
      }
    });
    sceneRenderer.attachKernel(kernel);
  } catch (err) {
    console.error('World failed to start; the still page stands.', err);
    document.body.classList.add('no-webgl');
    new ContentController(false, agentDim * agentDim);
    recorder.noWorld();
    return;
  }

  new ContentController(true, kernel.agentCount);
  observation = new ObservationModel(state, () => kernel.focusPoint());
  new ScrollDirector(state);
  new InputController(kernel, observation, () => {
    recorder.notice(
      'T+' + String(kernel.tick).padStart(6, '0') + ' · STILL TAKING THE LAST MARK'
    );
  });

  const telemetry = document.querySelector<HTMLElement>('#telemetry');

  // if the GPU goes away mid-session, say so and stand on the still page
  canvas.addEventListener('webglcontextlost', () => {
    document.body.classList.add('no-webgl');
    document.body.classList.remove('world-ready');
    recorder.add({
      kind: 'removed',
      tick: kernel.tick,
      text: 'WEBGL CONTEXT LOST',
      status: 'OFFLINE'
    });
  });

  const announceOnline = (): void => {
    recorder.add({
      kind: 'seed',
      tick: kernel.tick,
      text:
        'SEED ' +
        state.seed +
        ' · ' +
        kernel.agentCount.toLocaleString('en-GB') +
        ' AGENTS · FIXED STEP 60 HZ',
      status: 'ONLINE'
    });
  };

  if (harness) {
    // deterministic control surface: nothing steps unless the harness says so
    document.body.classList.add('world-ready');
    announceOnline();
    (window as unknown as Record<string, unknown>).__dl = {
      seed: state.seed,
      stepTo: (n: number): number => {
        while (kernel.tick < n) kernel.step();
        return kernel.tick;
      },
      snapshot: (): { tick: number; sum: number } => ({
        tick: kernel.tick,
        sum: kernel.healthChecksum()
      }),
      placeMark: (x: number, y: number): boolean => kernel.placeMark(x, y),
      records: (): number => document.querySelectorAll('#record-list li').length
    };
    const renderOnly = (): void => {
      requestAnimationFrame(renderOnly);
      observation.update(1 / 60);
      sceneRenderer.render(kernel, observation.view);
    };
    requestAnimationFrame(renderOnly);
    return;
  }

  recorder.notice('SEED ' + state.seed + ' · FORMING');

  let warmed = 0;
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

    if (warmed < WARMUP_TICKS) {
      // staged warm-up: the world forms before it is shown
      for (let i = 0; i < WARMUP_CHUNK && warmed < WARMUP_TICKS; i++) {
        kernel.step();
        warmed++;
      }
      if (warmed >= WARMUP_TICKS) {
        document.body.classList.add('world-ready');
        announceOnline();
      }
      return;
    }

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

    if (telemetry && frame % 20 === 0) {
      telemetry.textContent =
        'SEED ' + state.seed + ' · T+' + String(kernel.tick).padStart(6, '0');
    }
  };

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) last = performance.now();
  });

  requestAnimationFrame(loop);
}

boot();
