import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { ExperienceState, Phase } from '../core/ExperienceState';

/**
 * The single seam between the document and the world. Maps scroll
 * progress onto observational scale and narrative phase. It never
 * invents simulation behaviour and it never smooths the scroll itself:
 * the document scrolls natively, only the reading follows.
 */

const PHASES: Array<{ upTo: number; phase: Phase }> = [
  { upTo: 0.06, phase: 'enter' },
  { upTo: 0.24, phase: 'travel' },
  { upTo: 0.38, phase: 'desk42' },
  { upTo: 0.52, phase: 'rule' },
  { upTo: 0.66, phase: 'brawler' },
  { upTo: 0.8, phase: 'technology' },
  { upTo: 0.9, phase: 'studio' },
  { upTo: 1.01, phase: 'return' }
];

export class ScrollDirector {
  private trigger: ScrollTrigger | null = null;

  constructor(private readonly state: ExperienceState) {
    gsap.registerPlugin(ScrollTrigger);
    this.trigger = ScrollTrigger.create({
      trigger: document.body,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => this.apply(self.progress)
    });
    this.apply(this.trigger.progress);
  }

  private apply(progress: number): void {
    this.state.progress = progress;
    const found = PHASES.find((p) => progress <= p.upTo);
    const phase = found ? found.phase : 'return';
    if (phase !== this.state.phase) {
      this.state.phase = phase;
      document.body.dataset.phase = phase;
    }
  }

  dispose(): void {
    this.trigger?.kill();
    this.trigger = null;
  }
}
