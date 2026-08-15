/**
 * YOUR RECORD — the floor.
 *
 * The two logs the system has been keeping are finally put next to each other,
 * and nothing here explains what that means. The visitor is given the clean
 * statement first, alone, with a whole viewport of nothing around it; the diff
 * is below, for anyone who goes looking. Do not interpret the horror in the
 * same instant you reveal it.
 *
 * Every figure is read from the simulation and the file. Nothing is authored,
 * nothing is estimated, and there is no path in here that can print a number
 * the system did not produce — which is what makes the one number that is a
 * lie worth printing. RESIDUAL DEVIATION is measured against what the sensor
 * can see, and below its threshold it sees nothing, so it reports zero over a
 * structure that is still drifting. Honest arithmetic and a false statement at
 * once.
 *
 * DOM only. It takes plain numbers and arrays, so the editorial layer never
 * imports the renderer.
 */

export interface RecordLine {
  source: string;
  node: number;
  tick: number;
  paths: number;
}

export interface RecordView {
  /** Real, cumulative across every visit the file remembers. */
  adjustments: number;
  /** What the sensor can see. Zero once a correction completes. */
  residual: number;
  physical: RecordLine[];
  recorded: Array<RecordLine & { divergence: string }>;
  statement: [string, string];
  visits: number;
}

const cell = (line: RecordLine | undefined): string =>
  line
    ? `${line.source.padEnd(8)} node ${String(line.node).padStart(5)}   t ${String(line.tick).padStart(5)}   paths ${String(line.paths).padStart(3)}`
    : '—';

export class RecordPanel {
  private readonly root: HTMLElement;
  private heading: HTMLElement;

  constructor(host: HTMLElement) {
    this.root = host;
    this.root.hidden = true;
    this.root.setAttribute('role', 'region');
    this.root.setAttribute('aria-label', 'Your record');
    this.heading = document.createElement('h1');
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /**
   * Build and reveal.
   *
   * Rebuilt on open rather than kept in sync: the floor is reached once, at
   * the end, and a panel that updates while nobody is looking at it is a
   * dashboard.
   */
  show(view: RecordView): void {
    this.root.textContent = '';

    // --- the clean statement, alone -----------------------------------
    const first = document.createElement('section');
    first.className = 'record__statement';

    this.heading = document.createElement('h1');
    this.heading.className = 'record__title';
    this.heading.tabIndex = -1;
    this.heading.textContent = 'Your record';
    first.appendChild(this.heading);

    const figures = document.createElement('dl');
    figures.className = 'record__figures';
    for (const [term, value] of [
      ['Adjustments applied', String(view.adjustments)],
      ['Residual deviation', String(view.residual)],
    ]) {
      const dt = document.createElement('dt');
      dt.textContent = term;
      const dd = document.createElement('dd');
      dd.textContent = value;
      figures.append(dt, dd);
    }
    first.appendChild(figures);
    this.root.appendChild(first);

    // --- the diff, below, for anyone who goes looking ------------------
    const second = document.createElement('section');
    second.className = 'record__diff';

    const statement = document.createElement('pre');
    statement.className = 'record__lines';
    statement.textContent = view.statement.join('\n');
    second.appendChild(statement);

    const table = document.createElement('table');
    table.className = 'record__table';
    const head = document.createElement('thead');
    head.innerHTML =
      '<tr><th scope="col">What happened</th><th scope="col">What is recorded</th><th scope="col">Difference</th></tr>';
    table.appendChild(head);

    const body = document.createElement('tbody');
    const rows = Math.max(view.physical.length, view.recorded.length);
    for (let i = 0; i < rows; i++) {
      const p = view.physical[i];
      const r = view.recorded[i];
      const tr = document.createElement('tr');

      const left = document.createElement('td');
      left.textContent = cell(p);
      const right = document.createElement('td');
      right.textContent = cell(r);
      const note = document.createElement('td');

      if (!r) {
        note.textContent = 'not recorded';
      } else if (!p) {
        note.textContent = 'no counterpart';
      } else {
        const differs: string[] = [];
        if (p.source !== r.source) differs.push('attributed');
        if (p.node !== r.node) differs.push('position');
        if (p.tick !== r.tick) differs.push('time');
        if (p.paths !== r.paths) differs.push('paths');
        note.textContent = differs.length ? differs.join(', ') : 'matches';
        if (!differs.length) tr.className = 'is-match';
      }

      tr.append(left, right, note);
      body.appendChild(tr);
    }
    table.appendChild(body);
    second.appendChild(table);

    const visits = document.createElement('p');
    visits.className = 'record__visits';
    visits.textContent =
      view.visits === 1 ? 'One visit on file.' : `${view.visits} visits on file.`;
    second.appendChild(visits);

    this.root.appendChild(second);
    this.root.hidden = false;
    // Focus the heading rather than the region, so a screen reader announces
    // what this is before reading a table of numbers.
    this.heading.focus();
  }

  hide(): void {
    this.root.hidden = true;
  }
}
