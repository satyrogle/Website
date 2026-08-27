import * as THREE from 'three';

/**
 * The approved opening pose. The hero is a held encounter now: there is
 * no scroll path, threshold transfer, interior country, or return route.
 */
const HERO_POSITION = new THREE.Vector3(0, 10, 262);
const HERO_LOOK = new THREE.Vector3(0, 86, 0);
const HERO_FOV = 45;

export interface CameraState {
  severity: number;
}

export class CameraPath {
  readonly state: CameraState = { severity: 0 };
  private readonly look = HERO_LOOK.clone();

  /** Current look target, retained for the hero's restrained pointer parallax. */
  get lookPoint(): THREE.Vector3 {
    return this.look;
  }

  update(camera: THREE.PerspectiveCamera): void {
    camera.position.copy(HERO_POSITION);
    this.look.copy(HERO_LOOK);
    camera.lookAt(this.look);
    if (camera.fov !== HERO_FOV) {
      camera.fov = HERO_FOV;
      camera.updateProjectionMatrix();
    }
    this.state.severity = 0;
  }
}
