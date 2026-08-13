import * as THREE from "three";

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.look = new THREE.Vector3();
    this._pos = new THREE.Vector3(0, 22, -40);
    this._desired = new THREE.Vector3();
    this._lookDesired = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this.shake = 0;
    this.fovPunch = 0;
    this.baseFov = 58;
    camera.fov = this.baseFov;
    camera.position.copy(this._pos);
  }

  addShake(amount) {
    this.shake = Math.min(1.4, this.shake + amount);
  }

  punchFov(amount) {
    this.fovPunch = Math.min(16, this.fovPunch + amount);
  }

  updateCinematic(dt, time, focus) {
    const a = time * 0.11;
    const r = 78;
    this._pos.set(focus.x + Math.cos(a) * r, 26 + Math.sin(time * 0.2) * 2, focus.z + Math.sin(a) * r);
    this.camera.position.lerp(this._pos, 1 - Math.pow(0.001, dt));
    this.look.lerp(focus, 0.08);
    this.camera.lookAt(this.look.x, 3.5, this.look.z);
    this.camera.fov += (this.baseFov - 4 - this.camera.fov) * 0.05;
    this.camera.updateProjectionMatrix();
  }

  update(dt, kart) {
    const yaw = kart.heading;
    this._fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    this._right.set(Math.cos(yaw), 0, -Math.sin(yaw));

    const speedK = Math.min(1, Math.abs(kart.speed) / 48);
    const back = 7.6 + speedK * 1.8;
    const height = 3.35 + speedK * 0.55;
    const lookAhead = 7.2;
    const lean = THREE.MathUtils.clamp(kart.steerAngle + kart.driftDir * (kart.drifting ? 0.55 : 0), -1.2, 1.2);

    this._desired.copy(kart.position)
      .addScaledVector(this._fwd, -back)
      .addScaledVector(this._right, -lean * 1.35);
    this._desired.y = kart.position.y + height;

    this._lookDesired.copy(kart.position)
      .addScaledVector(this._fwd, lookAhead)
      .addScaledVector(this._right, lean * 2.4);
    this._lookDesired.y = kart.position.y + 0.85;

    const follow = 1 - Math.pow(0.012, dt);
    this._pos.lerp(this._desired, follow);
    this.look.lerp(this._lookDesired, follow);

    if (this.shake > 0) {
      this._pos.x += (Math.random() - 0.5) * this.shake * 0.55;
      this._pos.y += (Math.random() - 0.5) * this.shake * 0.35;
      this.shake = Math.max(0, this.shake - dt * 3.2);
    }

    this.camera.position.copy(this._pos);
    this.camera.lookAt(this.look);

    const boostFov = kart.boostTimer > 0 ? 10 : 0;
    this.fovPunch = Math.max(0, this.fovPunch - dt * 18);
    const fov = this.baseFov + boostFov + this.fovPunch + speedK * 4;
    this.camera.fov += (fov - this.camera.fov) * 0.12;
    this.camera.updateProjectionMatrix();
  }
}
