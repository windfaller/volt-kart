export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this._engine = null;
    this._drift = null;
    this._started = false;
  }

  async resume() {
    if (!this.ctx) this.#init();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this._started = true;
  }

  #init() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    this.#setupEngine();
    this.#setupDrift();
  }

  #setupEngine() {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    const osc2 = ctx.createOscillator();
    osc2.type = "square";
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 420;
    filt.Q.value = 1.1;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filt);
    osc2.connect(filt);
    filt.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc2.start();
    this._engine = { osc, osc2, filt, gain };
  }

  #setupDrift() {
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = 1400;
    filt.Q.value = 1.8;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filt);
    filt.connect(gain);
    gain.connect(this.master);
    src.start();
    this._drift = { gain, filt };
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.55;
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  updateEngine(speed, throttle, drifting, racing) {
    if (!this._engine || !this._started) return;
    const t = this.ctx.currentTime;
    const mag = Math.min(1, Math.abs(speed) / 50);
    const hz = 55 + mag * 210 + (throttle > 0 ? 18 : 0);
    this._engine.osc.frequency.setTargetAtTime(hz, t, 0.06);
    this._engine.osc2.frequency.setTargetAtTime(hz * 0.5, t, 0.06);
    this._engine.filt.frequency.setTargetAtTime(280 + mag * 900, t, 0.08);
    const vol = racing ? 0.04 + mag * 0.08 : 0.0;
    this._engine.gain.gain.setTargetAtTime(vol, t, 0.08);
    this._drift.gain.gain.setTargetAtTime(drifting && racing ? 0.045 + mag * 0.03 : 0, t, 0.05);
  }

  beep(kind) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    const now = ctx.currentTime;
    if (kind === "go") {
      o.frequency.value = 660;
      g.gain.setValueAtTime(0.12, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      o.stop(now + 0.36);
    } else {
      o.frequency.value = kind === 1 ? 520 : kind === 2 ? 440 : 360;
      g.gain.setValueAtTime(0.1, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      o.stop(now + 0.2);
    }
    o.connect(g);
    g.connect(this.master);
    o.start(now);
  }

  boost() {
    this.#whoosh(720, 180, 0.28, 0.09);
  }

  whoosh() {
    this.#whoosh(420, 140, 0.2, 0.06);
  }

  #whoosh(startHz, endHz, dur, vol) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(startHz, now);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, endHz), now + dur);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    o.connect(f);
    f.connect(g);
    g.connect(this.master);
    o.start(now);
    o.stop(now + dur + 0.02);
  }

  grab() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    [880, 1320].forEach((hz, i) => {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.07, now + i * 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.18 + i * 0.04);
      o.connect(g);
      g.connect(this.master);
      o.start(now + i * 0.04);
      o.stop(now + 0.22 + i * 0.04);
    });
  }

  thud() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(140, now);
    o.frequency.exponentialRampToValueAtTime(50, now + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    o.connect(g);
    g.connect(this.master);
    o.start(now);
    o.stop(now + 0.2);
  }

  slip() {
    this.#whoosh(900, 220, 0.18, 0.05);
  }

  fanfare() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const notes = [392, 494, 587, 784];
    notes.forEach((hz, i) => {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = hz;
      const g = ctx.createGain();
      const t0 = now + i * 0.12;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.1, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
      o.connect(g);
      g.connect(this.master);
      o.start(t0);
      o.stop(t0 + 0.42);
    });
  }
}
