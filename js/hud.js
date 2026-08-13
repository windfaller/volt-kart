const PLACE_SUFFIX = ["st", "nd", "rd", "th", "th", "th"];

export class HUD {
  constructor(canvas, track) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.track = track;
    this.dpr = 1;
    this.minimap = this.#buildMinimap();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  #buildMinimap() {
    const pts = this.track.samples.map((s) => s.position);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    return { pts, minX, maxX, minZ, maxZ };
  }

  draw(state) {
    const ctx = this.ctx;
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);
    if (state.mode === "title") return;

    const player = state.player;
    const place = player.place;
    const suffix = PLACE_SUFFIX[place - 1] || "th";

    ctx.save();
    ctx.font = "900 52px Nunito, sans-serif";
    ctx.fillStyle = "#fff4d6";
    ctx.shadowColor = "rgba(40,8,16,0.7)";
    ctx.shadowBlur = 12;
    ctx.fillText(`${place}${suffix}`, 28, 70);
    ctx.font = "800 18px Nunito, sans-serif";
    ctx.fillStyle = "#ffd27a";
    ctx.shadowBlur = 0;
    ctx.fillText("of 6", 28, 88);
    ctx.restore();

    ctx.font = "800 18px Nunito, sans-serif";
    ctx.fillStyle = "#ffe0c0";
    ctx.fillText(`LAP  ${Math.min(player.lap, 3)} / 3`, 28, 112);

    ctx.font = "700 14px Nunito, sans-serif";
    ctx.fillStyle = "#ffc8a0";
    ctx.fillText(`LAP ${formatTime(player.currentLapClock)}`, 28, 132);
    const best = Number.isFinite(player.bestLap) ? formatTime(player.bestLap) : "--:--.--";
    ctx.fillText(`BEST ${best}`, 28, 150);

    ctx.font = "800 16px Nunito, sans-serif";
    ctx.fillStyle = "#fff0d0";
    ctx.textAlign = "center";
    ctx.fillText(formatTime(state.raceTime), w / 2, 36);
    ctx.textAlign = "left";

    this.#speedo(w, h, player);
    this.#item(w, player);
    this.#minimap(w, h, state.karts, player);
    if (player.drifting) this.#driftBar(w, h, player);
    if (state.wrongWay) {
      ctx.textAlign = "center";
      ctx.font = "900 28px Russo One, sans-serif";
      ctx.fillStyle = "#ff5a4a";
      ctx.fillText("WRONG WAY", w / 2, h * 0.28);
      ctx.textAlign = "left";
    }
  }

  #speedo(w, h, player) {
    const ctx = this.ctx;
    const x = w / 2;
    const y = h - (w < 820 ? 120 : 36);
    const kmh = Math.max(0, Math.round(Math.abs(player.speed) * 4.2));
    ctx.textAlign = "center";
    ctx.font = "900 34px Nunito, sans-serif";
    ctx.fillStyle = player.boostTimer > 0 ? "#7dffd2" : "#fff6de";
    ctx.fillText(String(kmh), x, y);
    ctx.font = "800 11px Nunito, sans-serif";
    ctx.fillStyle = "#ffc090";
    ctx.fillText("KM/H", x, y + 16);
    ctx.textAlign = "left";

    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,220,160,0.25)";
    ctx.lineWidth = 6;
    ctx.arc(x, y - 8, 52, Math.PI * 0.7, Math.PI * 0.3, false);
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = player.boostTimer > 0 ? "#7dffd2" : "#ffb24a";
    ctx.lineWidth = 6;
    const t = Math.min(1, kmh / 220);
    ctx.arc(x, y - 8, 52, Math.PI * 0.7, Math.PI * 0.7 + t * Math.PI * 1.6, false);
    ctx.stroke();
  }

  #item(w, player) {
    const ctx = this.ctx;
    const x = w - 210;
    const y = 58;
    roundRect(ctx, x, y, 74, 74, 16);
    ctx.fillStyle = "rgba(20,8,28,0.55)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,210,120,0.45)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.font = "800 11px Nunito, sans-serif";
    ctx.fillStyle = "#ffd7a0";
    ctx.fillText("ITEM", x + 37, y - 8);
    if (player.item) {
      ctx.font = "900 13px Nunito, sans-serif";
      ctx.fillStyle = "#fff4d8";
      const label = player.item === "mushroom" ? "BOOST" : player.item === "banana" ? "BANANA" : "SHELL";
      ctx.fillText(label, x + 37, y + 42);
      ctx.font = "28px sans-serif";
      ctx.fillText(player.item === "mushroom" ? "▲" : player.item === "banana" ? "●" : "◆", x + 37, y + 28);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = "28px sans-serif";
      ctx.fillText("·", x + 37, y + 46);
    }
    ctx.textAlign = "left";
  }

  #driftBar(w, h, player) {
    const ctx = this.ctx;
    const x = w / 2 - 70;
    const y = h - (w < 820 ? 188 : 108);
    roundRect(ctx, x, y, 140, 10, 5);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();
    const t = Math.min(1, player.driftCharge / 1.35);
    roundRect(ctx, x, y, 140 * t, 10, 5);
    ctx.fillStyle = t > 0.92 ? "#7ecbff" : t > 0.4 ? "#ffc14a" : "#ff8a3a";
    ctx.fill();
  }

  #minimap(w, h, karts, player) {
    const ctx = this.ctx;
    const size = Math.min(168, w * 0.28);
    const pad = 18;
    const ox = w - size - pad;
    const oy = h - size - pad - (w < 820 ? 96 : 8);
    ctx.save();
    roundRect(ctx, ox - 8, oy - 8, size + 16, size + 16, 16);
    ctx.fillStyle = "rgba(16,6,24,0.55)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,200,120,0.3)";
    ctx.stroke();

    const { pts, minX, maxX, minZ, maxZ } = this.minimap;
    const sx = size / (maxX - minX + 20);
    const sz = size / (maxZ - minZ + 20);
    const s = Math.min(sx, sz);
    const mapX = (x) => ox + (x - minX) * s + 8;
    const mapY = (z) => oy + size - (z - minZ) * s - 8;

    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 214, 150, 0.85)";
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.moveTo(mapX(pts[0].x), mapY(pts[0].z));
    for (let i = 1; i < pts.length; i += 2) ctx.lineTo(mapX(pts[i].x), mapY(pts[i].z));
    ctx.closePath();
    ctx.stroke();

    for (const kart of karts) {
      const x = mapX(kart.position.x);
      const y = mapY(kart.position.z);
      ctx.beginPath();
      ctx.fillStyle = "#" + kart.racer.color.toString(16).padStart(6, "0");
      ctx.arc(x, y, kart === player ? 5.5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      if (kart === player) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
