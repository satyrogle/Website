/**
 * RecordController — the file the system keeps about you.
 *
 * Three things live here, because they are the same thing seen from different
 * distances: the floor panel, the false first action, and the record that
 * survives the visit.
 *
 * Every number it prints is read from the Worker's counters. Nothing is
 * authored, nothing is estimated, and there is no path in this file that can
 * put a figure on screen that the simulation did not produce — which is what
 * makes the one number that is a lie interesting. RESIDUAL DEVIATION is
 * measured against what the system can see, and below its own release
 * threshold it can see nothing, so it reports zero over a world that is still
 * moving. The zero is honest arithmetic and a false statement at the same
 * time. That is the proposition, printed.
 */

const STORAGE_KEY = 'darkLattice.record';

/** What survives the visit. Small, local, and never sent anywhere. */
interface StoredRecord {
  version: 1;
  visits: number;
  /** Adjustments accumulated across every previous visit. */
  adjustments: number;
  /** Whether the last visit went into the simulation at all. */
  entered: boolean;
}

/**
 * The narrow view of the scene this needs. Kept structural so the editorial
 * layer does not import the renderer.
 */
export interface RecordSource {
  readonly telemetry: { residual: number; injections: number };
  /**
   * Adjustments this visit is answerable for — the Worker's count minus any
   * the system made to itself before the visitor did anything.
   */
  readonly visitAdjustments: number;
  readonly struck: boolean;
  readonly budgetLeft: number;
  pressCentre(): number;
  /** Pulls the newest counters without drawing. */
  pollTelemetry(): void;
}

/** Idle before the system supplies the visitor's first action for them. */
const FALSE_ACTION_DELAY = 8000;

const MACHINE_BANDS = new Set(['open', 'ask', 'notice', 'gradient', 'floor']);

/**
 * The one rule this string has to obey: it reads "0" if and only if the
 * system's own reading is zero.
 *
 * Two decimals alone breaks that. A residual of 0.004 is a violation the
 * sensor can see and would have printed as "0.00" — a zero the arithmetic
 * never produced, in the one line on the site whose entire weight rests on
 * being a reading rather than a statement. Small readings therefore keep a
 * significant figure instead of being rounded into the claim.
 */
function formatResidual(value: number): string {
  if (value <= 0) return '0';
  if (value < 0.005) return value.toPrecision(1);
  return value.toFixed(2);
}

function loadStored(): StoredRecord | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredRecord>;
    if (parsed?.version !== 1) return null;
    return {
      version: 1,
      visits: Number(parsed.visits) || 0,
      adjustments: Number(parsed.adjustments) || 0,
      entered: parsed.entered === true,
    };
  } catch {
    // Storage blocked or corrupt. A visitor with no history is a valid state,
    // so there is nothing to recover from and nothing to report.
    return null;
  }
}

export interface RecordOptions {
  /**
   * Whether the system is allowed to supply the first action. Off under
   * reduced motion: there is no live event to watch there, so an injection
   * would put an adjustment on the visitor's record for something they were
   * never shown.
   */
  falseAction: boolean;
}

export class RecordController {
  private readonly scene: RecordSource | null;
  private readonly options: RecordOptions;
  private readonly panel: HTMLElement | null;
  private readonly adjustmentsOut: HTMLElement | null;
  private readonly residualOut: HTMLElement | null;
  private readonly noteOut: HTMLElement | null;

  /** The record as it stood when this visit began. */
  private previous: StoredRecord | null;
  private entered = false;
  private band = '';

  private falseActionTimer = 0;
  private falseActionDone = false;
  private refreshTimer = 0;

  constructor(scene: RecordSource | null, options: RecordOptions = { falseAction: true }) {
    this.scene = scene;
    this.options = options;
    this.panel = document.querySelector<HTMLElement>('[data-record]');
    this.adjustmentsOut = document.querySelector<HTMLElement>('[data-record-adjustments]');
    this.residualOut = document.querySelector<HTMLElement>('[data-record-residual]');
    this.noteOut = document.querySelector<HTMLElement>('[data-record-note]');
    this.previous = loadStored();
  }

  init(): void {
    if (this.panel) this.panel.hidden = false;

    document.addEventListener('bandchange', this.onBandChange as EventListener);
    document.addEventListener('injected', this.onInjected as EventListener);
    window.addEventListener('pagehide', this.commit);
    document.addEventListener('visibilitychange', this.onVisibility);

    this.wireSkip();
    this.armFalseAction();
    this.render();

    // The visit is counted the moment it starts. Someone who closes the tab
    // after four seconds still happened, and the record has to say so.
    this.commit();
  }

  // ------------------------------------------------------------------
  //  The skip path — recorded, not hidden
  // ------------------------------------------------------------------

  private wireSkip(): void {
    document.querySelectorAll<HTMLAnchorElement>('[data-skip]').forEach((link) => {
      link.addEventListener('click', () => {
        // Not marked as entered, and not counted as a refusal either: the
        // record simply says what happened. Leaving is a permitted state.
        this.cancelFalseAction();
        this.commit();
      });
    });
  }

  // ------------------------------------------------------------------
  //  The false first action
  // ------------------------------------------------------------------

  /**
   * If nobody touches the structure, the system supplies the touch itself,
   * corrects it, and files the adjustment under the visitor. Nothing
   * distinguishes it from a real press anywhere downstream, which is the
   * point: the record does not have a column for whose fault it was.
   */
  private armFalseAction(): void {
    if (!this.options.falseAction) return;
    if (!this.scene || this.falseActionDone || this.falseActionTimer) return;
    this.falseActionTimer = window.setTimeout(() => {
      this.falseActionTimer = 0;
      if (!this.scene || this.scene.struck) return;
      if (!MACHINE_BANDS.has(this.band || 'open')) return;
      this.falseActionDone = true;
      this.scene.pressCentre();
    }, FALSE_ACTION_DELAY);
  }

  private cancelFalseAction(): void {
    if (!this.falseActionTimer) return;
    window.clearTimeout(this.falseActionTimer);
    this.falseActionTimer = 0;
  }

  // ------------------------------------------------------------------
  //  Events
  // ------------------------------------------------------------------

  private onBandChange = (event: CustomEvent<{ band: string }>): void => {
    this.band = event.detail.band;

    // Past the invitation is far enough in to count as having entered. The
    // skip path leaves from the first frame, so it never reaches this.
    if (this.band === 'notice' || this.band === 'gradient' || this.band === 'floor') {
      this.entered = true;
    }

    if (this.band === 'editorial') {
      this.cancelFalseAction();
      this.stopRefreshing();
      this.commit();
    } else {
      this.armFalseAction();
    }

    // The counters only change while the machine is running, and they are only
    // read at the floor, so the panel is refreshed there and nowhere else.
    if (this.band === 'floor') this.startRefreshing();
    else this.stopRefreshing();
  };

  private onInjected = (): void => {
    this.entered = true;
    this.cancelFalseAction();
    this.falseActionDone = true;

    // The invitation goes quiet while the budget is empty and comes back when
    // it refills. Left permanently disabled it read as a broken control.
    this.syncInvitation();
    window.setTimeout(() => this.syncInvitation(), 5200);
  };

  private syncInvitation(): void {
    const spent = !this.scene || this.scene.budgetLeft <= 0;
    document.querySelectorAll<HTMLButtonElement>('[data-inject]').forEach((button) => {
      button.disabled = spent;
    });
  }

  private onVisibility = (): void => {
    if (document.hidden) this.commit();
  };

  // ------------------------------------------------------------------
  //  The panel
  // ------------------------------------------------------------------

  private startRefreshing(): void {
    if (this.refreshTimer) return;
    this.render();
    this.refreshTimer = window.setInterval(() => this.render(), 250);
  }

  private stopRefreshing(): void {
    if (!this.refreshTimer) return;
    window.clearInterval(this.refreshTimer);
    this.refreshTimer = 0;
  }

  private render(): void {
    // The panel is the only place these numbers are read, and on the
    // reduced-motion path nothing else is consuming snapshots, so the read
    // has to pull them itself.
    this.scene?.pollTelemetry();

    const adjustments = this.scene?.visitAdjustments ?? 0;
    const residual = this.scene?.telemetry.residual ?? 0;

    if (this.adjustmentsOut) this.adjustmentsOut.textContent = String(adjustments);
    if (this.residualOut) {
      this.residualOut.textContent = formatResidual(residual);
    }

    if (!this.noteOut) return;

    const notes: string[] = [];
    if (!this.entered) notes.push('Simulation: not entered.');
    if (this.previous && this.previous.visits > 0) {
      notes.push(
        `Previous visits: ${this.previous.visits}. Adjustments carried: ${this.previous.adjustments}.`
      );
    }

    this.noteOut.textContent = notes.join(' ');
    this.noteOut.hidden = notes.length === 0;
  }

  // ------------------------------------------------------------------
  //  Persistence
  // ------------------------------------------------------------------

  /**
   * Written as a total rather than as an increment, so committing twice —
   * which happens whenever a tab is hidden and then closed — cannot inflate
   * the count. The visit contributes exactly what the Worker counted.
   */
  private commit = (): void => {
    const record: StoredRecord = {
      version: 1,
      visits: (this.previous?.visits ?? 0) + 1,
      adjustments: (this.previous?.adjustments ?? 0) + (this.scene?.visitAdjustments ?? 0),
      entered: this.entered,
    };

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch {
      // Private browsing, or storage denied. The visit still happened; the
      // site simply will not remember it, and nothing on screen depends on it.
    }
  };

  dispose(): void {
    this.cancelFalseAction();
    this.stopRefreshing();
    document.removeEventListener('bandchange', this.onBandChange as EventListener);
    document.removeEventListener('injected', this.onInjected as EventListener);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.commit);
  }
}
