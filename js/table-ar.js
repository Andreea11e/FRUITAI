// FruitAI — fructul pe masă pe ORICE telefon cu cameră (fără WebXR / AR Quick Look).
// Imaginea camerei e fundalul, iar fructul 3D stă „pe masă”, cu umbră sub el. Giroscopul telefonului
// rotește camera virtuală odată cu telefonul, așa că fructul rămâne pe loc când te uiți în jur.
// Gesturi, fără butoane: un deget mută fructul, două degete îl măresc / micșorează și îl rotesc,
// o atingere pe masă îl mută acolo, o atingere pe un nutrient deschide fișa lui.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildFruitModel, disposeObject } from "./fruit-models.js";
import { namePanel, nutrientSprite, softDisc } from "./xr.js";

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const H = 0.42;      // înălțimea presupusă a telefonului deasupra mesei (m)
const R = 0.085;     // raza fructului (m), ca în AR-ul spațial

/**
 * ui: { overlay, close, card, t, onEnd, onNutrient, orientation: Promise<boolean> (permisiunea pentru giroscop) }
 * Returnează { end() }.
 */
export async function startTableAR(fruit, nutrients, ui) {
  const t = ui.t || (s => s);
  const mobile = matchMedia("(pointer: coarse)").matches;

  // ---------- camera ----------
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  const video = document.createElement("video");
  video.playsInline = true; video.muted = true; video.autoplay = true; video.setAttribute("playsinline", "");
  video.srcObject = stream;
  video.style.cssText = "position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:98;background:#000;";
  document.body.appendChild(video);
  await video.play().catch(() => {});

  // ---------- scena 3D ----------
  const renderer = new THREE.WebGLRenderer({ antialias: !mobile || devicePixelRatio < 2, alpha: true });
  renderer.setPixelRatio(Math.min(mobile ? 1.5 : 2, devicePixelRatio || 1));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:99;touch-action:none;";
  document.body.appendChild(renderer.domElement);
  document.documentElement.classList.add("imm-lock");

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.8;
  const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(0.5, 1, 0.3);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334433, 0.9), sun);
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 20);
  const fov = () => { const a = innerWidth / innerHeight; camera.aspect = a; camera.fov = a < 1 ? 62 : 46; camera.updateProjectionMatrix(); };
  fov();
  camera.rotation.set(-0.85, 0, 0, "YXZ");   // fără giroscop: telefonul privește masa, în jos

  // fructul, ca în AR-ul spațial: umbră, inel luminos, numele deasupra, nutrienții pe orbită
  const holder = new THREE.Group(); holder.visible = false; scene.add(holder);
  const model = buildFruitModel(fruit); model.scale.setScalar(R); model.position.y = R * 1.05;
  const spin = new THREE.Group(); spin.add(model); holder.add(spin);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(R * 3.2, R * 3.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: softDisc(THREE, "0,0,0", 0.6), transparent: true, depthWrite: false }));
  shadow.position.y = 0.002; holder.add(shadow);
  const glowRing = new THREE.Mesh(new THREE.RingGeometry(R * 1.45, R * 1.55, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(fruit.visual.color).lerp(new THREE.Color(0xffffff), 0.3), transparent: true, opacity: 0.7 }));
  glowRing.position.y = 0.003; holder.add(glowRing);
  const np = namePanel(THREE, fruit);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2 / np.aspect), new THREE.MeshBasicMaterial({ map: np.tex, transparent: true, side: THREE.DoubleSide }));
  panel.position.y = R * 2.6; holder.add(panel);
  const orbit = new THREE.Group(); orbit.position.y = R * 1.05; holder.add(orbit);
  const sprites = nutrients.slice(0, 8).map((n, i, arr) => {
    const s = nutrientSprite(THREE, n), a = i / arr.length * Math.PI * 2;
    s.position.set(Math.cos(a) * R * 1.9, Math.sin(a * 2) * R * 0.25, Math.sin(a) * R * 1.9);
    orbit.add(s); return s;
  });
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 });
  sprites.forEach(s => orbit.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), s.position.clone().multiplyScalar(0.92)]), lineMat)));

  // ---------- giroscopul: camera virtuală urmează telefonul ----------
  const gyro = { ok: false, alpha0: null, q: new THREE.Quaternion() };
  const zee = new THREE.Vector3(0, 0, 1), euler = new THREE.Euler(), q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
  const deg = THREE.MathUtils.degToRad;
  const onOrient = e => {
    if (e.beta == null) return;
    const alpha = e.alpha ?? 0;
    if (gyro.alpha0 == null) gyro.alpha0 = alpha;
    const orient = deg(screen.orientation?.angle ?? window.orientation ?? 0);
    euler.set(deg(e.beta), deg(alpha - gyro.alpha0), -deg(e.gamma ?? 0), "YXZ");
    gyro.q.setFromEuler(euler).multiply(q1).multiply(q0.setFromAxisAngle(zee, -orient));
    if (!gyro.ok) { gyro.ok = true; camera.quaternion.copy(gyro.q); }
  };
  // permisiunea contează doar pe iPhone; în rest ascultăm oricum (fără permisiune pur și simplu nu vin date)
  await (ui.orientation || Promise.resolve(true));
  addEventListener("deviceorientation", onOrient);

  // ---------- așezarea pe masă ----------
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), H);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hitP = new THREE.Vector3();
  const st = { placed: false, scale: 0.55, targetScale: 0.55, yaw: 0, auto: true, appear: 0, picked: null, dragging: false };
  const target = new THREE.Vector3();
  function tablePoint(x, y) {
    ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const p = ray.ray.intersectPlane(plane, hitP);
    if (p && p.length() < 2.5) return p.clone();
    return null;
  }
  function place() {
    camera.updateMatrixWorld();
    let p = tablePoint(innerWidth / 2, innerHeight * 0.6);
    if (!p) {   // telefonul privește înainte, nu spre masă: punem fructul la ~70 cm în față
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion); f.y = 0;
      if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
      p = f.normalize().multiplyScalar(0.7); p.y = -H;
    }
    holder.position.copy(p); target.copy(p);
    st.placed = true; st.appear = 0; holder.visible = true;
  }
  // așteptăm puțin primele date de la giroscop, ca fructul să apară exact pe masa din fața telefonului
  setTimeout(place, 450);

  // ---------- fișa nutrientului ----------
  function showCard(n) {
    if (!ui.card) return;
    ui.card.style.setProperty("--nc", n.color);
    ui.card.innerHTML = `<button type="button" class="xr-x" aria-label="${esc(t("Închide"))}">×</button>
      <div class="xr-c-lang"><b>RO</b><h4>${esc(n.title)}</h4><p>${esc(n.kid)}</p></div>
      <div class="xr-c-lang en"><b>EN</b><h4>${esc(n.title_en || n.title)}</h4><p>${esc(n.kid_en || "")}</p></div>`;
    ui.card.hidden = false;
    ui.card.querySelector(".xr-x").onclick = () => { ui.card.hidden = true; st.picked = null; };
    st.picked = n.key;
    ui.onNutrient?.(n);
  }
  function tap(x, y) {
    camera.updateMatrixWorld();
    ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(sprites, false)[0];
    if (hit) { showCard(hit.object.userData.nutrient); return; }
    const p = tablePoint(x, y);
    if (p) target.copy(p);
  }

  // ---------- gesturi ----------
  const cv = renderer.domElement;
  let pinch0 = 0, scale0 = 1, ang0 = 0, yaw0 = 0, start = null, moved = 0;
  const two = e => { const [a, b] = e.touches; return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), ang: Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) }; };
  const ts = e => {
    e.preventDefault();
    if (e.touches.length >= 2) { const g = two(e); pinch0 = g.d; ang0 = g.ang; scale0 = st.targetScale; yaw0 = st.yaw; st.dragging = false; moved = 99; }
    else { start = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now() }; moved = 0; st.dragging = false; }
  };
  const tm = e => {
    e.preventDefault();
    if (!st.placed) return;
    if (e.touches.length >= 2 && pinch0) {
      const g = two(e);
      st.targetScale = THREE.MathUtils.clamp(scale0 * g.d / pinch0, 0.25, 2.5);
      let da = g.ang - ang0; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
      st.yaw = yaw0 - da; st.auto = false;
    } else if (start && e.touches.length === 1) {
      const x = e.touches[0].clientX, y = e.touches[0].clientY;
      moved = Math.max(moved, Math.hypot(x - start.x, y - start.y));
      if (moved > 10) { st.dragging = true; st.auto = false; const p = tablePoint(x, y); if (p) target.copy(p); }
    }
  };
  const te = e => {
    if (e.touches.length < 2) pinch0 = 0;
    if (!e.touches.length) {
      if (start && moved <= 10 && performance.now() - start.t < 400) tap(start.x, start.y);
      start = null; st.dragging = false;
    }
  };
  // mouse (pentru calculator): trage = mută, rotița = mărește
  let md = null;
  const mdn = e => { md = { x: e.clientX, y: e.clientY, moved: 0 }; };
  const mmv = e => { if (!md) return; md.moved = Math.max(md.moved, Math.hypot(e.clientX - md.x, e.clientY - md.y)); if (md.moved > 5) { const p = tablePoint(e.clientX, e.clientY); if (p) target.copy(p); st.auto = false; } };
  const mup = e => { if (md && md.moved <= 5) tap(e.clientX, e.clientY); md = null; };
  const whl = e => { e.preventDefault(); st.targetScale = THREE.MathUtils.clamp(st.targetScale * (e.deltaY < 0 ? 1.1 : 0.9), 0.25, 2.5); };
  cv.addEventListener("touchstart", ts, { passive: false });
  cv.addEventListener("touchmove", tm, { passive: false });
  cv.addEventListener("touchend", te); cv.addEventListener("touchcancel", te);
  cv.addEventListener("mousedown", mdn); addEventListener("mousemove", mmv); addEventListener("mouseup", mup);
  cv.addEventListener("wheel", whl, { passive: false });
  const onResize = () => { renderer.setSize(innerWidth, innerHeight); fov(); };
  addEventListener("resize", onResize);

  // ---------- bucla de randare ----------
  const clock = new THREE.Clock(), camPos = new THREE.Vector3();
  let raf = 0, ended = false;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, clock.getDelta()), tt = clock.elapsedTime;
    if (gyro.ok) camera.quaternion.slerp(gyro.q, 0.35);
    if (st.placed) {
      holder.position.lerp(target, 0.25);
      st.appear = Math.min(1, st.appear + dt / 0.9);
      const e = st.appear, elastic = e >= 1 ? 1 : 1 - Math.pow(2, -10 * e) * Math.cos(e * Math.PI * 4.2);
      st.scale += (st.targetScale - st.scale) * 0.15;
      holder.scale.setScalar(Math.max(0.001, elastic) * st.scale);
      if (st.auto) st.yaw += dt * 0.5;
      spin.rotation.y += (st.yaw - spin.rotation.y) * 0.2;
      model.position.y = R * 1.05 + Math.sin(tt * 1.6) * 0.004;
      orbit.rotation.y = tt * 0.35;
      glowRing.material.opacity = 0.45 + Math.sin(tt * 2.2) * 0.25;
      sprites.forEach(s => { const k = s.userData.nutrient.key === st.picked ? 1.45 : 1; s.scale.x += (0.05 * k - s.scale.x) * 0.2; s.scale.y = s.scale.x * 326 / 256; });
      camera.getWorldPosition(camPos);
      panel.lookAt(camPos.x, holder.position.y + panel.position.y * holder.scale.y, camPos.z);
    }
    renderer.render(scene, camera);
  };
  loop();
  if (/[?&]debug\b/.test(location.search)) window.__tableAR = { camera, holder, st, gyro, renderer };

  if (ui.overlay) ui.overlay.hidden = false;
  if (ui.card) ui.card.hidden = true;
  const onClose = () => end();
  ui.close?.addEventListener("click", onClose);
  const onKey = e => { if (e.key === "Escape") end(); };
  addEventListener("keydown", onKey);

  function end() {
    if (ended) return; ended = true;
    cancelAnimationFrame(raf);
    removeEventListener("deviceorientation", onOrient);
    removeEventListener("mousemove", mmv); removeEventListener("mouseup", mup);
    removeEventListener("resize", onResize); removeEventListener("keydown", onKey);
    ui.close?.removeEventListener("click", onClose);
    stream.getTracks().forEach(tr => tr.stop());
    video.remove();
    disposeObject(scene);
    scene.environment?.dispose?.(); pmrem.dispose(); renderer.dispose();
    renderer.domElement.remove();
    document.documentElement.classList.remove("imm-lock");
    if (ui.card) ui.card.hidden = true;
    if (ui.overlay) ui.overlay.hidden = true;
    ui.onEnd?.();
  }
  return { end };
}
