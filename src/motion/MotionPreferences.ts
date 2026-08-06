/**
 * MotionPreferences
 *
 * Single source of truth for whether the site is allowed to move.
 *
 * Reduced motion is treated as a different composition, not a disabled
 * one: the smooth-scroll layer is removed, spatial travel and text
 * choreography are removed, and the 3D system holds a deliberately
 * composed still. Nothing is hidden and nothing depends on an animation
 * having run.
 */

export class MotionPreferences {
  readonly reduced: boolean;
  private query: MediaQueryList | null = null;

  constructor() {
    this.query = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reduced = this.query.matches;

    const root = document.documentElement;
    root.classList.toggle('reduced-motion', this.reduced);

    // A mid-session change is rare, but the honest response is a reload
    // rather than trying to tear down half a choreography.
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches !== this.reduced) window.location.reload();
    };
    this.query.addEventListener('change', onChange);
  }

  /** True when full choreography should run. */
  get animated(): boolean {
    return !this.reduced;
  }
}
