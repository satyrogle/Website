import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * THE CHOIR. Six authored witness masses standing behind the Split
 * Spire, from the brief of 2026-08-19.
 *
 * They are environmental evidence and nothing else. Not a second
 * mechanic, not characters, not the source of the fissure, and never
 * mentioned in the copy. The Spire remains the subject; these make the
 * world feel like it extends far past the one thing being shown.
 *
 * Three rules this class exists to enforce:
 *
 * 1. THEY NEVER MOVE. No sway, no drift, no breath, no scaling, no
 *    response to scroll. A hundred-metre mass that drifts gently is
 *    fantasy scenery; one that does not move at all while the visitor
 *    travels hundreds of metres around it is disturbing. The reveal
 *    comes from camera translation and parallax alone.
 * 2. THEY CARRY NO RECORDS. The Spire's skin is inscribed because it
 *    IS the ledger. These are unmarked: same material family, no
 *    glyphs. Witnesses, not copies.
 * 3. THEIR MEANING IS ALIGNMENT. Each mass carries one physical cut,
 *    and every cut lies in a single plane that passes through the
 *    alignment camera. From that one view the cuts coincide into a
 *    straight line across the whole composition; from anywhere else
 *    they scatter. Perspective does the work, so nothing floats and
 *    nothing glows.
 */

export interface ChoirInputs {
  /** scroll progress, 0 to 1. Changes nothing about the geometry. */
  progress: number;
  /** narrative severity, which only reinterprets their light */
  severity: number;
  /** how square the eye is to the fissure, 0 to 1 */
  alignment: number;
}

const CHOIR_FRAG_COMMON = `#include <common>
varying vec3 vChoirW;
uniform float uCSeverity;
uniform float uCAlign;
float cHash(vec3 c) { return fract(sin(dot(c, vec3(127.1, 311.7, 74.7))) * 43758.5453); }`;

const CHOIR_FRAG_MAP = `#include <map_fragment>
{
  vec3 n = normalize(vNormal);
  // per-facet tone, keyed off the facet's own constant normal, the same
  // trick the Spire's skin uses
  diffuseColor.rgb *= 0.80 + 0.34 * cHash(floor(n * 15.0));

  // the machined edge: with flat shading the normal only changes at a
  // facet boundary, so its derivative finds every edge for free
  float edge = smoothstep(0.35, 1.6, length(fwidth(n)) * 24.0);
  diffuseColor.rgb += vec3(0.030, 0.032, 0.038) * edge;

  // sparse cut marks. Restrained on purpose: these are not inscribed,
  // and detail here would turn a witness into a second subject
  float mark = step(0.972, cHash(floor(vChoirW * 0.55)));
  diffuseColor.rgb *= 1.0 - mark * 0.30;

  // the alignment cut takes a raking response when the eye squares up.
  // The groove is already physically there; this only lets the light
  // find it, and it never becomes a glow
  float grooveLight = edge * uCAlign;
  diffuseColor.rgb += vec3(0.055, 0.058, 0.066) * grooveLight;

  // severity reinterprets the light, it does not repaint the stone
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.66, 0.78, 1.04), uCSeverity * 0.45);
  diffuseColor.rgb = mix(diffuseColor.rgb * 0.4, diffuseColor.rgb, smoothstep(0.0, 8.0, vChoirW.y));
}`;

export class ChoirGroup {
  /** resolves once the masses are standing */
  readonly ready: Promise<void>;

  private readonly uniforms: Record<string, THREE.IUniform> = {
    uCSeverity: { value: 0 },
    uCAlign: { value: 0 }
  };

  constructor(scene: THREE.Scene) {
    // same material family as the Spire: near-black sintered graphite,
    // the spec's numbers, restrained edge response
    const stone = new THREE.MeshStandardMaterial({
      color: 0x05060a,
      roughness: 0.54,
      metalness: 0.07
    });
    stone.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vChoirW;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvChoirW = (modelMatrix * vec4(position, 1.0)).xyz;'
        );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', CHOIR_FRAG_COMMON)
        .replace('#include <map_fragment>', CHOIR_FRAG_MAP);
    };

    this.ready = new GLTFLoader()
      .loadAsync('/models/choir.glb')
      .then((gltf) => {
        // The authored scene is added WHOLE. Building fresh meshes from
        // the geometry drops the node transforms, and the exported
        // group carries a translation of several hundred units, so
        // every mass landed on the Spire's foot instead of out on the
        // plain. Placement is authored; the loader must not relocate it.
        gltf.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.material = stone;
          mesh.frustumCulled = false;
        });
        scene.add(gltf.scene);
      })
      .catch((e) => {
        console.error('choir.glb failed to load; the plain stands empty', e);
      });
  }

  /**
   * The only three inputs, and none of them touch the geometry.
   * severity reinterprets the light, alignment lets it find the cuts,
   * and progress deliberately does nothing at all.
   */
  update(inputs: ChoirInputs): void {
    this.uniforms.uCSeverity!.value = inputs.severity;
    this.uniforms.uCAlign!.value = inputs.alignment;
  }
}
