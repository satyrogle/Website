import type { SimulationKernel } from '../sim/SimulationKernel';
import type { ObservationModel } from '../render/ObservationModel';

/**
 * A press travels input -> authoritative state -> visible consequence
 * -> record, and nowhere else. Screen coordinates are mapped through
 * the current observation window so the mark lands exactly where the
 * visitor pressed, at any scale.
 */
export class InputController {
  constructor(
    private readonly kernel: SimulationKernel,
    private readonly observation: ObservationModel
  ) {
    window.addEventListener('pointerdown', this.onPointerDown);
    const button = document.querySelector<HTMLButtonElement>('[data-place-mark]');
    button?.addEventListener('click', () => {
      this.kernel.placeMarkAuto();
    });
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    const target = e.target as Element | null;
    if (target && target.closest('a, button, input, textarea, select, nav, header, footer, aside')) {
      return;
    }
    const v = this.observation.view;
    const sx = e.clientX / window.innerWidth;
    const sy = 1 - e.clientY / window.innerHeight;
    const x = v.centerX + (sx - 0.5) * v.winX;
    const y = v.centerY + (sy - 0.5) * v.winY;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    this.kernel.placeMark(x, y);
  };

  dispose(): void {
    window.removeEventListener('pointerdown', this.onPointerDown);
  }
}
