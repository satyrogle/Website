import type { PrologueState, SceneController } from '../scene/SceneController';

/**
 * PrologueDirector
 *
 * Maps scroll through the prologue wrapper onto the one progress value
 * the camera, the lighting arc and the entity are authored against, and
 * owns the boundary between the cinematic prologue and the editorial
 * page: when the prologue leaves the viewport the render loop is
 * stopped, and it is restarted only if the visitor scrolls back.
 *
 * There is deliberately no smooth-scroll layer. The camera is driven by
 * scroll position, so a lag between the wheel and the page is a lag
 * between the visitor's input and the movement they caused.
 */

const STATES: { at: number; state: PrologueState }[] = [
  { at: 0.0, state: 'full' },
  { at: 0.22, state: 'opening' },
  { at: 0.42, state: 'tunnel' },
  { at: 0.72, state: 'latent' },
];

/** Copy beats, in prologue progress: fade in over a..b, out over c..d. */
const BEATS: Record<string, [number, number, number, number]> = {
  hero: [-1, 0, 0.13, 0.2],
  t1: [0.25, 0.3, 0.38, 0.43],
  t2: [0.46, 0.51, 0.57, 0.62],
  t3: [0.64, 0.69, 0.76, 0.81],
  latent: [0.79, 0.84, 2, 3],
};

/** Where the canvas begins handing over to the editorial page. */
const FADE_FROM = 0.94;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / Math.max(edge1 - edge0, 1e-6), 0), 1);
  return t * t * (3 - 2 * t);
}

export class PrologueDirector {
  private scene: SceneController;
  private reduced: boolean;

  private wrapper: HTMLElement | null;
  private frame: HTMLElement | null;
  private beats: { el: HTMLElement; range: [number, number, number, number] }[] = [];

  private top = 0;
  private travel = 1;
  private progress = -1;
  private state: PrologueState = 'full';
  private rafId = 0;
  private running = false;
  private visible = true;
  private observer: IntersectionObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private autoTimer = 0;

  constructor(scene: SceneController, reduced: boolean) {
    this.scene = scene;
    this.reduced = reduced;
    this.wrapper = document.querySelector<HTMLElement>('[data-prologue]');
    this.frame = document.querySelector<HTMLElement>('[data-prologue-frame]');

    document.querySelectorAll<HTMLElement>('[data-beat]').forEach((el) => {
      const range = BEATS[el.dataset.beat ?? ''];
      if (range) this.beats.push({ el, range });
    });

    this.measure();
    window.addEventListener('resize', this.onResize, { passive: true });
    window.addEventListener('load', this.onResize, { passive: true });

    // Anything that changes the wrapper's height — a font landing, a
    // mobile toolbar collapsing — re-times the whole sequence unless the
    // measurement follows it.
    if (this.wrapper && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.onResize());
      this.resizeObserver.observe(this.wrapper);
    }
  }

  private onResize = (): void => {
    this.measure();
    this.apply(this.readProgress(), true);
  };

  /**
   * Cached layout read. Never called from the scroll handler.
   *
   * The stage height is published to CSS from here rather than left to
   * `svh`: the CSS height and the height this measures against have to
   * be the same number, and viewport units are not reliably resolved
   * against the layout viewport.
   */
  private measure(): void {
    document.documentElement.style.setProperty('--stage-h', `${window.innerHeight}px`);
    if (!this.wrapper) return;
    const rect = this.wrapper.getBoundingClientRect();
    this.top = rect.top + window.scrollY;
    this.travel = Math.max(rect.height - window.innerHeight, 1);
  }

  private readProgress(): number {
    if (!this.wrapper) return 0;
    return Math.min(Math.max((window.scrollY - this.top) / this.travel, 0), 1);
  }

  private stateFor(progress: number): PrologueState {
    let chosen: PrologueState = 'full';
    for (const entry of STATES) if (progress >= entry.at) chosen = entry.state;
    return chosen;
  }

  private apply(progress: number, force = false): void {
    if (!force && Math.abs(progress - this.progress) < 0.0002) return;
    this.progress = progress;

    this.scene.setProgress(progress);

    const state = this.stateFor(progress);
    if (state !== this.state) {
      this.state = state;
      this.scene.setState(state);
      document.documentElement.dataset.prologueState = state;
    }

    for (const beat of this.beats) {
      const [a, b, c, d] = beat.range;
      const opacity = smoothstep(a, b, progress) * (1 - smoothstep(c, d, progress));
      const shown = this.reduced ? (opacity > 0.5 ? 1 : 0) : opacity;
      beat.el.style.opacity = shown.toFixed(3);
      // Opacity, never visibility: the causal statements stay in the
      // accessibility tree the whole way through.
      beat.el.style.pointerEvents = shown < 0.05 ? 'none' : 'auto';
    }

    if (this.frame) {
      const fade = 1 - smoothstep(FADE_FROM, 1, progress);
      this.frame.style.opacity = fade.toFixed(3);
    }
  }

  /**
   * Watches the prologue. Outside it the renderer is fully stopped —
   * nothing is consumed behind the editorial page — and the frame is
   * hidden so no body copy can ever sit on top of live WebGL.
   */
  private observe(): void {
    if (!this.wrapper || typeof IntersectionObserver === 'undefined') return;
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const nowVisible = entry.isIntersecting;
          if (nowVisible === this.visible) continue;
          this.visible = nowVisible;
          document.documentElement.classList.toggle('prologue-parked', !nowVisible);
          if (nowVisible) {
            this.measure();
            this.apply(this.readProgress(), true);
            if (!this.reduced) this.scene.start();
            else this.scene.renderStill();
          } else {
            this.scene.suspend();
          }
        }
      },
      { rootMargin: '0px' }
    );
    this.observer.observe(this.wrapper);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.measure();
    document.documentElement.dataset.prologueState = this.state;
    this.apply(this.readProgress(), true);
    this.observe();

    if (this.reduced) {
      window.addEventListener('scroll', this.onReducedScroll, { passive: true });
    } else {
      this.rafId = requestAnimationFrame(this.tick);
    }

    // The demonstration happens whether or not the visitor participates.
    this.autoTimer = window.setTimeout(() => {
      if (!this.scene.hasDisturbance) this.scene.disturb();
    }, 1500);

    window.addEventListener('pointerdown', this.onPointerDown, { passive: true });
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    window.clearTimeout(this.autoTimer);
    window.removeEventListener('scroll', this.onReducedScroll);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('resize', this.onResize);
    this.observer?.disconnect();
    this.resizeObserver?.disconnect();
  }

  /**
   * A press inside the entity's half of the frame makes the disturbance.
   * Never preventDefault-ed, so it cannot interfere with scrolling, and
   * it fires once: pointer movement across the copy changes nothing.
   */
  private onPointerDown = (event: PointerEvent): void => {
    if (!this.frame || this.scene.hasDisturbance) return;
    if (this.progress > 0.42) return;
    const rect = this.frame.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left + rect.width * 0.44 &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (!inside) return;
    this.scene.disturb(event.clientX, event.clientY);
  };

  private onReducedScroll = (): void => {
    this.apply(this.readProgress());
  };

  private tick = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);
    if (!this.visible) return;
    this.apply(this.readProgress());
  };

  /** Native smooth scroll: it respects reduced motion and leaves the wheel alone. */
  scrollTo(target: string | HTMLElement): void {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    el?.scrollIntoView({ behavior: this.reduced ? 'auto' : 'smooth', block: 'start' });
  }

  get prologueProgress(): number {
    return this.progress;
  }
}
