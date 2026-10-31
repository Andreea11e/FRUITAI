// FruitAI — fructul 3D din ecranul „Descoperă”.
// Modelul se construiește procedural din catalog (visual.shape + visual.color),
// deci orice fruct nou primește automat un model 3D. three.js se încarcă doar aici.

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const tmp = new THREE.Vector3();

function shade(hex, t) { const c = new THREE.Color(hex); return t >= 0 ? c.lerp(new THREE.Color(0xffffff), t) : c.lerp(new THREE.Color(0x000000), -t); }

function skinMaterial(color, opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color), roughness: opts.roughness ?? 0.32, metalness: 0,
    clearcoat: opts.clearcoat ?? 0.7, clearcoatRoughness: 0.22, sheen: opts.sheen ?? 0.25,
    sheenColor: shade(color, 0.5), sheenRoughness: 0.6, ...opts.extra
  });
}
const leafMat = () => new THREE.MeshPhysicalMaterial({ color: 0x4caf50, roughness: 0.45, clearcoat: 0.4, side: THREE.DoubleSide });
const stemMat = () => new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.8 });

function leaf(size = 0.55) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.bezierCurveTo(size * 0.35, size * 0.25, size * 0.4, size * 0.75, 0, size);
  s.bezierCurveTo(-size * 0.4, size * 0.75, -size * 0.35, size * 0.25, 0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.015, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 });
  const m = new THREE.Mesh(g, leafMat());
  return m;
}
function stemAndLeaf(y, tilt = 0.25) {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.32, 10), stemMat());
  stem.position.y = y + 0.12; stem.rotation.z = tilt * 0.4;
  const l = leaf(); l.position.set(0.04, y + 0.16, 0); l.rotation.set(0.2, 0.4, -1.1);
  g.add(stem, l);
  return g;
}

// ---------- forme ----------
const BUILD = {
  round(c) {
    const geo = new THREE.SphereGeometry(1, 96, 64);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      tmp.fromBufferAttribute(p, i);
      const pole = Math.pow(Math.abs(tmp.y), 6);            // ușoară adâncitură la poli
      tmp.y *= 0.92 - pole * 0.12;
      tmp.multiplyScalar(1 + Math.sin(tmp.x * 9) * Math.sin(tmp.z * 9) * 0.004);
      p.setXYZ(i, tmp.x, tmp.y, tmp.z);
    }
    geo.computeVertexNormals();
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, skinMaterial(c)), stemAndLeaf(0.78));
    return g;
  },
  oval(c) {
    const g = BUILD.round(c);
    g.children[0].scale.set(0.8, 1.12, 0.8);
    g.children[1].position.y = 0.2;
    g.rotation.z = -0.25;
    return g;
  },
  teardrop(c) {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, y = -1 + t * 2.1;
      const r = 0.92 * Math.sin(Math.PI * Math.min(1, t * 1.05)) * (1 - 0.48 * Math.pow(t, 1.6)) + 0.02;
      pts.push(new THREE.Vector2(Math.max(0.001, r), y));
    }
    const geo = new THREE.LatheGeometry(pts, 72); geo.computeVertexNormals();
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, skinMaterial(c)), stemAndLeaf(1.0));
    return g;
  },
  elongated(c) {
    // „banană”: un tub curbat, mai subțire la capete
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-1.25, 0.55, 0), new THREE.Vector3(0, -0.75, 0), new THREE.Vector3(1.25, 0.55, 0));
    const N = 80, M = 7, pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, P = curve.getPoint(t), T = curve.getTangent(t).normalize();
      const Nn = new THREE.Vector3(0, 0, 1), Bn = new THREE.Vector3().crossVectors(T, Nn).normalize();
      const r = 0.36 * Math.pow(Math.sin(Math.PI * t), 0.55) + 0.03;
      for (let j = 0; j <= M * 4; j++) {
        const a = j / (M * 4) * Math.PI * 2;
        const ridge = 1 + 0.06 * Math.cos(a * M / 2 * 2);   // muchiile cojii
        pos.push(P.x + (Bn.x * Math.cos(a) + Nn.x * Math.sin(a)) * r * ridge, P.y + (Bn.y * Math.cos(a) + Nn.y * Math.sin(a)) * r * ridge, P.z + (Bn.z * Math.cos(a) + Nn.z * Math.sin(a)) * r * ridge);
      }
    }
    const W = M * 4 + 1;
    for (let i = 0; i < N; i++) for (let j = 0; j < M * 4; j++) { const a = i * W + j, b = a + W; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, skinMaterial(c, { roughness: 0.45, clearcoat: 0.3 })));
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.25, 8), stemMat()); tip.position.set(1.3, 0.66, 0); tip.rotation.z = -0.9;
    g.add(tip);
    return g;
  },
  cluster(c) {
    const g = new THREE.Group(), mat = skinMaterial(c, { roughness: 0.25, clearcoat: 0.9 });
    const geo = new THREE.SphereGeometry(0.3, 40, 28);
    const rows = [4, 4, 3, 3, 2, 1];
    let y = 0.75;
    rows.forEach((n, r) => {
      const rad = 0.08 + n * 0.12;
      for (let i = 0; i < n * 2 - (r % 2); i++) {
        const a = i / (n * 2 - (r % 2)) * Math.PI * 2 + r * 0.6;
        const m = new THREE.Mesh(geo, mat);
        m.position.set(Math.cos(a) * rad, y + (Math.random() - 0.5) * 0.06, Math.sin(a) * rad);
        m.scale.setScalar(0.92 + Math.random() * 0.14);
        g.add(m);
      }
      y -= 0.33;
    });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.5, 8), stemMat()); stem.position.y = 1.05;
    g.add(stem);
    const l = leaf(0.6); l.position.set(0.06, 1.1, 0); l.rotation.set(0.3, 0.2, -1.2); g.add(l);
    g.position.y = 0.1;
    return g;
  },
  drupelets(c) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.82, 32, 24), skinMaterial(shade(c, -0.35)));
    core.scale.set(0.95, 1.12, 0.95);
    const n = 150, inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.19, 20, 14), skinMaterial(c, { roughness: 0.22, clearcoat: 1 }), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const y = 1 - (i + 0.5) / n * 2, rr = Math.sqrt(1 - y * y), a = i * 2.399963;
      tmp.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
      tmp.set(tmp.x * 0.88, tmp.y * 1.05, tmp.z * 0.88);
      sc.setScalar(0.9 + Math.random() * 0.2);
      m4.compose(tmp, q, sc); inst.setMatrixAt(i, m4);
    }
    g.add(core, inst, stemAndLeaf(0.95));
    return g;
  },
  spiky(c) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.9, 64, 48), skinMaterial(c, { roughness: 0.5, clearcoat: 0.3 }));
    body.scale.set(0.95, 1.12, 0.95);
    const n = 170, inst = new THREE.InstancedMesh(new THREE.ConeGeometry(0.075, 0.24, 8), skinMaterial(shade(c, -0.2), { roughness: 0.5 }), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s1 = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < n; i++) {
      const y = 1 - (i + 0.5) / n * 2, rr = Math.sqrt(1 - y * y), a = i * 2.399963;
      const dir = new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr).normalize();
      tmp.set(dir.x * 0.86, dir.y * 1.0, dir.z * 0.86);
      q.setFromUnitVectors(up, dir);
      m4.compose(tmp, q, s1); inst.setMatrixAt(i, m4);
    }
    // coroana de frunze
    const crown = new THREE.Group();
    for (let i = 0; i < 9; i++) { const l = leaf(0.75); l.rotation.set(-0.35, i / 9 * Math.PI * 2, 0); l.position.y = 0.95; crown.add(l); }
    g.add(body, inst, crown);
    return g;
  },
  star(c) {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.48 : 1.1;
      i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.55, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.14, bevelSegments: 6, curveSegments: 4 });
    geo.center();
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, skinMaterial(c, { roughness: 0.25, clearcoat: 0.9 })));
    return g;
  }
};

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
export function createFruitScene(canvas, fruit, { reducedMotion = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  const HOME_Z = 6.2;
  camera.position.set(0, 0.15, HOME_Z);

  // lumini: cheie caldă, contur în culoarea fructului, umplere rece
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2.5, 3, 4);
  const rim = new THREE.PointLight(new THREE.Color(fruit.visual.color), 30, 12); rim.position.set(-2.5, 1.5, -2);
  const fill = new THREE.PointLight(0x7fd8ff, 10, 12); fill.position.set(2.5, -1.5, 2);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 0.6), key, rim, fill);

  // strălucire în spatele fructului
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(fruit.visual.color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.setScalar(6.2); glow.position.z = -1.5;
  scene.add(glow);

  // inel luminos sub fruct
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.018, 12, 120), new THREE.MeshBasicMaterial({ color: new THREE.Color(fruit.visual.color).lerp(new THREE.Color(0xffffff), .3), transparent: true, opacity: 0.8 }));
  ring.rotation.x = Math.PI / 2.15; ring.position.y = -1.32;
  const ring2 = ring.clone(); ring2.scale.setScalar(1.35); ring2.material = ring.material.clone(); ring2.material.opacity = 0.35;
  scene.add(ring, ring2);

  // fructul
  const pivot = new THREE.Group();
  const model = (BUILD[fruit.visual.shape] || BUILD.round)(fruit.visual.color);
  pivot.add(model);
  scene.add(pivot);
  const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  model.position.sub(ctr);
  const RADIUS = 1.25, fit = (RADIUS * 2) / Math.max(size.x, size.y, size.z);
  model.scale.multiplyScalar(fit);

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
  scene.add(sparks);

  // explozie de particule (la descoperire și la atingerea unei vitamine)
  const BN = 260, bPos = new Float32Array(BN * 3), bVel = new Float32Array(BN * 3), bCol = new Float32Array(BN * 3);
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute("position", new THREE.BufferAttribute(bPos, 3)); bGeo.setAttribute("color", new THREE.BufferAttribute(bCol, 3));
  const burstMat = new THREE.PointsMaterial({ size: 0.11, map: sparkTex, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const burstPts = new THREE.Points(bGeo, burstMat);
  scene.add(burstPts);
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

  // ---------- interacțiune: rotire cu degetul / mouse-ul, zoom ----------
  const state = { yaw: 0, pitch: 0.12, vYaw: 0, vPitch: 0, auto: true, idleUntil: 0, zoom: HOME_Z, targetZoom: HOME_Z, appear: 0, wobble: 0 };
  const ptrs = new Map(); let pinch0 = 0;
  canvas.style.touchAction = "none";
  canvas.addEventListener("pointerdown", e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); state.idleUntil = performance.now() + 2500; });
  canvas.addEventListener("pointermove", e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()]; const d0 = Math.hypot(a.x - b.x, a.y - b.y);
      p.x = e.clientX; p.y = e.clientY;
      const [c, d] = [...ptrs.values()]; const d1 = Math.hypot(c.x - d.x, c.y - d.y);
      if (pinch0) state.targetZoom = THREE.MathUtils.clamp(state.targetZoom * (d0 / d1), 3.4, 10);
      pinch0 = d1; return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    state.vYaw = dx * 0.012; state.vPitch = dy * 0.008;
    state.yaw += state.vYaw; state.pitch = THREE.MathUtils.clamp(state.pitch + state.vPitch, -0.9, 0.9);
    state.idleUntil = performance.now() + 2500;
  });
  const up = e => { ptrs.delete(e.pointerId); pinch0 = 0; };
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", e => { e.preventDefault(); state.targetZoom = THREE.MathUtils.clamp(state.targetZoom * (1 + Math.sign(e.deltaY) * 0.1), 3.4, 10); }, { passive: false });

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
  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
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
    camera.position.z = state.zoom / HOME_Z * base;
    // apariția: scalare elastică
    if (state.appear < 1) state.appear = Math.min(1, state.appear + dt / (reducedMotion ? 0.01 : 0.9));
    const e = state.appear, elastic = e >= 1 ? 1 : 1 - Math.pow(2, -10 * e) * Math.cos(e * Math.PI * 4.2);
    state.wobble = Math.max(0, state.wobble - dt * 2.2);
    const wob = 1 + Math.sin(t * 22) * 0.06 * state.wobble;
    pivot.scale.setScalar(Math.max(0.001, elastic) * wob);
    pivot.rotation.set(state.pitch, state.yaw, 0);
    pivot.position.y = reducedMotion ? 0 : Math.sin(t * 1.4) * 0.06;
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
    reset() { state.targetZoom = HOME_Z; state.yaw = 0; state.pitch = 0.12; state.vYaw = state.vPitch = 0; state.auto = true; state.idleUntil = 0; },
    setAuto(on) { state.auto = on; return state.auto; },
    get auto() { return state.auto; },
    celebrate() { state.appear = 0; burst(); },
    poke(color, dx, dy) { state.wobble = 1; burst(color, dx, dy); },
    burst,
    /** Centrul și raza fructului pe ecran (px CSS), pentru săgețile către vitamine. */
    screenInfo() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      tmp.copy(pivot.position).project(camera);
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
