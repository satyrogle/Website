/**
 * Graph format — types only.
 *
 * Ported from the causal-pulse spike (`claude/causal-pulse-spike-v1`,
 * `src/labs/causal-pulse/graph/GraphAsset.ts`). The spike decoded a binary
 * written from the retired entity mesh; that half is deliberately not carried
 * over. THE CORRECTION synthesises its structure in memory from a seed
 * (`GraphSynth`), so there is no asset to load, no format version to police
 * and no `.glb` anywhere in the pipeline.
 *
 * What survives is the CSR contract the simulation is written against, so the
 * engine steps a synthesised graph without knowing the difference.
 */

/**
 * Undirected weighted graph in compressed sparse row form.
 *
 * `offsets` has `nodeCount + 1` entries; node `i` owns the neighbour range
 * `[offsets[i], offsets[i + 1])`. Both directions of every edge are stored,
 * so `entryCount` is twice the undirected edge count and the adjacency is
 * symmetric — the simulation relies on that when it treats the coupling
 * operator as self-adjoint.
 */
export interface CausalGraph {
  nodeCount: number;
  /** Directed entries in the CSR arrays — twice the undirected edge count. */
  entryCount: number;
  /** xyz per node: the blade's anchor, where the law says it belongs. */
  positions: Float32Array;
  /**
   * Unit deviation axis `n̂ᵢ` per node — the blade's own face normal.
   *
   * State `uᵢ` is an angle about this axis, not a translation. A deviating
   * blade physically swings out of the comb and is physically rotated back;
   * the world deviates and is put back in the world, rather than changing
   * colour in place.
   */
  directions: Float32Array;
  offsets: Uint32Array;
  neighbours: Uint32Array;
  weights: Float32Array;
}

/**
 * Spectral headroom for the timestep, computed by the synthesiser rather than
 * discovered by watching the simulation explode.
 *
 * `lambdaMaxBound` is Gershgorin's bound on the weighted coupling operator,
 * `2 · maxᵢ Σⱼ wᵢⱼ`. Explicit Euler on the first-order relaxation
 * `u̇ = −γu + κLu` is stable while `dt · (γ + κ · λ_max) ≤ 2`; the field
 * asserts a much tighter `≤ 0.5`, which is the accuracy bound rather than the
 * stability one.
 */
export interface StabilityBounds {
  maxWeightedDegree: number;
  lambdaMaxBound: number;
}
