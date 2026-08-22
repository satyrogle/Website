import type { WorldEvent } from './events';

/**
 * The record, rendered as an institutional ledger: tick, event, status.
 * Everything the world does that matters is written here, in the DOM,
 * readable without the canvas. The site holds itself to the same
 * standard the studio claims.
 */
export class EvidenceRecorder {
  private readonly list: HTMLOListElement | null;
  private readonly chip: HTMLElement | null;
  private readonly maxEntries = 60;

  constructor() {
    this.list = document.querySelector<HTMLOListElement>('#record-list');
    this.chip = document.querySelector<HTMLElement>('#record-chip');
  }

  add(e: WorldEvent): void {
    // negative ticks are the prior history: before observation began
    const tickLabel =
      e.tick < 0
        ? 'T-' + String(-e.tick).padStart(6, '0')
        : 'T+' + String(e.tick).padStart(6, '0');

    if (this.list) {
      const li = document.createElement('li');
      li.className = 'entry--' + e.kind + ' is-new';
      for (const part of [tickLabel, e.text, e.status]) {
        const span = document.createElement('span');
        span.textContent = part;
        li.appendChild(span);
      }
      this.list.prepend(li);
      while (this.list.children.length > this.maxEntries) {
        this.list.lastElementChild?.remove();
      }
    }

    this.setChip(tickLabel + ' · ' + e.text + ' · ' + e.status, e.kind);
  }

  /** Transient chip text with no ledger row (warm-up, notices). */
  notice(text: string): void {
    this.setChip(text, 'seed');
  }

  noWorld(): void {
    if (this.list) {
      const li = document.createElement('li');
      li.className = 'entry--seed';
      for (const part of ['T+000000', 'WEBGL UNAVAILABLE', 'STILL PAGE']) {
        const span = document.createElement('span');
        span.textContent = part;
        li.appendChild(span);
      }
      this.list.prepend(li);
    }
  }

  private setChip(text: string, kind: WorldEvent['kind']): void {
    if (!this.chip) return;
    this.chip.hidden = false;
    this.chip.textContent = text;
    this.chip.classList.remove('chip--event', 'chip--removed');
    if (kind === 'placed') this.chip.classList.add('chip--event');
    if (kind === 'removed') this.chip.classList.add('chip--removed');
  }
}
