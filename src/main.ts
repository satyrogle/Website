import './styles/tokens.css';
import './styles/global.css';
import './styles/typography.css';
import './styles/sections.css';

import { MotionPreferences } from './motion/MotionPreferences';
import { TextReveals } from './motion/TextReveals';
import { AccessibilityController } from './accessibility/AccessibilityController';
import { SceneController, isWebGL2Available } from './scene/SceneController';
import { ScrollDirector } from './motion/ScrollDirector';
import { verifyEvidenceIntegrity } from './content/verify';

/**
 * Boot sequence.
 *
 * Order matters. Accessibility and the DOM narrative come up first and
 * never depend on the 3D system; the lattice is attached afterwards and
 * every failure path leaves the site fully readable.
 */

const root = document.documentElement;
const motion = new MotionPreferences();
const a11y = new AccessibilityController();
const reveals = new TextReveals(motion.animated);

let scene: SceneController | null = null;
let director: ScrollDirector | null = null;

// ---------------------------------------------------------------------
//  Loader — genuine progress against real initialisation milestones
// ---------------------------------------------------------------------

const loaderEl = document.getElementById('loader');
const loaderBar = document.getElementById('loader-bar');
const loaderCount = document.getElementById('loader-count');

// Repeat visits within a session skip the loader entirely: the shaders
// and fonts are already warm, so showing progress would be theatre.
const REPEAT_KEY = 'dl.visited';
let repeatVisit = false;
try {
  repeatVisit = sessionStorage.getItem(REPEAT_KEY) === '1';
  sessionStorage.setItem(REPEAT_KEY, '1');
} catch {
  // Storage blocked; treat as a first visit.
}

let loaderProgress = 0;

function setLoaderProgress(value: number): void {
  loaderProgress = Math.max(loaderProgress, Math.min(Math.max(value, 0), 1));
  if (loaderBar) loaderBar.style.transform = `scaleX(${loaderProgress})`;
  if (loaderCount) loaderCount.textContent = String(Math.round(loaderProgress * 100));
}

function dismissLoader(): void {
  setLoaderProgress(1);
  if (!loaderEl) return;
  loaderEl.classList.add('is-done');
  window.setTimeout(() => {
    loaderEl.hidden = true;
  }, 950);
}

if (loaderEl && !repeatVisit) {
  // The inline script in the document head hid this before any bundle
  // loaded. Now that we know JS is running, it can be shown.
  loaderEl.hidden = false;
}

// ---------------------------------------------------------------------
//  Fallback paths
// ---------------------------------------------------------------------

function enterFallback(reason: string): void {
  root.classList.add('no-webgl');
  document.getElementById('lattice-canvas')?.remove();
  // Controls that only affect the 3D object are removed, not disabled:
  // a dead control is worse than an absent one.
  document.querySelectorAll('[data-webgl-only]').forEach((el) => el.remove());
  dismissLoader();
  if (import.meta.env.DEV) console.warn(`[dark-lattice] 3D disabled: ${reason}`);
}

// ---------------------------------------------------------------------
//  Boot
// ---------------------------------------------------------------------

async function boot(): Promise<void> {
  // 1 — DOM narrative and controls. Always runs, never blocks on 3D.
  a11y.init((index) => scene?.focusLayer(index));
  reveals.init();
  setLoaderProgress(0.1);

  // 2 — Fonts. Real work, and worth waiting for: the hero must not
  //     land and then reflow as the display face swaps in.
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
  setLoaderProgress(0.3);

  const canvas = document.getElementById('lattice-canvas') as HTMLCanvasElement | null;

  if (!canvas || !isWebGL2Available()) {
    enterFallback('WebGL2 unavailable');
    reveals.revealHero();
    return;
  }

  // 3 — Scene construction: geometry build and shader compilation.
  try {
    scene = new SceneController({ canvas, reducedMotion: motion.reduced });
  } catch (error) {
    enterFallback(String(error));
    reveals.revealHero();
    return;
  }
  setLoaderProgress(0.45);

  // 3b — The Blender-authored entity. Real network work, so it feeds
  //      the loader directly. A failure here is not fatal: the site
  //      drops to the poster and the DOM narrative is untouched.
  try {
    await scene.loadEntity(
      `${import.meta.env.BASE_URL}models/DL_CrownedConvergence_Production_v01.glb`,
      (fraction) => setLoaderProgress(0.45 + fraction * 0.18)
    );
  } catch (error) {
    scene.dispose();
    scene = null;
    enterFallback(`entity load failed: ${String(error)}`);
    reveals.revealHero();
    return;
  }
  setLoaderProgress(0.63);

  // 4 — Grow the reaction field. This is the bulk of the real
  //     initialisation work and the main thing the loader is measuring:
  //     Gray–Scott needs thousands of iterations before it looks like
  //     anything, and the hero has to land developed rather than
  //     visibly filling in over the first fifteen seconds.
  try {
    await scene.warmUpField(
      repeatVisit ? 800 : 2400,
      repeatVisit ? 600 : 1500,
      (fraction) => setLoaderProgress(0.63 + fraction * 0.24)
    );
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[dark-lattice] warm-up skipped', error);
  }

  setLoaderProgress(0.88);

  // 5 — First frame. Rendering once here means the hero composition is
  //     already on screen behind the loader when it clears, so the
  //     hand-off resolves directly into the hero rather than popping.
  try {
    scene.renderStill();
  } catch (error) {
    scene.dispose();
    scene = null;
    enterFallback(String(error));
    reveals.revealHero();
    return;
  }
  setLoaderProgress(0.92);

  canvas.classList.add('is-live');

  // 5 — Hand off.
  director = new ScrollDirector(scene, motion.reduced);
  director.start();

  if (motion.reduced) {
    // Composed still. No drift, no travel, no smooth-scroll layer.
    scene.setWake(1);
    scene.renderStill();
  } else {
    scene.setWake(1);
    scene.start();
  }

  setLoaderProgress(1);

  // A short settle so the reveal begins against a live field rather than
  // a frozen one, then the loader clears and the hero plays.
  window.setTimeout(
    () => {
      dismissLoader();
      // Measure first, then play. ScrollTrigger.refresh() reverts
      // in-flight animations to their start values as part of
      // recalculating positions, so refreshing after starting the hero
      // would leave the masked lines parked off-screen.
      reveals.refresh();
      reveals.revealHero();
    },
    repeatVisit ? 0 : 260
  );

  wireScrollAnchors();
}

// ---------------------------------------------------------------------
//  Anchors — routed through the smooth-scroll layer where present
// ---------------------------------------------------------------------

function wireScrollAnchors(): void {
  document.querySelectorAll<HTMLAnchorElement>('a[data-scroll-to]').forEach((anchor) => {
    anchor.addEventListener('click', (event) => {
      const href = anchor.getAttribute('href');
      if (!href?.startsWith('#')) return;
      const target = document.querySelector<HTMLElement>(href);
      if (!target || !director) return;
      event.preventDefault();
      director.scrollTo(target);
      // Keep the keyboard in sync with the visual position.
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  });
}

// Layout changes from the evidence disclosure must re-measure the
// narrative bands, or the camera timing drifts against the new height.
document.addEventListener('layoutchange', () => {
  reveals.refresh();
});

if (import.meta.env.DEV) {
  verifyEvidenceIntegrity();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void boot());
} else {
  void boot();
}

// Guard against a late failure leaving the loader up.
window.addEventListener('error', () => dismissLoader());
