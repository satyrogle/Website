import type { LatticeWorld } from '../world/LatticeWorld';
import type { JourneyRenderer } from '../render/JourneyRenderer';

/**
 * A press travels input, authoritative state, visible consequence,
 * record, and nowhere else. The press ray lands a fixed reach ahead of
 * the camera, so a mark is placed wherever in the world the visitor is
 * currently looking.
 */
export class InputController {
  constructor(
    private readonly world: LatticeWorld,
    private readonly renderer: JourneyRenderer,
    private readonly onRefused: () => void
  ) {
    window.addEventListener('pointerdown', this.onPointerDown);
    const button = document.querySelector<HTMLButtonElement>('[data-place-mark]');
    button?.addEventListener('click', () => {
      this.place(0, 0);
    });
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    const target = e.target as Element | null;
    if (target && target.closest('a, button, input, textarea, select, nav, header, footer, aside')) {
      return;
    }
    const ndcX = (e.clientX / window.innerWidth) * 2 - 1;
    const ndcY = -((e.clientY / window.innerHeight) * 2 - 1);
    this.place(ndcX, ndcY);
  };

  private place(ndcX: number, ndcY: number): void {
    const p = this.renderer.path.markPoint(this.renderer.camera, ndcX, ndcY);
    if (!this.world.placeMark(p.x, p.y, p.z)) this.onRefused();
  }

  dispose(): void {
    window.removeEventListener('pointerdown', this.onPointerDown);
  }
}
