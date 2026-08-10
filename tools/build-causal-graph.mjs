/**
 * build-causal-graph.mjs — derive a simulation graph from the production entity.
 *
 * The Causal Pulse spike needs a graph to propagate through, and that graph has
 * to come from the object the visitor is actually looking at. This reads
 * DL_Aurora_v13.glb, clusters its ~198k vertices down to a few thousand nodes,
 * connects them, and writes the result plus a vertex->node map.
 *
 * The source GLB is opened read-only and never rewritten. Everything here is
 * deterministic: same asset + same seed + same target count => byte-identical
 * output, which is what makes the runtime checksum meaningful.
 *
 *   node tools/build-causal-graph.mjs [--nodes 6144] [--seed 421977]
 *
 * Writes public/generated/causal-pulse/{graph.bin,vertex-map.bin,graph-manifest.json}
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { Matrix4, Quaternion, Vector3 } from 'three';

const SOURCE = 'public/models/DL_Aurora_v13.glb';
const OUT_DIR = 'public/generated/causal-pulse';
const FORMAT_VERSION = 1;

// ---------------------------------------------------------------- arguments

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(process.argv[i + 1]);
}

const TARGET_NODES = arg('nodes', 6144);
const SEED = arg('seed', 421977);
// Proximity reach as a multiple of median node spacing. Tight by default: these
// edges exist only to bridge separate parts, and letting them dominate turns
// structural propagation into a radial blob.
const PROXIMITY_SCALE = arg('proximity', 1.1);
// Bridge reach and fan-out, both as deliberate structural junctions rather than
// general proximity. Also multiples of median node spacing.
const BRIDGE_SCALE = arg('bridge', 4.0);
const BRIDGES_PER_PAIR = arg('bridges-per-pair', 6);

if (TARGET_NODES < 4096 || TARGET_NODES > 8192) {
  console.error(`--nodes must be 4096..8192 for this spike (got ${TARGET_NODES})`);
  process.exit(1);
}

// ------------------------------------------------------------- GLB parsing

/** Split a .glb container into its JSON and binary chunks. */
function parseGlb(buffer) {
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB (bad magic)');
  const version = buffer.readUInt32LE(4);
  if (version !== 2) throw new Error(`unsupported glTF container version ${version}`);

  let offset = 12;
  let json = null;
  let bin = null;

  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (type === 0x4e4f534a) json = JSON.parse(buffer.subarray(start, start + length).toString('utf8'));
    else if (type === 0x004e4942) bin = buffer.subarray(start, start + length);
    offset = start + length;
  }

  if (!json) throw new Error('GLB contains no JSON chunk');
  return { json, bin };
}

const COMPONENT = {
  5120: { array: Int8Array, size: 1 },
  5121: { array: Uint8Array, size: 1 },
  5122: { array: Int16Array, size: 2 },
  5123: { array: Uint16Array, size: 2 },
  5125: { array: Uint32Array, size: 4 },
  5126: { array: Float32Array, size: 4 },
};

const COMPONENTS_PER_TYPE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/**
 * Read an accessor into a flat array. Handles interleaved buffer views, which
 * Blender's exporter does not currently produce but the format permits — a
 * silent stride bug here would poison every downstream position.
 */
function readAccessor(json, bin, index) {
  const accessor = json.accessors[index];
  if (accessor.sparse) throw new Error(`accessor ${index} is sparse; unsupported`);

  const comp = COMPONENT[accessor.componentType];
  if (!comp) throw new Error(`accessor ${index} has unknown componentType ${accessor.componentType}`);

  const perElement = COMPONENTS_PER_TYPE[accessor.type];
  const count = accessor.count;
  const out = new Float32Array(count * perElement);

  if (accessor.bufferView === undefined) return out; // spec: treat as zeroes

  const view = json.bufferViews[accessor.bufferView];
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? perElement * comp.size;

  for (let i = 0; i < count; i++) {
    const elementStart = base + i * stride;
    for (let c = 0; c < perElement; c++) {
      const at = elementStart + c * comp.size;
      let value;
      switch (accessor.componentType) {
        case 5120: value = bin.readInt8(at); break;
        case 5121: value = bin.readUInt8(at); break;
        case 5122: value = bin.readInt16LE(at); break;
        case 5123: value = bin.readUInt16LE(at); break;
        case 5125: value = bin.readUInt32LE(at); break;
        default: value = bin.readFloatLE(at); break;
      }
      out[i * perElement + c] = value;
    }
  }

  return out;
}

// ------------------------------------------------------- structural roles

/**
 * The entity's parts are named, so structural role is read rather than guessed.
 * Anything unrecognised lands in `other` and is reported, so a renamed part
 * shows up in the manifest instead of quietly becoming exterior.
 */
const ROLES = ['exterior', 'shard', 'tunnel_ring', 'tunnel_shell', 'halo', 'latent', 'core', 'gyre', 'chamber', 'other'];

/**
 * Which roles are allowed to conduct across a gap. The entity is an assembly of
 * separate meshes, so without this the graph fragments into per-part islands and
 * a pulse stays trapped on whatever the visitor happened to hit.
 *
 * The halo is deliberately absent: it is a free-floating ring several units off
 * the structure, and wiring it in would be inventing a connection the object
 * does not have.
 */
const BRIDGE_ROLES = [
  ['shard', 'shard'], ['shard', 'tunnel_ring'], ['shard', 'gyre'], ['shard', 'exterior'],
  ['exterior', 'tunnel_ring'], ['exterior', 'gyre'],
  ['tunnel_ring', 'tunnel_ring'], ['tunnel_ring', 'tunnel_shell'], ['tunnel_ring', 'gyre'],
  ['tunnel_ring', 'chamber'], ['tunnel_shell', 'chamber'], ['tunnel_shell', 'gyre'],
  ['chamber', 'latent'], ['chamber', 'core'],
  ['latent', 'core'], ['latent', 'gyre'], ['latent', 'latent'],
  ['gyre', 'gyre'], ['gyre', 'core'],
];

const bridgeAllowed = new Set(BRIDGE_ROLES.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));

function classifyRole(name) {
  const n = (name ?? '').toLowerCase();
  if (n.includes('shard')) return 'shard';
  if (n.includes('tunnelring')) return 'tunnel_ring';
  if (n.includes('tunnelshell')) return 'tunnel_shell';
  if (n.includes('halo')) return 'halo';
  if (n.includes('latent')) return 'latent';
  if (n.includes('gyre')) return 'gyre';
  if (n.includes('chamber')) return 'chamber';
  if (n.includes('core')) return 'core';
  if (n.includes('exterior')) return 'exterior';
  return 'other';
}

// --------------------------------------------------- flatten the GLB scene

/** Walk the node hierarchy accumulating world matrices, and collect primitives. */
function collectPrimitives(json, bin) {
  const primitives = [];
  const scene = json.scenes[json.scene ?? 0];

  const localMatrix = (node) => {
    const m = new Matrix4();
    if (node.matrix) return m.fromArray(node.matrix);
    const t = node.translation ?? [0, 0, 0];
    const r = node.rotation ?? [0, 0, 0, 1];
    const s = node.scale ?? [1, 1, 1];
    // Real Vector3/Quaternion instances: Matrix4.compose reads the quaternion's
    // _x/_y/_z/_w internals, so a plain {x,y,z,w} silently composes to NaN.
    return m.compose(
      new Vector3(t[0], t[1], t[2]),
      new Quaternion(r[0], r[1], r[2], r[3]),
      new Vector3(s[0], s[1], s[2]),
    );
  };

  const visit = (nodeIndex, parentMatrix) => {
    const node = json.nodes[nodeIndex];
    const world = new Matrix4().multiplyMatrices(parentMatrix, localMatrix(node));

    if (node.mesh !== undefined) {
      const mesh = json.meshes[node.mesh];
      const role = classifyRole(node.name ?? mesh.name);
      const normalMatrix = new Matrix4().copy(world).invert().transpose();

      mesh.primitives.forEach((prim, primIndex) => {
        if (prim.attributes.POSITION === undefined) return;

        const rawPos = readAccessor(json, bin, prim.attributes.POSITION);
        const rawNrm = prim.attributes.NORMAL !== undefined
          ? readAccessor(json, bin, prim.attributes.NORMAL)
          : new Float32Array(rawPos.length);

        const count = rawPos.length / 3;
        const position = new Float32Array(count * 3);
        const normal = new Float32Array(count * 3);
        const we = world.elements;
        const ne = normalMatrix.elements;

        for (let i = 0; i < count; i++) {
          const x = rawPos[i * 3], y = rawPos[i * 3 + 1], z = rawPos[i * 3 + 2];
          position[i * 3] = we[0] * x + we[4] * y + we[8] * z + we[12];
          position[i * 3 + 1] = we[1] * x + we[5] * y + we[9] * z + we[13];
          position[i * 3 + 2] = we[2] * x + we[6] * y + we[10] * z + we[14];

          const nx = rawNrm[i * 3], ny = rawNrm[i * 3 + 1], nz = rawNrm[i * 3 + 2];
          let tx = ne[0] * nx + ne[4] * ny + ne[8] * nz;
          let ty = ne[1] * nx + ne[5] * ny + ne[9] * nz;
          let tz = ne[2] * nx + ne[6] * ny + ne[10] * nz;
          const len = Math.hypot(tx, ty, tz) || 1;
          normal[i * 3] = tx / len;
          normal[i * 3 + 1] = ty / len;
          normal[i * 3 + 2] = tz / len;
        }

        const indices = prim.indices !== undefined
          ? Uint32Array.from(readAccessor(json, bin, prim.indices))
          : Uint32Array.from({ length: count }, (_, i) => i);

        primitives.push({
          nodeName: node.name ?? `node_${nodeIndex}`,
          nodeIndex,
          meshIndex: node.mesh,
          primIndex,
          role,
          position,
          normal,
          indices,
          vertexCount: count,
        });
      });
    }

    (node.children ?? []).forEach((child) => visit(child, world));
  };

  (scene.nodes ?? []).forEach((nodeIndex) => visit(nodeIndex, new Matrix4()));

  // Deterministic order independent of hierarchy traversal quirks.
  primitives.sort((a, b) => (a.nodeName === b.nodeName
    ? a.primIndex - b.primIndex
    : a.nodeName.localeCompare(b.nodeName)));

  return primitives;
}

// ------------------------------------------------------------- clustering

/**
 * Cluster vertices on a uniform voxel grid, keyed by primitive so a cluster can
 * never span two parts. Cell size is binary-searched to land on the requested
 * node count; smaller cells yield more clusters, monotonically.
 */
function countClusters(primitives, cell) {
  const keys = new Set();
  for (let p = 0; p < primitives.length; p++) {
    const { position, vertexCount } = primitives[p];
    for (let i = 0; i < vertexCount; i++) {
      const ix = Math.floor(position[i * 3] / cell);
      const iy = Math.floor(position[i * 3 + 1] / cell);
      const iz = Math.floor(position[i * 3 + 2] / cell);
      keys.add(`${p}|${ix}|${iy}|${iz}`);
    }
  }
  return keys.size;
}

function solveCellSize(primitives, target) {
  let lo = 0.005;
  let hi = 4.0;
  let best = hi;

  for (let iteration = 0; iteration < 42; iteration++) {
    const mid = Math.sqrt(lo * hi); // geometric bisection — scale-free
    const count = countClusters(primitives, mid);
    if (count > target) lo = mid; else hi = mid;
    best = mid;
    if (Math.abs(count - target) <= Math.max(16, target * 0.005)) break;
  }

  return best;
}

function buildNodes(primitives, cell) {
  const byKey = new Map();
  const vertexNode = primitives.map((p) => new Uint32Array(p.vertexCount));

  for (let p = 0; p < primitives.length; p++) {
    const prim = primitives[p];
    for (let i = 0; i < prim.vertexCount; i++) {
      const x = prim.position[i * 3], y = prim.position[i * 3 + 1], z = prim.position[i * 3 + 2];
      const key = `${p}|${Math.floor(x / cell)}|${Math.floor(y / cell)}|${Math.floor(z / cell)}`;

      let node = byKey.get(key);
      if (node === undefined) {
        node = {
          index: byKey.size,
          primitive: p,
          role: prim.role,
          sum: [0, 0, 0],
          normalSum: [0, 0, 0],
          count: 0,
        };
        byKey.set(key, node);
      }

      node.sum[0] += x; node.sum[1] += y; node.sum[2] += z;
      node.normalSum[0] += prim.normal[i * 3];
      node.normalSum[1] += prim.normal[i * 3 + 1];
      node.normalSum[2] += prim.normal[i * 3 + 2];
      node.count++;
      vertexNode[p][i] = node.index;
    }
  }

  const nodes = [...byKey.values()].map((n) => {
    const len = Math.hypot(...n.normalSum) || 1;
    return {
      index: n.index,
      primitive: n.primitive,
      role: n.role,
      position: [n.sum[0] / n.count, n.sum[1] / n.count, n.sum[2] / n.count],
      normal: [n.normalSum[0] / len, n.normalSum[1] / len, n.normalSum[2] / len],
      vertexCount: n.count,
    };
  });

  return { nodes, vertexNode };
}

// -------------------------------------------------------------- adjacency

/** Coarse occupancy grid, used to reject edges that would cross open space. */
function buildOccupancy(primitives, cell) {
  const filled = new Set();
  for (const prim of primitives) {
    for (let i = 0; i < prim.vertexCount; i++) {
      const ix = Math.floor(prim.position[i * 3] / cell);
      const iy = Math.floor(prim.position[i * 3 + 1] / cell);
      const iz = Math.floor(prim.position[i * 3 + 2] / cell);
      filled.add(`${ix}|${iy}|${iz}`);
    }
  }
  return { filled, cell };
}

function crossesAirGap(occupancy, a, b, maxRun) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const distance = Math.hypot(dx, dy, dz);
  const samples = Math.max(4, Math.ceil(distance / (occupancy.cell * 0.5)));
  let run = 0;

  for (let s = 1; s < samples; s++) {
    const t = s / samples;
    const ix = Math.floor((a[0] + dx * t) / occupancy.cell);
    const iy = Math.floor((a[1] + dy * t) / occupancy.cell);
    const iz = Math.floor((a[2] + dz * t) / occupancy.cell);
    if (occupancy.filled.has(`${ix}|${iy}|${iz}`)) run = 0;
    else if (++run > maxRun) return true;
  }

  return false;
}

/**
 * Two edge sources. Mesh topology is authoritative — those connections are the
 * object's real structure. Proximity edges bridge separate parts, and are held
 * to a distance bound, a normal-compatibility test and the air-gap test, so the
 * halo does not end up wired to the core through six units of vacuum.
 */
function buildAdjacency(nodes, primitives, vertexNode, opts) {
  const pairs = new Map();

  const addPair = (a, b, distance, kind) => {
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const existing = pairs.get(key);
    if (existing) {
      existing.count++;
      if (kind === 'topology') existing.kind = 'topology';
      return;
    }
    pairs.set(key, { a: Math.min(a, b), b: Math.max(a, b), distance, kind, count: 1 });
  };

  const distanceBetween = (i, j) => Math.hypot(
    nodes[i].position[0] - nodes[j].position[0],
    nodes[i].position[1] - nodes[j].position[1],
    nodes[i].position[2] - nodes[j].position[2],
  );

  // 1. topology
  for (let p = 0; p < primitives.length; p++) {
    const { indices } = primitives[p];
    const map = vertexNode[p];
    for (let t = 0; t < indices.length; t += 3) {
      const n0 = map[indices[t]], n1 = map[indices[t + 1]], n2 = map[indices[t + 2]];
      addPair(n0, n1, distanceBetween(n0, n1), 'topology');
      addPair(n1, n2, distanceBetween(n1, n2), 'topology');
      addPair(n2, n0, distanceBetween(n2, n0), 'topology');
    }
  }

  // 2. proximity, bucketed so this stays near-linear rather than N^2
  const buckets = new Map();
  const bucketSize = opts.proximityRadius;
  nodes.forEach((node, i) => {
    const key = `${Math.floor(node.position[0] / bucketSize)}|${Math.floor(node.position[1] / bucketSize)}|${Math.floor(node.position[2] / bucketSize)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(i);
  });

  let proximityRejectedGap = 0;
  let proximityRejectedNormal = 0;

  nodes.forEach((node, i) => {
    const bx = Math.floor(node.position[0] / bucketSize);
    const by = Math.floor(node.position[1] / bucketSize);
    const bz = Math.floor(node.position[2] / bucketSize);

    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        for (let oz = -1; oz <= 1; oz++) {
          const candidates = buckets.get(`${bx + ox}|${by + oy}|${bz + oz}`);
          if (!candidates) continue;

          for (const j of candidates) {
            if (j <= i) continue;
            const other = nodes[j];
            if (other.primitive === node.primitive) continue; // topology already owns these

            const distance = distanceBetween(i, j);
            if (distance > opts.proximityRadius) continue;

            const dot = node.normal[0] * other.normal[0]
              + node.normal[1] * other.normal[1]
              + node.normal[2] * other.normal[2];
            if (dot < opts.minNormalDot) { proximityRejectedNormal++; continue; }

            if (crossesAirGap(opts.occupancy, node.position, other.position, opts.maxEmptyRun)) {
              proximityRejectedGap++;
              continue;
            }

            addPair(i, j, distance, 'proximity');
          }
        }
      }
    }
  });

  return { pairs: [...pairs.values()], proximityRejectedGap, proximityRejectedNormal };
}

/**
 * Deliberate junctions between parts that should conduct but do not touch
 * closely enough for a contact edge. Only the k shortest candidates per part
 * pair survive, so parts join at a few identifiable points rather than through
 * a cloud of weak links — and because weight falls off with distance, a pulse
 * visibly slows as it crosses one.
 */
function buildBridges(nodes, primitives, existing, opts) {
  const bucketSize = opts.bridgeMax;
  const buckets = new Map();
  nodes.forEach((node, i) => {
    const key = `${Math.floor(node.position[0] / bucketSize)}|${Math.floor(node.position[1] / bucketSize)}|${Math.floor(node.position[2] / bucketSize)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(i);
  });

  const byPartPair = new Map();
  let rejectedRole = 0;

  nodes.forEach((node, i) => {
    const bx = Math.floor(node.position[0] / bucketSize);
    const by = Math.floor(node.position[1] / bucketSize);
    const bz = Math.floor(node.position[2] / bucketSize);

    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        for (let oz = -1; oz <= 1; oz++) {
          const candidates = buckets.get(`${bx + ox}|${by + oy}|${bz + oz}`);
          if (!candidates) continue;

          for (const j of candidates) {
            if (j <= i) continue;
            const other = nodes[j];
            if (other.primitive === node.primitive) continue;
            if (existing.has(i < j ? `${i}|${j}` : `${j}|${i}`)) continue;

            if (!bridgeAllowed.has(`${node.role}|${other.role}`)) { rejectedRole++; continue; }

            const distance = Math.hypot(
              node.position[0] - other.position[0],
              node.position[1] - other.position[1],
              node.position[2] - other.position[2],
            );
            if (distance > opts.bridgeMax) continue;

            const pairKey = node.primitive < other.primitive
              ? `${node.primitive}|${other.primitive}`
              : `${other.primitive}|${node.primitive}`;
            if (!byPartPair.has(pairKey)) byPartPair.set(pairKey, []);
            byPartPair.get(pairKey).push({ a: Math.min(i, j), b: Math.max(i, j), distance });
          }
        }
      }
    }
  });

  const bridges = [];
  for (const candidates of byPartPair.values()) {
    candidates.sort((x, y) => (x.distance === y.distance ? x.a - y.a : x.distance - y.distance));
    for (const candidate of candidates.slice(0, opts.bridgesPerPartPair)) {
      bridges.push({ ...candidate, kind: 'bridge', count: 1 });
    }
  }

  return { bridges, rejectedRole, partPairsJoined: byPartPair.size };
}

/** Symmetric CSR with Gaussian distance weights. */
function toCsr(nodes, pairs, sigma) {
  const degree = new Uint32Array(nodes.length);
  for (const pair of pairs) { degree[pair.a]++; degree[pair.b]++; }

  const offsets = new Uint32Array(nodes.length + 1);
  for (let i = 0; i < nodes.length; i++) offsets[i + 1] = offsets[i] + degree[i];

  const cursor = Uint32Array.from(offsets.subarray(0, nodes.length));
  const neighbours = new Uint32Array(pairs.length * 2);
  const weights = new Float32Array(pairs.length * 2);

  for (const pair of pairs) {
    const w = Math.exp(-(pair.distance * pair.distance) / (2 * sigma * sigma));
    const weight = Math.max(w, 1e-4);
    neighbours[cursor[pair.a]] = pair.b; weights[cursor[pair.a]++] = weight;
    neighbours[cursor[pair.b]] = pair.a; weights[cursor[pair.b]++] = weight;
  }

  return { offsets, neighbours, weights };
}

// ------------------------------------------------------------------ output

function writeGraphBin(path, nodes, csr, roleIndex) {
  const n = nodes.length;
  const e = csr.neighbours.length;
  const header = 24;
  // The u16/u8 sections leave the cursor on an arbitrary byte boundary. Pad to
  // 4 so the reader can take zero-copy Uint32Array/Float32Array views over the
  // buffer instead of copying it.
  const beforePad = header + n * 12 + n * 12 + n * 2 + n;
  const padding = (4 - (beforePad % 4)) % 4;
  const bytes = beforePad + padding
    + (n + 1) * 4              // offsets
    + e * 4 + e * 4;           // neighbours, weights

  const buffer = Buffer.alloc(bytes);
  buffer.write('DLCG', 0, 'ascii');
  buffer.writeUInt32LE(FORMAT_VERSION, 4);
  buffer.writeUInt32LE(n, 8);
  buffer.writeUInt32LE(e, 12);
  buffer.writeUInt32LE(roleIndex.length, 16);
  buffer.writeUInt32LE(0, 20);

  let at = header;
  for (const node of nodes) {
    buffer.writeFloatLE(node.position[0], at); buffer.writeFloatLE(node.position[1], at + 4); buffer.writeFloatLE(node.position[2], at + 8);
    at += 12;
  }
  for (const node of nodes) {
    buffer.writeFloatLE(node.normal[0], at); buffer.writeFloatLE(node.normal[1], at + 4); buffer.writeFloatLE(node.normal[2], at + 8);
    at += 12;
  }
  for (const node of nodes) { buffer.writeUInt16LE(node.primitive, at); at += 2; }
  for (const node of nodes) { buffer.writeUInt8(roleIndex.indexOf(node.role), at); at += 1; }
  at += padding;
  for (let i = 0; i <= n; i++) { buffer.writeUInt32LE(csr.offsets[i], at); at += 4; }
  for (let i = 0; i < e; i++) { buffer.writeUInt32LE(csr.neighbours[i], at); at += 4; }
  for (let i = 0; i < e; i++) { buffer.writeFloatLE(csr.weights[i], at); at += 4; }

  writeFileSync(path, buffer);
  return bytes;
}

function writeVertexMap(path, primitives, vertexNode) {
  const total = primitives.reduce((sum, p) => sum + p.vertexCount, 0);
  const buffer = Buffer.alloc(16 + total * 4);
  buffer.write('DLVM', 0, 'ascii');
  buffer.writeUInt32LE(FORMAT_VERSION, 4);
  buffer.writeUInt32LE(primitives.length, 8);
  buffer.writeUInt32LE(total, 12);

  let at = 16;
  for (let p = 0; p < primitives.length; p++) {
    const map = vertexNode[p];
    for (let i = 0; i < map.length; i++) { buffer.writeUInt32LE(map[i], at); at += 4; }
  }

  writeFileSync(path, buffer);
  return { bytes: 16 + total * 4, total };
}

// -------------------------------------------------------------------- main

const sourcePath = resolve(SOURCE);
const sourceBytes = readFileSync(sourcePath);
const sourceSha = createHash('sha256').update(sourceBytes).digest('hex');

const { json, bin } = parseGlb(sourceBytes);

const required = json.extensionsRequired ?? [];
if (required.length) throw new Error(`GLB requires unsupported extensions: ${required.join(', ')}`);

const primitives = collectPrimitives(json, bin);
const totalVertices = primitives.reduce((sum, p) => sum + p.vertexCount, 0);
console.log(`source     ${basename(SOURCE)}  ${primitives.length} primitives  ${totalVertices} vertices`);

// A bad world matrix produces NaN positions, which cluster into exactly one
// node per primitive and look superficially like a working graph. Check the
// data rather than the plausibility of the summary line.
for (const prim of primitives) {
  const extent = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < prim.vertexCount * 3; i++) {
    if (!Number.isFinite(prim.position[i])) {
      throw new Error(`${prim.nodeName} has non-finite vertex positions (component ${i})`);
    }
    const axis = i % 3;
    extent[axis] = Math.min(extent[axis], prim.position[i]);
    extent[axis + 3] = Math.max(extent[axis + 3], prim.position[i]);
  }
  const span = Math.max(extent[3] - extent[0], extent[4] - extent[1], extent[5] - extent[2]);
  if (span < 1e-6 && prim.vertexCount > 8) {
    throw new Error(`${prim.nodeName} collapsed to a point (${prim.vertexCount} vertices, span ${span})`);
  }
}

const cell = solveCellSize(primitives, TARGET_NODES);
const { nodes, vertexNode } = buildNodes(primitives, cell);
console.log(`clustering cell ${cell.toFixed(4)}  ->  ${nodes.length} nodes (target ${TARGET_NODES})`);

// Median nearest-neighbour spacing sets both the proximity radius and the
// weight falloff, so the graph adapts to the entity's own scale.
const spacing = (() => {
  const sample = [];
  const step = Math.max(1, Math.floor(nodes.length / 512));
  for (let i = 0; i < nodes.length; i += step) {
    let nearest = Infinity;
    for (let j = 0; j < nodes.length; j += step) {
      if (i === j) continue;
      const d = Math.hypot(
        nodes[i].position[0] - nodes[j].position[0],
        nodes[i].position[1] - nodes[j].position[1],
        nodes[i].position[2] - nodes[j].position[2],
      );
      if (d < nearest) nearest = d;
    }
    if (Number.isFinite(nearest)) sample.push(nearest);
  }
  sample.sort((a, b) => a - b);
  return sample[Math.floor(sample.length / 2)] || cell;
})();

const occupancy = buildOccupancy(primitives, cell);
const options = {
  proximityRadius: spacing * PROXIMITY_SCALE,
  // Disabled deliberately. Two surfaces actually in contact face each other, so
  // their normals are anti-parallel — a dot-product floor rejects exactly the
  // contacts worth keeping. Occupancy along the segment is the honest test.
  minNormalDot: -1.0,
  maxEmptyRun: 1,
  occupancy,
};

const { pairs, proximityRejectedGap, proximityRejectedNormal } = buildAdjacency(nodes, primitives, vertexNode, options);

const existingPairs = new Set(pairs.map((p) => `${p.a}|${p.b}`));
const { bridges, rejectedRole, partPairsJoined } = buildBridges(nodes, primitives, existingPairs, {
  bridgeMax: spacing * BRIDGE_SCALE,
  bridgesPerPartPair: BRIDGES_PER_PAIR,
});
pairs.push(...bridges);

const csr = toCsr(nodes, pairs, spacing);

const degrees = [];
let maxWeightedDegree = 0;
for (let i = 0; i < nodes.length; i++) {
  degrees.push(csr.offsets[i + 1] - csr.offsets[i]);
  let weighted = 0;
  for (let k = csr.offsets[i]; k < csr.offsets[i + 1]; k++) weighted += csr.weights[k];
  if (weighted > maxWeightedDegree) maxWeightedDegree = weighted;
}
degrees.sort((a, b) => a - b);

const isolated = degrees.filter((d) => d === 0).length;

/**
 * The property the spike actually depends on: a pulse injected anywhere must be
 * able to reach the rest of the entity. A graph split into per-part islands
 * renders as a glow trapped on one shard, which would read as a failure of the
 * idea rather than of the graph.
 */
const componentOf = new Int32Array(nodes.length).fill(-1);
const componentSizes = [];
for (let start = 0; start < nodes.length; start++) {
  if (componentOf[start] !== -1) continue;
  const id = componentSizes.length;
  let size = 0;
  const stack = [start];
  componentOf[start] = id;
  while (stack.length) {
    const current = stack.pop();
    size++;
    for (let k = csr.offsets[current]; k < csr.offsets[current + 1]; k++) {
      const next = csr.neighbours[k];
      if (componentOf[next] === -1) { componentOf[next] = id; stack.push(next); }
    }
  }
  componentSizes.push(size);
}
let largestComponentId = 0;
for (let id = 1; id < componentSizes.length; id++) {
  if (componentSizes[id] > componentSizes[largestComponentId]) largestComponentId = id;
}
const largestComponentSize = componentSizes[largestComponentId];
const largestComponentShare = largestComponentSize / nodes.length;

// Which roles the largest component actually reaches — a pulse that never
// leaves the exterior is not travelling through the entity.
const rolesInLargest = new Set();
for (let i = 0; i < nodes.length; i++) {
  if (componentOf[i] === largestComponentId) rolesInLargest.add(nodes[i].role);
}

// Per-component composition, so a split graph says which parts fell off
// instead of only how many did.
const componentDetail = componentSizes.map((size, id) => {
  const roles = new Set();
  const parts = new Set();
  for (let i = 0; i < nodes.length; i++) {
    if (componentOf[i] !== id) continue;
    roles.add(nodes[i].role);
    parts.add(primitives[nodes[i].primitive].nodeName);
  }
  return { id, size, roles: [...roles].sort(), parts: [...parts].sort() };
}).sort((a, b) => b.size - a.size);

// Stability bounds for explicit integration. lambdaMax of a weighted graph
// Laplacian is bounded by 2*max weighted degree; the simulation reads these
// from the manifest rather than using a timestep that happened to look fine.
const lambdaMaxBound = 2 * maxWeightedDegree;
const diffusionDtMax = 2 / lambdaMaxBound;
const waveDtMax = 2 / Math.sqrt(lambdaMaxBound);

mkdirSync(OUT_DIR, { recursive: true });
const graphBytes = writeGraphBin(`${OUT_DIR}/graph.bin`, nodes, csr, ROLES);
const vertexMap = writeVertexMap(`${OUT_DIR}/vertex-map.bin`, primitives, vertexNode);

const roleCounts = {};
for (const node of nodes) roleCounts[node.role] = (roleCounts[node.role] ?? 0) + 1;

const manifest = {
  formatVersion: FORMAT_VERSION,
  generator: 'tools/build-causal-graph.mjs',
  seed: SEED,
  source: { path: SOURCE, sha256: sourceSha, bytes: sourceBytes.length, vertices: totalVertices, primitives: primitives.length },
  graph: {
    targetNodes: TARGET_NODES,
    nodes: nodes.length,
    edges: pairs.length,
    directedEntries: csr.neighbours.length,
    cellSize: cell,
    medianSpacing: spacing,
    degree: {
      min: degrees[0],
      median: degrees[Math.floor(degrees.length / 2)],
      mean: Number((csr.neighbours.length / nodes.length).toFixed(3)),
      max: degrees[degrees.length - 1],
      isolated,
    },
    topologyEdges: pairs.filter((p) => p.kind === 'topology').length,
    proximityEdges: pairs.filter((p) => p.kind === 'proximity').length,
    bridgeEdges: bridges.length,
    bridgeMax: spacing * BRIDGE_SCALE,
    bridgeScale: BRIDGE_SCALE,
    bridgesPerPartPair: BRIDGES_PER_PAIR,
    bridgePartPairsJoined: partPairsJoined,
    bridgeRejectedRole: rejectedRole,
    proximityRejectedGap,
    proximityRejectedNormal,
    proximityRadius: options.proximityRadius,
    proximityScale: PROXIMITY_SCALE,
    minNormalDot: options.minNormalDot,
    maxEmptyRun: options.maxEmptyRun,
  },
  connectivity: {
    components: componentSizes.length,
    largestComponent: largestComponentSize,
    largestComponentShare: Number(largestComponentShare.toFixed(4)),
    rolesReached: [...rolesInLargest].sort(),
    rolesTotal: Object.keys(roleCounts).length,
    detail: componentDetail,
  },
  stability: {
    maxWeightedDegree,
    lambdaMaxBound,
    diffusionDtMax,
    waveDtMax,
    note: 'Explicit Euler. Simulation must satisfy kappa*dt < diffusionDtMax and c*dt < waveDtMax.',
  },
  roles: ROLES,
  roleCounts,
  // The runtime asserts this list against the loaded scene. A mismatch means
  // the asset changed under the graph, which must fail loudly rather than
  // mapping state onto the wrong vertices.
  primitiveOrder: primitives.map((p) => ({
    nodeName: p.nodeName,
    meshIndex: p.meshIndex,
    primIndex: p.primIndex,
    role: p.role,
    vertexCount: p.vertexCount,
  })),
  files: {
    graph: { name: 'graph.bin', bytes: graphBytes },
    vertexMap: { name: 'vertex-map.bin', bytes: vertexMap.bytes, vertices: vertexMap.total },
  },
};

writeFileSync(`${OUT_DIR}/graph-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`edges      ${pairs.length}  (topology ${manifest.graph.topologyEdges}, contact ${manifest.graph.proximityEdges}, bridge ${bridges.length} across ${partPairsJoined} part pairs)`);
console.log(`rejected   ${proximityRejectedGap} air-gap, ${rejectedRole} role-disallowed bridges`);
console.log(`degree     min ${degrees[0]}  median ${manifest.graph.degree.median}  mean ${manifest.graph.degree.mean}  max ${degrees[degrees.length - 1]}  isolated ${isolated}`);
console.log(`connected  ${componentSizes.length} components, largest holds ${(largestComponentShare * 100).toFixed(1)}% and reaches ${rolesInLargest.size}/${Object.keys(roleCounts).length} roles`);
console.log(`stability  lambdaMax<=${lambdaMaxBound.toFixed(3)}  diffusion dt<${diffusionDtMax.toFixed(5)}  wave dt<${waveDtMax.toFixed(5)}`);
console.log(`wrote      ${OUT_DIR}/  graph.bin ${(graphBytes / 1024).toFixed(1)}kB  vertex-map.bin ${(vertexMap.bytes / 1024).toFixed(1)}kB`);
