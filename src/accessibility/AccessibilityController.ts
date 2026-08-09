/**
 * AccessibilityController
 *
 * Progressive enhancement only. The markup ships in its working state:
 * every section is present and readable, every control is a real link or
 * button, and nothing here is required for the page to be usable.
 */

export class AccessibilityController {
  init(): void {
    this.setupMagneticControls();
    this.setupPrintDisclosures();
  }

  /** Desktop, fine-pointer only, and purely additive. */
  private setupMagneticControls(): void {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const reduced = document.documentElement.classList.contains('reduced-motion');
    if (!fine || reduced) return;

    document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((control) => {
      let frame = 0;

      const onMove = (event: PointerEvent) => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const rect = control.getBoundingClientRect();
          const dx = event.clientX - (rect.left + rect.width / 2);
          const dy = event.clientY - (rect.top + rect.height / 2);
          // Capped: the control never moves far enough to escape the
          // pointer that is chasing it.
          const x = Math.max(-8, Math.min(8, dx * 0.18));
          const y = Math.max(-5, Math.min(5, dy * 0.18));
          control.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        });
      };

      const reset = () => {
        cancelAnimationFrame(frame);
        control.style.transform = '';
      };

      control.addEventListener('pointerenter', () => {
        control.style.transition = 'transform 240ms cubic-bezier(0.16, 1, 0.3, 1)';
      });
      control.addEventListener('pointermove', onMove);
      control.addEventListener('pointerleave', reset);
      // Keyboard focus must never leave the control displaced.
      control.addEventListener('blur', reset);
    });
  }

  /**
   * A closed <details> does not render its contents at all, so no print
   * stylesheet can bring them back. They have to be opened before the
   * print snapshot is taken and restored afterwards.
   */
  private setupPrintDisclosures(): void {
    const details = Array.from(
      document.querySelectorAll<HTMLDetailsElement>('[data-disclosure]')
    );
    if (!details.length) return;

    let wasOpen: boolean[] = [];

    const expand = () => {
      wasOpen = details.map((el) => el.open);
      details.forEach((el) => {
        el.open = true;
      });
    };

    const restore = () => {
      details.forEach((el, i) => {
        el.open = wasOpen[i] ?? false;
      });
    };

    window.addEventListener('beforeprint', expand);
    window.addEventListener('afterprint', restore);

    // Safari and some print-preview paths only surface this as a media
    // query change.
    const printQuery = window.matchMedia('print');
    printQuery.addEventListener('change', (event) => {
      if (event.matches) expand();
      else restore();
    });
  }
}
