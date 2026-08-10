/**
 * Fetches the generated graph artifacts and checks them against the scene they
 * are about to be mapped onto.
 */

import {
  decodeGraph, decodeVertexMap,
  type CausalGraph, type GraphManifest,
} from './GraphAsset';

export interface LoadedGraph {
  manifest: GraphManifest;
  graph: CausalGraph;
  vertexNodeIndex: Uint32Array;
  /** Byte size of the two binaries, for the inspector. */
  bytes: number;
}

const BASE = `${import.meta.env.BASE_URL}generated/causal-pulse`;

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url}: ${response.status} ${response.statusText} — run "node tools/build-causal-graph.mjs"`);
  }
  return response.arrayBuffer();
}

export async function loadCausalGraph(): Promise<LoadedGraph> {
  const [manifestResponse, graphBuffer, vertexBuffer] = await Promise.all([
    fetch(`${BASE}/graph-manifest.json`),
    fetchBuffer(`${BASE}/graph.bin`),
    fetchBuffer(`${BASE}/vertex-map.bin`),
  ]);

  if (!manifestResponse.ok) {
    throw new Error(`graph-manifest.json: ${manifestResponse.status} — run "node tools/build-causal-graph.mjs"`);
  }

  const manifest = (await manifestResponse.json()) as GraphManifest;
  const graph = decodeGraph(graphBuffer);
  const { nodeIndex } = decodeVertexMap(vertexBuffer);

  if (graph.nodeCount !== manifest.graph.nodes) {
    throw new Error(`graph.bin has ${graph.nodeCount} nodes, manifest says ${manifest.graph.nodes}`);
  }

  const mappedVertices = manifest.primitiveOrder.reduce((sum, p) => sum + p.vertexCount, 0);
  if (nodeIndex.length !== mappedVertices) {
    throw new Error(`vertex-map.bin has ${nodeIndex.length} entries, manifest primitives total ${mappedVertices}`);
  }

  return {
    manifest,
    graph,
    vertexNodeIndex: nodeIndex,
    bytes: graphBuffer.byteLength + vertexBuffer.byteLength,
  };
}

/**
 * Graph plus manifest only — no vertex map. The Worker simulates and never
 * touches render vertices, so it skips the larger of the two binaries.
 */
export async function loadGraphForSimulation(): Promise<{ manifest: GraphManifest; graph: CausalGraph }> {
  const [manifestResponse, graphBuffer] = await Promise.all([
    fetch(`${BASE}/graph-manifest.json`),
    fetchBuffer(`${BASE}/graph.bin`),
  ]);

  if (!manifestResponse.ok) throw new Error(`graph-manifest.json: ${manifestResponse.status}`);

  return {
    manifest: (await manifestResponse.json()) as GraphManifest,
    graph: decodeGraph(graphBuffer),
  };
}

/**
 * Nearest graph node to a world-space point. Brute force over a few thousand
 * nodes costs well under a millisecond and only runs on click, so an
 * acceleration structure would be complexity without a reason.
 */
export function nearestNode(graph: CausalGraph, x: number, y: number, z: number, excludeRole = -1): number {
  let best = -1;
  let bestDistance = Infinity;

  for (let i = 0; i < graph.nodeCount; i++) {
    if (excludeRole >= 0 && graph.role[i] === excludeRole) continue;
    const dx = graph.positions[i * 3] - x;
    const dy = graph.positions[i * 3 + 1] - y;
    const dz = graph.positions[i * 3 + 2] - z;
    const distance = dx * dx + dy * dy + dz * dz;
    if (distance < bestDistance) { bestDistance = distance; best = i; }
  }

  return best;
}
