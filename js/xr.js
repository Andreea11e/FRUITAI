// FruitAI — AR spațial cu WebXR (immersive-ar + hit-test).
// Fructul 3D (același model ca în Camera AR, din fruit-models.js) e așezat pe o suprafață reală:
// masă sau podea. Copilul îl poate muta (atinge altă suprafață), roti (trage cu un deget sau butoanele),
// mări / micșora (două degete sau butoanele) și privi din orice unghi, mișcându-se în jurul lui.
// În jurul fructului orbitează nutrienții; atingerea unuia deschide cardul bilingv.
// three.js și acest modul se încarcă doar când copilul pornește AR spațial.

export async function isSupported() {
  try { return !!(navigator.xr && window.isSecureContext && await navigator.xr.isSessionSupported("immersive-ar")); }
  catch { return false; }
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const FONT = '"Nunito", system-ui, -apple-system, "Segoe UI", sans-serif';

/** Panoul cu numele, deasupra fructului: română mare, engleză dedesubt. */
export function namePanel(THREE, fruit) {
  const W = 1024, H = 300, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  const rr = (X, Y, w, h, r) => { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); };
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, "rgba(40,26,92,0.9)"); g.addColorStop(1, "rgba(13,9,38,0.92)");
  rr(10, 10, W - 20, H - 20, 70); x.fillStyle = g; x.fill();
  x.lineWidth = 6; x.strokeStyle = "rgba(255,226,122,0.75)"; x.stroke();
  x.textAlign = "center"; x.fillStyle = "#FFFFFF";
  const ro = (fruit.emoji ? fruit.emoji + " " : "") + fruit.ro.toLocaleUpperCase("ro-RO");
  let size = 120; x.font = `900 ${size}px ${FONT}`;
  while (x.measureText(ro).width > W - 120 && size > 50) { size -= 6; x.font = `900 ${size}px ${FONT}`; }
  x.fillText(ro, W / 2, 150);
  x.fillStyle = "#8EF0C9"; x.font = `900 58px ${FONT}`; x.fillText(fruit.en.toUpperCase().split("").join(" "), W / 2, 240);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return { tex: t, aspect: W / H };
}

/** Pictograma unui nutrient (sferă / cristal / frunză colorată, cu simbolul și numele). */
export function nutrientSprite(THREE, n) {
  const S = 256, c = document.createElement("canvas"); c.width = S; c.height = S + 70;
  const x = c.getContext("2d"), cx = S / 2, cy = S / 2, r = S * 0.4;
  const g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, "#FFFFFF"); g.addColorStop(0.25, n.color); g.addColorStop(1, "#1b1238");
  x.fillStyle = g; x.beginPath();
  if (n.kind === "mineral") for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  else if (n.kind === "fiber") { x.moveTo(cx - r, cy + r * 0.2); x.quadraticCurveTo(cx - r * 0.2, cy - r * 1.2, cx + r, cy - r * 0.2); x.quadraticCurveTo(cx + r * 0.2, cy + r * 1.2, cx - r, cy + r * 0.2); }
  else x.arc(cx, cy, r, 0, Math.PI * 2);
  x.closePath(); x.fill();
  x.lineWidth = 8; x.strokeStyle = "rgba(255,255,255,0.85)"; x.stroke();
  x.fillStyle = "#FFFFFF"; x.textAlign = "center"; x.font = `900 ${n.symbol.length > 1 ? 78 : 96}px ${FONT}`;
  x.shadowColor = "rgba(0,0,0,.5)"; x.shadowBlur = 8; x.fillText(n.symbol, cx, cy + 32);
  x.shadowBlur = 0;
  x.fillStyle = "rgba(13,9,38,0.85)"; x.fillRect(10, S + 4, S - 20, 60);
  x.fillStyle = "#FFFFFF"; x.font = `800 34px ${FONT}`;
  let label = n.title.replace(/^Vitamina /, "Vit. ");
  while (x.measureText(label).width > S - 30 && label.length > 4) label = label.slice(0, -2) + "…";
  x.fillText(label, cx, S + 46);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  sp.scale.set(0.05, 0.05 * (S + 70) / S, 1);
  sp.userData.nutrient = n;
  return sp;
}

export function softDisc(THREE, color, alpha) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d"), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, `rgba(${color},${alpha})`); g.addColorStop(1, `rgba(${color},0)`);
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/**
 * Pornește o sesiune immersive-ar pentru un fruct din catalog.
 * nutrients: catalog.nutrientsFor(id). ui: { overlay, msg, hint, close, tools, card, t, onEnd, onNutrient }
 */
export async function startSession(fruit, nutrients, ui) {
  if (!(await isSupported())) throw new Error("WebXR immersive-ar nu este suportat");
  const THREE = await import("three");
  const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
  const { buildFruitModel, disposeObject } = await import("./fruit-models.js");
  const { createPlay } = await import("./ar-play.js");
  const { sound } = await import("./sound.js");
  const t = ui.t || (s => s);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local");
  renderer.domElement.style.cssText = "position:fixed;inset:0;z-index:99;";
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.8;
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
  const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(0.5, 1, 0.3);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334433, 0.9), sun);

  // reticul: unde a fost găsită o suprafață reală (masă / podea)
  const reticle = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xdfff7a, transparent: true, opacity: 0.95 });
  reticle.add(new THREE.Mesh(new THREE.RingGeometry(0.055, 0.07, 48).rotateX(-Math.PI / 2), ringMat));
  const pulse = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.078, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8ef0c9, transparent: true, opacity: 0.8 }));
  reticle.add(pulse);
  reticle.matrixAutoUpdate = false; reticle.visible = false;
  scene.add(reticle);

  // fructul, cu umbră, inel luminos, numele deasupra și nutrienții pe orbită
  const holder = new THREE.Group(); holder.visible = false; scene.add(holder);
  const R = 0.085;                                   // raza fructului: ~8,5 cm, cât un fruct mare
  const model = buildFruitModel(fruit); model.scale.setScalar(R);
  const lift = () => -model.userData.bottom * R + 0.002;   // fructul stă pe masă, indiferent de formă (și după ce se încarcă modelul real)
  model.position.y = lift();
  const spin = new THREE.Group(); spin.add(model); holder.add(spin);
  // joaca: rostogolire cu două degete (și cu susul în jos) + săritură cu tumbă la atingerea fructului
  const play = createPlay({ spin, model, R, color: fruit.visual.color, lift, sound });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(R * 3.2, R * 3.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: softDisc(THREE, "0,0,0", 0.55), transparent: true, depthWrite: false }));
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
  // linii subțiri de la fruct la fiecare nutrient
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 });
  const lines = sprites.map(s => { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), s.position.clone().multiplyScalar(0.92)]); const l = new THREE.Line(g, lineMat); orbit.add(l); return l; });

  const st = { placed: false, guess: false, scale: 1, targetScale: 1, yaw: 0, auto: true, appear: 0, picked: null, ignoreSelectUntil: 0, t0: performance.now() };
  const setMsg = s => { if (ui.msg) ui.msg.textContent = t(s); };
  const setHint = s => { if (ui.hint) ui.hint.textContent = t(s); };

  // ---------- cardul nutrientului (în overlay, bilingv) ----------
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

  // ---------- gesturi, fără butoane ----------
  // un deget: trage fructul pe masă / podea (îl urmează sub deget)
  // două degete: apropie / depărtează = mărește / micșorează; răsucește = întoarce fructul
  let pinch0 = 0, scale0 = 1, ang0 = 0, yaw0 = 0, moved = 0, start = null, mid0 = null;
  const ov = ui.overlay;
  const two = e => {
    const [a, b] = e.touches;
    return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), ang: Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX), mid: { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 } };
  };
  const onStart = e => {
    if (e.target.closest("button, .xr-card")) return;
    moved = 0;
    if (e.touches.length >= 2) {
      const g = two(e); pinch0 = g.d; ang0 = g.ang; scale0 = st.targetScale; yaw0 = st.yaw; st.dragging = false; mid0 = g.mid;
    } else { start = { x: e.touches[0].clientX, y: e.touches[0].clientY }; st.dragging = false; }
  };
  const onMove = e => {
    if (!st.placed) return;
    if (e.touches.length >= 2 && pinch0) {
      const g = two(e);
      st.targetScale = THREE.MathUtils.clamp(scale0 * g.d / pinch0, 0.4, 3);
      let da = g.ang - ang0; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
      st.yaw = yaw0 - da; st.auto = false; moved += 20;
      if (mid0) { play.roll(g.mid.x - mid0.x, g.mid.y - mid0.y, renderer.xr.getCamera().quaternion); mid0 = g.mid; }
    } else if (start && e.touches.length === 1) {
      const dist = Math.hypot(e.touches[0].clientX - start.x, e.touches[0].clientY - start.y);
      if (dist > 10) { st.dragging = true; st.auto = false; }
      moved = Math.max(moved, dist);
    }
    if (moved > 12) st.ignoreSelectUntil = performance.now() + 400;   // a fost un gest, nu o atingere
  };
  const onEnd = e => {
    if (e.touches.length < 2) { pinch0 = 0; mid0 = null; }
    if (!e.touches.length) { start = null; st.dragging = false; }
  };
  ov.addEventListener("touchstart", onStart, { passive: true });
  ov.addEventListener("touchmove", onMove, { passive: true });
  ov.addEventListener("touchend", onEnd, { passive: true });
  ov.addEventListener("touchcancel", onEnd, { passive: true });
  // atingerile pe butonul de închidere sau pe fișă nu trebuie să plaseze fructul
  const noSelect = e => { if (e.target.closest("button, .xr-card")) e.preventDefault(); };
  ov.addEventListener("beforexrselect", noSelect);

  if (ui.overlay) { ui.overlay.hidden = false; ui.overlay.style.pointerEvents = "auto"; ui.overlay.style.touchAction = "none"; }
  if (ui.card) ui.card.hidden = true;
  let session, hitSource;
  try {
    // sesiunea e cerută chiar în momentul atingerii (vezi requestARSession), altfel browserul o refuză
    session = await (ui.session || requestARSession(ui.overlay));
    await renderer.xr.setSession(session);
    const viewerSpace = await session.requestReferenceSpace("viewer");
    hitSource = await session.requestHitTestSource({ space: viewerSpace });
  } catch (e) {
    // dacă ceva nu merge după ce AR-ul a pornit, îl închidem curat (altfel rămâne camera fără fruct)
    try { await session?.end(); } catch {}
    if (ui.overlay) { ui.overlay.hidden = true; ui.overlay.style.pointerEvents = ""; ui.overlay.style.touchAction = ""; }
    renderer.setAnimationLoop(null); renderer.dispose(); renderer.domElement.remove(); pmrem.dispose();
    throw e;
  }
  // punctul de sub deget (pentru mutarea fructului cu degetul); dacă browserul nu-l oferă, folosim centrul ecranului
  let touchSource = null;
  try { touchSource = await session.requestHitTestSourceForTransientInput({ profile: "generic-touchscreen" }); } catch {}
  const target = new THREE.Vector3();
  setMsg("Mișcă încet telefonul ca să găsesc masa sau podeaua");
  setHint("Când apare cercul, atinge ecranul ca să pui fructul acolo");

  const ray = new THREE.Raycaster(), m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), quat = new THREE.Quaternion(), sc = new THREE.Vector3();
  session.addEventListener("select", ev => {
    if (performance.now() < st.ignoreSelectUntil) return;
    // 1) a atins un nutrient? (rază din punctul atins)
    if (st.placed) {
      const pose = ev.frame.getPose(ev.inputSource.targetRaySpace, renderer.xr.getReferenceSpace());
      if (pose) {
        m4.fromArray(pose.transform.matrix); m4.decompose(pos, quat, sc);
        ray.set(pos, new THREE.Vector3(0, 0, -1).applyQuaternion(quat));
        ray.camera = renderer.xr.getCamera();
        const hit = ray.intersectObjects(sprites, false)[0];
        if (hit) { showCard(hit.object.userData.nutrient); return; }
        if (play.hits(ray)) { play.jump(); return; }          // atingere pe fruct: sare și face o tumbă
      }
    }
    // 2) altfel, prima atingere pune fructul pe suprafața găsită (după aceea se mută trăgându-l cu degetul)
    if (st.placed) return;
    if (reticle.visible) placeAt(pos.setFromMatrixPosition(reticle.matrix), false);
    else placeGuess(ev.frame);
  });
  function placeAt(p, guess) {
    holder.position.copy(p); target.copy(p);
    st.placed = true; st.guess = guess; st.appear = 0; holder.visible = true;
  }
  // masa nu a fost găsită încă (suprafață albă, lucioasă sau lumină slabă): punem fructul
  // la ~60 cm în fața telefonului și ~35 cm mai jos, cât o masă; când telefonul găsește masa, fructul „aterizează” pe ea
  const vpos = new THREE.Vector3(), vq = new THREE.Quaternion(), fwd = new THREE.Vector3();
  function placeGuess(frame) {
    const vp = frame.getViewerPose(renderer.xr.getReferenceSpace());
    if (!vp) return;
    m4.fromArray(vp.transform.matrix); m4.decompose(vpos, vq, sc);
    fwd.set(0, 0, -1).applyQuaternion(vq); fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    placeAt(vpos.clone().addScaledVector(fwd, 0.6).add(new THREE.Vector3(0, -0.35, 0)), true);
  }
  const dragPlane = new THREE.Plane(), dragHit = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

  if (/[?&]debug\b/.test(location.search)) window.__xrAR = { st, holder, target };
  const onClose = () => session.end().catch(() => {});
  ui.close?.addEventListener("click", onClose);

  const clock = new THREE.Clock(), camPos = new THREE.Vector3();
  // siguranță: dacă în 4 s nu vine nicio imagine cu poziția telefonului, AR-ul nu merge aici → închidem și trecem pe cameră
  let posed = 0, failed = false;
  const watchdog = setTimeout(() => { if (!posed) { failed = true; session.end().catch(() => {}); } }, 4000);
  renderer.setAnimationLoop((time, frame) => {
    const dt = Math.min(0.05, clock.getDelta()), tt = clock.elapsedTime;
    if (frame && !posed && frame.getViewerPose(renderer.xr.getReferenceSpace())) posed++;
    if (frame) {
      const hits = frame.getHitTestResults(hitSource);
      const p = hits.length ? hits[0].getPose(renderer.xr.getReferenceSpace()) : null;
      reticle.visible = !!p;
      if (p) reticle.matrix.fromArray(p.transform.matrix);
      reticle.visible = !!p && !st.placed;               // după plasare, cercul nu mai e necesar
      if (!st.placed && !p && performance.now() - st.t0 > 3500) placeGuess(frame);
      // fructul a fost pus „din estimare”, iar acum telefonul a găsit masa: îl așezăm pe ea
      if (st.placed && st.guess && p && !st.dragging) {
        const hp = new THREE.Vector3().setFromMatrixPosition(m4.fromArray(p.transform.matrix));
        if (hp.distanceTo(target) < 1.2) { target.copy(hp); st.guess = false; }
      }
      // mutare cu degetul: fructul merge spre punctul de pe masă / podea de sub deget
      if (st.placed && st.dragging) {
        let q = null;
        if (touchSource) {
          const tr = frame.getHitTestResultsForTransientInput(touchSource);
          const r0 = tr.find(r => r.results.length)?.results[0];
          q = r0 ? r0.getPose(renderer.xr.getReferenceSpace()) : null;
        }
        if (q) { target.setFromMatrixPosition(m4.fromArray(q.transform.matrix)); st.guess = false; }
        else {
          // nicio suprafață sub deget: fructul alunecă pe planul orizontal pe care stă deja
          const src = [...frame.session.inputSources].find(s => s.targetRayMode === "screen");
          const rp = src && frame.getPose(src.targetRaySpace, renderer.xr.getReferenceSpace());
          if (rp) {
            m4.fromArray(rp.transform.matrix); m4.decompose(pos, quat, sc);
            ray.set(pos, new THREE.Vector3(0, 0, -1).applyQuaternion(quat));
            dragPlane.setFromNormalAndCoplanarPoint(up, target);
            if (ray.ray.intersectPlane(dragPlane, dragHit) && dragHit.distanceTo(pos) < 4) target.copy(dragHit);
          }
        }
      }
    }
    pulse.scale.setScalar(1 + (tt % 1.2) / 1.2 * 0.6); pulse.material.opacity = 0.8 * (1 - (tt % 1.2) / 1.2);
    if (st.placed) {
      holder.position.lerp(target, 0.25);
      st.appear = Math.min(1, st.appear + dt / 0.9);
      const e = st.appear, elastic = e >= 1 ? 1 : 1 - Math.pow(2, -10 * e) * Math.cos(e * Math.PI * 4.2);
      st.scale += (st.targetScale - st.scale) * 0.15;
      holder.scale.setScalar(Math.max(0.001, elastic) * st.scale);
      if (st.auto) st.yaw += dt * 0.5;
      spin.rotation.y += (st.yaw - spin.rotation.y) * 0.2;
      play.tumble.position.y = lift() + Math.sin(tt * 1.6) * 0.004 + play.update(dt, 1);   // plutire ușoară + săritura
      orbit.rotation.y = tt * 0.35;
      glowRing.material.opacity = 0.45 + Math.sin(tt * 2.2) * 0.25;
      sprites.forEach(s => { const k = s.userData.nutrient.key === st.picked ? 1.45 : 1; s.scale.x += (0.05 * k - s.scale.x) * 0.2; s.scale.y = s.scale.x * 326 / 256; });
      // numele se întoarce mereu spre copil (doar pe orizontală)
      renderer.xr.getCamera().getWorldPosition(camPos);
      panel.lookAt(camPos.x, holder.position.y + panel.position.y * holder.scale.y, camPos.z);
    }
    renderer.render(scene, camera);
  });

  session.addEventListener("end", () => {
    clearTimeout(watchdog);
    renderer.setAnimationLoop(null);
    try { hitSource.cancel(); } catch {}
    try { touchSource?.cancel(); } catch {}
    ui.close?.removeEventListener("click", onClose);
    ov.removeEventListener("touchstart", onStart); ov.removeEventListener("touchmove", onMove); ov.removeEventListener("touchend", onEnd); ov.removeEventListener("touchcancel", onEnd);
    ov.removeEventListener("beforexrselect", noSelect);
    disposeObject(scene);
    scene.environment?.dispose?.(); pmrem.dispose(); renderer.dispose();
    renderer.domElement.remove();
    if (ui.overlay) { ui.overlay.hidden = true; ui.overlay.style.pointerEvents = ""; ui.overlay.style.touchAction = ""; }
    ui.onEnd?.(failed ? "failed" : "ended");
  });
  return session;
}

/** Cere sesiunea AR. Se apelează DIRECT din atingerea butonului (înainte de orice await), altfel browserul o refuză. */
export function requestARSession(overlay) {
  if (overlay) overlay.hidden = false;
  return navigator.xr.requestSession("immersive-ar", {
    requiredFeatures: ["hit-test"],
    optionalFeatures: ["dom-overlay", "local-floor"],
    domOverlay: { root: overlay }
  });
}
