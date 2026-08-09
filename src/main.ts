import './styles/tokens.css';
import './styles/global.css';
import './styles/typography.css';
import './styles/sections.css';

import { MotionPreferences } from './motion/MotionPreferences';
import { TextReveals } from './motion/TextReveals';
import { AccessibilityController } from './accessibility/AccessibilityController';
import { SceneController, isWebGL2Available } from './scene/SceneController';
import { PrologueDirector } from './motion/PrologueDirector';

/**
 * Boot sequence.
 *
 * Poster first: the hero composition is on screen as a still image
 * before anything is loaded, the DOM is usable from first paint, and the
 * live scene crossfades in when it is ready. There is no loading screen
 * and no progress number — every failure path leaves the whole site
 * readable rather than putting the visitor behind a counter.
 */

const root = document.documentElement;
const motion = new MotionPreferences();
const a11y = new AccessibilityController();
const reveals = new TextReveals(motion.animated);

let scene: SceneController | null = null;
let director: PrologueDirector | null = null;

function enterFallback(reason: string): void {
  root.classList.add('no-webgl');
  document.getElementById('lattice-canvas')?.remove();
  if (import.meta.env.DEV) console.warn(`[dark-lattice] 3D disabled: ${reason}`);
}

async function boot(): Promise<void> {
  a11y.init();
  reveals.init();
  reveals.revealHero();

  const canvas = document.getElementById('lattice-canvas') as HTMLCanvasElement | null;
  const poster = document.querySelector<HTMLElement>('[data-poster]');

  if (!canvas || !isWebGL2Available()) {
    enterFallback('WebGL2 unavailable');
    return;
  }

  // Fonts are real work and worth waiting for before the crossfade: the
  // hero must not land and then reflow as the display face swaps in.
  try {
    if (document.fonts) {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => window.setTimeout(resolve, 2200)),
      ]);
    }
  } catch {
    /* font loading is best-effort */
  }

  try {
    scene = new SceneController({ canvas, reducedMotion: motion.reduced });
  } catch (error) {
    enterFallback(String(error));
    return;
  }

  try {
    await scene.loadEntity(`${import.meta.env.BASE_URL}models/DL_Monolith_v01.glb`);
  } catch (error) {
    scene.dispose();
    scene = null;
    enterFallback(`entity load failed: ${String(error)}`);
    return;
  }

  // Gray–Scott needs thousands of iterations before it looks like
  // anything, and the hero has to land developed rather than visibly
  // filling in over the first fifteen seconds.
  try {
    await scene.warmUpField(2200, 1400);
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[dark-lattice] warm-up skipped', error);
  }

  scene.setWake(1);

  try {
    scene.renderStill();
  } catch (error) {
    scene.dispose();
    scene = null;
    enterFallback(String(error));
    return;
  }

  canvas.classList.add('is-live');
  poster?.classList.add('is-retired');

  director = new PrologueDirector(scene, motion.reduced);
  director.start();

  if (!motion.reduced) scene.start();

  // Dev-only handles for the capture and QA harness.
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__dl = { scene, director };
  }

  wireScrollAnchors();
}

function wireScrollAnchors(): void {
  document.querySelectorAll<HTMLAnchorElement>('a[data-scroll-to]').forEach((anchor) => {
    anchor.addEventListener('click', (event) => {
      const href = anchor.getAttribute('href');
      if (!href?.startsWith('#')) return;
      const target = document.querySelector<HTMLElement>(href);
      if (!target || !director) return;
      event.preventDefault();
      director.scrollTo(target);
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void boot());
} else {
  void boot();
}
