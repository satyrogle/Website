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
 * ported engine steps a synthesised graph without knowing the difference.
 */

/**
 * Undirected weighted graph in compressed sparse row form.
 *
 * `offsets` has `nodeCount + 1` entries; node `i` owns the neighbour range
 * `[offsets[i], offsets[i + 1])`. Both directions of every edge are stored,
 * so `entryCount` is twice the undirected edge count and the adjacency is
 * symmetric — the simulation relies on that when it resolves canonical edge
 * ids and when it treats the Laplacian as self-adjoint.
 */
export interface CausalGraph {
  nodeCount: number;
  /** Directed entries in the CSR arrays — twice the undirected edge count. */
  entryCount: number;
  /** xyz per node, the approved rest geometry `p₀`. */
  positions: Float32Array;
  /**
   * Unit displacement direction `n̂ᵢ` per node. Rendered position is
   * `p₀ᵢ + uᵢ · n̂ᵢ`: the world physically deviates and is physically pushed
   * back, rather than changing colour in place.
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
 * `lambdaMaxBound` is Gershgorin's bound on the weighted Laplacian,
 * `2 · maxᵢ Σⱼ wᵢⱼ`. Symplectic Euler on `u'' = c²Lu` is stable while
 * `c · dt · √λ_max < 2`, which is what `waveDtMax` reports.
 */
export interface StabilityBounds {
  maxWeightedDegree: number;
  lambdaMaxBound: number;
  waveDtMax: number;
}
