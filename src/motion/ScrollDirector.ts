import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import type { SceneController } from '../scene/SceneController';
import type { PresetName } from '../scene/ReactionField';

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
  /** Field behaviour across this band. */
  preset: PresetName;
  /** Preset eased toward across the band, if the state is transitional. */
  presetTo?: PresetName;
  /** Layer separation target at the start and end of the band. */
  separation: [number, number];
}

/**
 * Narrative bands. These correspond to the camera keyframe `at` values
 * in CameraRig and the lighting arc in Lighting — the three files are
 * authored against one timeline.
 */
const BANDS: Band[] = [
  { id: 'hero', from: 0.0, to: 0.1, preset: 'base', separation: [0, 0] },
  { id: 'premise', from: 0.1, to: 0.26, preset: 'base', presetTo: 'desk42', separation: [0, 0] },
  { id: 'desk42', from: 0.26, to: 0.4, preset: 'desk42', separation: [0, 0] },
  { id: 'brawler', from: 0.4, to: 0.5, preset: 'desk42', presetTo: 'brawler', separation: [0, 0] },
  { id: 'roguelite', from: 0.5, to: 0.6, preset: 'brawler', presetTo: 'roguelite', separation: [0, 0] },
  // Layer separation is retired, held at zero across the whole descent.
  //
  // It slid the three ring groups apart along the travel axis and
  // dimmed the two not being focused, to literalise "three games, one
  // accumulating stack". It only ever read as that if you already knew
  // that was the intent — there is no label, no camera beat and no
  // framing that says "look, three layers" — so on screen it was
  // shards drifting and dimming for no stated reason, in the exact
  // stretch that was hardest to follow.
  //
  // The narrative for this stretch is not missing and never was: the
  // four bands below each have their DOM copy, their camera keyframes
  // and their lighting keyframes, all authored against this timeline.
  // What was missing is that Lighting's `psy` — keyframed 0.8 / 0.5 /
  // 0.45 / 0.35 across exactly these four bands — was never published
  // to the entity, so all four rendered identically. They differ now.
  { id: 'foundation', from: 0.6, to: 0.71, preset: 'roguelite', separation: [0, 0] },
  { id: 'accumulation', from: 0.71, to: 0.82, preset: 'roguelite', presetTo: 'resolved', separation: [0, 0] },
  { id: 'evidence', from: 0.82, to: 0.93, preset: 'resolved', separation: [0, 0] },
  { id: 'resolution', from: 0.93, to: 1.0, preset: 'resolved', separation: [0, 0] },
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

  private currentBand(narrative: number): { band: Band; local: number } {
    for (const b of BANDS) {
      if (narrative <= b.to || b === BANDS[BANDS.length - 1]) {
        const local = Math.min(Math.max((narrative - b.from) / Math.max(b.to - b.from, 1e-5), 0), 1);
        return { band: b, local };
      }
    }
    return { band: BANDS[0], local: 0 };
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

    // Reduced motion still gets the whole narrative, just as composed
    // states rather than travel. The bands drive it exactly as they do
    // for the animated path; only the camera treatment differs.
    const narrative = this.toNarrative(window.scrollY);
    this.narrative = narrative;
    this.scene.setProgress(narrative);

    const { band, local } = this.currentBand(narrative);
    if (band.presetTo) {
      this.scene.blendFieldPresets(band.preset, band.presetTo, local);
    } else {
      this.scene.setFieldPreset(band.preset);
    }

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

    const { band, local } = this.currentBand(narrative);

    // Field behaviour. Transitional bands ease between two presets so
    // the three game states read as one system changing rate.
    if (band.presetTo) {
      this.scene.blendFieldPresets(band.preset, band.presetTo, local);
    } else {
      this.scene.setFieldPreset(band.preset);
    }

    // Layer separation is scroll-linked, so pulling the foundation apart
    // is causally tied to the visitor's own movement.
    const [s0, s1] = band.separation;
    this.scene.setLayerSeparation(s0 + (s1 - s0) * local);

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
