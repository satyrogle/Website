/**
 * The tuning panel. Development only.
 *
 * Every value the four-frame gate settled — the resting fraction, the reveal
 * target, the deviation and arrest gains, the body's face and rim — was found
 * by editing a constant, rebuilding, capturing on the GPU and looking at a
 * PNG. That loop costs minutes per guess, and it is why "reduce the cyan gain
 * from 5.4 to about 4.3" took a full round trip to answer.
 *
 * A slider answers it in seconds, against a live frame, on the machine it will
 * actually run on. That is the entire justification and the whole scope.
 *
 * **This panel changes nothing permanently.** It writes to live uniforms; it
 * does not write to source. A value found here has to be typed into the file
 * it came from, with a comment saying why, before it means anything — and the
 * locked defaults are what ship until someone does that deliberately.
 *
 * Tweakpane, not Leva: Leva is a React component and would drag React,
 * ReactDOM and a renderer into a project whose stack explicitly locks them
 * out. Tweakpane is vanilla and has no dependencies at all — verified before
 * installing, because npm resolving a peer dependency in the background is the
 * exact way an architecture changes while a build reports success.
 *
 * Dynamically imported behind `import.meta.env.DEV`, so it is not in the
 * production bundle. `?quiet` suppresses it, because a capture harness should
 * photograph the hero rather than a picture of the sliders.
 */

import type { Pane } from 'tweakpane';
import type { ContainmentHero } from '../scene/ContainmentHero';

/**
 * What each control is, in the terms the project argues in.
 *
 * Ranges bracket the gated value rather than spanning the possible: a slider
 * that runs 0..10 on a value settled at 4.3 spends most of its travel in
 * places already known to be wrong.
 */
interface Knob {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Why this number matters, so the panel teaches rather than just exposes. */
  note: string;
}

const GROUPS: Array<{ title: string; knobs: Knob[] }> = [
  {
    title: 'The frame',
    knobs: [
      { key: 'progress', label: 'rail  OBSERVE→CROSS', min: 0, max: 1, step: 0.001,
        note: 'Camera position along the authored rail. 0 is OBSERVE, 1 is CROSS.' },
    ],
  },
  {
    title: 'At rest — the thing that fixed the feather read',
    knobs: [
      { key: 'uRestFraction', label: 'fibres at rest', min: 0, max: 0.5, step: 0.005,
        note: 'Fraction of the graph floor kept at rest. Above ~0.25 the fibres become the object again and it reads as hair.' },
      { key: 'uFloor', label: 'graph floor', min: 0, max: 0.2, step: 0.001,
        note: 'Base brightness of one trajectory. Additive, so overlaps multiply it.' },
      { key: 'uFace', label: 'body face', min: 0, max: 0.08, step: 0.001,
        note: 'Near-black by law. Lift it and the body becomes a lit slab.' },
      { key: 'uRim', label: 'body rim', min: 0, max: 1, step: 0.01,
        note: 'The grazing edge. This is the silhouette; almost everything the eye uses.' },
      { key: 'uWash', label: 'body wash', min: 0, max: 0.1, step: 0.002,
        note: 'Directionless fill so a face-on region is not a flat cutout.' },
      { key: 'uCrest', label: 'ridge crest', min: 0, max: 1.2, step: 0.01,
        note: 'The dozen structural veins. Raise the count and it corrugates.' },
    ],
  },
  {
    title: 'Hover — presence',
    knobs: [
      { key: 'uRevealTarget', label: 'reveal target', min: 0, max: 1, step: 0.01,
        note: 'What a woken fibre rises to. Past ~0.7 the region saturates into a white blob and shows no paths.' },
    ],
  },
  {
    title: 'Event — deviation and its suppression',
    knobs: [
      { key: 'uDeviationGain', label: 'cyan  deviation', min: 0, max: 9, step: 0.1,
        note: 'Gated at 4.3. At 5.4 the peak stopped being a network and became a luminous slab.' },
      { key: 'uArrestGain', label: 'violet  arrest', min: 0, max: 12, step: 0.1,
        note: 'Gated at 6.2, which put the correction at ~59% of the cascade. Below half it reads as an afterthought.' },
    ],
  },
  {
    title: 'Halation — what may bloom',
    knobs: [
      { key: 'uRest', label: 'resting bloom', min: 0, max: 0.4, step: 0.005,
        note: 'Fibres are 0 by law: they bloom from events only. Ridges carry 0.10, the rim 0.20.' },
      { key: 'uRimBloom', label: 'rim bloom', min: 0, max: 0.6, step: 0.01,
        note: 'The only resting light allowed to bleed.' },
    ],
  },
];

export class TuningPanel {
  private pane: Pane | null = null;

  constructor(private readonly hero: ContainmentHero) {}

  async mount(): Promise<void> {
    const { Pane } = await import('tweakpane');
    const live = this.hero.uniforms;

    // Only offer a control the hero actually exposes. A dead slider is worse
    // than an absent one — it invites tuning something that is not connected.
    const state: Record<string, number> = {};
    this.pane = new Pane({ title: 'Dark Lattice — dev' });

    for (const group of GROUPS) {
      const available = group.knobs.filter((k) => k.key in live);
      if (!available.length) continue;
      const folder = this.pane.addFolder({ title: group.title });
      for (const knob of available) {
        state[knob.key] = live[knob.key];
        folder
          .addBinding(state, knob.key, {
            label: knob.label,
            min: knob.min,
            max: knob.max,
            step: knob.step,
          })
          .on('change', (event: { value: unknown }) => this.hero.tune({ [knob.key]: Number(event.value) }));
      }
    }

    const actions = this.pane.addFolder({ title: 'Actions' });
    actions.addButton({ title: 'Provoke an event' }).on('click', () => this.hero.pressCentre());
    actions.addButton({ title: 'Copy values to clipboard' }).on('click', () => {
      const text = Object.entries(state)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');
      void navigator.clipboard?.writeText(text);
      // Deliberately not written to source: a number is a decision, and it
      // belongs in the file it came from with a comment explaining it.
      console.info('[dark-lattice] tuned values\n' + text);
    });
    actions.addButton({ title: 'Reset to gated values' }).on('click', () => {
      for (const [key, value] of Object.entries(live)) {
        if (key in state) state[key] = value;
      }
      this.hero.tune(live);
      this.pane?.refresh();
    });
  }

  dispose(): void {
    this.pane?.dispose();
    this.pane = null;
  }
}
