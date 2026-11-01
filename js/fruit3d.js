// FruitAI — scena 3D interactivă a unui fruct (ecranul „Descoperă”, Camera AR, prima pagină).
// Modelul vine din fruit-models.js (construit din catalog); aici sunt lumina, efectele și interacțiunea:
// rotire / mutare cu un deget sau mouse-ul, zoom cu două degete sau rotița, mutare cu două degete.

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import { buildFruitModel } from "./fruit-models.js";

const tmp = new THREE.Vector3();

function glowTexture(color) {
  const cv = document.createElement("canvas"); cv.width = cv.height = 256;
  const x = cv.getContext("2d"), c = new THREE.Color(color);
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, `rgba(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0},0.85)`);
  g.addColorStop(0.35, `rgba(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0},0.25)`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; return t;
}
function dotTexture() {
  const cv = document.createElement("canvas"); cv.width = cv.height = 64;
  const x = cv.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.3, "rgba(255,255,255,.6)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv); t.flipY = false; return t;   // radială: orientarea nu contează
}

/**
 * Creează scena 3D într-un <canvas>.
 * Întoarce un controller: zoom(±1), reset(), setAuto(bool), celebrate(), burst(color, dirX, dirY), screenInfo(), dispose().
 */
// Pe telefon: rezoluție 3D mai mică (ecranele au 2–3× pixeli, iar diferența nu se vede), fără antialias pe ecrane dense
const MOBILE = matchMedia("(pointer: coarse)").matches;
const DPR = window.devicePixelRatio || 1;

export function createFruitScene(canvas, fruit, { reducedMotion = false, distance = 1, interactive = true, effects = true, fps = 60 } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !(MOBILE && DPR >= 2), alpha: true, powerPreference: MOBILE ? "default" : "high-performance" });
  renderer.setPixelRatio(Math.min(MOBILE ? 1.5 : 2, DPR));
  renderer.toneMapping = THREE.NeutralToneMapping;    // păstrează culorile vii ale fructelor
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.75;

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  const HOME_Z = 6.2;
  camera.position.set(0, 0.15, HOME_Z);

  // lumini: cheie caldă, contur în culoarea fructului, umplere rece
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2.5, 3, 4);
  const rim = new THREE.PointLight(new THREE.Color(fruit.visual.color), 30, 12); rim.position.set(-2.5, 1.5, -2);
  const fill = new THREE.PointLight(0x7fd8ff, 10, 12); fill.position.set(2.5, -1.5, 2);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 0.6), key, rim, fill);

  // tot ce se mută împreună cu fructul (când copilul îl trage cu două degete)
  const world = new THREE.Group();
  scene.add(world);

  // strălucire în spatele fructului
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(fruit.visual.color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.setScalar(6.2); glow.position.z = -1.5;
  world.add(glow);

  // inel luminos sub fruct
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.018, 12, 120), new THREE.MeshBasicMaterial({ color: new THREE.Color(fruit.visual.color).lerp(new THREE.Color(0xffffff), .3), transparent: true, opacity: 0.8 }));
  ring.rotation.x = Math.PI / 2.15; ring.position.y = -1.32;
  const ring2 = ring.clone(); ring2.scale.setScalar(1.35); ring2.material = ring.material.clone(); ring2.material.opacity = 0.35;
  world.add(ring, ring2);
  // umbra moale de sub fruct
  const shadowCv = document.createElement("canvas"); shadowCv.width = shadowCv.height = 128;
  { const x = shadowCv.getContext("2d"), g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, "rgba(0,0,0,.55)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCv), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -1.34;
  world.add(shadow);

  // fructul
  const pivot = new THREE.Group();
  const RADIUS = 1.25;
  const model = buildFruitModel(fruit);
  model.scale.setScalar(RADIUS);
  pivot.add(model);
  world.add(pivot);

  // particule care plutesc în jur
  const sparkTex = dotTexture();
  const PN = 220, pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), seeds = new Float32Array(PN);
  const base = new THREE.Color(fruit.visual.color);
  for (let i = 0; i < PN; i++) {
    const r = 1.7 + Math.random() * 1.6, a = Math.random() * Math.PI * 2, y = (Math.random() - 0.5) * 3.2;
    pPos.set([Math.cos(a) * r, y, Math.sin(a) * r - 0.5], i * 3);
    const c = base.clone().lerp(new THREE.Color(0xffffff), Math.random() * 0.7);
    pCol.set([c.r, c.g, c.b], i * 3); seeds[i] = Math.random() * 10;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
  const sparks = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.07, map: sparkTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sparks.visible = effects;
  world.add(sparks);

  // explozie de particule (la descoperire și la atingerea unei vitamine)
  const BN = 260, bPos = new Float32Array(BN * 3), bVel = new Float32Array(BN * 3), bCol = new Float32Array(BN * 3);
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute("position", new THREE.BufferAttribute(bPos, 3)); bGeo.setAttribute("color", new THREE.BufferAttribute(bCol, 3));
  const burstMat = new THREE.PointsMaterial({ size: 0.11, map: sparkTex, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const burstPts = new THREE.Points(bGeo, burstMat);
  world.add(burstPts);
  let burstT = -1;
  function burst(color = fruit.visual.color, dx = 0, dy = 0) {
    const c0 = new THREE.Color(color), palette = [c0, new THREE.Color(0xffffff), new THREE.Color(0xc9f25c), new THREE.Color(0x5be3c4), new THREE.Color(0xff9f1c)];
    for (let i = 0; i < BN; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 3.5);
      v.x += dx * 2.5; v.y += dy * 2.5;
      bVel.set([v.x, v.y, v.z], i * 3); bPos.set([0, 0, 0.3], i * 3);
      const c = palette[(Math.random() * palette.length) | 0]; bCol.set([c.r, c.g, c.b], i * 3);
    }
    bGeo.attributes.position.needsUpdate = bGeo.attributes.color.needsUpdate = true;
    burstT = 0;
  }

  // ---------- interacțiune ----------
  // un deget / mouse: rotire (sau mutare, în modul „mută”); două degete: zoom + mutare; rotița: zoom
  const state = { yaw: 0, pitch: 0.12, vYaw: 0, vPitch: 0, auto: true, idleUntil: 0, zoom: HOME_Z, targetZoom: HOME_Z, appear: 0, wobble: 0,
    panX: 0, panY: 0, mode: "rotate", lastTouch: 0 };
  const ptrs = new Map(); let pinch0 = 0, mid0 = null;
  const unitsPerPx = () => 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z / Math.max(1, canvas.clientHeight);
  const clampPan = () => { state.panX = THREE.MathUtils.clamp(state.panX, -3, 3); state.panY = THREE.MathUtils.clamp(state.panY, -2.2, 2.2); };
  if (interactive) {
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); state.idleUntil = performance.now() + 2500; state.lastTouch = performance.now(); if (ptrs.size === 2) { pinch0 = 0; mid0 = null; } });
    canvas.addEventListener("pointermove", e => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      state.lastTouch = performance.now();
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()]; const d0 = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX; p.y = e.clientY;
        const [c, d] = [...ptrs.values()]; const d1 = Math.hypot(c.x - d.x, c.y - d.y), mid = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 };
        if (pinch0) state.targetZoom = THREE.MathUtils.clamp(state.targetZoom * (d0 / d1), 3.4, 10);
        if (mid0) { const u = unitsPerPx(); state.panX += (mid.x - mid0.x) * u; state.panY -= (mid.y - mid0.y) * u; clampPan(); }
        pinch0 = d1; mid0 = mid; return;
      }
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (state.mode === "move") { const u = unitsPerPx(); state.panX += dx * u; state.panY -= dy * u; clampPan(); return; }
      state.vYaw = dx * 0.012; state.vPitch = dy * 0.008;
      state.yaw += state.vYaw; state.pitch = THREE.MathUtils.clamp(state.pitch + state.vPitch, -0.9, 0.9);
      state.idleUntil = performance.now() + 2500;
    });
    const up = e => { ptrs.delete(e.pointerId); pinch0 = 0; mid0 = null; };
    canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", e => { e.preventDefault(); state.lastTouch = performance.now(); state.targetZoom = THREE.MathUtils.clamp(state.targetZoom * (1 + Math.sign(e.deltaY) * 0.1), 3.4, 10); }, { passive: false });
  } else canvas.style.pointerEvents = "none";

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // pe ecrane înguste (portret) îndepărtăm puțin camera, ca fructul să încapă
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  // ---------- bucla de randare ----------
  const clock = new THREE.Clock();
  let raf = 0, running = true;
  const minGap = 1000 / fps - 2;
  let lastDraw = 0;
  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (fps < 60 && !ptrs.size) { const n = performance.now(); if (n - lastDraw < minGap) return; lastDraw = n; }
    const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime, now = performance.now();
    if (!ptrs.size) {
      state.vYaw *= 0.94; state.vPitch *= 0.9;
      state.yaw += state.vYaw;
      if (state.auto && now > state.idleUntil && !reducedMotion) state.yaw += dt * 0.45;
      state.pitch += (0.12 - state.pitch) * (now > state.idleUntil ? 0.02 : 0);
    }
    state.zoom += (state.targetZoom - state.zoom) * 0.12;
    // pe ecrane înguste (portret) camera se depărtează, ca fructul să lase loc cardurilor din jur
    const base = Math.max(HOME_Z, 6.4 / Math.max(0.3, camera.aspect));
    camera.position.z = state.zoom / HOME_Z * base * distance;   // distance > 1: fructul apare mai mic (lasă loc etichetelor)
    // apariția: scalare elastică
    if (state.appear < 1) state.appear = Math.min(1, state.appear + dt / (reducedMotion ? 0.01 : 0.9));
    const e = state.appear, elastic = e >= 1 ? 1 : 1 - Math.pow(2, -10 * e) * Math.cos(e * Math.PI * 4.2);
    state.wobble = Math.max(0, state.wobble - dt * 2.2);
    const wob = 1 + Math.sin(t * 22) * 0.06 * state.wobble;
    pivot.scale.setScalar(Math.max(0.001, elastic) * wob);
    pivot.rotation.set(state.pitch, state.yaw, 0);
    pivot.position.y = reducedMotion ? 0 : Math.sin(t * 1.4) * 0.06;
    world.position.x += (state.panX - world.position.x) * 0.25;
    world.position.y += (state.panY - world.position.y) * 0.25;
    ring.rotation.z = t * 0.4; ring2.rotation.z = -t * 0.25;
    ring.material.opacity = 0.55 + Math.sin(t * 2) * 0.25;
    glow.material.opacity = 0.75 + Math.sin(t * 1.3) * 0.15;
    sparks.rotation.y = t * 0.05;
    const pa = pGeo.attributes.position;
    if (!reducedMotion) for (let i = 0; i < PN; i++) pa.array[i * 3 + 1] += Math.sin(t + seeds[i]) * 0.0015;
    pa.needsUpdate = true;
    if (burstT >= 0) {
      burstT += dt;
      const k = burstT / 1.4;
      for (let i = 0; i < BN; i++) {
        bPos[i * 3] += bVel[i * 3] * dt; bPos[i * 3 + 1] += bVel[i * 3 + 1] * dt - k * dt * 1.5; bPos[i * 3 + 2] += bVel[i * 3 + 2] * dt;
        bVel[i * 3] *= 0.97; bVel[i * 3 + 1] *= 0.97; bVel[i * 3 + 2] *= 0.97;
      }
      bGeo.attributes.position.needsUpdate = true;
      burstMat.opacity = Math.max(0, 1 - k);
      if (k >= 1) burstT = -1;
    }
    renderer.render(scene, camera);
  }
  frame();

  return {
    zoom(dir) { state.targetZoom = THREE.MathUtils.clamp(state.targetZoom * (dir > 0 ? 0.82 : 1.22), 3.4, 10); },
    rotate(step = 1) { state.vYaw += 0.12 * step; state.idleUntil = performance.now() + 1500; },
    reset() { state.targetZoom = HOME_Z; state.yaw = 0; state.pitch = 0.12; state.vYaw = state.vPitch = 0; state.auto = true; state.idleUntil = 0; state.panX = state.panY = 0; state.mode = "rotate"; },
    /** „rotate”: un deget rotește fructul; „move”: un deget îl mută. */
    setMode(mode) { state.mode = mode; return state.mode; },
    get mode() { return state.mode; },
    /** Momentul ultimei atingeri (pentru a nu înlocui fructul cât timp copilul se joacă cu el). */
    get lastTouch() { return state.lastTouch; },
    setAuto(on) { state.auto = on; return state.auto; },
    get auto() { return state.auto; },
    celebrate() { state.appear = 0; burst(); },
    poke(color, dx, dy) { state.wobble = 1; burst(color, dx, dy); },
    burst,
    /** Oprește / repornește randarea (ex. când scena nu e vizibilă pe ecran). */
    pause() { running = false; cancelAnimationFrame(raf); },
    resume() { if (running) return; running = true; clock.getDelta(); frame(); },
    /** Centrul și raza fructului pe ecran (px CSS), pentru săgețile către vitamine. */
    screenInfo() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      pivot.getWorldPosition(tmp); tmp.project(camera);
      const cx = (tmp.x + 1) / 2 * w, cy = (1 - tmp.y) / 2 * h;
      const dist = camera.position.z;
      const r = (RADIUS * pivot.scale.x) / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist) * (h / 2);
      return { cx, cy, r };
    },
    dispose() {
      running = false; cancelAnimationFrame(raf); ro.disconnect();
      scene.traverse(o => { o.geometry?.dispose?.(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach(x => { x.map?.dispose?.(); x.dispose?.(); }); });
      scene.environment?.dispose?.(); pmrem.dispose(); renderer.dispose();
    }
  };
}
