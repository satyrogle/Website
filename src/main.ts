import './styles/tokens.css';
import './styles/global.css';
import './styles/typography.css';
import './styles/sections.css';

import { MotionPreferences } from './motion/MotionPreferences';
import { TextReveals } from './motion/TextReveals';
import { AccessibilityController } from './accessibility/AccessibilityController';
import { ContainmentHero, isWebGL2Available } from './scene/ContainmentHero';
import { ScrollDirector } from './motion/ScrollDirector';

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

let scene: ContainmentHero | null = null;
let refusalTimer = 0;
let director: ScrollDirector | null = null;

// ---------------------------------------------------------------------
//  Loader — genuine progress against real initialisation milestones
// ---------------------------------------------------------------------

const loaderEl = document.getElementById('loader');
const loaderBar = document.getElementById('loader-bar');
const loaderCount = document.getElementById('loader-count');
const loaderLabel = document.getElementById('loader-label');

/**
 * What the bar is actually waiting for. Each label is a real stage of
 * initialisation the hero reports, so the loader describes work rather than
 * decorating a timer.
 */
const LOADER_LABELS: Record<string, string> = {
  fonts: 'Loading type',
  synth: 'Synthesising the structure',
  warmup: 'Placing the veins on the body',
  frame: 'Composing the first frame',
};

function setLoaderStage(stage: keyof typeof LOADER_LABELS | string): void {
  const label = LOADER_LABELS[stage];
  if (label && loaderLabel) loaderLabel.textContent = label;
}

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

  // The editorial is the site. Without the hero it simply starts at the
  // thesis, and every anchor still has to carry focus with it.
  wireScrollAnchors();

  if (import.meta.env.DEV) console.warn(`[dark-lattice] 3D disabled: ${reason}`);
}

// ---------------------------------------------------------------------
//  Boot
// ---------------------------------------------------------------------

async function boot(): Promise<void> {
  // 1 — DOM narrative and controls. Always runs, never blocks on 3D.
  a11y.init();
  reveals.init();
  setLoaderProgress(0.1);
  setLoaderStage('fonts');

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
  setLoaderStage('synth');

  const canvas = document.getElementById('lattice-canvas') as HTMLCanvasElement | null;

  if (!canvas || !isWebGL2Available()) {
    enterFallback('WebGL2 unavailable');
    reveals.revealHero();
    return;
  }

  // 3 — Scene construction: geometry build and shader compilation.
  try {
    scene = new ContainmentHero({ canvas, reducedMotion: motion.reduced });
  } catch (error) {
    enterFallback(String(error));
    reveals.revealHero();
    return;
  }
  // A declined press explains itself. The scene knows it refused; only this
  // layer knows how to say so, and it says it in a polite live region so a
  // screen reader hears it without the sighted visitor being interrupted by
  // anything louder than a line of text.
  scene.onRefusal = () => {
    const out = document.querySelector<HTMLElement>('[data-refusal]');
    if (!out) return;
    out.textContent = 'Reduced motion is on, so the simulation is not running.';
    out.hidden = false;
    window.clearTimeout(refusalTimer);
    refusalTimer = window.setTimeout(() => {
      out.hidden = true;
    }, 4000);
  };

  setLoaderProgress(0.55);

  // 4 — Load the authored body and synthesise the graph that runs through
  //     it. This is the bulk of the real initialisation work and the main
  //     thing the loader is measuring.
  try {
    await scene.warmUp((fraction, stage) => {
      setLoaderProgress(0.55 + fraction * 0.32);
      setLoaderStage(stage);
    });
  } catch (error) {
    scene.dispose();
    scene = null;
    enterFallback(String(error));
    reveals.revealHero();
    return;
  }

  setLoaderProgress(0.88);
  setLoaderStage('frame');

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
    // A composed still, and nothing else. No drift, no travel, no
    // smooth-scroll layer. The three-still triptych belonged to the retired
    // planet system and is not rebuilt: this visitor gets the resting entity
    // and then the editorial, which is the whole site.
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

  // Development only, and dynamically imported so Tweakpane is not in the
  // production bundle at all. Judging a look means looking at it on the
  // machine it runs on, and a slider settles in seconds what a rebuild and a
  // GPU capture settle in minutes. `?quiet` keeps it out of a capture, which
  // would otherwise ship a photograph of the sliders with every frame.
  if (import.meta.env.DEV && scene && !new URLSearchParams(location.search).has('quiet')) {
    const { TuningPanel } = await import('./dev/TuningPanel');
    void new TuningPanel(scene).mount();
  }

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
      if (!target) return;

      event.preventDefault();

      // The director owns scrolling when there is one. Without it — the
      // no-WebGL path — the anchor still has to move the page AND move the
      // keyboard with it, which a native jump does not do. Bailing out here
      // is how a fallback visitor ends up looking at a section their focus
      // is not in.
      if (director) director.scrollTo(target);
      else target.scrollIntoView({ behavior: motion.reduced ? 'auto' : 'smooth', block: 'start' });

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
  // Development handle, so a capture harness or a console can read what the
  // simulation actually produced. DEV only: not in the production bundle.
  Object.defineProperty(window, '__correction', {
    value: {
      get hero() {
        return scene;
      },
      get adjustments() {
        return scene?.visitAdjustments ?? -1;
      },
      press: () => scene?.pressCentre() ?? -1,
    },
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void boot());
} else {
  void boot();
}

// Guard against a late failure leaving the loader up.
window.addEventListener('error', () => dismissLoader());
