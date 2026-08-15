/**
 * Level 2 — the structural flow.
 *
 * Thirty-five ridges running the length of the sheets: heavier than the graph
 * fibres, far finer than the mass. They are what stops a sheet reading as a
 * milky pane — a surface with nothing between its silhouette and its finest
 * detail has no material, because there is no scale in between for the eye to
 * find.
 *
 * Unlike the near-field strands these carry world width at every distance.
 * They are structure, not a proximity effect: they have to be legible in a
 * thumbnail, which is the whole reason this level exists.
 *
 * Raised proud of the surface and shaded as a crest with falling flanks, so
 * they read as ridges in the sheet rather than as lines drawn on it. Spaced
 * unevenly across each sheet's width — evenly spaced ridges are a comb, and
 * this project has met that fault often enough.
 */

import * as THREE from 'three';
import { SHEETS, frameAt, surfacePoint, surfaceNormal, inAperture } from './Sheets';
import type { ContainmentStructure } from './ContainmentSynth';

/** Ridges per sheet, and samples along each. */
const PER_SHEET = 26;
const ALONG = 108;

export interface RidgeLook {
  /** Half-width in world units. Constant — this level does not fade. */
  halfWidth: number;
  /** How far proud of the surface the crest sits. */
  lift: number;
  /** Resting brightness of the crest. */
  crest: number;
}

export const RIDGE_LOOK: RidgeLook = {
  halfWidth: 0.05,
  lift: 0.055,
  crest: 0.34,
};

/**
 * Where the ridges sit across a sheet, per sheet.
 *
 * Hand-picked and deliberately irregular: no two sheets have the same
 * arrangement, and no arrangement is symmetric about the spine.
 */
const SEATS: number[][] = [
  (() => {
    // Irregular by construction, across the one body. An even sweep is a comb
    // and the golden ratio is the least even sequence available.
    const out: number[] = [];
    for (let i = 0; i < 26; i++) out.push(((i * 0.61803398875) % 1) * 1.94 - 0.97);
    return out.sort((a, b) => a - b);
  })(),
];

export class SheetRidges {
  readonly object: THREE.Mesh;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly energyAttr: THREE.BufferAttribute;
  private readonly owner: Uint32Array;

  constructor(structure: ContainmentStructure, look: RidgeLook = RIDGE_LOOK) {
    const position: number[] = [];
    const other: number[] = [];
    const side: number[] = [];
    const weights: number[] = [];
    const along: number[] = [];
    const index: number[] = [];
    const owners: number[] = [];

    const nodes = structure.graph.positions;
    const nodeCount = structure.graph.nodeCount;

    /**
     * Nearest graph node to a ridge vertex, so a cascade running through the
     * fibres lights the ridge above it too. Built with a coarse bucket grid;
     * a linear scan would be forty thousand nodes times eight thousand
     * vertices.
     */
    const CELL = 0.6;
    const buckets = new Map<number, number[]>();
    const key = (x: number, y: number, z: number): number =>
      ((Math.floor(x / CELL) + 512) * 1024 + (Math.floor(y / CELL) + 512)) * 1024 +
      (Math.floor(z / CELL) + 512);
    for (let i = 0; i < nodeCount; i++) {
      const k = key(nodes[i * 3], nodes[i * 3 + 1], nodes[i * 3 + 2]);
      const b = buckets.get(k);
      if (b) b.push(i);
      else buckets.set(k, [i]);
    }
    const nearestNode = (x: number, y: number, z: number): number => {
      let best = 0;
      let bestD = Infinity;
      const bx = Math.floor(x / CELL);
      const by = Math.floor(y / CELL);
      const bz = Math.floor(z / CELL);
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          for (let k2 = -1; k2 <= 1; k2++) {
            const b = buckets.get(((bx + i + 512) * 1024 + (by + j + 512)) * 1024 + (bz + k2 + 512));
            if (!b) continue;
            for (const n of b) {
              const d =
                (nodes[n * 3] - x) ** 2 + (nodes[n * 3 + 1] - y) ** 2 + (nodes[n * 3 + 2] - z) ** 2;
              if (d < bestD) {
                bestD = d;
                best = n;
              }
            }
          }
        }
      }
      return best;
    };

    let base = 0;
    for (let s = 0; s < SHEETS.length; s++) {
      const sheet = SHEETS[s];
      const seats = SEATS[s % SEATS.length];

      for (let r = 0; r < Math.min(PER_SHEET, seats.length); r++) {
        // A ridge WANDERS across its sheet.
        //
        // Held at a fixed seat they run parallel for their whole length and
        // six of them is corrugation — stripes, which is the one decoration
        // this project has rejected outright. Veins converge, separate and
        // cross. Deterministic in the sheet and ridge index, so the
        // arrangement is authored rather than rolled.
        const h = Math.sin((s * 71 + r * 13) * 12.9898) * 43758.5453;
        const f1 = h - Math.floor(h);
        const h2 = Math.sin((s * 29 + r * 47) * 78.233) * 43758.5453;
        const f2 = h2 - Math.floor(h2);
        const amp = 0.14 + 0.30 * f1;
        const rate = 0.7 + 1.9 * f2;
        const phase = f1 * Math.PI * 2;
        // Not all ridges carry the same weight: a level with one thickness is
        // a pattern, and a level with a range is a structure.
        const weight = 0.55 + 0.95 * f2;

        const spine: number[][] = [];
        for (let i = 0; i <= ALONG; i++) {
          const u = i / ALONG;
          const v = Math.max(
            -0.97,
            Math.min(0.97, seats[r] + amp * Math.sin(rate * u * Math.PI * 2 + phase))
          );
          const frame = frameAt(sheet, u);
          const p = surfacePoint(sheet, u, v, frame);
          const n = surfaceNormal(sheet, u, v);
          const lift = inAperture(sheet, u, v) ? 0 : look.lift;
          spine.push([p[0] + n[0] * lift, p[1] + n[1] * lift, p[2] + n[2] * lift]);
        }

        for (let i = 0; i <= ALONG; i++) {
          const p = spine[i];
          const mate = spine[Math.min(i + 1, ALONG)] === p ? spine[Math.max(i - 1, 0)] : spine[Math.min(i + 1, ALONG)];
          const owner = nearestNode(p[0], p[1], p[2]);
          for (const sgn of [-1, 1]) {
            position.push(p[0], p[1], p[2]);
            other.push(mate[0], mate[1], mate[2]);
            side.push(sgn);
            weights.push(weight);
            along.push(i / ALONG);
            owners.push(owner);
          }
        }

        for (let i = 0; i < ALONG; i++) {
          const a = base + i * 2;
          index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
        base += (ALONG + 1) * 2;
      }
    }

    this.owner = new Uint32Array(owners);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(position), 3));
    this.geometry.setAttribute('aOther', new THREE.BufferAttribute(new Float32Array(other), 3));
    this.geometry.setAttribute('aSide', new THREE.BufferAttribute(new Float32Array(side), 1));
    this.geometry.setAttribute('aWeight', new THREE.BufferAttribute(new Float32Array(weights), 1));
    this.geometry.setAttribute('aAlong', new THREE.BufferAttribute(new Float32Array(along), 1));
    this.energyAttr = new THREE.BufferAttribute(new Float32Array(owners.length), 1);
    this.energyAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('aEnergy', this.energyAttr);
    this.geometry.setIndex(index);

    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uHalfWidth: { value: look.halfWidth },
        uCrest: { value: look.crest },
        uExposure: { value: 1 },
        uEmissiveOnly: { value: 0 },
        uRest: { value: 0.3 },
      },
      vertexShader: /* glsl */ `
        in vec3 aOther;
        in float aSide;
        in float aWeight;
        in float aAlong;
        in float aEnergy;
        uniform float uHalfWidth;
        out float vAcross;
        out float vAlong;
        out float vEnergy;
        void main() {
          vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
          vec3 mate = (modelMatrix * vec4(aOther, 1.0)).xyz;
          vec3 toEye = cameraPosition - world;
          vec3 dir = normalize(mate - world);
          vec3 sideways = normalize(cross(dir, normalize(toEye)));
          // Weight is its own attribute, not the sign's magnitude. Folded into
          // aSide it cancelled itself in the fragment crest — the width was
          // right and every ridge rendered at zero brightness.
          world += sideways * aSide * uHalfWidth * aWeight;
          vAcross = aSide;
          vAlong = aAlong;
          vEnergy = aEnergy;
          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uCrest;
        uniform float uExposure;
        uniform float uEmissiveOnly;
        uniform float uRest;
        in float vAcross;
        in float vAlong;
        in float vEnergy;
        out vec4 fragColour;

        void main() {
          // A crest with flanks falling away from it, so the band reads as
          // raised structure in the surface rather than as a stripe painted
          // across it.
          float crest = pow(max(1.0 - abs(vAcross), 0.0), 1.6);
          float ends = smoothstep(0.0, 0.10, vAlong) * smoothstep(1.0, 0.90, vAlong);

          vec3 rest = vec3(0.80, 0.84, 0.93);
          vec3 deviating = vec3(0.30, 0.92, 1.00);
          vec3 arrested  = vec3(0.72, 0.42, 1.00);

          float e = clamp(vEnergy, 0.0, 2.5);
          vec3 colour = rest;
          colour = mix(colour, deviating, clamp(e, 0.0, 1.0) * 0.85);
          colour = mix(colour, arrested, clamp((e - 1.0) / 0.55, 0.0, 1.0) * 0.95);

          float deviation = min(e, 1.0);
          float arrest = max(e - 1.0, 0.0);
          float level = (uCrest + deviation * 2.6 + arrest * 1.2) * crest * ends;
          if (uEmissiveOnly > 0.5) {
            level = (uRest * uCrest + deviation * 2.6 + arrest * 1.2) * crest * ends;
          }

          fragColour = vec4(colour * level * uExposure, 1.0);
        }
      `,
    });

    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.frustumCulled = false;
    this.object = mesh;
  }

  setEnergy(energy: Float32Array): void {
    const target = this.energyAttr.array as Float32Array;
    for (let v = 0; v < target.length; v++) target[v] = energy[this.owner[v]];
    this.energyAttr.needsUpdate = true;
  }

  setEmissiveOnly(on: boolean): void {
    this.material.uniforms.uEmissiveOnly.value = on ? 1 : 0;
  }

  setExposure(value: number): void {
    this.material.uniforms.uExposure.value = value;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
