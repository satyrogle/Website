import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';

import { QualityManager } from './QualityManager';
import { FUNNEL, FieldModel, STAR_POSITION } from './correction/FieldModel';
import { PlanetCorrection } from './correction/PlanetCorrection';
import { PlanetModel } from './correction/PlanetModel';
import { PulseClient } from './correction/sim/PulseClient';

/**
 * SceneController
 *
 * Owns the renderer, the single persistent scene and the frame loop, and
 * exposes the small surface the scroll director is allowed to touch.
 *
 * There is one path and it is THE CORRECTION: a synthesised structure stepped
 * in a Worker and drawn from authoritative snapshots. The retired entity
 * system that used to sit alongside it is gone from the tree entirely; git
 * history is where it lives now.
 *
 * No caller can swap scenes, reseed the graph or rebuild the structure, which
 * is what keeps the site a single continuous world by construction.
 */

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  reducedMotion: boolean;
}

export function isWebGL2Available(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

const CAMERA = { fov: 38 };

/**
 * Where the subject sits on screen, derived from the layout rather than
 * guessed at.
 *
 * `--hero-type-column` in `sections.css` states what share of the viewport
 * the wordmark occupies; the subject gets the middle of what is left. One
 * number owns both halves of the composition, so the planet cannot drift
 * back under the type when the type changes size.
 */
export const HERO_SUBJECT = {
  /** NDC y. Slightly low, so the body sits under the eyeline, not on it. */
  centreY: -0.06,
  /** Dev-tune multiplier on the judged stand-off. 1 is the shipped frame. */
  standOffScale: 1,
  aspect: (): number => window.innerWidth / Math.max(window.innerHeight, 1),
  typeColumn: (): number => {
    // Read off the .hero element, where the variable is actually defined.
    // Reading the document root returned the fallback forever — which
    // silently ate the portrait media query's column of 1, so the portrait
    // camera kept solving for a type column that portrait does not have.
    const hero = document.querySelector('.hero');
    const raw = getComputedStyle(hero ?? document.documentElement).getPropertyValue(
      '--hero-type-column'
    );
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : 0.54;
  },
  /** NDC x of the free column's centre. Zero when the type spans the frame. */
  centreX(): number {
    const column = this.typeColumn();
    if (column >= 0.98) return 0;
    // Screen fraction of the free column's middle, then into NDC. NDC spans
    // -1..1, so the conversion is (fraction - 0.5) * 2 — halving it leaves the
    // subject stranded between the two columns, still under the type.
    const fraction = column + (1 - column) / 2;
    return (fraction - 0.5) * 2;
  },
};

/**
 * Halation for the hot surfaces, and only for them. The threshold sits far
 * above anything the crust can output — charcoal peaks near 0.19 — so the
 * only pixels that bloom are the ones the shaders author as emitters: the
 * melt, the wound walls, the venting seams, the white lips. Restrained on
 * purpose: this is the difference between light-emitting geology and orange
 * paint, not a poster effect. The scene renders into half-float targets so
 * the melt's >1 energies survive to feed it.
 */
const BLOOM = { strength: 0.42, radius: 0.55, threshold: 0.85 };

/** A waypoint the rail can interpolate: where the eye is, what it looks at. */
interface Waypoint {
  eye: readonly [number, number, number];
  aim: readonly [number, number, number];
}

const asTriple = (v: THREE.Vector3): readonly [number, number, number] => [v.x, v.y, v.z];

/**
 * The rail, derived from the wreckage itself.
 *
 * Jacob, restated after the corridor misread: "I said funnel the VIEW, not
 * funnel the explosion." The debris was thrown radially — every piece on the
 * line out of its own wound — so there is no corridor to travel. What
 * converges is the journey: the scroll starts at the fragment that has flown
 * furthest, and every stop is nearer the body than the last, each leg
 * curving around the field as the slabs fan across the rupture hemisphere.
 * The view narrows onto the source; that narrowing is the funnel.
 *
 * Each stop stands off its own fragment by that fragment's own size, which
 * is what keeps a continent-scale slab and a smaller one both framed as
 * monumental rather than one filling the screen and the other vanishing.
 * Waypoints are computed after the geometry loads, because a stop that is
 * not derived from a real piece is a stop that can point at nothing.
 */
const buildRail = (planet: PlanetModel): Waypoint[] => {
  const { axis, lift, side } = FUNNEL;
  const waypoints: Waypoint[] = [];
  // Furthest-flown first: the journey is inward.
  const stops = [...planet.stops].sort((a, b) => b.home.length() - a.home.length());

  const stand = (piece: (typeof stops)[number], reach: number): THREE.Vector3 => {
    // The eye stands behind and beside the fragment on its own flight line —
    // further from the body than the piece, offset sideways and above — so
    // every stop looks past its fragment at the wounded world beyond. The
    // offsets keep the pose off the fragment's own radial, which is the one
    // line that would stack its trail into concentric depth.
    const radial = piece.home.clone().normalize();
    const beside = new THREE.Vector3().crossVectors(radial, lift);
    if (beside.lengthSq() < 1e-3) beside.crossVectors(radial, side);
    beside.normalize();
    const above = new THREE.Vector3().crossVectors(beside, radial).normalize();
    // Stand-off is in multiples of the piece's own radius: the authored
    // slabs are continent-scale, so a small multiple is already a long way
    // back. The above-component keeps a foreground slab in the lower third
    // with the body legible beyond it — a composed shot, not a black wall.
    return piece.home
      .clone()
      .addScaledVector(radial, piece.extent * reach * 1.05)
      .addScaledVector(beside, piece.extent * reach * 0.9)
      .addScaledVector(above, piece.extent * reach * 0.55);
  };

  if (stops.length) {
    // The opening is an authored shot, and it has one job the previous
    // version did not do: show a whole planet.
    //
    // Jacob, on the frame this replaces: the body was off camera and the
    // composition read as anatomy. Three faults compounded. The wordmark sat
    // ON the planet, so the silhouette was never legible as an outline. The
    // rupture ran near-vertical through the middle, which left two soft lobes
    // flanking a central cleft. And the stand-off was close enough that the
    // body was cropped rather than contained. Bilateral symmetry plus a
    // central seam plus a smooth dark ovoid is a shape nobody can un-see.
    //
    // So: stand far enough back that the entire body sits inside the frame,
    // put it in the open right third where no type reaches, and approach from
    // an azimuth that throws the wound across a diagonal instead of down the
    // middle.
    const body = new THREE.Vector3(0, 0, 0);

    // Far enough back that the entire body is contained. The silhouette is
    // what says "planet"; a cropped one says nothing, which is how a dark
    // ovoid with a seam down it ends up reading as anatomy.
    // The stand-off belongs to the same contract as the aim. 24 units is the
    // distance the composition was judged at, and it was judged at 1440x900 —
    // aspect 1.6. The vertical FOV is fixed, so a wider window at the same
    // distance shows more world on either side of the body and the subject's
    // share of its column falls: at 16:9 the judged frame thins into type
    // over void, which is how "the planet is off" was reported. Holding the
    // share means distance scales as judgedAspect / aspect — the camera steps
    // in exactly as much as the frame widened. Clamped so windows at or
    // narrower than the judged aspect keep the judged stand-off untouched
    // (portrait is its own recomposition, not this shot), and an ultrawide
    // cannot pull in past containment of the full silhouette.
    const JUDGED_STAND = { distance: 24, aspect: 1440 / 900 };
    const standAspect = Math.min(Math.max(HERO_SUBJECT.aspect(), JUDGED_STAND.aspect), 2.6);
    const eye = new THREE.Vector3()
      .addScaledVector(axis, 1.65)
      .addScaledVector(side, 2.35)
      .addScaledVector(lift, 0.92)
      .normalize()
      .multiplyScalar(
        JUDGED_STAND.distance * (JUDGED_STAND.aspect / standAspect) * HERO_SUBJECT.standOffScale
      );

    // Put the body where the CSS says the subject lives, by solving for it
    // rather than nudging toward it.
    //
    // Shifting the aim perpendicular to the view rotates the frame, and the
    // subject moves the opposite way by offset / (distance * tan(halfFov)).
    // Inverting that places the body at a chosen NDC coordinate exactly. Two
    // attempts at eyeballing this moved the planet the wrong way, because the
    // sign of a world-space lateral depends on the approach; the camera's own
    // basis does not.
    const forward = body.clone().sub(eye).normalize();
    const camRight = new THREE.Vector3().crossVectors(forward, lift).normalize();
    const camUp = new THREE.Vector3().crossVectors(camRight, forward).normalize();
    const distance = eye.distanceTo(body);
    const tanHalf = Math.tan((CAMERA.fov * Math.PI) / 360);
    const aspect = HERO_SUBJECT.aspect();

    // Centre of the column the type does not occupy, in NDC.
    const nx = HERO_SUBJECT.centreX();
    const ny = HERO_SUBJECT.centreY;
    waypoints.push({
      eye: asTriple(eye),
      aim: asTriple(
        body
          .clone()
          .addScaledVector(camRight, -nx * distance * tanHalf * aspect)
          .addScaledVector(camUp, -ny * distance * tanHalf)
      ),
    });
  }

  for (const piece of stops) {
    waypoints.push({
      eye: asTriple(stand(piece, 2.7)),
      // Aimed well past the fragment toward the source, so every stop holds
      // the relationship — this piece, the body it left, the wound between
      // them — instead of a fragment floating on black.
      aim: asTriple(piece.home.clone().multiplyScalar(0.55)),
    });
  }

  // The reveal, stood before the rupture — the money shot, and it is
  // composed, not surveyed. The camera's azimuth matches the rupture zone's,
  // so the eye looks into the compound wound at a working obliquity; the
  // distance is close enough that the body commands most of the frame's
  // height; and the aim is pulled off-side so the wound stands clear of the
  // record's typography. Around it, the field: every slab on the line out of
  // its own hole, debris in every direction, the whole crust webbed with
  // failing plate boundaries — one death, dominating the frame.
  waypoints.push({
    eye: asTriple(
      new THREE.Vector3()
        .addScaledVector(axis, 20.0)
        .addScaledVector(side, 13.0)
        .addScaledVector(lift, 9.5)
    ),
    aim: asTriple(
      new THREE.Vector3().addScaledVector(axis, 3.2).addScaledVector(side, -2.2)
    ),
  });

  return waypoints;
};

/** Filled once the geometry has loaded. */
const RAIL: { waypoints: Waypoint[] } = { waypoints: [] };

/**
 * The machine's visible life ends at narrative 0.82 — the editorial band owns
 * the rest and the canvas is covered there. The rail finishes its journey just
 * inside that: the wide view of the whole event arrives at 0.78, and the flare
 * climbs through the floor band so YOUR RECORD is typeset over a star that is
 * letting go. A rail spread over 0..1 was a journey the visitor could never
 * finish — the first capture of the floor band proved it, two fragments short
 * of the star.
 */
const RAIL_END = 0.71;

/**
 * The flare starts after the camera has arrived, not while it is still
 * travelling.
 *
 * They used to overlap almost entirely — the pull-back and the whiteout
 * happened together, so the wide reveal the whole descent builds toward was
 * never actually seen. Arriving somewhere and watching it come apart are two
 * beats, and they get one each.
 */
const FLARE = { from: 0.73, to: 0.86 };

/**
 * Enforcement gain against narrative depth.
 *
 * Flat through the opening and the invitation — the visitor's first press has
 * to meet the system at its most permissive, or the six stages have no room to
 * happen. It rises through NOTICE and GRADIENT and plateaus at the floor.
 * Falling back up the page lowers it again: the gradient is scroll-bound in
 * both directions. What does not come back is the damage.
 */
const GAIN = { from: 0.28, to: 0.75, low: 1.0, high: 2.2 };

/**
 * Portrait recomposition.
 *
 * Not the landscape frame scaled down. The veil is eighteen units long and
 * under two thick, and a tall viewport's horizontal field is narrow: held
 * level it would be cropped to a fragment, and pulling back far enough to fit
 * it would reduce it to a thread across the middle of the frame.
 *
 * So the frame turns instead of the object. Rolling the camera puts the veil
 * on the diagonal, which is the longest run a portrait frame has — about
 * sixteen units against seven across the width — and the composition fills
 * rather than shrinks. The camera is still on a straight rail; only its
 * horizon is different.
 */
const PORTRAIT = { fov: 34, roll: -0.92, below: 0.85, retreat: 1.7, drop: 1.0 };

const smoothstep = (t: number): number => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};

/**
 * Energy of one press. Bounded — the visitor gets an action, not a sandbox.
 *
 * Under the first-order field this lands directly in the state rather than in a
 * velocity to be integrated, so it is read in the same units the renderer
 * swings by: 0.8 turns the struck blades about eighteen degrees out of the comb
 * their neighbours are still in. Measured rather than chosen — at 0.8 the
 * system notices after 0.28 s, takes hold of about fifty blades, and lets go
 * 2.2 s later with the residual back at zero.
 */
export const PRESS_ENERGY = 0.8;

/** Longest a touch can rest and still be a tap rather than a hold. */
const TAP_MS = 350;
/** Movement that turns a tap into travel, in CSS pixels. */
const TAP_SLOP = 8;

/**
 * How many presses a visit is worth.
 *
 * The bound is the difference between an action and a toy. Twelve is enough to
 * strike, watch the whole event, and try it again somewhere else to see whether
 * the system behaves the same way — which is the comparison the GRADIENT band
 * depends on — and few enough that the structure can never become a thing to
 * play with while the meaning drains out of it.
 */
const PRESS_BUDGET = 12;

/**
 * How long one press takes to come back.
 *
 * The budget exists so the structure cannot become a toy, and it did its job
 * too well: spend twelve and the site stops responding to clicks entirely,
 * which does not read as restraint, it reads as broken. A visitor who has been
 * exploring for a minute is exactly the visitor who should still be able to
 * strike it.
 *
 * So the budget is a rate now rather than a quota. It is still bounded at any
 * instant — twelve is the most that can ever be spent at once, and rapid
 * clicking still runs dry — but it refills while the visitor watches what they
 * did, which is the pace the event happens at anyway.
 */
const PRESS_RECHARGE_MS = 5000;

export class SceneController {
  readonly quality: QualityManager;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  model: FieldModel | null = null;
  planet: PlanetModel | null = null;
  /** The system holding the catastrophe in the pose it was authored in. */
  correction: PlanetCorrection | null = null;

  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private client: PulseClient | null = null;
  private frameHandle = 0;
  private running = false;
  private reducedMotion: boolean;
  private disposed = false;

  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();

  /** True when the viewport is tall enough to need its own composition. */
  private portrait = false;

  /** Scratch for the camera rail, so a frame allocates nothing. */
  private railTarget = new THREE.Vector3();
  private railOffset = new THREE.Vector3();

  /** False past the floor, where the machine is off. */
  private machineOn = true;
  /** Bounded injection energy, in presses. */
  private pressesLeft = PRESS_BUDGET;
  /** When the budget was last reconciled against the clock. */
  private budgetAt = 0;
  /** Live so the dev panel can move it. */
  private pressEnergy = PRESS_ENERGY;
  /** True once anything has struck the structure, whoever started it. */
  private pressed = false;
  /** A touch in progress that has not yet disqualified itself as a tap. */
  private tap: { id: number; x: number; y: number; at: number } | null = null;

  /** Pointer in NDC, and whether it is over the hero rather than over copy. */
  private hover = new THREE.Vector2(0, 0);
  private hovering = false;
  private hoverStrength = 0;

  private progress = 0;
  private exposure = 0;
  private exposureTarget = 0;
  private lastFrameTime = 0;

  /** Latest published counters. Read-only; the Worker owns the truth. */
  telemetry = {
    tick: 0,
    adjustments: 0,
    engaged: 0,
    correctionEnergy: 0,
    peakDeviation: 0,
    residual: 0,
    injections: 0,
    stepMs: 0,
  };

  private resizeObserver: ResizeObserver | null = null;

  constructor(options: SceneOptions) {
    this.reducedMotion = options.reducedMotion;
    this.quality = new QualityManager();

    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      // On by default now. The structure is drawn as hairlines with no post to
      // hide edge aliasing behind, so multisampling is doing real work.
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      // The ribbons are opaque and have to occlude one another, so there is a
      // depth buffer now. The old line field was additive and order-free.
      depth: true,
    });
    this.renderer.setClearColor(new THREE.Color('#05070a'), 1);
    this.renderer.setPixelRatio(this.quality.pixelRatio());
    // Tone mapping only, and none of it. Intensities are authored directly in
    // the shaders against a near-black ground, so there is no highlight to roll
    // off — and a filmic curve would desaturate exactly the hues that carry the
    // colour grammar.
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    const { clientWidth, clientHeight } = this.canvasSize();
    this.renderer.setSize(clientWidth, clientHeight, false);

    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, clientWidth / Math.max(clientHeight, 1), 0.1, 200);

    // The post chain: scene into half-float, hot pixels haloed, plain copy
    // out. No OutputPass — the shaders author display values directly, and a
    // colour-space conversion here would re-grade the whole look.
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(clientWidth, clientHeight), BLOOM.strength, BLOOM.radius, BLOOM.threshold)
    );
    this.composer.addPass(new ShaderPass(CopyShader));

    this.compose();
    this.applyCamera();

    this.quality.onChange(() => this.resize());
    this.bindEvents();
  }

  private canvasSize(): { clientWidth: number; clientHeight: number } {
    return {
      clientWidth: Math.max(1, window.innerWidth),
      clientHeight: Math.max(1, window.innerHeight),
    };
  }

  // ------------------------------------------------------------------
  //  Initialisation — the graph, the calm, and the record
  // ------------------------------------------------------------------

  /**
   * Synthesises the structure, runs it unsupervised, and takes the record from
   * the result. This is the site's real initialisation work, so the loader is
   * reporting progress rather than counting down a timer.
   */
  async warmUp(
    onProgress?: (fraction: number, stage: 'synth' | 'warmup' | 'record') => void
  ): Promise<void> {
    const client = new PulseClient();
    this.client = client;

    client.onProgress = (message) => {
      // Graph synthesis is a tenth of it; the warm-up ticks are the rest.
      const fraction = message.stage === 'synth' ? 0 : 0.1 + message.fraction * 0.9;
      onProgress?.(Math.min(fraction, 1), message.stage);
    };

    client.start();
    await client.ready;

    if (!client.structure || !client.record) {
      throw new Error('correction: worker reported ready without a structure');
    }

    this.model = new FieldModel();
    // Behind everything: the source is light, and the wreckage stands in
    // front of it.
    this.model.group.renderOrder = -1;
    this.scene.add(this.model.group);

    // The authored world. Real geometry, so this is genuine initialisation
    // work and the loader is reporting it rather than counting down.
    this.planet = new PlanetModel({ axis: FUNNEL.axis, starPosition: STAR_POSITION });
    await this.planet.load();
    this.scene.add(this.planet.group);
    RAIL.waypoints = buildRail(this.planet);
    this.correction = new PlanetCorrection(this.planet);

    if (import.meta.env.DEV) {
      (window as unknown as { dl?: unknown }).dl = { scene: this, planet: this.planet, correction: this.correction };
    }

    this.resize();

    // The first snapshot is drained so telemetry starts from the settled world
    // rather than from zero. The field does not read it yet — see `consume`.
    const first = client.take();
    if (first) client.release(first);

    onProgress?.(1, 'record');
  }

  // ------------------------------------------------------------------
  //  Events
  // ------------------------------------------------------------------

  private bindEvents(): void {
    window.addEventListener('resize', this.onResize, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibility);

    // Press, not hover, and never preventDefault-ed, so it can never
    // interfere with scrolling. A mouse presses on the way down; a finger
    // has to finish the gesture first — see `onPointerDown`.
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerup', this.onPointerUp, { passive: true });
    window.addEventListener('pointercancel', this.onPointerCancel, { passive: true });
    document.addEventListener('pointerleave', this.onPointerLeave, { passive: true });

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(document.documentElement);
    }
  }

  private onResize = (): void => {
    this.resize();
  };

  private onVisibility = (): void => {
    if (document.hidden) {
      this.stop();
      this.client?.setRunning(false);
    } else if (!this.disposed && this.machineOn && !this.reducedMotion) {
      // Only resume what the narrative says should be running: returning to
      // the tab while the visitor is reading the editorial must not restart
      // the machine behind it, and the reduced-motion world does not run at
      // all after boot.
      this.client?.setRunning(true);
      this.start();
    }
  };

  /**
   * A mouse means it on the way down. A finger does not.
   *
   * `pointerdown` fires the instant a finger touches the glass, before the
   * browser has decided whether the gesture is a tap or a scroll — and the
   * machine's bands are mostly empty space, so on a phone every flick down
   * the descent was landing as a press. That spent the visit's whole budget
   * on scrolling and, worse, marked the structure as struck, which is the one
   * condition that cancels the false first action. The visitor was being
   * charged for deciding to look.
   *
   * So touch and pen arm a tap and resolve it on release: short enough, and
   * still in the same place. Anything else is travel, and travel is free.
   */
  private onPointerDown = (event: PointerEvent): void => {
    if (this.isReading(event.target)) return;

    if (event.pointerType === 'mouse') {
      this.pressAt(event.clientX, event.clientY);
      return;
    }

    this.tap = { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now() };
  };

  private onPointerMove = (event: PointerEvent): void => {
    // Attention, tracked in NDC. A pointer resting over the hero is the
    // visitor looking at it, and the field answers that before it answers
    // anything else.
    this.hover.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -((event.clientY / window.innerHeight) * 2 - 1)
    );
    this.hovering = !this.isReading(event.target);

    const tap = this.tap;
    if (!tap || event.pointerId !== tap.id) return;
    if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > TAP_SLOP) this.tap = null;
  };

  private onPointerUp = (event: PointerEvent): void => {
    const tap = this.tap;
    if (!tap || event.pointerId !== tap.id) return;
    this.tap = null;

    if (performance.now() - tap.at > TAP_MS) return;
    if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > TAP_SLOP) return;
    if (this.isReading(event.target)) return;

    this.pressAt(event.clientX, event.clientY);
  };

  /** The browser took the gesture for itself — a scroll, or a system edge swipe. */
  private onPointerCancel = (event: PointerEvent): void => {
    if (this.tap?.id === event.pointerId) this.tap = null;
  };

  private onPointerLeave = (): void => {
    this.hovering = false;
  };

  /**
   * Surfaces that are being read rather than touched. The record panel is on
   * the list because it is the one piece of the machine's own text a visitor
   * is meant to stop and read, and reading it should not strike anything.
   */
  private isReading(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!el?.closest?.('a, button, details, summary, input, textarea, select, [data-record]');
  }

  /**
   * One press, one bounded impulse. The raycast resolves to a node so the
   * deviation starts where the visitor touched — the causal link between the
   * action and what happens next is the whole point of the interaction.
   */
  pressAt(clientX: number, clientY: number, tolerance?: number): number {
    if (!this.model || !this.client) return -1;

    this.recharge();
    if (this.pressesLeft <= 0) return -1;

    // Only while there is something to press.
    //
    // Past the floor the machine is off and the editorial's own ground is
    // covering the canvas — but a raycast does not know that, so a click on
    // body copy was reaching through it, spending budget on a deviation
    // nobody could see and parking it in a paused Worker to erupt whenever
    // the visitor scrolled back up. Under reduced motion the same press went
    // into a world that is never re-rendered. In both cases the action has no
    // consequence the visitor can observe, and an action without an
    // observable consequence is the one thing this interaction cannot be.
    if (!this.machineOn || this.reducedMotion) return -1;

    this.pointerNdc.set(
      (clientX / window.innerWidth) * 2 - 1,
      -((clientY / window.innerHeight) * 2 - 1)
    );
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    // Live. This was dead for as long as the hero was a picture: nothing was
    // raycastable, so a press spent budget and showed the visitor nothing,
    // and the system this site is named after ran connected to nothing at
    // all. The staged composition has slabs and chunks to hit, and each one
    // can only escape along the flight it was already on.
    if (!this.planet || !this.correction) return -1;
    const node = this.planet.pick(this.raycaster, this.camera, this.pointerNdc, tolerance ?? 0.20);
    if (node < 0) return -1;

    const probe = this.probe();
    const piecePx = probe?.pieces[node]?.r ?? 0;
    this.correction.injectAt(
      node,
      this.camera,
      this.renderer.domElement.clientWidth || window.innerWidth,
      this.renderer.domElement.clientHeight || window.innerHeight,
      piecePx
    );
    this.client.inject(node, this.pressEnergy);
    this.pressesLeft--;
    this.pressed = true;
    document.dispatchEvent(
      new CustomEvent('injected', { detail: { node, left: this.pressesLeft } })
    );
    return node;
  }

  /**
   * The same action, without a pointer.
   *
   * Fired from the centre of the frame with no distance tolerance, so it
   * always lands on the structure: a keyboard or assistive user gets the
   * action itself, not a control that silently does nothing because their
   * ray missed a filament.
   */
  pressCentre(): number {
    return this.pressAt(window.innerWidth * 0.5, window.innerHeight * 0.5, Infinity);
  }

  /**
   * Development only. Routes a tuning patch to whichever layer owns each
   * number — the Worker for anything the simulation reads, the material for
   * anything the renderer reads.
   */
  tune(patch: {
    dynamics?: Record<string, number>;
    correction?: Record<string, number>;
    render?: Record<string, number>;
    layout?: Record<string, number>;
    hops?: number;
    energy?: number;
  }): void {
    if (patch.dynamics || patch.correction || patch.hops !== undefined) {
      this.client?.tune({
        dynamics: patch.dynamics,
        correction: patch.correction,
        hops: patch.hops,
      });
    }
    if (patch.render) {
      // One patch fans out to both layers; each takes only the uniforms it
      // actually owns, so a knob cannot silently write into the void.
      this.model?.tune(patch.render);
      this.planet?.tune(patch.render);
    }
    if (patch.layout) {
      // The composition contract, live. Type column moves the CSS and the
      // camera from the same number, exactly as a stylesheet edit would;
      // the others override the solve's own constants. Rebuilding the rail
      // is the same path a resize takes.
      if (patch.layout.typeColumn !== undefined) {
        document
          .querySelector<HTMLElement>('.hero')
          ?.style.setProperty('--hero-type-column', String(patch.layout.typeColumn));
      }
      if (patch.layout.standOff !== undefined) HERO_SUBJECT.standOffScale = patch.layout.standOff;
      if (patch.layout.height !== undefined) HERO_SUBJECT.centreY = patch.layout.height;
      if (this.planet) RAIL.waypoints = buildRail(this.planet);
    }
    if (patch.energy !== undefined) this.pressEnergy = patch.energy;
  }

  /** Returns spent presses at a fixed rate, up to the cap. */
  private recharge(): void {
    const now = performance.now();
    if (this.budgetAt === 0) {
      this.budgetAt = now;
      return;
    }
    const earned = Math.floor((now - this.budgetAt) / PRESS_RECHARGE_MS);
    if (earned <= 0) return;
    this.budgetAt += earned * PRESS_RECHARGE_MS;
    this.pressesLeft = Math.min(PRESS_BUDGET, this.pressesLeft + earned);
  }

  /** Presses available right now. */
  get budgetLeft(): number {
    this.recharge();
    return this.pressesLeft;
  }

  /**
   * Adjustments this visit is answerable for.
   *
   * Not the same as the Worker's total. The reduced-motion path runs a real
   * correction event at boot to render the triptych, and those two hundred
   * adjustments belong to the demonstration, not to a visitor who has not
   * touched anything — putting them on the record would say they did
   * something they were never even shown happening. Subtracting the
   * system's own work is what makes YOUR RECORD true on every path.
   */
  /**
   * DEV measurement surface — where every pressable piece is on screen, how
   * big it is there, and how far it has left its seat.
   *
   * Acceptance for the enforcement event is stated in screen space, because
   * that is the only space the visitor has: a slab that moves a generous
   * number of world units and thirty-seven pixels has not moved. Reading
   * that from a screenshot is guesswork, so the harness reads it from here.
   */
  probe(): {
    tMs: number;
    adjustments: number;
    pieces: { x: number; y: number; r: number; u: number; engaged: number }[];
  } | null {
    if (!this.planet || !this.correction) return null;
    const width = this.renderer.domElement.clientWidth || window.innerWidth;
    const height = this.renderer.domElement.clientHeight || window.innerHeight;
    const centre = new THREE.Vector3();
    const edge = new THREE.Vector3();
    const right = new THREE.Vector3();
    this.camera.matrixWorld.extractBasis(right, new THREE.Vector3(), new THREE.Vector3());

    const pieces = this.planet.pressable.map((piece, index) => {
      piece.mesh.getWorldPosition(centre);
      const geometry = piece.mesh as THREE.Mesh;
      const sphere = (geometry.geometry as THREE.BufferGeometry | undefined)?.boundingSphere;
      if (!sphere) (geometry.geometry as THREE.BufferGeometry)?.computeBoundingSphere();
      const worldRadius =
        ((geometry.geometry as THREE.BufferGeometry)?.boundingSphere?.radius ?? 1) *
        Math.max(piece.mesh.scale.x, piece.mesh.scale.y, piece.mesh.scale.z);
      edge.copy(centre).addScaledVector(right, worldRadius);

      const c = centre.clone().project(this.camera);
      const e = edge.clone().project(this.camera);
      const cx = (c.x * 0.5 + 0.5) * width;
      const cy = (-c.y * 0.5 + 0.5) * height;
      const ex = (e.x * 0.5 + 0.5) * width;
      const ey = (-e.y * 0.5 + 0.5) * height;
      return {
        x: cx,
        y: cy,
        r: Math.hypot(ex - cx, ey - cy),
        u: this.correction!.deviationOf(index),
        engaged: this.correction!.operator.engaged[index] ?? 0,
      };
    });

    return { tMs: performance.now(), adjustments: this.correction.adjustments, pieces };
  }

  get visitAdjustments(): number {
    // The staged world's own operator, not the Worker's. The Worker still
    // steps the structure it was written for, but nothing it corrects is on
    // screen, and putting its count on YOUR RECORD would report adjustments
    // the visitor could never have caused or seen.
    if (this.correction) {
      const own = this.correction.adjustments - this.correction.systemAdjustments;
      return own > 0 ? own : 0;
    }
    const own = this.telemetry.adjustments - (this.client?.systemAdjustments ?? 0);
    return own > 0 ? own : 0;
  }

  /**
   * Takes the newest counters without drawing anything. The reduced-motion
   * path has no render loop, so this is how the record panel reads a world
   * that is otherwise only ever consumed by a frame.
   */
  pollTelemetry(): void {
    this.consume();
  }

  /** Whether the structure has been struck at all yet. */
  get struck(): boolean {
    return this.pressed;
  }

  resize(): void {
    // The composition is stated in screen fractions, so a viewport change
    // moves where the subject belongs. Rebuilding the rail here is what stops
    // the planet sliding back under the wordmark on a window resize.
    if (this.planet) RAIL.waypoints = buildRail(this.planet);

    const { clientWidth, clientHeight } = this.canvasSize();
    const ratio = this.quality.pixelRatio();
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.composer?.setPixelRatio(ratio);
    this.composer?.setSize(clientWidth, clientHeight);
    this.camera.aspect = clientWidth / Math.max(clientHeight, 1);
    // The march is per pixel, so the quality tier buys steps here rather than
    // elements. This is the whole performance story of the new carrier.
    this.model?.setSize(clientWidth * ratio, clientHeight * ratio);
    this.model?.setSteps(ratio > 1.25 ? 96 : 144);
    this.compose();
  }

  /**
   * One seam for every frame drawn, still or looped: through the bloom chain
   * when the tier affords it, straight to the canvas when it does not. A
   * demoted machine loses halation before it loses pixels.
   */
  private draw(): void {
    if (this.composer && this.quality.settings.bloom) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /** Picks the composition the viewport shape needs, and nothing else. */
  private compose(): void {
    const { clientWidth, clientHeight } = this.canvasSize();
    this.portrait = clientWidth / Math.max(clientHeight, 1) < PORTRAIT.below;

    this.camera.fov = this.portrait ? PORTRAIT.fov : CAMERA.fov;
    if (this.portrait) {
      this.camera.up.set(Math.sin(PORTRAIT.roll), Math.cos(PORTRAIT.roll), 0);
    } else {
      this.camera.up.set(0, 1, 0);
    }
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------
  //  Narrative surface — the only things the director may change
  // ------------------------------------------------------------------

  /**
   * The director saw real scroll displacement — the visitor has entered the
   * system, which is what licenses it to act unprompted. Until then the
   * opening frame stays exactly the frame that was approved. Driven by
   * measured scroll rather than by narrative progress, because the at-rest
   * narrative moves on its own as fonts and layout settle, and a latch on
   * it armed at boot.
   */
  visitorMoved(): void {
    this.correction?.armFalseAction();
  }

  /**
   * Global narrative progress, 0..1.
   *
   * Two things hang off it: where the camera is on the rail, and how hard the
   * system enforces. The second is authoritative state, so it is not applied
   * here — it is posted to the Worker, which owns it.
   */
  setProgress(p: number): void {
    this.progress = Math.min(Math.max(p, 0), 1);

    const depth = smoothstep((this.progress - GAIN.from) / (GAIN.to - GAIN.from));
    const gain = GAIN.low + (GAIN.high - GAIN.low) * depth;
    this.client?.setGain(gain);
    // The same curve drives the staged world. One enforcement gradient for
    // the site, not one per subsystem: the journey travels inward toward the
    // source, and the grip tightens as it does.
    this.correction?.setGain(gain);
  }

  /** Drives the cold-open reveal out of darkness. */
  setWake(target: number): void {
    this.exposureTarget = Math.min(Math.max(target, 0), 1);
  }

  /**
   * Machine off.
   *
   * Past the floor there is nothing more to say and the system stops: the
   * render loop ends and the Worker is paused, so the editorial is not a page
   * with a simulation still running behind it. The cut itself is done by the
   * layout — the editorial carries its own ground and rises over the canvas —
   * because a fade timed against the scroll would be a transition, and what
   * the beat needs is a stop.
   *
   * Coming back up restarts it exactly where it was. The state was never
   * rewound, so the bruises and the count are still there: scrolling back is
   * how the visitor finds that out.
   */
  setMachine(running: boolean): void {
    if (this.machineOn === running || this.disposed) return;
    this.machineOn = running;

    if (running) {
      // Reduced motion is deliberately not resumed. Its world was stepped
      // once, at boot, to produce the triptych and the state behind it; there
      // is no render loop consuming snapshots, so resuming the Worker would
      // advance the simulation where nobody can see it and leave the held
      // frame describing a past that no longer matches the counters.
      if (this.reducedMotion) return;
      this.client?.setRunning(true);
      this.start();
    } else {
      this.stop();
      this.client?.setRunning(false);
    }
  }

  // ------------------------------------------------------------------
  //  Loop
  // ------------------------------------------------------------------

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastFrameTime = performance.now();
    this.frameHandle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
  }

  /**
   * Three stills of one correction event, rendered off the same scene the
   * live path uses.
   *
   * This is the reduced-motion explanation. A before-and-after pair would be
   * the failure the direction was warned about — an unexplained change — so
   * the middle frame is the one that matters: the system has hold of the
   * deviation and has not won yet.
   *
   * Rendered at a fixed size rather than at the viewport's, so the three
   * stills are the same shape on every machine, and taken while the loader is
   * still up so the temporary resize is never seen.
   */
  async captureTriptych(width = 1000): Promise<Array<{ stage: string; url: string }>> {
    if (!this.client || !this.model) return [];

    const frames = await this.client.triptych();
    const height = Math.round(width * 0.6);

    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);

    // The stills are landscape thumbnails whatever the viewport is, so they
    // get the landscape pose. A phone would otherwise inherit the portrait
    // roll and render three diagonal compositions inside three wide frames —
    // the recomposition applied to the one place it does not belong. The
    // portrait flag is lowered for the same reason: applyCamera reads it for
    // the retreat, and these frames are the landscape composition. The
    // closing resize() puts the viewport's own composition back.
    this.portrait = false;
    this.camera.fov = CAMERA.fov;
    this.camera.up.set(0, 1, 0);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.model.setExposure(1);
    this.applyCamera();

    const stills = frames.map((frame) => {
      this.model?.setCamera(this.camera);
      this.draw();
      return { stage: frame.stage, url: this.renderer.domElement.toDataURL('image/png') };
    });

    // Back to the viewport, and back to the world the event left behind.
    this.resize();
    this.consume();
    this.renderStill();

    return stills;
  }

  /** Renders exactly one frame — used for the reduced-motion still. */
  renderStill(): void {
    this.exposure = 1;
    this.consume();
    this.applyCamera();
    this.model?.setCamera(this.camera);
    this.model?.setFlare(this.flareAt(this.progress));
    this.model?.setExposure(1);
    this.planet?.setFlare(this.flareAt(this.progress));
    this.planet?.setExposure(1);
    this.draw();
  }

  /**
   * The finale, as a readout of scroll.
   *
   * A function of progress rather than a triggered animation, so it runs
   * backwards exactly as it ran forwards: scroll away from the floor and the
   * star settles, scroll back and it flares again. The explosion is a place
   * the visitor goes, not a fuse they lit.
   */
  private flareAt(progress: number): number {
    return smoothstep((progress - FLARE.from) / (FLARE.to - FLARE.from));
  }

  /** Takes the newest authoritative snapshot, if one has arrived. */
  private consume(): void {
    const client = this.client;
    if (!client || !this.model) return;

    const snapshot = client.take();
    if (!snapshot) return;

    // Telemetry only. The authoritative world is still stepped in the Worker
    // and still counts its own corrections, but nothing renders it: the field
    // carrier is being judged on the approved state before the deviation is
    // attached to it, because every carrier before this one was wired to state
    // first and then thrown away on the frame.
    this.telemetry = {
      tick: snapshot.tick,
      adjustments: snapshot.adjustments,
      engaged: snapshot.engaged,
      correctionEnergy: snapshot.correctionEnergy,
      peakDeviation: snapshot.peakDeviation,
      residual: snapshot.residual,
      injections: snapshot.injections,
      stepMs: snapshot.stepMs,
    };
    client.release(snapshot);
  }

  /** A point on the rail, in world space, at rail parameter `t`. */
  private railPose(t: number, eye: THREE.Vector3, aim: THREE.Vector3): void {
    const points = RAIL.waypoints;
    if (points.length < 2) return;
    const spans = points.length - 1;
    const scaled = Math.min(Math.max(t, 0), 1) * spans;
    const index = Math.min(Math.floor(scaled), spans - 1);
    const from = points[index];
    const to = points[index + 1];

    // Eased within each leg rather than across the whole rail, so arriving
    // somewhere settles instead of sliding straight into the next move.
    const local = smoothstep(scaled - index);
    const mix = (a: readonly number[], b: readonly number[], i: number): number =>
      a[i] + (b[i] - a[i]) * local;

    eye.set(mix(from.eye, to.eye, 0), mix(from.eye, to.eye, 1), mix(from.eye, to.eye, 2));
    aim.set(mix(from.aim, to.aim, 0), mix(from.aim, to.aim, 1), mix(from.aim, to.aim, 2));
  }

  /**
   * The no-rings guardrail, restated for a field with no axis.
   *
   * The camera cone is retired with the flow it protected: there is no
   * privileged direction here to look down. The rule that outlived four
   * directions has not gone anywhere, it has moved into the shader — every
   * fold is offset before it mirrors and rotated on an axis shared with
   * nothing, because origin-centred mirrors and radial domain repetition are
   * the two ways a raymarcher manufactures concentric arcs. That construction
   * cannot be asserted from here; it is checked by looking, on real hardware,
   * from several poses.
   */

  private applyCamera(): void {
    // Eased against progress rather than tweened against time: the camera is a
    // readout of where the visitor is on the page, so it must be able to run
    // backwards exactly as it ran forwards, with no easing state to unwind.
    // Reduced motion holds it at the head of the rail, which is the same pose
    // by construction rather than a second set of numbers to keep in step.
    const t = this.reducedMotion ? 0 : Math.min(this.progress / RAIL_END, 1);

    this.railPose(t, this.railOffset, this.railTarget);

    // A tall frame sees far less across its width, and the choir's long axis
    // runs across the frame — held level it would be cropped to a fragment. So
    // portrait stands further back along the same line and aims lower, which
    // carries the field into the frame's upper reach and leaves the copy on its
    // own ground. Still one straight rail; only distance and aim move.
    if (this.portrait) {
      this.railOffset.sub(this.railTarget).multiplyScalar(PORTRAIT.retreat).add(this.railTarget);
      this.railTarget.y -= PORTRAIT.drop;
    }

    this.camera.position.copy(this.railOffset);
    this.camera.lookAt(this.railTarget);
  }

  private tick = (): void => {
    if (!this.running) return;
    this.frameHandle = requestAnimationFrame(this.tick);

    const now = performance.now();
    const rawDelta = now - this.lastFrameTime;
    this.lastFrameTime = now;
    const dt = Math.min(rawDelta / 1000, 1 / 20);

    this.quality.sample(rawDelta, now);

    // Cold-open reveal. The only eased quantity in the whole system, and it
    // touches exposure alone — never the state, never the geometry.
    this.exposure += (this.exposureTarget - this.exposure) * (1 - Math.pow(0.05, dt));
    this.model?.setExposure(this.exposure);

    // Eased both ways, and slower on the way out than in: the field meeting
    // your attention should feel like a response, and losing it should feel
    // like it is still holding the place you were looking.
    const target = this.hovering && this.machineOn ? 1 : 0;
    const rate = target > this.hoverStrength ? 0.02 : 0.35;
    this.hoverStrength += (target - this.hoverStrength) * (1 - Math.pow(rate, dt));
    this.model?.setHover(this.hover.x, this.hover.y, this.hoverStrength);

    this.consume();
    this.applyCamera();
    this.model?.setCamera(this.camera);
    this.model?.setTime(now / 1000);
    this.model?.setFlare(this.flareAt(this.progress));
    this.planet?.setTime(now / 1000);
    this.planet?.setFlare(this.flareAt(this.progress));
    this.planet?.setExposure(this.exposure);
    // Stepped after the flare, because both write the same positions and the
    // correction's deviation has to be the one that lands last.
    this.correction?.update(dt);
    this.draw();
  };

  dispose(): void {
    this.disposed = true;
    this.stop();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
    document.removeEventListener('pointerleave', this.onPointerLeave);
    this.resizeObserver?.disconnect();
    if (this.model) {
      this.scene.remove(this.model.group);
      this.model.dispose();
      this.model = null;
    }
    if (this.planet) {
      this.scene.remove(this.planet.group);
      this.planet.dispose();
      this.planet = null;
      this.correction = null;
    }
    this.client?.dispose();
    this.client = null;
    this.renderer.dispose();
  }
}
