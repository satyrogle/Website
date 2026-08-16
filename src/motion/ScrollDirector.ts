import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * What the director actually needs from a scene.
 *
 * Named as an interface rather than imported as a class so the seam does not
 * pin the site to one visual system: the director maps scroll onto narrative
 * progress and says which band is live, and that is true of any hero. It was
 * typed to the retired planet controller, which meant swapping the hero
 * required editing the scroll layer for no reason.
 */
export interface DirectedScene {
  setMachine(running: boolean): void;
  setProgress(p: number): void;
  visitorMoved(): void;
}

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
 * Five beats of the machine, then the ground. Each owns a fixed slice of
 * progress whatever its measured height, so the descent is paced by the
 * narrative rather than by how much copy happens to sit in a section.
 *
 * EDITORIAL is one band spanning every editorial section, because the
 * machine is off by then and there is nothing left for progress to drive.
 */
const BANDS: Band[] = [
  { id: 'open', from: 0.0, to: 0.12 },
  { id: 'ask', from: 0.12, to: 0.28 },
  { id: 'notice', from: 0.28, to: 0.46 },
  { id: 'gradient', from: 0.46, to: 0.68 },
  { id: 'floor', from: 0.68, to: 0.82 },
  { id: 'editorial', from: 0.82, to: 1.0 },
];

interface MeasuredSection {
  band: Band;
  top: number;
  height: number;
}

export class ScrollDirector {
  private scene: DirectedScene;
  private sections: MeasuredSection[] = [];
  private docProgress = 0;
  private narrative = 0;
  private reduced: boolean;
  private rafId = 0;
  private running = false;
  private progressReadout: HTMLElement | null;
  private lastReadout = -1;
  private band = '';
  /** Scroll offset when the director started; NaN until running. */
  private restY = Number.NaN;
  private moved = false;

  constructor(scene: DirectedScene, reduced: boolean) {
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

  /**
   * Cached layout read. Never called from the scroll handler.
   *
   * A band may be marked up as several sections — EDITORIAL is six of them —
   * so a band's span runs from the top of its first element to the bottom of
   * its last. Missing elements are skipped rather than defaulted: the
   * no-WebGL path removes the machine's sections outright, and the remaining
   * editorial must still map cleanly onto progress.
   */
  private measure = (): void => {
    const measured: MeasuredSection[] = [];

    for (const band of BANDS) {
      const elements = document.querySelectorAll<HTMLElement>(`[data-band="${band.id}"]`);
      if (!elements.length) continue;

      let top = Infinity;
      let bottom = -Infinity;
      elements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        top = Math.min(top, rect.top + window.scrollY);
        bottom = Math.max(bottom, rect.bottom + window.scrollY);
      });

      measured.push({ band, top, height: Math.max(bottom - top, 1) });
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

    if (viewportMid <= sections[0].top) {
      this.setBand(sections[0].band.id);
      return 0;
    }

    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      const end = s.top + s.height;
      if (viewportMid < end || i === sections.length - 1) {
        const t = Math.min(Math.max((viewportMid - s.top) / s.height, 0), 1);
        this.setBand(s.band.id);
        return s.band.from + (s.band.to - s.band.from) * t;
      }
    }
    return 1;
  }

  /**
   * Publishes the current band to the document so CSS and the editorial
   * layer can respond to narrative position without reading scroll
   * themselves. One writer, one attribute.
   *
   * Deliberately NOT `data-band`, which is the sections' own attribute:
   * writing that name onto the root element makes `<html>` match the
   * section selector, and since its box is the whole document the first
   * band then swallows every other one at the next re-measure.
   *
   * `data-narrative-band` is the public hook. No CSS reads it today;
   * `tools/correction-capture.mjs` does, to confirm a captured frame sits
   * where the narrative says it does.
   */
  private setBand(id: string): void {
    if (id === this.band) return;
    this.band = id;
    document.documentElement.dataset.narrativeBand = id;
    // Machine off past the floor, and on again on the way back up.
    this.scene.setMachine(id !== 'editorial');
    document.dispatchEvent(new CustomEvent('bandchange', { detail: { band: id } }));
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
    this.noteMovement(window.scrollY);
    // Nothing spatial moves, but the band still has to be published: the
    // editorial hand-off is a DOM state change, not a camera move, and it
    // must happen on this path too.
    this.narrative = this.toNarrative(window.scrollY);
    this.updateReadout();
  };

  private tick = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    const scrollY = window.scrollY;
    const max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    this.docProgress = Math.min(Math.max(scrollY / max, 0), 1);
    this.noteMovement(scrollY);

    const narrative = this.toNarrative(scrollY);
    this.narrative = narrative;
    this.scene.setProgress(narrative);

    this.updateReadout();
  };

  /**
   * Real displacement, in pixels, from wherever this visit started. This is
   * the one signal that means the visitor actually did something: narrative
   * progress drifts on its own as fonts and images settle the layout, and a
   * latch keyed on it armed the false first action at boot, on the untouched
   * opening frame.
   */
  private noteMovement(scrollY: number): void {
    if (Number.isNaN(this.restY)) {
      this.restY = scrollY;
      return;
    }
    if (this.moved || Math.abs(scrollY - this.restY) < 48) return;
    this.moved = true;
    this.scene.visitorMoved();
  }

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
