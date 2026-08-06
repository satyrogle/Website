import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * TextReveals
 *
 * Headlines enter by sliding out from behind a clipping mask with a
 * tracking release; supporting copy enters on a short opacity and
 * tracking move. Nothing translates up from twenty pixels below, and
 * nothing is a plain fade — both are called out in the brief.
 *
 * Two rules make this safe rather than decorative:
 *
 * 1. The pre-animation state lives behind a `.motion-ready` class that
 *    this module adds only once it is certain it will run. If the script
 *    fails to load or throws first, every element is simply visible.
 *
 * 2. Every reveal hands off to a CSS resting state (`.is-revealed`) when
 *    it completes, and its inline tween properties are cleared.
 *    ScrollTrigger.refresh() reverts `fromTo` tweens to their start
 *    values while re-measuring, and refresh fires on load, on resize and
 *    whenever the evidence disclosure changes the page height. Without
 *    the hand-off, opening the evidence table would throw already-read
 *    headlines back off-screen.
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
    this.bindRules();
  }

  /**
   * Locks in the finished state as CSS and drops the inline properties
   * GSAP was driving, so nothing downstream can revert it.
   */
  private static settle(targets: ArrayLike<HTMLElement>, props: string): void {
    gsap.set(targets, { clearProps: props });
    Array.from(targets).forEach((el) => el.classList.add('is-revealed'));
  }

  /** Masked headline reveal. */
  private bindMaskedHeadlines(): void {
    const blocks = document.querySelectorAll<HTMLElement>('[data-reveal]');

    blocks.forEach((block) => {
      const lines = block.querySelectorAll<HTMLElement>('.reveal-line > span');
      if (!lines.length) return;

      const stagger = Number(block.dataset.revealStagger ?? 0.085);

      const tween = gsap.fromTo(
        lines,
        {
          yPercent: 105,
          // A slight tracking compression that releases as the line
          // settles — the type looks like it is coming into register.
          letterSpacing: '0.04em',
        },
        {
          yPercent: 0,
          letterSpacing: '0em',
          duration: 1.15,
          ease: 'expo.out',
          stagger,
          paused: true,
          onComplete: () => TextReveals.settle(lines, 'transform,letterSpacing'),
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

  /** Supporting copy — restrained, and never the same beat as the headline. */
  private bindSupportingCopy(): void {
    const items = document.querySelectorAll<HTMLElement>('.fade-in');

    items.forEach((item) => {
      const delay = Number(item.dataset.revealDelay ?? 0);
      const tween = gsap.fromTo(
        item,
        { opacity: 0, letterSpacing: '0.012em' },
        {
          opacity: 1,
          letterSpacing: '0em',
          duration: 0.9,
          delay,
          ease: 'power2.out',
          paused: true,
          onComplete: () => TextReveals.settle([item], 'opacity,letterSpacing'),
        }
      );

      this.triggers.push(
        ScrollTrigger.create({
          trigger: item,
          start: 'top 92%',
          once: true,
          onEnter: () => tween.play(),
        })
      );
    });
  }

  /**
   * Rules draw themselves in. Reaction lines becoming section dividers is
   * one of the preferred transition techniques in the brief, so the
   * dividers share the accent gradient with the field.
   */
  private bindRules(): void {
    const rules = document.querySelectorAll<HTMLElement>('[data-rule]');

    rules.forEach((rule) => {
      const tween = gsap.fromTo(
        rule,
        { scaleX: 0, transformOrigin: '0% 50%' },
        {
          scaleX: 1,
          duration: 1.4,
          ease: 'expo.out',
          paused: true,
          onComplete: () => TextReveals.settle([rule], 'transform'),
        }
      );

      this.triggers.push(
        ScrollTrigger.create({
          trigger: rule,
          start: 'top 94%',
          once: true,
          onEnter: () => tween.play(),
        })
      );
    });
  }

  /** Plays the hero without waiting for scroll, once the loader clears. */
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
        { yPercent: 105, letterSpacing: '0.06em' },
        {
          yPercent: 0,
          letterSpacing: '0em',
          duration: 1.45,
          ease: 'expo.out',
          stagger: 0.1,
          onComplete: () => TextReveals.settle(lines, 'transform,letterSpacing'),
        }
      )
      .fromTo(
        supporting,
        { opacity: 0 },
        {
          opacity: 1,
          duration: 1.0,
          ease: 'power2.out',
          stagger: 0.09,
          onComplete: () => TextReveals.settle(supporting, 'opacity,letterSpacing'),
        },
        '-=0.95'
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
