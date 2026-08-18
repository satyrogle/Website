import * as THREE from 'three';
import { LatticeWorld, CORE_CENTER } from '../world/LatticeWorld';
import { CameraPath } from './CameraPath';

/**
 * The observation of the world. One scene, one camera journey:
 * exterior mass, entry, descent through the strata, the core chamber.
 * Everything luminous is a node of the one lattice; the renderer owns
 * no authoritative state.
 */

const CLOUD_VERT = /* glsl */ `
  in float aSeed;
  in float aDead;
  uniform float uTime;
  uniform float uScale;
  uniform float uSeverity;
  out float vSeed;
  out float vDead;
  out float vFog;
  uniform float uFogDensity;
  void main() {
    vSeed = aSeed;
    vDead = aDead;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = max(1.0, -mv.z);
    // gentle breath: each node drifts a fraction of its spacing
    float b = sin(uTime * 0.35 + aSeed * 41.0) * 0.22 * (1.0 - uSeverity * 0.7);
    mv.xyz += vec3(sin(aSeed * 91.0), cos(aSeed * 57.0), sin(aSeed * 23.0)) * b;
    gl_Position = projectionMatrix * mv;
    float size = uScale * (0.75 + 0.5 * aSeed) / dist;
    gl_PointSize = clamp(size, 1.5, 42.0);
    vFog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  }
`;

const CLOUD_FRAG = /* glsl */ `
  precision highp float;
  in float vSeed;
  in float vDead;
  in float vFog;
  uniform float uTime;
  uniform float uSeverity;
  uniform vec3 uFogColor;
  out vec4 outColor;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;
    float fall = exp(-r2 * 14.0);
    // alive: bone light, cooled by severity. dead: a faint dying ember.
    vec3 alive = mix(vec3(0.93, 0.95, 0.97), vec3(0.62, 0.78, 0.92), uSeverity * 0.6);
    vec3 dead = vec3(0.16, 0.2, 0.27);
    // deep in, the failing nodes stutter
    float flicker = 1.0;
    if (vDead > 0.5) {
      flicker = 0.55 + 0.45 * step(0.5, fract(uTime * (1.5 + vSeed * 6.0) + vSeed * 7.0));
    }
    vec3 col = mix(alive, dead * flicker, vDead);
    float amp = mix(0.85, 0.28 + 0.25 * uSeverity, vDead);
    col *= fall * amp;
    col = mix(col, vec3(0.0), vFog);
    outColor = vec4(col, 1.0);
  }
`;

const MARK_VERT = /* glsl */ `
  in float aBorn;
  uniform float uTime;
  uniform float uScale;
  out float vBorn;
  void main() {
    vBorn = aBorn;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = max(1.0, -mv.z);
    gl_Position = projectionMatrix * mv;
    float ignite = clamp((uTime - aBorn) * 1.4, 0.0, 1.0);
    float swell = 1.0 + (1.0 - ignite) * 2.2;
    gl_PointSize = clamp(uScale * 1.35 * swell / dist, 2.0, 64.0);
  }
`;

const MARK_FRAG = /* glsl */ `
  precision highp float;
  in float vBorn;
  uniform float uTime;
  out vec4 outColor;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;
    float fall = exp(-r2 * 12.0);
    float ignite = clamp((uTime - vBorn) * 1.4, 0.0, 1.0);
    vec3 col = mix(vec3(1.0), vec3(0.55, 0.87, 1.0), 0.35) * fall * (0.8 + 1.6 * (1.0 - ignite));
    outColor = vec4(col, 1.0);
  }
`;

const SKY_VERT = /* glsl */ `
  out vec3 vDir;
  void main() {
    vDir = position;
    vec4 mv = modelViewMatrix * vec4(position, 0.0);
    gl_Position = (projectionMatrix * vec4(mv.xyz, 1.0)).xyww;
  }
`;

const SKY_FRAG = /* glsl */ `
  precision highp float;
  in vec3 vDir;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform float uSeverity;
  out vec4 outColor;
  void main() {
    vec3 d = normalize(vDir);
    float h = smoothstep(-0.4, 0.55, d.y);
    vec3 col = mix(uHorizon, uZenith, h);
    // the faint promise of the mass, straight ahead
    vec2 gd = d.xy - vec2(0.0, 0.02);
    float glow = exp(-dot(gd, gd) * 4.0) * max(0.0, -d.z);
    col += vec3(0.16, 0.2, 0.3) * glow * (1.0 - uSeverity * 0.8) * 0.8;
    outColor = vec4(col, 1.0);
  }
`;

export class JourneyRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly path = new CameraPath();

  private readonly scene = new THREE.Scene();
  private readonly cloudMat: THREE.ShaderMaterial;
  private readonly markMat: THREE.ShaderMaterial;
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly markGeom: THREE.BufferGeometry;
  private readonly markPos = new Float32Array(12 * 3);
  private readonly markBorn = new Float32Array(12);
  private readonly coreMesh: THREE.InstancedMesh;
  private readonly coreMat: THREE.MeshLambertMaterial;
  private readonly cage: THREE.LineSegments;
  private readonly halo: THREE.Sprite;
  private readonly massHalo: THREE.Sprite;
  private readonly dummy = new THREE.Object3D();
  private readonly maxDpr: number;
  private time = 0;

  constructor(canvas: HTMLCanvasElement, private readonly world: LatticeWorld, maxDpr: number) {
    this.maxDpr = maxDpr;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setClearColor(0x020304, 1);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 600);

    // --- sky ---
    this.skyMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        uZenith: { value: new THREE.Color('#04070c') },
        uHorizon: { value: new THREE.Color('#101b2a') },
        uSeverity: { value: 0 }
      },
      side: THREE.BackSide,
      depthWrite: false
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 16), this.skyMat);
    sky.frustumCulled = false;
    this.scene.add(sky);

    // --- the cloud: every star is a node ---
    const cloudGeom = new THREE.BufferGeometry();
    cloudGeom.setAttribute('position', new THREE.BufferAttribute(world.positions, 3));
    cloudGeom.setAttribute('aSeed', new THREE.BufferAttribute(world.nodeSeeds, 1));
    cloudGeom.setAttribute('aDead', new THREE.BufferAttribute(world.deadness, 1));
    this.cloudMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: CLOUD_VERT,
      fragmentShader: CLOUD_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 900 },
        uSeverity: { value: 0 },
        uFogColor: { value: new THREE.Color('#04070c') },
        uFogDensity: { value: 0.005 }
      },
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true
    });
    const cloud = new THREE.Points(cloudGeom, this.cloudMat);
    cloud.frustumCulled = false;
    this.scene.add(cloud);

    // --- visitor marks ---
    this.markGeom = new THREE.BufferGeometry();
    this.markGeom.setAttribute('position', new THREE.BufferAttribute(this.markPos, 3));
    this.markGeom.setAttribute('aBorn', new THREE.BufferAttribute(this.markBorn, 1));
    this.markGeom.setDrawRange(0, 0);
    this.markMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: MARK_VERT,
      fragmentShader: MARK_FRAG,
      uniforms: { uTime: { value: 0 }, uScale: { value: 900 } },
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true
    });
    const marks = new THREE.Points(this.markGeom, this.markMat);
    marks.frustumCulled = false;
    this.scene.add(marks);

    // --- the core: the frame, visible at last ---
    const coreGroup = new THREE.Group();
    const key = new THREE.DirectionalLight(0xdfe8f2, 1.35);
    key.position.set(0.5, 1, 0.35);
    coreGroup.add(key);
    coreGroup.add(new THREE.AmbientLight(0x232b36, 1.0));
    this.coreMat = new THREE.MeshLambertMaterial({ color: 0xe9eef2 });
    this.coreMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.26, 14, 12),
      this.coreMat,
      world.coreNodes.length
    );
    this.coreMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    coreGroup.add(this.coreMesh);

    const cagePts: number[] = [];
    for (const n of this.world.coreNodes) {
      for (const m of this.world.coreNodes) {
        const manhattan =
          Math.abs(n.ix - m.ix) + Math.abs(n.iy - m.iy) + Math.abs(n.iz - m.iz);
        const before = m.ix > n.ix || m.iy > n.iy || m.iz > n.iz;
        if (manhattan === 1 && before) cagePts.push(n.x, n.y, n.z, m.x, m.y, m.z);
      }
    }
    const cageGeom = new THREE.BufferGeometry();
    cageGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cagePts), 3));
    this.cage = new THREE.LineSegments(
      cageGeom,
      new THREE.LineBasicMaterial({ color: 0xe9eef2, transparent: true, opacity: 0.14 })
    );
    coreGroup.add(this.cage);

    this.halo = makeHalo('#9fc4e6', 46);
    this.halo.position.set(CORE_CENTER.x, CORE_CENTER.y, CORE_CENTER.z);
    coreGroup.add(this.halo);
    this.scene.add(coreGroup);

    // --- the exterior atmosphere of the mass ---
    this.massHalo = makeHalo('#8fa8c8', 190);
    this.massHalo.position.set(0, 0, 15);
    this.scene.add(this.massHalo);

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  update(progress: number, dt: number, reduced: boolean): void {
    this.time += dt;
    this.path.update(this.camera, progress, dt, reduced);
    const sev = this.path.state.severity;

    // grade: pale sacred exterior, cold corrective interior
    const fogColor = lerpColor('#0a1420', '#030609', sev);
    const fogDensity = 0.005 + 0.009 * smooth01(progress, 0.3, 0.6) - 0.006 * smooth01(progress, 0.78, 0.95);
    const cu = this.cloudMat.uniforms;
    cu.uTime!.value = reduced ? 0 : this.time;
    cu.uSeverity!.value = sev;
    cu.uFogColor!.value.copy(fogColor);
    cu.uFogDensity!.value = fogDensity;
    this.markMat.uniforms.uTime!.value = this.time;

    const su = this.skyMat.uniforms;
    su.uSeverity!.value = sev;
    (su.uZenith!.value as THREE.Color).copy(lerpColor('#05080e', '#020304', sev));
    (su.uHorizon!.value as THREE.Color).copy(lerpColor('#13202f', '#050a10', sev));

    this.massHalo.material.opacity = 0.5 * (1 - smooth01(progress, 0.25, 0.45));
    this.halo.material.opacity = 0.55 * smooth01(progress, 0.55, 0.85);
    (this.cage.material as THREE.LineBasicMaterial).opacity =
      0.02 + 0.2 * smooth01(progress, 0.6, 0.88);

    // core instances: health dims a node, the cull removes it
    let i = 0;
    for (const n of this.world.coreNodes) {
      let s = 1;
      if (!n.alive) {
        const since = (this.world.tick - n.cullTick) / 60;
        s = Math.max(0, 1 - since * 1.6);
      } else if (n.health < 0.15) {
        s = 0.75 + 0.25 * Math.sin(this.time * (6 + n.ix) + n.iy);
      }
      this.dummy.position.set(n.x, n.y, n.z);
      this.dummy.scale.setScalar(Math.max(0.0001, s));
      this.dummy.updateMatrix();
      this.coreMesh.setMatrixAt(i++, this.dummy.matrix);
    }
    this.coreMesh.instanceMatrix.needsUpdate = true;

    // marks buffer
    const marks = this.world.marks;
    for (let m = 0; m < marks.length; m++) {
      const mk = marks[m]!;
      this.markPos[m * 3] = mk.x;
      this.markPos[m * 3 + 1] = mk.y;
      this.markPos[m * 3 + 2] = mk.z;
      this.markBorn[m] = mk.bornTick / 60;
    }
    this.markGeom.setDrawRange(0, marks.length);
    this.markGeom.attributes.position!.needsUpdate = true;
    this.markGeom.attributes.aBorn!.needsUpdate = true;

    this.renderer.render(this.scene, this.camera);
  }

  private readonly resize = (): void => {
    const pr = Math.min(window.devicePixelRatio, this.maxDpr);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    const scale = window.innerHeight * pr * 0.85;
    this.cloudMat.uniforms.uScale!.value = scale;
    this.markMat.uniforms.uScale!.value = scale;
  };

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
  }
}

function makeHalo(color: string, scale: number): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0, color);
  g.addColorStop(0.4, colorWithAlpha(color, 0.25));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.5
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(scale);
  return sprite;
}

function colorWithAlpha(hex: string, a: number): string {
  const c = new THREE.Color(hex);
  return (
    'rgba(' +
    Math.round(c.r * 255) +
    ',' +
    Math.round(c.g * 255) +
    ',' +
    Math.round(c.b * 255) +
    ',' +
    a +
    ')'
  );
}

function lerpColor(a: string, b: string, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

function smooth01(x: number, a: number, b: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
