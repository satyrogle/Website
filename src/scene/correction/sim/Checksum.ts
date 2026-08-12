/**
 * FNV-1a over quantised state.
 *
 * Quantisation is the point: float noise in the last bits would make an
 * otherwise identical run report as divergent, so this answers "did this
 * reproduce" rather than "are these bit-identical". The site's claim is that
 * the same seed and the same input trace replay to the same world, and this is
 * the instrument that claim is measured with.
 */
export class Checksum {
  private hash = 0x811c9dc5;

  mix(value: number): void {
    this.hash ^= value & 0xff;
    this.hash = Math.imul(this.hash, 0x01000193);
    this.hash ^= (value >>> 8) & 0xff;
    this.hash = Math.imul(this.hash, 0x01000193);
  }

  /** Quantises a signed value in [-range, range] to 16 bits before mixing. */
  mixSigned(value: number, range: number): void {
    const t = (value + range) / (2 * range);
    this.mix(Math.round(Math.min(Math.max(t, 0), 1) * 65535));
  }

  /** Quantises a non-negative value in [0, range] to 16 bits before mixing. */
  mixUnsigned(value: number, range: number): void {
    const t = value / range;
    this.mix(Math.round(Math.min(Math.max(t, 0), 1) * 65535));
  }

  get value(): number {
    return this.hash >>> 0;
  }
}
