import { PRESS_ENERGY, type SceneController } from '../scene/SceneController';
import {
  DEBRIS_FIELD,
  DENSITY,
  GLOW,
  HOVER_FRINGE,
  HOVER_GAIN,
  HOVER_RADIUS,
  LAVA,
  PLATING,
  STAR,
  TRAIL,
} from '../scene/correction/FieldModel';
import { DEFAULT_DYNAMICS, INJECTION } from '../scene/correction/sim/DeviationField';
import { DEFAULT_CORRECTION } from '../scene/correction/sim/CorrectionOperator';

/**
 * TuningPanel — the feel of the system, on sliders.
 *
 * Development only. It is dynamically imported behind an `import.meta.env.DEV`
 * guard so it is not in the production bundle, and it has no dependencies:
 * for a fixed list of numbers with ranges, a library would be carrying its own
 * weight and nothing else.
 *
 * It exists because of how the alternative was going. Judging motion means
 * looking at it on the machine it runs on, and every round of that was costing
 * a source edit, a rebuild and a capture before anyone could say whether it
 * felt right. The numbers below are the ones that decide feel; moving them by
 * hand takes seconds and settles arguments that guessing cannot.
 *
 * Two honest limits:
 *
 *   - Nothing here is part of the recorded trace. A run tuned mid-flight is
 *     not a run that replays, which is fine for finding a value and is why the
 *     panel cannot ship.
 *   - The values found here are not saved. Copy them into the defaults they
 *     came from — the panel prints a block ready to paste.
 */

interface Knob {
  label: string;
  /** Which layer owns it. */
  group: 'dynamics' | 'correction' | 'render' | 'press';
  /** Property name within that group. */
  key: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** Where the shipped default lives, for the paste block. */
  source: string;
}

/**
 * Every value is read from the shipped default rather than repeated here. The
 * first version hardcoded them, and within one round of tuning the panel was
 * displaying numbers the site was not running — a tuning tool that lies about
 * the current state is worse than no tuning tool.
 */
const KNOBS: Knob[] = [
  // How a deviation behaves once it exists. Relaxation is how fast the world
  // returns to the law on its own — too fast and the disturbance settles before
  // the system has to act, so the whole proposition goes unwitnessed. Coupling
  // is how far it bleeds into the blades around it.
  { label: 'relaxation', group: 'dynamics', key: 'relaxation', min: 0.2, max: 8, step: 0.1, value: DEFAULT_DYNAMICS.relaxation, source: 'DEFAULT_DYNAMICS' },
  { label: 'coupling', group: 'dynamics', key: 'coupling', min: 0.5, max: 20, step: 0.5, value: DEFAULT_DYNAMICS.coupling, source: 'DEFAULT_DYNAMICS' },

  // How much of the choir one press moves, and how hard.
  { label: 'press energy', group: 'press', key: 'energy', min: 0.05, max: 3, step: 0.05, value: PRESS_ENERGY, source: 'PRESS_ENERGY' },
  { label: 'press radius', group: 'press', key: 'hops', min: 0.3, max: 6, step: 0.1, value: INJECTION.radius, source: 'INJECTION.radius' },

  // What the system notices, how long it waits, and how hard it pulls back.
  { label: 'sees violation above', group: 'correction', key: 'thetaOn', min: 0.01, max: 0.3, step: 0.005, value: DEFAULT_CORRECTION.thetaOn, source: 'DEFAULT_CORRECTION' },
  { label: 'releases below', group: 'correction', key: 'thetaOff', min: 0.005, max: 0.2, step: 0.005, value: DEFAULT_CORRECTION.thetaOff, source: 'DEFAULT_CORRECTION' },
  { label: 'waits (ticks)', group: 'correction', key: 'holdTicks', min: 4, max: 160, step: 2, value: DEFAULT_CORRECTION.holdTicks, source: 'DEFAULT_CORRECTION' },
  { label: 'pull, settled', group: 'correction', key: 'stiffnessTo', min: 0.005, max: 0.3, step: 0.005, value: DEFAULT_CORRECTION.stiffnessTo, source: 'DEFAULT_CORRECTION' },
  { label: 'ramp (ticks)', group: 'correction', key: 'rampTicks', min: 2, max: 120, step: 2, value: DEFAULT_CORRECTION.rampTicks, source: 'DEFAULT_CORRECTION' },
  { label: 'sensor memory (s)', group: 'correction', key: 'senseSeconds', min: 0.05, max: 2, step: 0.05, value: DEFAULT_CORRECTION.senseSeconds, source: 'DEFAULT_CORRECTION' },

  // The event. The star at the funnel's throat, the heat coming out of the
  // broken faces, and the approved plating on every fragment. The flare is
  // deliberately not here: scroll owns it, and a knob the render loop
  // overwrites every frame is a knob that lies.
  { label: 'star size', group: 'render', key: 'uStarRadius', min: 0.2, max: 2.5, step: 0.05, value: STAR.radius, source: 'STAR.radius' },
  { label: 'star glow', group: 'render', key: 'uStarGlow', min: 0.2, max: 12, step: 0.1, value: STAR.glow, source: 'STAR.glow' },
  { label: 'star irregularity', group: 'render', key: 'uStarNoise', min: 0, max: 1, step: 0.01, value: STAR.noise, source: 'STAR.noise' },
  { label: 'star ejecta', group: 'render', key: 'uEjecta', min: 0, max: 5, step: 0.05, value: STAR.ejecta, source: 'STAR.ejecta' },
  { label: 'fragment trails', group: 'render', key: 'uTrail', min: 0, max: 4, step: 0.05, value: TRAIL, source: 'TRAIL' },
  { label: 'debris density', group: 'render', key: 'uDebrisDensity', min: 0, max: 1, step: 0.01, value: DEBRIS_FIELD.density, source: 'DEBRIS_FIELD.density' },
  { label: 'debris cell', group: 'render', key: 'uDebrisCell', min: 0.5, max: 3, step: 0.05, value: DEBRIS_FIELD.cell, source: 'DEBRIS_FIELD.cell' },
  { label: 'break heat (lava)', group: 'render', key: 'uLava', min: 0, max: 8, step: 0.1, value: LAVA, source: 'LAVA' },
  { label: 'plate size', group: 'render', key: 'uPanelFreq', min: 0.4, max: 6, step: 0.05, value: PLATING.freq, source: 'PLATING.freq' },
  { label: 'plate relief', group: 'render', key: 'uRelief', min: 0, max: 0.3, step: 0.005, value: PLATING.relief, source: 'PLATING.relief' },
  { label: 'seam depth', group: 'render', key: 'uGroove', min: 0, max: 0.3, step: 0.005, value: PLATING.groove, source: 'PLATING.groove' },
  { label: 'seam light', group: 'render', key: 'uHeat', min: 0, max: 6, step: 0.05, value: PLATING.heat, source: 'PLATING.heat' },
  { label: 'hover reach', group: 'render', key: 'uHoverRadius', min: 0.1, max: 1.2, step: 0.02, value: HOVER_RADIUS, source: 'HOVER_RADIUS' },
  { label: 'hover warmth', group: 'render', key: 'uHoverGain', min: 0, max: 8, step: 0.1, value: HOVER_GAIN, source: 'HOVER_GAIN' },
  { label: 'hover edge (cyan)', group: 'render', key: 'uHoverFringe', min: 0, max: 3, step: 0.05, value: HOVER_FRINGE, source: 'HOVER_FRINGE' },
  { label: 'emission', group: 'render', key: 'uGlow', min: 0.2, max: 24, step: 0.1, value: GLOW, source: 'GLOW' },
  { label: 'boundary sharpness', group: 'render', key: 'uDensity', min: 0.5, max: 24, step: 0.1, value: DENSITY, source: 'DENSITY' },
];

export class TuningPanel {
  private readonly scene: SceneController;
  private readonly root: HTMLElement;

  constructor(scene: SceneController) {
    this.scene = scene;
    this.root = document.createElement('aside');
    this.root.className = 'tuning';
    this.root.innerHTML = `
      <header>
        <strong>feel</strong>
        <button type="button" data-close aria-label="Hide">×</button>
      </header>
      <div data-rows></div>
      <footer>
        <button type="button" data-copy>copy values</button>
        <span data-note></span>
      </footer>`;

    const rows = this.root.querySelector('[data-rows]') as HTMLElement;
    for (const knob of KNOBS) rows.appendChild(this.row(knob));

    this.root.querySelector('[data-close]')?.addEventListener('click', () => {
      this.root.classList.toggle('is-folded');
    });
    this.root.querySelector('[data-copy]')?.addEventListener('click', () => this.copy());

    document.body.appendChild(this.root);
    this.style();
  }

  private row(knob: Knob): HTMLElement {
    const row = document.createElement('label');
    row.innerHTML = `<span>${knob.label}</span><input type="range" min="${knob.min}" max="${knob.max}" step="${knob.step}" value="${knob.value}"><output>${knob.value}</output>`;

    const input = row.querySelector('input') as HTMLInputElement;
    const output = row.querySelector('output') as HTMLOutputElement;

    input.addEventListener('input', () => {
      knob.value = Number(input.value);
      output.textContent = String(knob.value);
      this.apply(knob);
    });

    // The panel sits over the canvas, and the canvas listens for presses on
    // the window. Without this, dragging a slider strikes the structure.
    row.addEventListener('pointerdown', (event) => event.stopPropagation());
    return row;
  }

  private apply(knob: Knob): void {
    if (knob.group === 'press') {
      this.scene.tune(knob.key === 'hops' ? { hops: knob.value } : { energy: knob.value });
      return;
    }
    this.scene.tune({ [knob.group]: { [knob.key]: knob.value } });
  }

  /** Prints the current settings grouped by where their defaults live. */
  private copy(): void {
    const groups = new Map<string, string[]>();
    for (const knob of KNOBS) {
      const list = groups.get(knob.source) ?? [];
      list.push(`  ${knob.key}: ${knob.value},`);
      groups.set(knob.source, list);
    }

    const text = [...groups]
      .map(([source, lines]) => `// ${source}\n${lines.join('\n')}`)
      .join('\n\n');

    void navigator.clipboard?.writeText(text).catch(() => undefined);
    console.log(`\n${text}\n`);
    const note = this.root.querySelector('[data-note]');
    if (note) {
      note.textContent = 'copied — also in the console';
      window.setTimeout(() => (note.textContent = ''), 2400);
    }
  }

  private style(): void {
    const style = document.createElement('style');
    style.textContent = `
      .tuning {
        position: fixed; top: 4rem; right: 1rem; z-index: 200;
        width: 17rem; max-height: 82vh; overflow: auto;
        background: rgba(8, 11, 16, 0.94);
        border: 1px solid rgba(230, 235, 240, 0.16);
        font-family: ui-monospace, 'IBM Plex Mono', monospace; font-size: 10px;
        color: #eef0f2; padding: 0.5rem 0.6rem;
      }
      .tuning.is-folded [data-rows], .tuning.is-folded footer { display: none; }
      .tuning header { display: flex; justify-content: space-between; align-items: center;
        letter-spacing: 0.2em; text-transform: uppercase; color: #858d94; margin-bottom: 0.5rem; }
      .tuning button { background: none; border: 1px solid rgba(230,235,240,0.2);
        color: #eef0f2; font: inherit; cursor: pointer; padding: 0.15rem 0.4rem; }
      .tuning label { display: grid; grid-template-columns: 6.6rem 1fr 2.4rem;
        align-items: center; gap: 0.35rem; margin-bottom: 0.2rem; }
      .tuning label > span { color: #858d94; }
      .tuning output { text-align: right; font-variant-numeric: tabular-nums; }
      .tuning input[type='range'] { width: 100%; accent-color: #4dd0ff; }
      .tuning footer { display: flex; gap: 0.5rem; align-items: center;
        margin-top: 0.5rem; color: #858d94; }`;
    document.head.appendChild(style);
  }

  dispose(): void {
    this.root.remove();
  }
}
