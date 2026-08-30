import type { CameraPath } from '../render/CameraPath';

/**
 * The single seam between document scroll and the world. It maps page
 * progress onto CameraPath progress and nothing else: no smoothing
 * library, no hijack, no independent visual logic, and since
 * 2026-08-29 NO EASE AT ALL. The settle lag read as a to-and-fro
 * wobble - the world kept moving after the hand stopped (Jacob). The
 * repo already learned this once when Lenis was removed: anything
 * between the scrollbar and the camera obscures input causality.
 * The world is exactly where the document is, every frame.
 */

export class ScrollDirector {
  private target = 0;
  private current = 0;
  private readonly path: CameraPath;

  constructor(path: CameraPath, _reduced: boolean) {
    this.path = path;
    this.read();
    this.current = this.target;
    window.addEventListener('scroll', this.read, { passive: true });
    window.addEventListener('resize', this.read);
  }

  private readonly read = (): void => {
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    this.target = max > 0 ? window.scrollY / max : 0;
  };

  /** Called once per frame from the boot loop, before the renderer. */
  update(_dt: number): void {
    this.current = this.target;
    this.path.setProgress(this.current);
  }

  get progress(): number {
    return this.current;
  }
}
