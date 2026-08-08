import * as THREE from 'three';

/**
 * EnvironmentStages
 *
 * Two entity-free backplates inside the ONE persistent world: a heavenly
 * space behind the Crowned Convergence, and a menacing one behind the
 * Latent Form. They are real geometry in the same scene as everything
 * else — not a second renderer, not a CSS layer, not a crossfade between
 * pages — so the corridor between them is a physical traversal rather
 * than a transition effect.
 *
 * Neither plate ever moves. Only opacity changes, and it changes off the
 * same narrative progress that drives CameraRig, Lighting and the entity,
 * which is what keeps them synchronised without a second scroll
 * calculation existing anywhere.
 *
 * The plates carry no entity, halo, core or rings. Anything baked into
 * them would visually duplicate the geometry standing in front of them.
 */

/** Where each plate sits on the travel axis. Neither is ever moved. */
const CROWNED_Z = -3.8;
const LATENT_Z = -14.5;

/**
 * Coverage margin over the worst-case frustum. The plate has to
 * over-fill: an edge coming into frame would show the void behind the
 * backplate, which reads as the world ending.
 */
const MARGIN = 1.15;

/**
 * Worst-case frustum height each plate must cover, in world units,
 * measured across the window in which that plate is actually visible.
 *
 * Derived from the camera paths in CameraRig. Distance to the plate
 * shrinks faster than the FOV opens, so the maximum is at the START of
 * each plate's window, and the MOBILE path governs both — it stands
 * further back and runs a wider lens.
 *
 *   crowned, visible 0.00-0.26   mobile 0.00: z 13.6, fov 44, d 17.4 -> 14.06
 *   latent,  visible 0.68-1.00   mobile 0.68: z -3.96, fov 53, d 10.5 -> 10.57
 *
 * Re-derive these if either path's standoff or FOV band changes.
 */
const CROWNED_COVER_HEIGHT = 14.1;
const LATENT_COVER_HEIGHT = 10.6;

/**
 * Authored floor. The plates are never smaller than the size the brief
 * specifies — the frustum fit only ever grows them, which it has to do
 * on ultrawide: at 32:9 the hero frustum is over 41 units across and a
 * fixed 32-wide plate would show its own edge.
 */
const MIN_WIDTH = 32;
const MIN_HEIGHT = 18;

function smoothstep(x: number, min: number, max: number): number {
  const t = Math.min(Math.max((x - min) / Math.max(max - min, 1e-6), 0), 1);
  return t * t * (3 - 2 * t);
}

export class EnvironmentStages {
  readonly group = new THREE.Group();

  readonly crownedEnvironment: THREE.Mesh;
  readonly latentEnvironment: THREE.Mesh;

  private crownedMaterial: THREE.MeshBasicMaterial;
  private latentMaterial: THREE.MeshBasicMaterial;
  private geometry: THREE.PlaneGeometry;
  private textures: THREE.Texture[] = [];

  constructor(crownedTexture: THREE.Texture, latentTexture: THREE.Texture) {
    for (const texture of [crownedTexture, latentTexture]) {
      texture.colorSpace = THREE.SRGBColorSpace;
      // The plate is scaled to the frustum, so its edges must never
      // repeat — a wrapped edge reads as a seam across the sky.
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      this.textures.push(texture);
    }

    const shared = {
      transparent: true,
      depthWrite: false,
      depthTest: true,
      // Honoured only if the renderer tonemaps. This build tonemaps in
      // the composite pass instead, so the plates are graded with the
      // rest of the frame — which is what seats them in the world rather
      // than leaving them sitting on the glass in front of it.
      toneMapped: false,
      side: THREE.FrontSide,
    };

    this.crownedMaterial = new THREE.MeshBasicMaterial({
      ...shared,
      map: crownedTexture,
      opacity: 1,
    });

    this.latentMaterial = new THREE.MeshBasicMaterial({
      ...shared,
      map: latentTexture,
      opacity: 0,
    });

    // Unit plane, scaled per-mesh. One geometry serves both.
    this.geometry = new THREE.PlaneGeometry(1, 1);

    this.crownedEnvironment = new THREE.Mesh(this.geometry, this.crownedMaterial);
    this.crownedEnvironment.position.set(0, 0, CROWNED_Z);

    this.latentEnvironment = new THREE.Mesh(this.geometry, this.latentMaterial);
    this.latentEnvironment.position.set(0, 0, LATENT_Z);

    for (const mesh of [this.crownedEnvironment, this.latentEnvironment]) {
      // Drawn before every other transparent object.
      //
      // Both plates and the convergence core are transparent, so they
      // sort together back-to-front. The heavenly plate sits at z -3.8
      // and the core at z -10.8, which makes the PLATE the nearer of the
      // two — it would therefore draw last, over the core, and put the
      // one warm cyan point at the hero behind a wall. The core writes
      // no depth, so nothing else would have caught it.
      //
      // Render order is explicit rather than positional: the plates are
      // background by definition, whatever their coordinates.
      mesh.renderOrder = -10;
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
    }

    this.group.add(this.crownedEnvironment, this.latentEnvironment);
  }

  /**
   * Sizes each plate to over-fill the frustum for its whole visible
   * window. Depends only on the viewport aspect, so it is recomputed on
   * resize and never during the scroll — a plate that grew as the FOV
   * opened would read as the background zooming, which is exactly the
   * effect these are meant to avoid.
   */
  layout(aspect: number): void {
    const plates: [THREE.Mesh, number][] = [
      [this.crownedEnvironment, CROWNED_COVER_HEIGHT],
      [this.latentEnvironment, LATENT_COVER_HEIGHT],
    ];

    for (const [mesh, cover] of plates) {
      const height = cover * MARGIN;
      mesh.scale.set(
        Math.max(height * aspect, MIN_WIDTH),
        Math.max(height, MIN_HEIGHT),
        1
      );
      mesh.updateMatrix();
    }
  }

  /**
   * The only narrative input. Positions never change — the visitor moves
   * through the world, the world does not slide past them.
   */
  setProgress(progress: number): void {
    // Heavenly space is gone before the camera commits to the cavity, so
    // the plate is never approached closely enough to read as a flat
    // image. The rail passes through z -3.8 at about 54% scroll; by then
    // this has been at zero for half the descent.
    const crowned = 1 - smoothstep(progress, 0.12, 0.26);

    // The destination emerges through the tunnel exit. It starts under
    // the corridor's own light rather than arriving, so the visitor
    // registers having EXITED into somewhere rather than being shown a
    // new picture.
    const latent = smoothstep(progress, 0.68, 0.93);

    this.crownedMaterial.opacity = crowned;
    this.latentMaterial.opacity = latent;

    // A fully faded plate is switched off outright. At zero opacity it
    // still costs a full-frustum draw, and it still participates in
    // transparent sorting — cheapest correctness is to remove it.
    this.crownedEnvironment.visible = crowned > 0.001;
    this.latentEnvironment.visible = latent > 0.001;
  }

  dispose(): void {
    this.geometry.dispose();
    this.crownedMaterial.dispose();
    this.latentMaterial.dispose();
    for (const texture of this.textures) texture.dispose();
    this.group.clear();
  }
}
