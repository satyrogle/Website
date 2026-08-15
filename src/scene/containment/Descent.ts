/**
 * The descent — six semantic poses, and the rail through them.
 *
 * The camera does not visit objects. It enters the thing it was looking at:
 * the form observed from outside becomes the mouth, and the visitor passes
 * between the trajectories rather than past them.
 *
 * **The poses are authored from the narrative, not derived from the geometry.**
 * That is the whole architectural point. A rail built from where the objects
 * happen to be produces object → object → object → hero reveal, which is a
 * product showcase; the structure may decide local clearance and framing
 * inside a pose, and it may never decide what the sequence is.
 *
 * Two laws it inherits:
 *
 * - **No axis-aligned run.** A straight line inward is a tunnel down an axis,
 *   which is how the retired tunnels died. The path weaves — elevation rises
 *   again at DESCEND, and no two consecutive poses share a bearing.
 * Re-authored for the sheets. The poses were placed against a five-unit shell
 * structure and the entity now spans fourteen, so OBSERVE stood inside its own
 * subject and there was no silhouette to read at all.
 *
 * - **The end is the seat.** REVEAL sits just outside the forbidden volume the
 *   structure curves around, looking into it. In Act III that volume holds the
 *   planet; the descent already arrives at exactly the place it will be, and
 *   in this slice the visitor arrives to find it empty.
 */

export interface Pose {
  name: 'OBSERVE' | 'APPROACH' | 'CROSS' | 'DESCEND' | 'UNDERSTAND' | 'REVEAL';
  position: [number, number, number];
  target: [number, number, number];
  /** Recession window, so near and far trajectories keep arriving differently. */
  near: number;
  far: number;
  /**
   * Vertical field of view.
   *
   * Widens as the camera goes inside. At 38 degrees throughout, the thirty
   * trajectories within a metre of the CROSS pose were nearly all outside the
   * frustum — the camera was passing between enormous strands and showing none
   * of them. A wide lens is also what enclosure looks like: peripheral
   * structure streaming past is the difference between travelling through a
   * thing and looking at it down a tube.
   */
  fov: number;
}

/** Centre of the forbidden volume. Must match `ContainmentSynth`'s void. */
const SEAT: [number, number, number] = [0.42, -0.31, 0.55];

export const POSES: Pose[] = [
  {
    name: 'OBSERVE',
    // Fourteen out, not twenty. The entity spans fourteen units, so at the
    // previous distance it sat in the middle of the frame with black on every
    // side and read as a specimen. It has to crowd the frame to be enormous.
    // The body spans 12.8 x 9.9 and its centre is near the origin, so this
    // stands well off it and looks at the middle. Measured from the mesh
    // bounds rather than guessed.
    position: [10.5, 4.2, 15.5],
    target: [-0.2, 0.05, -0.23],
    near: 6.0,
    far: 24.0,
    fov: 40,
  },
  {
    name: 'APPROACH',
    position: [7.0, 2.7, 7.5],
    target: [0.1, -0.1, 0.3],
    near: 4.5,
    far: 19.0,
    fov: 46,
  },
  {
    name: 'CROSS',
    position: [5.6, 0.7, 4.8],
    target: SEAT,
    near: 2.6,
    far: 13.0,
    fov: 60,
  },
  {
    // Elevation climbs again here. A monotonic descent reads as a lift shaft.
    name: 'DESCEND',
    position: [4.3, 2.0, 3.7],
    target: SEAT,
    near: 1.8,
    far: 10.0,
    fov: 62,
  },
  {
    name: 'UNDERSTAND',
    position: [3.3, 0.6, 3.0],
    target: SEAT,
    near: 1.2,
    far: 8.0,
    fov: 56,
  },
  {
    // Stops 2.9 from the seat, not 2.0.
    //
    // Closer, the forbidden volume subtends fifty degrees and swallows the
    // frame: the visitor arrives at a hole. It has to be FRAMED by the
    // structure — the lattice visibly wrapped around and penetrating the thing
    // it is holding — which is the beat this pose exists for, and which only
    // reads if both are in shot. In Act III the volume is full; the composition
    // is the same either way, and that is the point of authoring it now.
    name: 'REVEAL',
    position: [2.22, 0.97, 2.44],
    target: SEAT,
    near: 0.8,
    far: 6.0,
    fov: 48,
  },
];

export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
  near: number;
  far: number;
  fov: number;
  /** The pose the visitor is nearest to, for the readout. */
  pose: Pose['name'];
  /** How far between poses, 0..1, for anything that needs a beat boundary. */
  within: number;
}

/**
 * Catmull-Rom through the authored poses.
 *
 * A straight lerp between poses puts a corner at every one of them, and a
 * corner in a camera path is a cut the visitor feels as a stumble. This passes
 * through each pose exactly and arrives with a continuous tangent, so the six
 * beats are places the rail goes through rather than places it stops.
 */
function spline(values: number[], t: number): number {
  const n = values.length - 1;
  const scaled = Math.min(Math.max(t, 0), 1) * n;
  const i = Math.min(Math.floor(scaled), n - 1);
  const f = scaled - i;

  const p0 = values[Math.max(i - 1, 0)];
  const p1 = values[i];
  const p2 = values[i + 1];
  const p3 = values[Math.min(i + 2, n)];

  const f2 = f * f;
  const f3 = f2 * f;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * f +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * f3)
  );
}

const axis = (key: 'position' | 'target', i: number): number[] => POSES.map((p) => p[key][i]);

const TRACKS = {
  px: axis('position', 0),
  py: axis('position', 1),
  pz: axis('position', 2),
  tx: axis('target', 0),
  ty: axis('target', 1),
  tz: axis('target', 2),
  near: POSES.map((p) => p.near),
  far: POSES.map((p) => p.far),
  fov: POSES.map((p) => p.fov),
};

export function sampleDescent(progress: number): CameraState {
  const t = Math.min(Math.max(progress, 0), 1);
  const scaled = t * (POSES.length - 1);
  const index = Math.min(Math.floor(scaled), POSES.length - 2);

  return {
    position: [spline(TRACKS.px, t), spline(TRACKS.py, t), spline(TRACKS.pz, t)],
    target: [spline(TRACKS.tx, t), spline(TRACKS.ty, t), spline(TRACKS.tz, t)],
    // Linear, not splined: overshooting a recession window pushes it past the
    // camera and the near field inverts.
    near: TRACKS.near[index] + (TRACKS.near[index + 1] - TRACKS.near[index]) * (scaled - index),
    far: TRACKS.far[index] + (TRACKS.far[index + 1] - TRACKS.far[index]) * (scaled - index),
    fov: TRACKS.fov[index] + (TRACKS.fov[index + 1] - TRACKS.fov[index]) * (scaled - index),
    pose: POSES[Math.round(scaled)].name,
    within: scaled - index,
  };
}

/** The pose nearest a given progress, for authoring and for tests. */
export const poseAt = (progress: number): Pose =>
  POSES[Math.round(Math.min(Math.max(progress, 0), 1) * (POSES.length - 1))];
