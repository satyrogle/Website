import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * TextReveals
 *
 * Headlines slide out from behind a clipping mask; supporting copy
 * enters on a short opacity move. Two rules keep it safe rather than
 * decorative:
 *
 * 1. The pre-animation state lives behind a `.motion-ready` class this
 *    module adds only once it is certain it will run. If the script
 *    fails first, every element is simply visible.
 *
 * 2. Every reveal hands off to a CSS resting state when it completes and
 *    its inline tween properties are cleared, because
 *    ScrollTrigger.refresh() reverts `fromTo` tweens to their start
 *    values while re-measuring.
 */

export class TextReveals {
  private triggers: ScrollTrigger[] = [];
  private enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
    if (enabled) document.documentElement.classList.add('motion-ready');
  }

  init(): void {
    if (!this.enabled) return;
    this.bindMaskedHeadlines();
    this.bindSupportingCopy();
  }

  private static settle(targets: ArrayLike<HTMLElement>, props: string): void {
    gsap.set(targets, { clearProps: props });
    Array.from(targets).forEach((el) => el.classList.add('is-revealed'));
  }

  private bindMaskedHeadlines(): void {
    document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((block) => {
      const lines = block.querySelectorAll<HTMLElement>('.reveal-line > span');
      if (!lines.length) return;

      const tween = gsap.fromTo(
        lines,
        { yPercent: 104 },
        {
          yPercent: 0,
          duration: 1.1,
          ease: 'expo.out',
          stagger: Number(block.dataset.revealStagger ?? 0.08),
          paused: true,
          onComplete: () => TextReveals.settle(lines, 'transform'),
        }
      );

      this.triggers.push(
        ScrollTrigger.create({
          trigger: block,
          start: 'top 88%',
          once: true,
          onEnter: () => tween.play(),
        })
      );
    });
  }

  private bindSupportingCopy(): void {
    document.querySelectorAll<HTMLElement>('.fade-in').forEach((item) => {
      const tween = gsap.fromTo(
        item,
        { opacity: 0 },
        {
          opacity: 1,
          duration: 0.85,
          delay: Number(item.dataset.revealDelay ?? 0),
          ease: 'power2.out',
          paused: true,
          onComplete: () => TextReveals.settle([item], 'opacity'),
        }
      );

      this.triggers.push(
        ScrollTrigger.create({
          trigger: item,
          start: 'top 94%',
          once: true,
          onEnter: () => tween.play(),
        })
      );
    });
  }

  /** Plays the hero immediately; it is on screen at first paint. */
  revealHero(): void {
    if (!this.enabled) return;
    const hero = document.querySelector<HTMLElement>('[data-hero-reveal]');
    if (!hero) return;

    const lines = hero.querySelectorAll<HTMLElement>('.reveal-line > span');
    const supporting = hero.querySelectorAll<HTMLElement>('.fade-in');

    gsap
      .timeline()
      .fromTo(
        lines,
        { yPercent: 104 },
        {
          yPercent: 0,
          duration: 1.35,
          ease: 'expo.out',
          stagger: 0.09,
          onComplete: () => TextReveals.settle(lines, 'transform'),
        }
      )
      .fromTo(
        supporting,
        { opacity: 0 },
        {
          opacity: 1,
          duration: 0.95,
          ease: 'power2.out',
          stagger: 0.08,
          onComplete: () => TextReveals.settle(supporting, 'opacity'),
        },
        '-=0.9'
      );
  }

  refresh(): void {
    ScrollTrigger.refresh();
  }

  dispose(): void {
    this.triggers.forEach((t) => t.kill());
    this.triggers = [];
  }
}
