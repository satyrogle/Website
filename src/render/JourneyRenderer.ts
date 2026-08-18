import * as THREE from 'three';
import { LatticeWorld, SEA_Y } from '../world/LatticeWorld';
import { CameraPath } from './CameraPath';

/**
 * The observation of THE FALSE HEAVEN, built to match the approved
 * image: a manufactured firmament of lamps in rows above a dark still
 * sea, pale shelves at the edges, haze toward the vanishing point.
 * The journey rises into the light layer, through it, and along the
 * maintenance side. The renderer owns no authoritative state.
 */

const LAMP_VERT = /* glsl */ `
  in float aSeed;
  in float aDead;
  uniform float uTime;
  uniform float uScale;
  uniform float uSizeMul;
  uniform float uFogDensity;
  out float vSeed;
  out float vDead;
  out float vFog;
  void main() {
    vSeed = aSeed;
    vDead = aDead;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = max(1.0, -mv.z);
    gl_Position = projectionMatrix * mv;
    float size = uScale * uSizeMul * (0.8 + 0.45 * aSeed) / dist;
    gl_PointSize = clamp(size, 1.25, 26.0);
    vFog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  }
`;

const LAMP_FRAG = /* glsl */ `
  precision highp float;
  in float vSeed;
  in float vDead;
  in float vFog;
  uniform float uTime;
  uniform float uSeverity;
  uniform float uDim;
  out vec4 outColor;
  void main() {
    if (vDead > 0.5 && vDead < 1.5) discard; // culled: the gap is the mark
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;
    float fall = exp(-r2 * 13.0);
    vec3 warmth = mix(vec3(0.95, 0.96, 0.99), vec3(0.99, 0.97, 0.93), vSeed * 0.6);
    vec3 col = mix(warmth, vec3(0.68, 0.8, 0.93), uSeverity * 0.45);
    float flicker = 1.0;
    if (vDead > 1.5) {
      flicker = 0.35 + 0.65 * step(0.45, fract(uTime * (2.0 + vSeed * 7.0) + vSeed * 13.0));
    }
    col *= fall * flicker * uDim;
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
    float swell = 1.0 + (1.0 - ignite) * 2.4;
    gl_PointSize = clamp(uScale * 1.5 * swell / dist, 2.0, 64.0);
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
    float fall = exp(-r2 * 11.0);
    float ignite = clamp((uTime - vBorn) * 1.4, 0.0, 1.0);
    vec3 col = mix(vec3(1.0), vec3(0.55, 0.87, 1.0), 0.3) * fall * (0.9 + 1.7 * (1.0 - ignite));
    outColor = vec4(col, 1.0);
  }
`;

const SEA_VERT = /* glsl */ `
  out vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const SEA_FRAG = /* glsl */ `
  precision highp float;
  in vec3 vWorld;
  uniform vec3 uCam;
  uniform float uSeverity;
  out vec4 outColor;
  void main() {
    float dist = length(vWorld - uCam);
    // black water, a breath of haze with distance, one soft path of
    // light running toward the vanishing point
    vec3 col = vec3(0.006, 0.009, 0.013);
    float toward = exp(-abs(vWorld.x) * 0.012) * smoothstep(30.0, 260.0, -vWorld.z);
    col += vec3(0.05, 0.065, 0.085) * toward * (1.0 - uSeverity * 0.6);
    float haze = 1.0 - exp(-dist * dist * 0.000004);
    col = mix(col, vec3(0.03, 0.04, 0.055), haze);
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
  uniform float uSeverity;
  out vec4 outColor;
  void main() {
    vec3 d = normalize(vDir);
    // the haze band where sea meets the far rows, dimming with truth
    float band = exp(-abs(d.y + 0.02) * 9.0);
    vec3 base = mix(vec3(0.008, 0.012, 0.018), vec3(0.004, 0.006, 0.009), uSeverity);
    vec3 glow = mix(vec3(0.10, 0.12, 0.16), vec3(0.03, 0.045, 0.06), uSeverity);
    vec3 col = base + glow * band * max(0.0, -d.z * 0.5 + 0.5);
    outColor = vec4(col, 1.0);
  }
`;

export class JourneyRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly path = new CameraPath();

  private readonly scene = new THREE.Scene();
  private readonly lampMat: THREE.ShaderMaterial;
  private readonly mirrorMat: THREE.ShaderMaterial;
  private readonly markMat: THREE.ShaderMaterial;
  private readonly seaMat: THREE.ShaderMaterial;
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly deadAttr: THREE.BufferAttribute;
  private readonly mirrorDeadAttr: THREE.BufferAttribute;
  private readonly markGeom: THREE.BufferGeometry;
  private readonly markPos = new Float32Array(12 * 3);
  private readonly markBorn = new Float32Array(12);
  private readonly glow: THREE.Sprite;
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
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.3, 900);

    // --- sky haze ---
    this.skyMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: { uSeverity: { value: 0 } },
      side: THREE.BackSide,
      depthWrite: false
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 24, 16), this.skyMat);
    sky.frustumCulled = false;
    this.scene.add(sky);

    // --- the sea ---
    this.seaMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: SEA_VERT,
      fragmentShader: SEA_FRAG,
      uniforms: { uCam: { value: new THREE.Vector3() }, uSeverity: { value: 0 } }
    });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), this.seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = SEA_Y;
    this.scene.add(sea);

    // --- the firmament ---
    const lampGeom = new THREE.BufferGeometry();
    lampGeom.setAttribute('position', new THREE.BufferAttribute(world.positions, 3));
    lampGeom.setAttribute('aSeed', new THREE.BufferAttribute(world.nodeSeeds, 1));
    this.deadAttr = new THREE.BufferAttribute(world.deadness, 1);
    lampGeom.setAttribute('aDead', this.deadAttr);

    const lampUniforms = (dim: number, sizeMul: number): Record<string, THREE.IUniform> => ({
      uTime: { value: 0 },
      uScale: { value: 900 },
      uSizeMul: { value: sizeMul },
      uSeverity: { value: 0 },
      uDim: { value: dim },
      uFogDensity: { value: 0.0035 }
    });
    this.lampMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: LAMP_VERT,
      fragmentShader: LAMP_FRAG,
      uniforms: lampUniforms(1.0, 1.0),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true
    });
    const lamps = new THREE.Points(lampGeom, this.lampMat);
    lamps.frustumCulled = false;
    this.scene.add(lamps);

    // --- the reflection: the same heaven, drowned ---
    const mirrorGeom = new THREE.BufferGeometry();
    const mirrored = new Float32Array(world.positions.length);
    for (let i = 0; i < world.nodeCount; i++) {
      mirrored[i * 3] = world.positions[i * 3]!;
      mirrored[i * 3 + 1] = 2 * SEA_Y - world.positions[i * 3 + 1]!;
      mirrored[i * 3 + 2] = world.positions[i * 3 + 2]!;
    }
    mirrorGeom.setAttribute('position', new THREE.BufferAttribute(mirrored, 3));
    mirrorGeom.setAttribute('aSeed', new THREE.BufferAttribute(world.nodeSeeds, 1));
    this.mirrorDeadAttr = new THREE.BufferAttribute(world.deadness, 1);
    mirrorGeom.setAttribute('aDead', this.mirrorDeadAttr);
    this.mirrorMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: LAMP_VERT,
      fragmentShader: LAMP_FRAG,
      uniforms: lampUniforms(0.13, 1.7),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true
    });
    const mirror = new THREE.Points(mirrorGeom, this.mirrorMat);
    mirror.frustumCulled = false;
    this.scene.add(mirror);

    // --- the fittings: sockets above every travelled lamp ---
    const socketPositions: THREE.Vector3[] = [];
    for (let i = 0; i < world.nodeCount; i++) {
      const x = world.positions[i * 3]!;
      const z = world.positions[i * 3 + 2]!;
      if (Math.abs(x) < 30 && z < -30 && z > -345) {
        socketPositions.push(new THREE.Vector3(x, world.positions[i * 3 + 1]! + 0.42, z));
      }
    }
    const socketMat = new THREE.MeshLambertMaterial({ color: 0x10151b });
    const sockets = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.55, 0.5, 0.55),
      socketMat,
      socketPositions.length
    );
    const dummy = new THREE.Object3D();
    socketPositions.forEach((p, i) => {
      dummy.position.copy(p);
      dummy.updateMatrix();
      sockets.setMatrixAt(i, dummy.matrix);
    });
    this.scene.add(sockets);

    // --- pale shelves at the edges of the sea ---
    const shelfMat = new THREE.MeshLambertMaterial({ color: 0x9aa6b0 });
    for (const [sx, sz, w, d2] of [
      [-150, -10, 130, 90],
      [165, -35, 150, 110],
      [120, 55, 120, 70],
      [-190, 60, 110, 60]
    ] as Array<[number, number, number, number]>) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(w, 0.7, d2), shelfMat);
      shelf.position.set(sx, SEA_Y + 0.35, sz);
      this.scene.add(shelf);
    }

    const key = new THREE.DirectionalLight(0xe8eef5, 0.9);
    key.position.set(0.2, 1, 0.15);
    this.scene.add(key);
    this.scene.add(new THREE.AmbientLight(0x1a2129, 1.0));
    this.scene.fog = new THREE.FogExp2(0x0a1016, 0.0035);

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

    // --- the vanishing point, where all rows agree ---
    this.glow = makeHalo('#8fa5c2', 260);
    this.glow.position.set(0, 14, -380);
    this.scene.add(this.glow);

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  update(progress: number, dt: number, reduced: boolean): void {
    this.time += dt;
    this.path.update(this.camera, progress, dt, reduced);
    const sev = this.path.state.severity;

    const fogDensity =
      0.0035 + 0.005 * smooth01(progress, 0.34, 0.6) - 0.0025 * smooth01(progress, 0.8, 0.95);
    (this.scene.fog as THREE.FogExp2).density = fogDensity;
    (this.scene.fog as THREE.FogExp2).color.copy(lerpColor('#0a1016', '#04070a', sev));

    for (const mat of [this.lampMat, this.mirrorMat]) {
      mat.uniforms.uTime!.value = reduced ? 0 : this.time;
      mat.uniforms.uSeverity!.value = sev;
      mat.uniforms.uFogDensity!.value = fogDensity;
    }
    // the drowned heaven fades once you are above the light layer
    this.mirrorMat.uniforms.uDim!.value = 0.13 * (1 - smooth01(progress, 0.5, 0.66));
    this.markMat.uniforms.uTime!.value = this.time;
    this.skyMat.uniforms.uSeverity!.value = sev;
    this.seaMat.uniforms.uSeverity!.value = sev;
    (this.seaMat.uniforms.uCam!.value as THREE.Vector3).copy(this.camera.position);
    this.glow.material.opacity = 0.5 * (1 - sev * 0.55);

    if (this.world.deadnessDirty) {
      this.deadAttr.needsUpdate = true;
      this.mirrorDeadAttr.needsUpdate = true;
      this.world.deadnessDirty = false;
    }

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
    const scale = window.innerHeight * pr * 0.8;
    this.lampMat.uniforms.uScale!.value = scale;
    this.mirrorMat.uniforms.uScale!.value = scale;
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
  g.addColorStop(0.4, colorWithAlpha(color, 0.22));
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
