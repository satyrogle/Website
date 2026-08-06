/**
 * AccessibilityController
 *
 * Progressive enhancement for the interactive parts of the page.
 *
 * The markup ships in its working state: all three foundation
 * explanations are present and visible, the evidence disclosure is a
 * native <details>, and every control is a real button or link. This
 * module only upgrades that baseline — it adds the tab semantics and
 * hides the inactive panels *after* confirming it is running, so a
 * script failure degrades to "everything is readable" rather than
 * "nothing is readable".
 */

export interface LayerSelectionHandler {
  (index: number): void;
}

export class AccessibilityController {
  private tabs: HTMLButtonElement[] = [];
  private panels: HTMLElement[] = [];
  private selected = 0;
  private onSelect: LayerSelectionHandler | null = null;

  init(onSelect?: LayerSelectionHandler): void {
    this.onSelect = onSelect ?? null;
    this.setupLayerTabs();
    this.setupMagneticControls();
    this.setupDisclosureFocus();
  }

  // ------------------------------------------------------------------
  //  Foundation layer selector — an ARIA tablist over real buttons
  // ------------------------------------------------------------------

  private setupLayerTabs(): void {
    const root = document.querySelector<HTMLElement>('[data-layers]');
    if (!root) return;

    this.tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-layer-tab]'));
    this.panels = Array.from(root.querySelectorAll<HTMLElement>('[data-layer-panel]'));
    if (!this.tabs.length || this.tabs.length !== this.panels.length) return;

    // Only now does it become safe to hide panels.
    root.classList.add('is-enhanced');

    const list = root.querySelector<HTMLElement>('[data-layer-list]');
    list?.setAttribute('role', 'tablist');
    list?.setAttribute('aria-orientation', 'vertical');

    this.tabs.forEach((tab, index) => {
      const panel = this.panels[index];
      const tabId = `layer-tab-${index}`;
      const panelId = `layer-panel-${index}`;

      tab.id = tabId;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', panelId);
      tab.type = 'button';

      panel.id = panelId;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tabId);
      // Panels are focusable so keyboard users can reach copy that is
      // longer than the viewport.
      panel.tabIndex = 0;

      tab.addEventListener('click', () => this.select(index));
      tab.addEventListener('keydown', (event) => this.onTabKeydown(event, index));
    });

    this.select(0);
  }

  private onTabKeydown(event: KeyboardEvent, index: number): void {
    const last = this.tabs.length - 1;
    let next: number | null = null;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        next = index === last ? 0 : index + 1;
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        next = index === 0 ? last : index - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }

    event.preventDefault();
    this.select(next);
    this.tabs[next].focus();
  }

  private select(index: number): void {
    this.selected = index;
    this.tabs.forEach((tab, i) => {
      const active = i === index;
      tab.setAttribute('aria-selected', String(active));
      // Roving tabindex: one stop for the group, arrow keys within it.
      tab.tabIndex = active ? 0 : -1;
      this.panels[i].hidden = !active;
    });
    this.onSelect?.(index);
  }

  get selectedLayer(): number {
    return this.selected;
  }

  // ------------------------------------------------------------------
  //  Magnetic pull — desktop, fine-pointer only, and purely additive
  // ------------------------------------------------------------------

  private setupMagneticControls(): void {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const reduced = document.documentElement.classList.contains('reduced-motion');
    if (!fine || reduced) return;

    const controls = document.querySelectorAll<HTMLElement>('[data-magnetic]');

    controls.forEach((control) => {
      let frame = 0;

      const onMove = (event: PointerEvent) => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const rect = control.getBoundingClientRect();
          const dx = event.clientX - (rect.left + rect.width / 2);
          const dy = event.clientY - (rect.top + rect.height / 2);
          // Small, capped displacement. The control never moves far
          // enough to escape the pointer that is chasing it.
          const x = Math.max(-10, Math.min(10, dx * 0.22));
          const y = Math.max(-6, Math.min(6, dy * 0.22));
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

  // ------------------------------------------------------------------
  //  Disclosure
  // ------------------------------------------------------------------

  /**
   * Native <details> already handles keyboard and screen readers, so the
   * only jobs here are telling listeners that the page height changed,
   * and making sure the evidence is actually on the page when printed.
   *
   * A closed <details> does not render its contents at all, so no print
   * stylesheet can bring the carry-over table back. It has to be opened
   * before the print snapshot is taken and restored afterwards.
   */
  private setupDisclosureFocus(): void {
    const details = Array.from(
      document.querySelectorAll<HTMLDetailsElement>('[data-disclosure]')
    );

    details.forEach((el) => {
      el.addEventListener('toggle', () => {
        el.dispatchEvent(new CustomEvent('layoutchange', { bubbles: true }));
      });
    });

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

    // Safari and the print-preview paths in some browsers only surface
    // this as a media query change.
    const printQuery = window.matchMedia('print');
    printQuery.addEventListener('change', (event) => {
      if (event.matches) expand();
      else restore();
    });
  }
}
