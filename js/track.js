import * as THREE from "three";

export const TRACK_WIDTH = 15.4;
export const HALF_WIDTH = TRACK_WIDTH * 0.5;
export const LAP_COUNT = 3;
export const CHECKPOINT_COUNT = 14;

const CONTROL = [
  [0, 0.22, -62],
  [0, 0.22, -18],
  [0, 0.22, 32],
  [6, 0.22, 78],
  [32, 0.22, 118],
  [78, 0.22, 142],
  [122, 0.22, 152],
  [168, 0.22, 148],
  [206, 1.6, 128],
  [226, 4.4, 98],
  [232, 7.4, 58],
  [222, 5.4, 18],
  [200, 2.3, -18],
  [212, 0.45, -52],
  [186, 0.22, -82],
  [202, 0.22, -114],
  [186, 0.7, -142],
  [146, 3.7, -156],
  [96, 4.5, -160],
  [50, 3.7, -150],
  [16, 1.7, -126],
  [0, 0.22, -96],
];

const SAMPLE_N = 420;

export class Track {
  constructor() {
    this.halfWidth = HALF_WIDTH;
    this.width = TRACK_WIDTH;
    this.curve = new THREE.CatmullRomCurve3(
      CONTROL.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
      true,
      "catmullrom",
      0.35
    );
    this.length = this.curve.getLength();
    this.samples = [];
    this.checkpoints = [];
    this.boostPads = [];
    this.itemSpawns = [];
    this.center = new THREE.Vector3();
    this.clouds = [];
    this.water = null;
    this.banner = null;
    this.lights = [];
    this._tmp = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this.#sample();
  }

  #sample() {
    const pts = this.curve.getSpacedPoints(SAMPLE_N);
    const tans = [];
    let cx = 0, cz = 0;
    for (let i = 0; i < pts.length; i++) {
      const t = i / pts.length;
      const tan = this.curve.getTangentAt(t).normalize();
      tans.push(tan);
      const right = new THREE.Vector3().crossVectors(this._up, tan).normalize();
      if (right.lengthSq() < 0.01) right.set(1, 0, 0);
      const bank = this.#curvature(i, pts) * 0.55;
      this.samples.push({
        t,
        position: pts[i],
        tangent: tan,
        right,
        bank,
      });
      cx += pts[i].x;
      cz += pts[i].z;
    }
    this.center.set(cx / pts.length, 2, cz / pts.length);

    for (let i = 0; i < CHECKPOINT_COUNT; i++) {
      const t = i / CHECKPOINT_COUNT;
      this.checkpoints.push(this.frameAt(t));
    }

    const boostT = [0.02, 0.205, 0.48, 0.71, 0.905];
    for (const t of boostT) this.boostPads.push({ t, ...this.frameAt(t), used: new WeakMap() });

    const itemT = [0.08, 0.09, 0.33, 0.34, 0.58, 0.59, 0.81, 0.82];
    const side = [ -3.1, 3.1, -3.1, 3.1, -3.1, 3.1, -3.1, 3.1 ];
    itemT.forEach((t, i) => {
      const f = this.frameAt(t);
      const p = f.position.clone().addScaledVector(f.right, side[i]);
      p.y += 1.15;
      this.itemSpawns.push(p);
    });
  }

  #curvature(i, pts) {
    const a = pts[(i - 1 + pts.length) % pts.length];
    const b = pts[i];
    const c = pts[(i + 1) % pts.length];
    const abx = b.x - a.x, abz = b.z - a.z;
    const bcx = c.x - b.x, bcz = c.z - b.z;
    const cross = abx * bcz - abz * bcx;
    return THREE.MathUtils.clamp(cross * 0.08, -0.6, 0.6);
  }

  frameAt(t) {
    const tt = ((t % 1) + 1) % 1;
    const pos = this.curve.getPointAt(tt);
    const tan = this.curve.getTangentAt(tt).normalize();
    const right = new THREE.Vector3().crossVectors(this._up, tan).normalize();
    return { t: tt, position: pos, tangent: tan, right };
  }

  project(worldPos) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.samples.length; i++) {
      const s = this.samples[i];
      const dx = worldPos.x - s.position.x;
      const dz = worldPos.z - s.position.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const s = this.samples[best];
    const dx = worldPos.x - s.position.x;
    const dz = worldPos.z - s.position.z;
    const offset = dx * s.right.x + dz * s.right.z;
    return {
      progress: s.t,
      position: s.position,
      tangent: s.tangent,
      right: s.right,
      offset,
      dist: Math.sqrt(bestD),
    };
  }

  checkpointHit(kart) {
    const n = this.checkpoints.length;
    const target = kart.nextCheckpoint / n;
    let d = kart.progress - target;
    if (d < -0.5) d += 1;
    if (d < 0 || d > 0.055) return false;
    const cp = this.checkpoints[kart.nextCheckpoint];
    const dx = kart.position.x - cp.position.x;
    const dz = kart.position.z - cp.position.z;
    return dx * dx + dz * dz < (HALF_WIDTH * 2.4) ** 2;
  }

  onBoostPad(kart) {
    for (const pad of this.boostPads) {
      const dx = kart.position.x - pad.position.x;
      const dz = kart.position.z - pad.position.z;
      if (dx * dx + dz * dz < 22) return true;
    }
    return false;
  }

  buildWorld(scene) {
    this.#sky(scene);
    this.#lights(scene);
    this.#water(scene);
    this.#island(scene);
    this.#asphalt(scene);
    this.#barriers(scene);
    this.#boostArrows(scene);
    this.#bridge(scene);
    this.#tunnel(scene);
    this.#startGantry(scene);
    this.#palms(scene);
    this.#rocks(scene);
    this.#grandstand(scene);
    this.#clouds(scene);
    this.#buoys(scene);
  }

  #sky(scene) {
    const geo = new THREE.SphereGeometry(520, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {},
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
          float h = normalize(vP).y;
          vec3 zenith = vec3(0.18, 0.12, 0.42);
          vec3 mid = vec3(0.95, 0.38, 0.28);
          vec3 hor = vec3(1.0, 0.72, 0.38);
          vec3 col = mix(hor, mid, smoothstep(-0.08, 0.18, h));
          col = mix(col, zenith, smoothstep(0.18, 0.72, h));
          float sun = pow(max(0.0, dot(normalize(vP), normalize(vec3(-0.55, 0.22, 0.4)))), 48.0);
          col += vec3(1.0, 0.75, 0.35) * sun * 1.2;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    scene.add(new THREE.Mesh(geo, mat));
    scene.fog = new THREE.FogExp2(0xff7e55, 0.0036);
  }

  #lights(scene) {
    const hemi = new THREE.HemisphereLight(0xffb07a, 0x3a6a4a, 0.85);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffd4a0, 1.55);
    sun.position.set(-80, 70, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 280;
    sun.shadow.camera.left = -140;
    sun.shadow.camera.right = 140;
    sun.shadow.camera.top = 140;
    sun.shadow.camera.bottom = -140;
    sun.shadow.bias = -0.0007;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x8899ff, 0.25);
    fill.position.set(40, 20, -60);
    scene.add(fill);
  }

  #water(scene) {
    const geo = new THREE.PlaneGeometry(900, 900, 48, 48);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying float vW;
        void main() {
          vUv = uv;
          vec3 p = position;
          float w = sin(p.x * 0.045 + uTime * 1.1) * 0.45 + cos(p.z * 0.038 + uTime * 0.8) * 0.35;
          p.y += w;
          vW = w;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying float vW;
        void main() {
          vec3 deep = vec3(0.05, 0.22, 0.38);
          vec3 warm = vec3(0.95, 0.45, 0.28);
          vec3 col = mix(deep, warm, 0.28 + vW * 0.15);
          float spark = pow(max(0.0, sin(vUv.x * 80.0 + uTime) * sin(vUv.y * 70.0 - uTime * 0.7)), 8.0);
          col += vec3(1.0, 0.85, 0.6) * spark * 0.15;
          gl_FragColor = vec4(col, 0.92);
        }
      `,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = -1.6;
    this.water = mesh;
    scene.add(mesh);
  }

  #island(scene) {
    const sand = new THREE.MeshStandardMaterial({ color: 0xe8c07a, roughness: 0.92 });
    const grass = new THREE.MeshStandardMaterial({ color: 0x3d9a58, roughness: 0.88 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(168, 178, 3.2, 40), sand);
    base.position.set(this.center.x, -1.4, this.center.z);
    base.receiveShadow = true;
    scene.add(base);
    const green = new THREE.Mesh(new THREE.CylinderGeometry(118, 128, 1.4, 32), grass);
    green.position.set(this.center.x + 8, 0.05, this.center.z + 6);
    green.receiveShadow = true;
    scene.add(green);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(170, 6.5, 8, 40), sand);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(this.center.x, -0.2, this.center.z);
    rim.receiveShadow = true;
    scene.add(rim);
  }

  #asphalt(scene) {
    const pos = [];
    const nrm = [];
    const uv = [];
    const idx = [];
    const hw = HALF_WIDTH;
    const n = this.samples.length;
    for (let i = 0; i < n; i++) {
      const s = this.samples[i];
      const up = this._up;
      const yOff = 0.05;
      const l = s.position.clone().addScaledVector(s.right, -hw);
      const r = s.position.clone().addScaledVector(s.right, hw);
      l.y += yOff;
      r.y += yOff;
      pos.push(l.x, l.y, l.z, r.x, r.y, r.z);
      nrm.push(0, 1, 0, 0, 1, 0);
      const u = i / n * 40;
      uv.push(0, u, 1, u);
    }
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = ((i + 1) % n) * 2;
      const d = ((i + 1) % n) * 2 + 1;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2a2d36,
      roughness: 0.72,
      metalness: 0.08,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    scene.add(mesh);

    this.#stripes(scene);
    this.#curbs(scene);
  }

  #stripes(scene) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xf2f0e4, roughness: 0.5 });
    const dash = new THREE.BoxGeometry(0.18, 0.04, 2.2);
    for (let i = 0; i < this.samples.length; i += 5) {
      const s = this.samples[i];
      const m = new THREE.Mesh(dash, mat);
      m.position.copy(s.position);
      m.position.y += 0.08;
      m.lookAt(s.position.x + s.tangent.x, s.position.y, s.position.z + s.tangent.z);
      scene.add(m);
    }
    const start = this.frameAt(0);
    const check = new THREE.Mesh(
      new THREE.BoxGeometry(TRACK_WIDTH, 0.05, 2.4),
      new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.45 })
    );
    check.position.copy(start.position);
    check.position.y += 0.09;
    check.lookAt(start.position.x + start.tangent.x, start.position.y, start.position.z + start.tangent.z);
    scene.add(check);
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    for (let i = -5; i <= 5; i++) {
      if ((i + 5) % 2 === 0) continue;
      const b = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH / 11, 0.06, 1.15), dark);
      b.position.copy(start.position).addScaledVector(start.right, i * (TRACK_WIDTH / 11));
      b.position.y += 0.11;
      b.lookAt(start.position.x + start.tangent.x, start.position.y, start.position.z + start.tangent.z);
      scene.add(b);
    }
  }

  #curbs(scene) {
    const red = new THREE.MeshStandardMaterial({ color: 0xe23b2f, roughness: 0.45 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf5f1e6, roughness: 0.45 });
    const geom = new THREE.BoxGeometry(0.55, 0.22, 1.7);
    for (let i = 0; i < this.samples.length; i += 3) {
      const s = this.samples[i];
      const mat = i % 2 === 0 ? red : white;
      for (const side of [-1, 1]) {
        const m = new THREE.Mesh(geom, mat);
        m.position.copy(s.position).addScaledVector(s.right, side * (HALF_WIDTH + 0.15));
        m.position.y += 0.12;
        m.lookAt(s.position.x + s.tangent.x, s.position.y, s.position.z + s.tangent.z);
        m.castShadow = true;
        m.receiveShadow = true;
        scene.add(m);
      }
    }
  }

  #barriers(scene) {
    const colors = [0x2ee6a6, 0xff8a3a, 0x3d8bff, 0xffd23d];
    const mats = colors.map((c) => new THREE.MeshStandardMaterial({
      color: c, roughness: 0.4, metalness: 0.15, emissive: c, emissiveIntensity: 0.07,
    }));
    const geom = new THREE.BoxGeometry(0.42, 1.15, 2.05);
    for (let i = 0; i < this.samples.length; i += 3) {
      const s = this.samples[i];
      const mat = mats[Math.floor(i / 8) % mats.length];
      for (const side of [-1, 1]) {
        if (this.#inTunnel(s.t) || this.#onBridge(s.t)) continue;
        const m = new THREE.Mesh(geom, mat);
        m.position.copy(s.position).addScaledVector(s.right, side * (HALF_WIDTH + 1.05));
        m.position.y += 0.55;
        m.lookAt(s.position.x + s.tangent.x, s.position.y, s.position.z + s.tangent.z);
        m.castShadow = true;
        scene.add(m);
      }
    }
  }

  #inTunnel(t) {
    return t > 0.18 && t < 0.27;
  }

  #onBridge(t) {
    return t > 0.62 && t < 0.82;
  }

  #boostArrows(scene) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x48f0c8, transparent: true, opacity: 0.85 });
    const shape = new THREE.Shape();
    shape.moveTo(0, 1.1);
    shape.lineTo(-0.7, -0.7);
    shape.lineTo(0, -0.25);
    shape.lineTo(0.7, -0.7);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    for (const pad of this.boostPads) {
      for (let k = 0; k < 3; k++) {
        const f = this.frameAt(pad.t + k * 0.004);
        const m = new THREE.Mesh(geo, mat);
        m.position.copy(f.position);
        m.position.y += 0.12;
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = Math.atan2(f.tangent.x, f.tangent.z);
        scene.add(m);
      }
    }
  }

  #bridge(scene) {
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a38, roughness: 0.7 });
    const stone = new THREE.MeshStandardMaterial({ color: 0x8b8074, roughness: 0.85 });
    const rail = new THREE.MeshStandardMaterial({ color: 0xffc85a, roughness: 0.4, metalness: 0.3 });
    for (let i = 0; i < this.samples.length; i += 3) {
      const s = this.samples[i];
      if (!this.#onBridge(s.t)) continue;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 8, 8), stone);
      pillar.position.copy(s.position);
      pillar.position.y = s.position.y - 4;
      pillar.castShadow = true;
      scene.add(pillar);
      for (const side of [-1, 1]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.1, 2.4), rail);
        r.position.copy(s.position).addScaledVector(s.right, side * (HALF_WIDTH + 0.55));
        r.position.y += 0.7;
        r.lookAt(s.position.x + s.tangent.x, s.position.y, s.position.z + s.tangent.z);
        scene.add(r);
      }
    }
    void wood;
  }

  #tunnel(scene) {
    const rock = new THREE.MeshStandardMaterial({ color: 0x6a5b52, roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3a322e, roughness: 0.95 });
    for (let i = 0; i < this.samples.length; i += 2) {
      const s = this.samples[i];
      if (!this.#inTunnel(s.t)) continue;
      for (const side of [-1, 1]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(2.4, 5.2, 3.2), rock);
        wall.position.copy(s.position).addScaledVector(s.right, side * (HALF_WIDTH + 2.0));
        wall.position.y += 2.2;
        wall.lookAt(s.position.x + s.tangent.x, s.position.y, s.position.z + s.tangent.z);
        wall.castShadow = true;
        scene.add(wall);
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH + 5.5, 1.3, 3.2), dark);
      roof.position.copy(s.position);
      roof.position.y += 4.6;
      roof.lookAt(s.position.x + s.tangent.x, s.position.y + 4.6, s.position.z + s.tangent.z);
      scene.add(roof);
    }
    const archMat = new THREE.MeshStandardMaterial({ color: 0x4a3f3a, roughness: 0.8 });
    for (const t of [0.182, 0.268]) {
      const f = this.frameAt(t);
      const arch = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH + 6, 6.2, 1.6), archMat);
      arch.position.copy(f.position);
      arch.position.y += 2.6;
      arch.lookAt(f.position.x + f.tangent.x, f.position.y + 2.6, f.position.z + f.tangent.z);
      scene.add(arch);
    }
  }

  #startGantry(scene) {
    const f = this.frameAt(0.002);
    const metal = new THREE.MeshStandardMaterial({ color: 0xcfd3dc, roughness: 0.35, metalness: 0.65 });
    const cloth = new THREE.MeshStandardMaterial({
      color: 0xff5a3a, roughness: 0.55, emissive: 0x661100, emissiveIntensity: 0.2,
    });
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 7.2, 8), metal);
      pole.position.copy(f.position).addScaledVector(f.right, side * (HALF_WIDTH + 2.2));
      pole.position.y += 3.4;
      pole.castShadow = true;
      scene.add(pole);
    }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH + 4.4, 1.3, 0.18), cloth);
    banner.position.copy(f.position);
    banner.position.y += 6.4;
    banner.lookAt(f.position.x + f.tangent.x, banner.position.y, f.position.z + f.tangent.z);
    scene.add(banner);
    this.banner = banner;

    const lampMatOff = new THREE.MeshStandardMaterial({ color: 0x331111, emissive: 0x220000, emissiveIntensity: 0.2 });
    this.lights = [];
    for (let i = 0; i < 3; i++) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), lampMatOff.clone());
      lamp.position.copy(f.position).addScaledVector(f.right, (i - 1) * 1.1);
      lamp.position.addScaledVector(f.tangent, -1.2);
      lamp.position.y += 5.6;
      scene.add(lamp);
      this.lights.push(lamp);
    }
  }

  setStartLights(stage) {
    const cols = [0xff2a2a, 0xff2a2a, 0xff2a2a, 0x3dff8a];
    this.lights.forEach((lamp, i) => {
      if (stage < 0) {
        lamp.material.emissive.setHex(0x220000);
        lamp.material.emissiveIntensity = 0.15;
      } else if (stage >= 3) {
        lamp.material.color.setHex(0xb6ffd2);
        lamp.material.emissive.setHex(0x3dff8a);
        lamp.material.emissiveIntensity = 1.4;
      } else {
        const on = i <= stage;
        lamp.material.color.setHex(on ? 0xff6a6a : 0x331111);
        lamp.material.emissive.setHex(on ? 0xff2a2a : 0x220000);
        lamp.material.emissiveIntensity = on ? 1.3 : 0.15;
      }
    });
  }

  #makePalm() {
    if (!this._palmGeo) {
      this._palmGeo = {
        trunk: new THREE.CylinderGeometry(0.16, 0.28, 5.2, 6),
        leaf: new THREE.ConeGeometry(0.55, 2.4, 5),
        cap: new THREE.SphereGeometry(0.42, 8, 6),
        trunkMat: new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.85 }),
        leafMat: new THREE.MeshStandardMaterial({ color: 0x2f9a4a, roughness: 0.7 }),
      };
    }
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(this._palmGeo.trunk, this._palmGeo.trunkMat);
    trunk.position.y = 2.6;
    trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(this._palmGeo.leaf, this._palmGeo.leafMat);
      leaf.position.y = 5.1;
      leaf.rotation.z = 0.95;
      leaf.rotation.y = (i / 6) * Math.PI * 2;
      leaf.castShadow = true;
      g.add(leaf);
    }
    const cap = new THREE.Mesh(this._palmGeo.cap, this._palmGeo.leafMat);
    cap.position.y = 5.15;
    g.add(cap);
    return g;
  }

  #palms(scene) {
    const rng = mulberry(1337);
    for (let i = 0; i < this.samples.length; i += 10) {
      const s = this.samples[i];
      if (this.#inTunnel(s.t) || this.#onBridge(s.t)) continue;
      const side = rng() > 0.5 ? 1 : -1;
      const palm = this.#makePalm();
      const dist = HALF_WIDTH + 6 + rng() * 10;
      palm.position.copy(s.position).addScaledVector(s.right, side * dist);
      palm.position.y = Math.max(0, s.position.y - 0.2);
      palm.rotation.y = rng() * Math.PI * 2;
      palm.scale.setScalar(0.85 + rng() * 0.45);
      scene.add(palm);
    }
    for (let k = 0; k < 10; k++) {
      const palm = this.#makePalm();
      const a = rng() * Math.PI * 2;
      const r = 70 + rng() * 70;
      palm.position.set(this.center.x + Math.cos(a) * r, 0, this.center.z + Math.sin(a) * r);
      palm.scale.setScalar(0.7 + rng() * 0.6);
      scene.add(palm);
    }
  }

  #rocks(scene) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x7a7068, roughness: 0.95 });
    const rockGeo = new THREE.DodecahedronGeometry(1.2, 0);
    const rng = mulberry(99);
    for (let i = 0; i < 22; i++) {
      const s = this.samples[Math.floor(rng() * this.samples.length)];
      if (this.#onBridge(s.t)) continue;
      const rock = new THREE.Mesh(rockGeo, mat);
      rock.scale.setScalar(0.7 + rng() * 1.4);
      const side = rng() > 0.5 ? 1 : -1;
      rock.position.copy(s.position).addScaledVector(s.right, side * (HALF_WIDTH + 4 + rng() * 8));
      rock.position.y += 0.4;
      rock.rotation.set(rng(), rng(), rng());
      rock.castShadow = true;
      rock.receiveShadow = true;
      scene.add(rock);
    }
  }

  #grandstand(scene) {
    const f = this.frameAt(0.97);
    const concrete = new THREE.MeshStandardMaterial({ color: 0xcac4b8, roughness: 0.8 });
    const seatColors = [0xff5a4a, 0x3d8bff, 0xffd23d, 0x2ee6a6];
    const base = new THREE.Mesh(new THREE.BoxGeometry(18, 1.2, 8), concrete);
    base.position.copy(f.position).addScaledVector(f.right, -(HALF_WIDTH + 8));
    base.position.y = 0.6;
    base.lookAt(f.position.x, 0.6, f.position.z);
    base.castShadow = true;
    scene.add(base);
    for (let row = 0; row < 4; row++) {
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(17.2, 0.7, 1.6),
        new THREE.MeshStandardMaterial({ color: seatColors[row], roughness: 0.55 })
      );
      step.position.copy(base.position);
      step.position.y = 1.2 + row * 0.75;
      step.translateZ(-1.2 - row * 1.15);
      scene.add(step);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(19, 0.25, 8), concrete);
    roof.position.copy(base.position);
    roof.position.y = 5.2;
    scene.add(roof);
  }

  #clouds(scene) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe6c8, transparent: true, opacity: 0.55 });
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(4 + Math.random() * 3, 8, 6), mat);
        puff.position.set((k - 1) * 5, Math.random() * 1.5, (Math.random() - 0.5) * 4);
        puff.scale.x = 1.6;
        g.add(puff);
      }
      g.position.set(this.center.x + (Math.random() - 0.5) * 260, 38 + Math.random() * 18, this.center.z + (Math.random() - 0.5) * 260);
      scene.add(g);
      this.clouds.push(g);
    }
  }

  #buoys(scene) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xff5a3a, roughness: 0.45 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), mat);
      b.position.set(this.center.x + Math.cos(a) * 190, -0.4, this.center.z + Math.sin(a) * 190);
      scene.add(b);
    }
  }

  update(time) {
    if (this.water) this.water.material.uniforms.uTime.value = time;
    for (let i = 0; i < this.clouds.length; i++) {
      this.clouds[i].position.x += Math.sin(time * 0.05 + i) * 0.01;
    }
  }
}

function mulberry(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
