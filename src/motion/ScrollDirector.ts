import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import type { SceneController } from '../scene/SceneController';

gsap.registerPlugin(ScrollTrigger);

/**
 * ScrollDirector
 *
 * Maps document scroll onto the narrative timeline the camera rig and
 * lighting arc are authored against.
 *
 * The mapping is deliberately indirect. Each movement owns a fixed band
 * of narrative progress regardless of how tall it happens to be, so the
 * camera choreography stays exactly as staged whether a section is 700px
 * or 2400px on a given viewport. Driving the camera from raw document
 * progress would re-time the whole sequence every time copy or viewport
 * height changed.
 *
 * All measurement is cached and refreshed on resize; the scroll handler
 * itself performs no layout reads.
 *
 * There is deliberately NO smooth-scroll layer. An earlier build ran
 * Lenis at 0.85s and it was the single thing that made the site feel
 * wrong: the page lagged behind the wheel, so the camera — which is
 * driven by scroll position — lagged too, and the causal link between
 * input and movement was broken. The brief's requirement is that normal
 * scrolling stays predictable, and native scrolling is what does that.
 */

interface Band {
  id: string;
  from: number;
  to: number;
}

/**
 * Narrative bands — the mapping from document position to narrative
 * progress, and nothing else.
 *
 * These are still the retired movements' ids because they are what the
 * editorial DOM is marked up with. Step 4 of the build plan replaces them
 * with THE CORRECTION's own bands (OPEN, ASK, NOTICE, GRADIENT, FLOOR,
 * EDITORIAL) and hangs the rising enforcement gain off them. Until then
 * this file does one job: turn scroll into a single 0..1 progress value
 * and hand it across the seam.
 */
const BANDS: Band[] = [
  { id: 'hero', from: 0.0, to: 0.1 },
  { id: 'premise', from: 0.1, to: 0.26 },
  { id: 'desk42', from: 0.26, to: 0.4 },
  { id: 'brawler', from: 0.4, to: 0.5 },
  { id: 'roguelite', from: 0.5, to: 0.6 },
  { id: 'foundation', from: 0.6, to: 0.71 },
  { id: 'accumulation', from: 0.71, to: 0.82 },
  { id: 'evidence', from: 0.82, to: 0.93 },
  { id: 'resolution', from: 0.93, to: 1.0 },
];

interface MeasuredSection {
  band: Band;
  top: number;
  height: number;
}

export class ScrollDirector {
  private scene: SceneController;
  private sections: MeasuredSection[] = [];
  private docProgress = 0;
  private narrative = 0;
  private reduced: boolean;
  private rafId = 0;
  private running = false;
  private progressReadout: HTMLElement | null;
  private lastReadout = -1;

  constructor(scene: SceneController, reduced: boolean) {
    this.scene = scene;
    this.reduced = reduced;
    this.progressReadout = document.querySelector('[data-progress]');

    // ScrollTrigger drives the text reveals and needs to know about
    // native scrolling; nothing else is layered on top of it.
    gsap.ticker.lagSmoothing(0);

    this.measure();
    window.addEventListener('resize', this.onResize, { passive: true });
    window.addEventListener('load', this.onResize, { passive: true });
    ScrollTrigger.addEventListener('refresh', this.measure);
  }

  private onResize = (): void => {
    this.measure();
    ScrollTrigger.refresh();
  };

  /** Cached layout read. Never called from the scroll handler. */
  private measure = (): void => {
    const measured: MeasuredSection[] = [];
    for (const band of BANDS) {
      const el = document.querySelector<HTMLElement>(`[data-movement="${band.id}"]`);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      measured.push({ band, top, height: Math.max(rect.height, 1) });
    }
    this.sections = measured;
  };

  /**
   * Converts a scroll offset into narrative progress by locating it
   * within the measured movements and mapping into that movement's band.
   */
  private toNarrative(scrollY: number): number {
    const sections = this.sections;
    if (!sections.length) return 0;

    const viewportMid = scrollY + window.innerHeight * 0.5;

    if (viewportMid <= sections[0].top) return 0;

    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      const end = s.top + s.height;
      if (viewportMid < end || i === sections.length - 1) {
        const t = Math.min(Math.max((viewportMid - s.top) / s.height, 0), 1);
        return s.band.from + (s.band.to - s.band.from) * t;
      }
    }
    return 1;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    if (this.reduced) {
      // Still update the readout so the chrome is not dead, but nothing
      // spatial moves.
      window.addEventListener('scroll', this.onReducedScroll, { passive: true });
      this.onReducedScroll();
      return;
    }
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('scroll', this.onReducedScroll);
  }

  private onReducedScroll = (): void => {
    const max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    this.docProgress = Math.min(Math.max(window.scrollY / max, 0), 1);
    this.updateReadout();
  };

  private tick = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    const scrollY = window.scrollY;
    const max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    this.docProgress = Math.min(Math.max(scrollY / max, 0), 1);

    const narrative = this.toNarrative(scrollY);
    this.narrative = narrative;
    this.scene.setProgress(narrative);

    this.updateReadout();
  };

  private updateReadout(): void {
    if (!this.progressReadout) return;
    const pct = Math.round(this.docProgress * 100);
    if (pct === this.lastReadout) return;
    this.lastReadout = pct;
    this.progressReadout.textContent = String(pct).padStart(2, '0');
  }

  /**
   * Scrolls to a target. Uses the browser's own smooth behaviour, which
   * respects prefers-reduced-motion automatically and, unlike a
   * scroll-hijacking layer, leaves the wheel and the scrollbar alone.
   */
  scrollTo(target: string | HTMLElement): void {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    el?.scrollIntoView({
      behavior: this.reduced ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  get narrativeProgress(): number {
    return this.narrative;
  }
}
