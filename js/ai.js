import * as THREE from "three";

const _to = new THREE.Vector3();

export class AIController {
  constructor(kart, personality) {
    this.kart = kart;
    this.look = personality.look ?? 0.045;
    this.skill = personality.skill ?? 0.85;
    this.driftBias = personality.driftBias ?? 0.7;
    this.aggro = personality.aggro ?? 0.5;
    this.itemDelay = 0;
    this._steer = 0;
    this._accel = true;
    this._brake = false;
    this._drift = false;
    this._item = false;
    this.driftJustPressed = false;
    this.itemJustPressed = false;
    this._wasDrift = false;
    this._holding = false;
  }

  steer() { return this._steer; }

  get accel() { return this._accel; }
  get brake() { return this._brake; }
  get drift() { return this._drift; }
  get item() { return this._item; }

  update(dt, track, karts, player) {
    const kart = this.kart;
    if (kart.finished || kart.spinTimer > 0) {
      this._accel = false;
      this._steer = 0;
      this._drift = false;
      return;
    }

    const look = this.look + Math.abs(kart.speed) * 0.0009;
    const target = track.frameAt(kart.progress + look);
    const line = (Math.sin(kart.progress * Math.PI * 8 + this.skill) * 0.35) * (1.1 - this.skill);
    _to.copy(target.position).addScaledVector(target.right, line);
    const dx = _to.x - kart.position.x;
    const dz = _to.z - kart.position.z;
    const desired = Math.atan2(dx, dz);
    let err = desired - kart.heading;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    this._steer = THREE.MathUtils.clamp(err * 1.6, -1, 1);

    const next = track.frameAt(kart.progress + 0.03);
    const cdx = next.tangent.x - target.tangent.x;
    const cdz = next.tangent.z - target.tangent.z;
    const curve = Math.hypot(cdx, cdz);

    const raceGap = kart.raceScore() - player.raceScore();
    let speedMul = 1;
    if (raceGap > 0.18) speedMul = 0.8;
    else if (raceGap > 0.08) speedMul = 0.9;
    else if (raceGap < -0.28) speedMul = 1.28;
    else if (raceGap < -0.12) speedMul = 1.16;
    speedMul *= 0.9 + this.skill * 0.18;

    kart.speedScale = speedMul;
    this._brake = curve > 0.22 && kart.speed > 31 && !kart.drifting;
    this._accel = !this._brake;

    const wantDrift = curve > 0.09 && Math.abs(kart.speed) > 16 && Math.abs(this._steer) > 0.45;
    this._drift = wantDrift && this.driftBias > 0.4;
    this.driftJustPressed = this._drift && !this._wasDrift;
    this._wasDrift = this._drift;

    this.itemDelay = Math.max(0, this.itemDelay - dt);
    this.itemJustPressed = false;
    this._item = false;
    if (!kart.item) {
      this._holding = false;
    } else if (!this._holding) {
      this._holding = true;
      this.itemDelay = 0.65 + Math.random() * 1.7;
    } else if (this.itemDelay <= 0 && this.#shouldUse(karts)) {
      this._item = true;
      this.itemJustPressed = true;
      this.itemDelay = 1.0;
      this._holding = false;
    }
  }

  #shouldUse(karts) {
    const kart = this.kart;
    if (kart.item === "mushroom") return Math.abs(this._steer) < 0.35;
    if (kart.item === "banana") return Math.random() < 0.4 + this.aggro * 0.3;
    if (kart.item === "shell") {
      const ahead = karts.some((k) => k !== kart && !k.finished && (k.lap + k.progress) > (kart.lap + kart.progress));
      return ahead;
    }
    return true;
  }
}

export const AI_TRAITS = [
  { look: 0.05, skill: 0.92, driftBias: 0.85, aggro: 0.7 },
  { look: 0.042, skill: 0.8, driftBias: 0.6, aggro: 0.4 },
  { look: 0.055, skill: 0.88, driftBias: 0.9, aggro: 0.55 },
  { look: 0.04, skill: 0.74, driftBias: 0.5, aggro: 0.8 },
  { look: 0.048, skill: 0.86, driftBias: 0.75, aggro: 0.5 },
];
