import * as THREE from "three";

const ITEM_TYPES = ["mushroom", "banana", "shell"];

function questionTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#f2c14a";
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "#fff6c8";
  g.lineWidth = 8;
  g.strokeRect(8, 8, 112, 112);
  g.fillStyle = "#3a1a08";
  g.font = "bold 90px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("?", 64, 72);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

export class ItemSystem {
  constructor(scene, track) {
    this.scene = scene;
    this.track = track;
    this.boxes = [];
    this.bananas = [];
    this.shells = [];
    this._qtex = questionTexture();
    this.#spawnBoxes();
  }

  #spawnBoxes() {
    const mat = new THREE.MeshStandardMaterial({
      map: this._qtex,
      emissive: 0x6a4a10,
      emissiveIntensity: 0.35,
      roughness: 0.4,
    });
    const geo = new THREE.BoxGeometry(1.35, 1.35, 1.35);
    for (const pos of this.track.itemSpawns) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.boxes.push({ mesh, alive: true, respawn: 0, baseY: pos.y });
    }
  }

  reset() {
    for (const b of this.boxes) {
      b.alive = true;
      b.respawn = 0;
      b.mesh.visible = true;
    }
    for (const banana of this.bananas) this.scene.remove(banana.mesh);
    for (const sh of this.shells) this.scene.remove(sh.mesh);
    this.bananas.length = 0;
    this.shells.length = 0;
  }

  pickItem(kart) {
    const r = Math.random();
    const firstish = kart.place <= 2;
    if (firstish) {
      if (r < 0.55) return "banana";
      if (r < 0.85) return "mushroom";
      return "shell";
    }
    if (r < 0.34) return "mushroom";
    if (r < 0.67) return "banana";
    return "shell";
  }

  useItem(kart, karts) {
    const item = kart.item;
    if (!item) return null;
    kart.item = null;
    if (item === "mushroom") {
      kart.applyBoost(1.35, 1);
      return "mushroom";
    }
    if (item === "banana") {
      this.#dropBanana(kart);
      return "banana";
    }
    if (item === "shell") {
      this.#fireShell(kart, karts);
      return "shell";
    }
    return item;
  }

  #dropBanana(kart) {
    const mesh = makeBanana();
    const back = new THREE.Vector3(Math.sin(kart.heading), 0, Math.cos(kart.heading));
    mesh.position.copy(kart.position).addScaledVector(back, -3.2);
    mesh.position.y = kart.surfaceY + 0.35;
    this.scene.add(mesh);
    this.bananas.push({ mesh, life: 22 });
  }

  #fireShell(kart, karts) {
    let target = null;
    let best = Infinity;
    const my = kart.lap + kart.progress;
    for (const other of karts) {
      if (other === kart || other.finished) continue;
      let gap = other.lap + other.progress - my;
      if (gap <= 0.002) gap += 3;
      if (gap < best) {
        best = gap;
        target = other;
      }
    }
    const mesh = makeShell();
    const fwd = new THREE.Vector3(Math.sin(kart.heading), 0, Math.cos(kart.heading));
    mesh.position.copy(kart.position).addScaledVector(fwd, 2.4);
    mesh.position.y = kart.surfaceY + 0.55;
    this.scene.add(mesh);
    this.shells.push({
      mesh,
      vel: fwd.multiplyScalar(42),
      target,
      owner: kart,
      life: 6.5,
    });
  }

  update(dt, karts, time) {
    for (const box of this.boxes) {
      if (!box.alive) {
        box.respawn -= dt;
        if (box.respawn <= 0) {
          box.alive = true;
          box.mesh.visible = true;
        }
        continue;
      }
      box.mesh.rotation.y += dt * 2.2;
      box.mesh.rotation.x = Math.sin(time * 2 + box.baseY) * 0.2;
      box.mesh.position.y = box.baseY + Math.sin(time * 3 + box.mesh.position.x) * 0.18;
      for (const kart of karts) {
        if (!box.alive) break;
        if (kart.item || kart.finished) continue;
        const dx = kart.position.x - box.mesh.position.x;
        const dz = kart.position.z - box.mesh.position.z;
        if (dx * dx + dz * dz < 3.6) {
          kart.item = this.pickItem(kart);
          box.alive = false;
          box.respawn = 5.5;
          box.mesh.visible = false;
          kart._grabbed = true;
          break;
        }
      }
    }

    for (let i = this.bananas.length - 1; i >= 0; i--) {
      const b = this.bananas[i];
      b.life -= dt;
      b.mesh.rotation.y += dt * 1.5;
      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        this.bananas.splice(i, 1);
        continue;
      }
      for (const kart of karts) {
        if (kart.invuln > 0 || kart.finished) continue;
        const dx = kart.position.x - b.mesh.position.x;
        const dz = kart.position.z - b.mesh.position.z;
        if (dx * dx + dz * dz < 1.9) {
          kart.hitSpin(1);
          kart._slipped = true;
          this.scene.remove(b.mesh);
          this.bananas.splice(i, 1);
          break;
        }
      }
    }

    for (let i = this.shells.length - 1; i >= 0; i--) {
      const sh = this.shells[i];
      sh.life -= dt;
      if (sh.target && !sh.target.finished) {
        const tx = sh.target.position.x - sh.mesh.position.x;
        const tz = sh.target.position.z - sh.mesh.position.z;
        const len = Math.hypot(tx, tz) || 1;
        sh.vel.x += (tx / len) * 70 * dt;
        sh.vel.z += (tz / len) * 70 * dt;
      }
      const spd = Math.hypot(sh.vel.x, sh.vel.z);
      if (spd > 52) {
        sh.vel.x *= 52 / spd;
        sh.vel.z *= 52 / spd;
      }
      sh.mesh.position.x += sh.vel.x * dt;
      sh.mesh.position.z += sh.vel.z * dt;
      const info = this.track.project(sh.mesh.position);
      sh.mesh.position.y = info.position.y + 0.55;
      sh.mesh.rotation.y += dt * 10;
      if (Math.abs(info.offset) > this.track.halfWidth + 1.4 || sh.life <= 0) {
        this.scene.remove(sh.mesh);
        this.shells.splice(i, 1);
        continue;
      }
      let hit = false;
      for (const kart of karts) {
        if (kart === sh.owner || kart.invuln > 0 || kart.finished) continue;
        const dx = kart.position.x - sh.mesh.position.x;
        const dz = kart.position.z - sh.mesh.position.z;
        if (dx * dx + dz * dz < 2.4) {
          kart.hitSpin(1.15);
          kart._slipped = true;
          hit = true;
          break;
        }
      }
      if (hit) {
        this.scene.remove(sh.mesh);
        this.shells.splice(i, 1);
      }
    }
  }
}

function makeBanana() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffe14a, roughness: 0.45 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), mat);
  body.scale.set(0.7, 0.45, 1.35);
  body.rotation.z = 0.4;
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), new THREE.MeshStandardMaterial({ color: 0x3a2a10 }));
  tip.position.set(0.05, 0.22, 0.42);
  g.add(body, tip);
  g.castShadow = true;
  return g;
}

function makeShell() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xff3a3a, roughness: 0.35, metalness: 0.2, emissive: 0x661010, emissiveIntensity: 0.4,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), mat);
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), mat);
  spike.position.y = 0.4;
  m.add(spike);
  m.castShadow = true;
  return m;
}

export { ITEM_TYPES };
