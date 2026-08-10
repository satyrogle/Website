/**
 * Decoding for the binaries written by tools/build-causal-graph.mjs.
 *
 * Both formats are versioned and carry a magic number. A mismatch throws rather
 * than being tolerated: mapping simulation state onto the wrong vertices
 * produces something that still renders, which is the worst possible failure.
 */

export const GRAPH_FORMAT_VERSION = 1;

const MAGIC_GRAPH = 0x47434c44; // "DLCG" little-endian
const MAGIC_VERTEX_MAP = 0x4d564c44; // "DLVM"

export type StructuralRole =
  | 'exterior' | 'shard' | 'tunnel_ring' | 'tunnel_shell'
  | 'halo' | 'latent' | 'core' | 'gyre' | 'chamber' | 'other';

export interface CausalGraph {
  nodeCount: number;
  /** Directed entries in the CSR arrays — twice the undirected edge count. */
  entryCount: number;
  positions: Float32Array;
  normals: Float32Array;
  primitive: Uint16Array;
  role: Uint8Array;
  offsets: Uint32Array;
  neighbours: Uint32Array;
  weights: Float32Array;
}

export interface PrimitiveRecord {
  nodeName: string;
  meshIndex: number;
  primIndex: number;
  role: StructuralRole;
  vertexCount: number;
}

export interface GraphManifest {
  formatVersion: number;
  seed: number;
  source: { path: string; sha256: string; vertices: number; primitives: number };
  graph: {
    nodes: number;
    edges: number;
    medianSpacing: number;
    degree: { min: number; median: number; mean: number; max: number; isolated: number };
    topologyEdges: number;
    proximityEdges: number;
    bridgeEdges: number;
  };
  stability: {
    maxWeightedDegree: number;
    lambdaMaxBound: number;
    diffusionDtMax: number;
    waveDtMax: number;
  };
  roles: StructuralRole[];
  roleCounts: Record<string, number>;
  connectivity: {
    components: number;
    largestComponent: number;
    largestComponentShare: number;
    rolesReached: string[];
  };
  primitiveOrder: PrimitiveRecord[];
  /** Written by tools/causal-pulse-calibrate.mjs. Fixed across all routes. */
  retainedDisplay?: {
    low: number;
    high: number;
    displayCut: number;
    absoluteThreshold: number;
    routesSatisfyingAll: number;
  };
}

export function decodeGraph(buffer: ArrayBuffer): CausalGraph {
  const header = new DataView(buffer);
  if (header.getUint32(0, true) !== MAGIC_GRAPH) throw new Error('graph.bin: bad magic');

  const version = header.getUint32(4, true);
  if (version !== GRAPH_FORMAT_VERSION) {
    throw new Error(`graph.bin: format version ${version}, expected ${GRAPH_FORMAT_VERSION} — rerun tools/build-causal-graph.mjs`);
  }

  const nodeCount = header.getUint32(8, true);
  const entryCount = header.getUint32(12, true);

  let at = 24;
  const positions = new Float32Array(buffer, at, nodeCount * 3); at += nodeCount * 12;
  const normals = new Float32Array(buffer, at, nodeCount * 3); at += nodeCount * 12;
  const primitive = new Uint16Array(buffer, at, nodeCount); at += nodeCount * 2;
  const role = new Uint8Array(buffer, at, nodeCount); at += nodeCount;
  at += (4 - (at % 4)) % 4; // writer pads here so the u32 views stay aligned

  const offsets = new Uint32Array(buffer, at, nodeCount + 1); at += (nodeCount + 1) * 4;
  const neighbours = new Uint32Array(buffer, at, entryCount); at += entryCount * 4;
  const weights = new Float32Array(buffer, at, entryCount);

  if (offsets[nodeCount] !== entryCount) {
    throw new Error(`graph.bin: CSR terminator ${offsets[nodeCount]} does not match entry count ${entryCount}`);
  }

  return { nodeCount, entryCount, positions, normals, primitive, role, offsets, neighbours, weights };
}

/**
 * Per-render-vertex node indices, stored in the manifest's primitiveOrder
 * sequence. Returned as one flat array plus the per-primitive offsets, so the
 * scene bridge can slice it without another pass.
 */
export function decodeVertexMap(buffer: ArrayBuffer): { nodeIndex: Uint32Array; primitiveCount: number } {
  const header = new DataView(buffer);
  if (header.getUint32(0, true) !== MAGIC_VERTEX_MAP) throw new Error('vertex-map.bin: bad magic');

  const version = header.getUint32(4, true);
  if (version !== GRAPH_FORMAT_VERSION) {
    throw new Error(`vertex-map.bin: format version ${version}, expected ${GRAPH_FORMAT_VERSION}`);
  }

  const primitiveCount = header.getUint32(8, true);
  const total = header.getUint32(12, true);

  return { nodeIndex: new Uint32Array(buffer, 16, total), primitiveCount };
}
