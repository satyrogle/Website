/**
 * The readout. Every value here is measured at runtime — nothing is a constant
 * typed in to look convincing, which is the only reason a panel like this is
 * worth showing at all.
 */

export interface InspectorFields {
  backend: string;
  nodes: number;
  edges: number;
  meanDegree: number;
  sourceSha: string;
  tick: number;
  simulatedSeconds: number;
  injections: number;
  reachedNodes: number;
  activeNodes: number;
  retainingNodes: number;
  meanRetained: number;
  maxRetained: number;
  checksum: number;
  stepMs: number;
  frameMs: number;
  frameP95: number;
}

const ROWS: [keyof InspectorFields, string, (value: never) => string][] = [
  ['backend', 'RENDER BACKEND', (v: string) => v],
  ['nodes', 'GRAPH NODES', (v: number) => v.toLocaleString()],
  ['edges', 'GRAPH EDGES', (v: number) => v.toLocaleString()],
  ['meanDegree', 'MEAN DEGREE', (v: number) => v.toFixed(2)],
  ['sourceSha', 'SOURCE ASSET', (v: string) => v.slice(0, 12)],
  ['tick', 'SIMULATION TICK', (v: number) => v.toLocaleString()],
  ['simulatedSeconds', 'SIMULATED TIME', (v: number) => `${v.toFixed(2)} s`],
  ['injections', 'DISTURBANCES', (v: number) => String(v)],
  ['reachedNodes', 'NODES REACHED', (v: number) => v.toLocaleString()],
  ['activeNodes', 'ACTIVE NOW', (v: number) => v.toLocaleString()],
  ['retainingNodes', 'RETAINING MEMORY', (v: number) => v.toLocaleString()],
  ['meanRetained', 'MEAN RETAINED', (v: number) => v.toFixed(5)],
  ['maxRetained', 'MAX RETAINED', (v: number) => v.toFixed(5)],
  ['checksum', 'STATE CHECKSUM', (v: number) => `0x${v.toString(16).padStart(8, '0')}`],
  ['stepMs', 'SIM STEP', (v: number) => `${v.toFixed(3)} ms`],
  ['frameMs', 'FRAME', (v: number) => `${v.toFixed(2)} ms`],
  ['frameP95', 'FRAME p95', (v: number) => `${v.toFixed(2)} ms`],
];

export class PulseInspector {
  private readonly values = new Map<string, HTMLElement>();

  constructor(container: HTMLElement) {
    const list = document.createElement('dl');
    list.className = 'inspector__list';

    for (const [key, label] of ROWS) {
      const term = document.createElement('dt');
      term.textContent = label;
      const value = document.createElement('dd');
      value.textContent = '—';
      list.append(term, value);
      this.values.set(key, value);
    }

    container.append(list);
  }

  update(fields: Partial<InspectorFields>): void {
    for (const [key, , format] of ROWS) {
      const value = fields[key];
      if (value === undefined) continue;
      const element = this.values.get(key);
      if (element) element.textContent = (format as (v: unknown) => string)(value);
    }
  }
}
