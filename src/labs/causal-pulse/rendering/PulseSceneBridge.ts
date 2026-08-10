/**
 * Binds the generated graph to the loaded entity.
 *
 * Each render vertex gets the index of its graph node as an attribute, so the
 * vertex shader can fetch that node's state directly. The source GLB is never
 * modified — geometries are cloned before the attribute is added, which is also
 * required because instanced nodes share one BufferGeometry and each instance
 * needs its own mapping.
 *
 * The runtime mesh order has to line up with the order the build tool walked.
 * A mismatch would map state onto the wrong vertices and still render happily,
 * so it is asserted against the manifest rather than assumed.
 */

import { BufferAttribute, type DataTexture, Group, Mesh, type Object3D, type ShaderMaterial } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import type { GraphManifest } from '../graph/GraphAsset';

export interface BoundEntity {
  root: Group;
  meshes: Mesh[];
  vertexCount: number;
  /** Names in the order they were bound, for the inspector. */
  boundOrder: string[];
}

/**
 * Resolve which glTF node a mesh belongs to. GLTFLoader may wrap a
 * multi-primitive mesh in a Group, so the owning name can be on an ancestor.
 */
function resolveNodeName(object: Object3D, known: Set<string>): string {
  let current: Object3D | null = object;
  while (current) {
    if (current.name && known.has(current.name)) return current.name;
    current = current.parent;
  }
  return object.name || '<unnamed>';
}

export async function loadAndBindEntity(
  url: string,
  manifest: GraphManifest,
  vertexNodeIndex: Uint32Array,
  material: ShaderMaterial,
): Promise<BoundEntity> {
  const gltf = await new GLTFLoader().loadAsync(url);

  const known = new Set(manifest.primitiveOrder.map((p) => p.nodeName));
  const collected: { name: string; mesh: Mesh; order: number }[] = [];
  let order = 0;

  gltf.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    collected.push({ name: resolveNodeName(object, known), mesh: object, order: order++ });
  });

  // Same ordering rule the build tool used: by owning node name, then by the
  // order primitives appear within that node.
  collected.sort((a, b) => (a.name === b.name ? a.order - b.order : a.name.localeCompare(b.name)));

  if (collected.length !== manifest.primitiveOrder.length) {
    throw new Error(
      `entity has ${collected.length} renderable primitives but the graph was built from `
      + `${manifest.primitiveOrder.length}. The asset changed — rerun tools/build-causal-graph.mjs`,
    );
  }

  const root = new Group();
  root.name = 'CausalPulseEntity';
  const meshes: Mesh[] = [];
  const boundOrder: string[] = [];
  let cursor = 0;

  for (let i = 0; i < collected.length; i++) {
    const expected = manifest.primitiveOrder[i];
    const { name, mesh } = collected[i];
    const position = mesh.geometry.getAttribute('position');

    if (position.count !== expected.vertexCount) {
      throw new Error(
        `primitive ${i} (${name}) has ${position.count} vertices, graph expects `
        + `${expected.vertexCount} for ${expected.nodeName}. Mapping would be wrong — rebuild the graph.`,
      );
    }

    // Clone so instanced nodes get independent attributes and the loaded asset
    // is left untouched.
    const geometry = mesh.geometry.clone();
    const slice = vertexNodeIndex.subarray(cursor, cursor + expected.vertexCount);
    cursor += expected.vertexCount;

    // Float rather than integer: node indices stay well inside exact float32
    // range, and this avoids the integer-attribute path entirely.
    const nodeAttribute = new Float32Array(expected.vertexCount);
    for (let v = 0; v < expected.vertexCount; v++) nodeAttribute[v] = slice[v];
    geometry.setAttribute('aGraphNode', new BufferAttribute(nodeAttribute, 1));

    const bound = new Mesh(geometry, material);
    bound.name = `${expected.nodeName}#${expected.primIndex}`;
    bound.matrixAutoUpdate = false;

    // The build tool baked world transforms into the graph positions, so the
    // render mesh has to sit in that same space.
    mesh.updateWorldMatrix(true, false);
    bound.matrix.copy(mesh.matrixWorld);

    root.add(bound);
    meshes.push(bound);
    boundOrder.push(bound.name);
  }

  if (cursor !== vertexNodeIndex.length) {
    throw new Error(`consumed ${cursor} of ${vertexNodeIndex.length} vertex-map entries`);
  }

  return { root, meshes, vertexCount: cursor, boundOrder };
}

/** Copy a Worker snapshot into the state texture. */
export function uploadState(texture: DataTexture, snapshot: Float32Array): void {
  (texture.image.data as unknown as Float32Array).set(snapshot);
  texture.needsUpdate = true;
}
