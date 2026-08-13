import * as THREE from "three";
import { Input } from "./input.js";
import { GameAudio } from "./audio.js";
import { ChaseCamera } from "./camera.js";
import { Kart, RACERS, simulateKart } from "./kart.js";
import { Track, LAP_COUNT } from "./track.js";
import { AIController, AI_TRAITS } from "./ai.js";
import { ItemSystem } from "./items.js";
import { HUD } from "./hud.js";

const canvas = document.getElementById("game-canvas");
const hudCanvas = document.getElementById("hud-canvas");
const titleEl = document.getElementById("title-screen");
const countEl = document.getElementById("countdown");
const countNum = document.getElementById("countdown-num");
const finishEl = document.getElementById("finish-screen");
const standingsEl = document.getElementById("standings");
const finishPlaceEl = document.getElementById("finish-place");
const muteBtn = document.getElementById("mute-btn");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setClearColor(0xff8a5c, 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.15, 700);
const chase = new ChaseCamera(camera);
const input = new Input();
const audio = new GameAudio();
const track = new Track();
track.buildWorld(scene);

const karts = RACERS.map((r, i) => new Kart(r, i === 0));
for (const k of karts) scene.add(k.mesh);
const player = karts[0];
const ais = karts.slice(1).map((k, i) => new AIController(k, AI_TRAITS[i]));
const items = new ItemSystem(scene, track);
const hud = new HUD(hudCanvas, track);

const sparks = makeSparks(scene);

let mode = "title";
let raceTime = 0;
let countT = 0;
let finishDelay = 0;
let last = performance.now();
let clock = 0;
let lastProgress = 0;
let bumpCd = 0;
let wallCd = 0;

placeGrid();
chase.look.copy(track.center);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  hud.resize();
}
window.addEventListener("resize", resize);
resize();

document.getElementById("start-btn").addEventListener("click", startRace);
document.getElementById("rematch-btn").addEventListener("click", () => {
  finishEl.classList.add("hidden");
  titleEl.classList.remove("hidden");
  mode = "title";
  placeGrid();
  track.setStartLights(-1);
});
muteBtn.addEventListener("click", async () => {
  await audio.resume();
  const muted = audio.toggleMute();
  muteBtn.textContent = muted ? "🔇" : "🔊";
});
window.addEventListener("keydown", async (e) => {
  if (e.key === "m" || e.key === "M") {
    await audio.resume();
    const muted = audio.toggleMute();
    muteBtn.textContent = muted ? "🔇" : "🔊";
  }
});

async function startRace() {
  await audio.resume();
  titleEl.classList.add("hidden");
  finishEl.classList.add("hidden");
  placeGrid();
  for (const k of karts) k.resetRace();
  items.reset();
  raceTime = 0;
  countT = 0;
  finishDelay = 0;
  mode = "countdown";
  countEl.classList.remove("hidden");
  countNum.textContent = "3";
  track.setStartLights(0);
  audio.beep(3);
}

function placeGrid() {
  const order = [0, 1, 2, 3, 4, 5];
  order.forEach((idx, slot) => {
    const row = Math.floor(slot / 2);
    const col = slot % 2;
    const progress = 0.985 - row * 0.012;
    const lat = col === 0 ? -3.15 : 3.15;
    karts[idx].placeOnTrack(track, progress, lat);
    karts[idx].resetRace();
  });
}

function updatePlaces() {
  const ranked = [...karts].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.raceScore() - a.raceScore();
  });
  ranked.forEach((k, i) => { k.place = i + 1; });
}

function checkProgress(kart) {
  if (track.checkpointHit(kart)) {
    const was = kart.nextCheckpoint;
    kart.nextCheckpoint = (kart.nextCheckpoint + 1) % track.checkpoints.length;
    if (was === 0) {
      kart.crossings += 1;
      if (kart.crossings > 1) {
        kart.bestLap = Math.min(kart.bestLap, kart.currentLapClock);
        kart.currentLapClock = 0;
        kart.lap = Math.min(LAP_COUNT, kart.crossings);
      }
      if (kart.crossings >= LAP_COUNT + 1) {
        kart.finished = true;
        kart.finishTime = raceTime;
        kart.lap = LAP_COUNT;
      }
    }
  }
}

function collideKarts() {
  for (let i = 0; i < karts.length; i++) {
    for (let j = i + 1; j < karts.length; j++) {
      const a = karts[i];
      const b = karts[j];
      const dx = b.position.x - a.position.x;
      const dz = b.position.z - a.position.z;
      const d2 = dx * dx + dz * dz;
      const min = 1.85;
      if (d2 < min * min && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        const push = (min - d) * 0.55;
        a.position.x -= nx * push;
        a.position.z -= nz * push;
        b.position.x += nx * push;
        b.position.z += nz * push;
        const rel = (b.speed - a.speed) * 0.25;
        a.speed += rel;
        b.speed -= rel;
        a.speed *= 0.96;
        b.speed *= 0.96;
        if ((a.isPlayer || b.isPlayer) && bumpCd <= 0) {
          chase.addShake(0.18);
          audio.thud();
          bumpCd = 0.28;
        }
      }
    }
  }
}

function showFinish() {
  mode = "finish";
  countEl.classList.add("hidden");
  finishEl.classList.remove("hidden");
  updatePlaces();
  const p = player.place;
  const names = ["1st", "2nd", "3rd", "4th", "5th", "6th"];
  finishPlaceEl.textContent = p === 1 ? "YOU WIN!" : `Finished ${names[p - 1]}`;
  standingsEl.innerHTML = "";
  const ranked = [...karts].sort((a, b) => a.place - b.place);
  for (const k of ranked) {
    const li = document.createElement("li");
    if (k.isPlayer) li.className = "you";
    const t = k.finished ? formatTime(k.finishTime) : "DNF";
    li.innerHTML = `<span><span class="pos">${k.place}</span> ${k.racer.name}${k.isPlayer ? " (You)" : ""}</span><span class="time">${t}</span>`;
    standingsEl.appendChild(li);
  }
  audio.fanfare();
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

function tick(now) {
  requestAnimationFrame(tick);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;
  clock += dt;
  input.beginFrame();
  track.update(clock);

  if (mode === "title") {
    chase.updateCinematic(dt, clock, track.center);
    renderer.render(scene, camera);
    hud.draw({ mode, player, karts, raceTime: 0, wrongWay: false });
    audio.updateEngine(0, 0, false, false);
    return;
  }

  if (mode === "countdown") {
    countT += dt;
    const stage = Math.min(3, Math.floor(countT));
    const labels = ["3", "2", "1", "GO"];
    if (countNum.textContent !== labels[stage]) {
      countNum.textContent = labels[stage];
      track.setStartLights(stage);
      if (stage < 3) audio.beep(3 - stage);
      else audio.beep("go");
    }
    const canSteer = true;
    const dummy = { accel: false, brake: false, steer: () => input.steer(), drift: false, driftJustPressed: false };
    simulateKart(player, dummy, track, dt, canSteer);
    for (const ai of ais) {
      const idle = { accel: false, brake: false, steer: () => 0, drift: false, driftJustPressed: false };
      simulateKart(ai.kart, idle, track, dt, false);
    }
    chase.update(dt, player);
    renderer.render(scene, camera);
    hud.draw({ mode, player, karts, raceTime: 0, wrongWay: false });
    if (countT >= 3.35) {
      countEl.classList.add("hidden");
      mode = "race";
      lastProgress = player.progress;
    }
    audio.updateEngine(player.speed, 0, false, true);
    return;
  }

  if (mode === "race" || mode === "finishing") {
    raceTime += dt;
    bumpCd = Math.max(0, bumpCd - dt);
    wallCd = Math.max(0, wallCd - dt);
    simulateKart(player, input, track, dt, !player.finished);
    if (input.itemJustPressed && player.item) {
      const used = items.useItem(player, karts);
      if (used === "mushroom") {
        audio.boost();
        chase.punchFov(8);
      } else if (used === "shell") {
        audio.whoosh();
      }
    }
    for (const ai of ais) {
      ai.update(dt, track, karts, player);
      simulateKart(ai.kart, ai, track, dt, !ai.kart.finished);
      if (ai.itemJustPressed && ai.kart.item) items.useItem(ai.kart, karts);
    }

    collideKarts();
    items.update(dt, karts, clock);

    for (const kart of karts) {
      if (kart._wallHit > 0.35 && kart.isPlayer && wallCd <= 0) {
        chase.addShake(0.28);
        audio.thud();
        wallCd = 0.32;
      }
      if (kart._grabbed) {
        audio.grab();
        kart._grabbed = false;
      }
      if (kart._slipped) {
        audio.slip();
        if (kart.isPlayer) chase.addShake(0.45);
        kart._slipped = false;
      }
      if (track.onBoostPad(kart) && kart.boostTimer < 0.4) {
        kart.applyBoost(0.85, 0.85);
        if (kart.isPlayer) {
          audio.whoosh();
          chase.punchFov(6);
        }
      }
      checkProgress(kart);
    }

    updatePlaces();
    updateSparks(sparks, player, dt);
    chase.update(dt, player);
    renderer.render(scene, camera);

    const deltaP = player.progress - lastProgress;
    let wrapped = deltaP;
    if (wrapped > 0.5) wrapped -= 1;
    if (wrapped < -0.5) wrapped += 1;
    const wrongWay = !player.finished && player.speed > 8 && wrapped < -0.0008;
    lastProgress = player.progress;

    hud.draw({ mode, player, karts, raceTime, wrongWay });
    audio.updateEngine(player.speed, input.accel ? 1 : 0, player.drifting, true);

    if (mode === "race" && player.finished) {
      mode = "finishing";
      finishDelay = 1.4;
    }
    if (mode === "finishing") {
      finishDelay -= dt;
      if (finishDelay <= 0) showFinish();
    }
  }

  if (mode === "finish") {
    chase.update(dt, player);
    renderer.render(scene, camera);
    hud.draw({ mode: "race", player, karts, raceTime, wrongWay: false });
    audio.updateEngine(player.speed, 0, false, true);
  }
}

function makeSparks(scene) {
  const arr = [];
  const geo = new THREE.SphereGeometry(0.07, 5, 4);
  for (let i = 0; i < 24; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc14a });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    arr.push({ mesh, life: 0, vx: 0, vy: 0, vz: 0 });
  }
  return arr;
}

function updateSparks(list, kart, dt) {
  if (kart.drifting) {
    for (let i = 0; i < 2; i++) {
      const s = list.find((p) => p.life <= 0);
      if (!s) break;
      s.life = 0.28;
      const side = kart.driftDir >= 0 ? 1 : -1;
      s.mesh.position.copy(kart.position);
      s.mesh.position.x += Math.cos(kart.heading) * side * 0.7;
      s.mesh.position.z += -Math.sin(kart.heading) * side * 0.7;
      s.mesh.position.y = kart.position.y - 0.15;
      s.vx = (Math.random() - 0.5) * 4;
      s.vy = 2 + Math.random() * 2;
      s.vz = (Math.random() - 0.5) * 4;
      s.mesh.visible = true;
      s.mesh.material.color.setHex(kart.driftCharge > 1.25 ? 0x7ecbff : 0xffc14a);
    }
  }
  for (const s of list) {
    if (s.life <= 0) {
      s.mesh.visible = false;
      continue;
    }
    s.life -= dt;
    s.vy -= 12 * dt;
    s.mesh.position.x += s.vx * dt;
    s.mesh.position.y += s.vy * dt;
    s.mesh.position.z += s.vz * dt;
  }
}

requestAnimationFrame(tick);
