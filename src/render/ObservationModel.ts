import type { ExperienceState } from '../core/ExperienceState';

/**
 * Derives what the camera reads from the one authoritative state.
 * Scale travel never swaps assets and never fakes a transformation:
 * macro, meso and micro are three readings of the same trail texture.
 */

export interface ViewState {
  centerX: number;
  centerY: number;
  winX: number;
  winY: number;
  zoom: number;
  severity: number;
  exposure: number;
  glow: number;
  agentOpacity: number;
  time: number;
}

interface Key {
  p: number;
  zoom: number;
  sev: number;
}

/** The journey: enter, travel, stops, descent, and the return. */
const KEYS: Key[] = [
  { p: 0.0, zoom: 1.0, sev: 0.0 },
  { p: 0.1, zoom: 1.35, sev: 0.0 },
  { p: 0.22, zoom: 2.6, sev: 0.06 },
  { p: 0.35, zoom: 3.4, sev: 0.12 },
  { p: 0.48, zoom: 4.6, sev: 0.55 },
  { p: 0.61, zoom: 6.0, sev: 0.72 },
  { p: 0.75, zoom: 8.0, sev: 0.9 },
  { p: 0.87, zoom: 3.0, sev: 0.62 },
  { p: 1.0, zoom: 1.0, sev: 0.5 }
];

export class ObservationModel {
  readonly view: ViewState = {
    centerX: 0.5,
    centerY: 0.5,
    winX: 1,
    winY: 1,
    zoom: 1,
    severity: 0,
    exposure: 0.3,
    glow: 0.9,
    agentOpacity: 0,
    time: 0
  };

  private logZoom = 0;
  private cx = 0.5;
  private cy = 0.5;
  private sev = 0;

  constructor(
    private readonly state: ExperienceState,
    private readonly focusProvider: () => { x: number; y: number }
  ) {}

  update(dt: number): void {
    const t = evaluate(this.state.progress);
    const targetLogZoom = Math.log(t.zoom);

    // smoothing follows input closely; it never runs ahead of it
    const rate = this.state.reducedMotion ? 1000 : 5.0;
    const k = 1 - Math.exp(-dt * rate);
    this.logZoom += (targetLogZoom - this.logZoom) * k;
    this.sev += (t.sev - this.sev) * k;

    const zoom = Math.exp(this.logZoom);
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const w0 = aspect >= 1 ? 1 : aspect;
    const h0 = aspect >= 1 ? 1 / aspect : 1;
    const winX = w0 / zoom;
    const winY = h0 / zoom;

    // the camera is pulled toward the retained event as scale falls
    const focus = this.focusProvider();
    const pull = smoothstep(2.0, 6.0, zoom);
    const tx = 0.5 + (focus.x - 0.5) * pull;
    const ty = 0.5 + (focus.y - 0.5) * pull;
    this.cx += (tx - this.cx) * k;
    this.cy += (ty - this.cy) * k;

    const v = this.view;
    v.zoom = zoom;
    v.severity = this.sev;
    v.winX = winX;
    v.winY = winY;
    v.centerX = clampCenter(this.cx, winX);
    v.centerY = clampCenter(this.cy, winY);
    v.exposure = 0.3 + (0.17 - 0.3) * this.sev;
    v.glow = 0.9 + (0.3 - 0.9) * this.sev;
    v.agentOpacity = smoothstep(4.5, 7.0, zoom) * (0.55 + 0.45 * this.sev);
    v.time += dt;
  }
}

function evaluate(p: number): { zoom: number; sev: number } {
  const first = KEYS[0]!;
  const last = KEYS[KEYS.length - 1]!;
  if (p <= first.p) return { zoom: first.zoom, sev: first.sev };
  if (p >= last.p) return { zoom: last.zoom, sev: last.sev };
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i]!;
    const b = KEYS[i + 1]!;
    if (p >= a.p && p <= b.p) {
      const t = smoothstep(a.p, b.p, p);
      // zoom interpolates in log space so travel feels constant
      const zoom = Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * t);
      return { zoom, sev: a.sev + (b.sev - a.sev) * t };
    }
  }
  return { zoom: last.zoom, sev: last.sev };
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function clampCenter(c: number, win: number): number {
  const half = Math.min(0.5, win / 2);
  return Math.min(1 - half, Math.max(half, c));
}
