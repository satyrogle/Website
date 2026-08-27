import { detectCapabilities, prefersReducedMotion } from './core/capabilities';
import { ExperienceState, seedFromLocation } from './core/ExperienceState';
import { LatticeWorld } from './world/LatticeWorld';
import { HeroRenderer } from './render/HeroRenderer';
import { InputController } from './input/InputController';
import { ContentController } from './content/ContentController';

/**
 * Boot. One deterministic world held at the approved hero camera.
 * Hero copy paints before WebGL starts; the world fades in once the
 * first frame exists. There is deliberately no scroll journey here.
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
  // ?flat=1 audits the static frame with bloom off. The capture tool has
  // passed this flag since the first gate and NOTHING CONSUMED IT - the
  // "flat audit" matched the lit frame to the decimal because it was the
  // lit frame. The static-frame law is only a law if it is tested bare.
  const flat = params.has('flat');

  const caps = detectCapabilities();

  const canvas = document.querySelector<HTMLCanvasElement>('#world');
  if (!caps.webgl || !canvas) {
    document.body.classList.add('no-webgl');
    new ContentController(false, 0);
    return;
  }

  const state = new ExperienceState(seedFromLocation());
  state.reducedMotion = prefersReducedMotion();

  let world: LatticeWorld;
  let renderer: HeroRenderer;
  try {
    world = new LatticeWorld(state.seed, () => undefined);
    // cap raised 1.75 -> 2 on Jacob's word, 2026-08-27, chasing edge
    // smoothness on his DPR-1 monitor: the renderer supersamples to
    // this cap and downscales. Low tier keeps its own ceiling.
    renderer = new HeroRenderer(canvas, world, caps.lowTier ? 1.25 : 2);
  } catch (err) {
    console.error('World failed to start; the still page stands.', err);
    document.body.classList.add('no-webgl');
    new ContentController(false, 0);
    return;
  }

  renderer.flatAudit = flat;
  new ContentController(true, world.nodeCount);
  new InputController(world, renderer, () => undefined);

  const telemetry = document.querySelector<HTMLElement>('#telemetry');

  canvas.addEventListener('webglcontextlost', () => {
    document.body.classList.add('no-webgl');
    document.body.classList.remove('world-ready');
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
        const p = renderer.pressPoint(ndcX, ndcY);
        return world.placeMark(p.x, p.y, p.z);
      },
      records: (): number => world.marks.length,
      // the witnessed cull's evidence: where the law has struck cells
      // from the face, so the harness can assert the strike is on the
      // camera-facing arc rather than trusting that it is
      cullPits: (): Array<{ x: number; y: number; z: number; tick: number }> =>
        world.cullPits.map((p) => ({ ...p })),
      // review affordance: sweep the lid's presence without a rebuild,
      // so its strength is chosen from rendered frames rather than from
      // a number written into a spec
      setLid: (amount: number): void => renderer.setLid(amount),
      setDraw: (amount: number): void => renderer.setDraw(amount),
      setStrata: (amount: number): void => renderer.setStrata(amount),
      setShaft: (amount: number): void => renderer.setShaft(amount),
      setChoirDim: (amount: number): void => renderer.setChoirDim(amount),
      setFog: (density: number): void => renderer.setFog(density),
      setGround: (amount: number): void => renderer.setGround(amount),
      setBite: (amount: number): void => renderer.setBite(amount),
      setSurge: (amount: number): void => renderer.setSurge(amount),
      setSurgeTime: (seconds: number): void => renderer.setSurgeTime(seconds),
      setSurgeTail: (uv: number): void => renderer.setSurgeTail(uv),
      setRim: (amount: number): void => renderer.setRim(amount),
      setBreak: (amount: number): void => renderer.setBreak(amount),
      // the crowded record at the wound: 0 kills it, 3 shouts it
      script: (a: number): void => renderer.setScript(a),
      // 0 = night with a lamp, 1 = twilight, up to 3 for review
      twilight: (a: number): void => renderer.setTwilight(a),
      // gate I1: 1 holds the brace open, 0 forces it shut, -1 is live
      still: (amount: number): void => renderer.setStill(amount),
      setGrade: (lift: number, contrast: number): void => renderer.setGrade(lift, contrast)
    };
    const renderOnly = (): void => {
      requestAnimationFrame(renderOnly);
      renderer.update(0, 1 / 60, false);
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

    renderer.update(0, dt, state.reducedMotion);

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
