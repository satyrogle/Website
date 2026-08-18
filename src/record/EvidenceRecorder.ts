import type { WorldEvent } from '../sim/SimulationKernel';

/**
 * The record. Everything the world does that matters is written here,
 * in the DOM, readable without the canvas. The site holds itself to the
 * same standard the studio claims.
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
    const text = 'T+' + String(e.tick).padStart(6, '0') + ' · ' + e.text;

    if (this.list) {
      const li = document.createElement('li');
      li.textContent = text;
      li.className = 'entry--' + e.kind;
      this.list.prepend(li);
      while (this.list.children.length > this.maxEntries) {
        this.list.lastElementChild?.remove();
      }
    }

    if (this.chip) {
      this.chip.hidden = false;
      this.chip.textContent = text;
      this.chip.classList.remove('chip--event', 'chip--removed');
      if (e.kind === 'placed') this.chip.classList.add('chip--event');
      if (e.kind === 'removed') this.chip.classList.add('chip--removed');
    }
  }

  noWorld(): void {
    if (this.list) {
      const li = document.createElement('li');
      li.textContent = 'WEBGL UNAVAILABLE · STATIC RECORD ONLY';
      li.className = 'entry--seed';
      this.list.prepend(li);
    }
  }
}
