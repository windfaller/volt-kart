import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

export function setupRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
    stencil: false,
  });
  renderer.setClearColor(0xff8a5c, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

export function createSunsetEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: `
      varying vec3 vP;
      void main() {
        vP = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vP;
      void main() {
        vec3 n = normalize(vP);
        float h = n.y;
        vec3 hor = vec3(1.15, 0.52, 0.22);
        vec3 mid = vec3(0.95, 0.28, 0.32);
        vec3 zen = vec3(0.12, 0.08, 0.32);
        vec3 col = mix(hor, mid, smoothstep(-0.12, 0.22, h));
        col = mix(col, zen, smoothstep(0.18, 0.78, h));
        float sun = pow(max(0.0, dot(n, normalize(vec3(-0.55, 0.24, 0.42)))), 36.0);
        col += vec3(1.4, 0.85, 0.35) * sun;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  env.add(new THREE.Mesh(new THREE.SphereGeometry(8, 32, 16), mat));
  env.add(new THREE.HemisphereLight(0xffc090, 0x1a4030, 1.35));
  const sun = new THREE.DirectionalLight(0xffd4a8, 2.2);
  sun.position.set(-4, 2.2, 3);
  env.add(sun);
  const tex = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  return tex;
}

const CineShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes;
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      vec2 fromC = vUv - 0.5;
      float r2 = dot(fromC, fromC);
      float ca = 0.0016;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + fromC * ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - fromC * ca).b;
      float vig = smoothstep(1.05, 0.22, r2 * 1.65);
      col *= mix(1.0, vig, 0.5);
      col = mix(col, col * vec3(1.07, 0.98, 0.88), 0.28);
      float g = fract(sin(dot(vUv * uRes + uTime * 11.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (g - 0.5) * 0.022;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createComposer(renderer, scene, camera) {
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    depthBuffer: true,
  });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(size.clone(), 0.42, 0.62, 0.68));
  const cine = new ShaderPass(CineShader);
  cine.uniforms.uRes.value.copy(size);
  composer.addPass(cine);
  composer.addPass(new SMAAPass(size.x, size.y));
  composer.addPass(new OutputPass());
  return { composer, cine };
}

function hash(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function fbm(x, y) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < 5; i++) {
    v += a * hash(x * f, y * f);
    a *= 0.5;
    f *= 2.03;
  }
  return v;
}

function canvasTex(size, fn) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const v = fn(x, y, size);
      img.data[i] = v[0];
      img.data[i + 1] = v[1];
      img.data[i + 2] = v[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function asphaltMap() {
  return canvasTex(512, (x, y, s) => {
    const n = fbm(x * 0.09, y * 0.09);
    const grain = hash(x * 1.7, y * 1.3);
    const stripe = Math.abs((x / s) * 2 - 1);
    const crack = Math.pow(Math.abs(Math.sin(x * 0.2 + y * 0.07)), 18);
    const base = 38 + n * 28 + grain * 18 - crack * 22;
    const edge = stripe > 0.92 ? 18 : 0;
    const r = base + edge;
    return [r, r * 0.98, r * 1.05];
  });
}

export function sandMap() {
  return canvasTex(256, (x, y) => {
    const n = fbm(x * 0.07, y * 0.07);
    const g = hash(x, y);
    return [210 + n * 30 + g * 12, 168 + n * 22, 98 + n * 18];
  });
}

export function grassMap() {
  return canvasTex(256, (x, y) => {
    const n = fbm(x * 0.11, y * 0.11);
    const g = hash(x * 2.1, y * 1.8);
    return [28 + n * 40, 110 + n * 70 + g * 20, 48 + n * 30];
  });
}

export function rockMap() {
  return canvasTex(256, (x, y) => {
    const n = fbm(x * 0.08, y * 0.08);
    const v = 90 + n * 50;
    return [v, v * 0.94, v * 0.88];
  });
}
