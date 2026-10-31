// FruitAI — AR spațial cu WebXR (immersive-ar + hit-test).
// Modulul și three.js se încarcă doar când utilizatorul apasă „Plasează în spațiu”.
// Funcționează pe browserele care suportă WebXR AR (ex. Chrome pe Android cu ARCore).

const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js";

export async function isSupported() {
  try { return !!(navigator.xr && await navigator.xr.isSessionSupported("immersive-ar")); }
  catch { return false; }
}

// Desenează eticheta nutrițională pe un canvas, folosit ca textură pe un panou 3D.
function drawLabel(info) {
  const W = 1024, H = 640, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  const rr = (X, Y, w, h, r) => { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); };
  rr(8, 8, W - 16, H - 16, 56);
  x.fillStyle = "rgba(10,13,15,0.88)"; x.fill();
  x.lineWidth = 4; x.strokeStyle = "rgba(255,255,255,0.22)"; x.stroke();
  const sans = "Geist, system-ui, -apple-system, Segoe UI, sans-serif";
  x.fillStyle = "#C9F25C"; x.font = `600 34px ${sans}`; x.fillText("FRUCT IDENTIFICAT", 64, 96);
  x.fillStyle = "#F2F5F3"; x.font = `600 96px ${sans}`; x.fillText(info.name, 60, 200);
  x.fillStyle = "#A3ADA8"; x.font = `500 44px ${sans}`; x.fillText(info.en, 64, 262);
  // vitaminele ca pastile, apoi mineralele
  const pillRow = (items, y, fg, border) => {
    let px = 64;
    x.font = `600 38px ${sans}`;
    for (const t of items) {
      const w = x.measureText(t).width + 48;
      if (px + w > W - 56) break;
      rr(px, y, w, 64, 32); x.fillStyle = "rgba(255,255,255,0.05)"; x.fill();
      x.lineWidth = 3; x.strokeStyle = border; x.stroke();
      x.fillStyle = fg; x.fillText(t, px + 24, y + 45);
      px += w + 14;
    }
  };
  x.fillStyle = "#6E7873"; x.font = `500 30px ${sans}`; x.fillText("VITAMINE", 64, 338);
  pillRow(info.vitamins.length ? info.vitamins.map(v => "Vit. " + v) : ["Fără date"], 356, "#C9F25C", "rgba(201,242,92,0.45)");
  x.fillStyle = "#6E7873"; x.font = `500 30px ${sans}`; x.fillText("MINERALE", 64, 480);
  pillRow(info.minerals.length ? info.minerals : ["Fără date"], 498, "#FFA94D", "rgba(255,169,77,0.45)");
  return c;
}

/**
 * Pornește o sesiune immersive-ar.
 * info: { name, en, vitamins:[...], minerals:[...], tint }
 * ui:   { overlay, msg, hint, close, onEnd }
 */
export async function startSession(info, ui) {
  if (!(await isSupported())) throw new Error("WebXR immersive-ar nu este suportat");
  const THREE = await import(THREE_URL);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local");
  renderer.domElement.style.cssText = "position:fixed;inset:0;z-index:99;";
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334433, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(0.4, 1, 0.3);
  scene.add(sun);

  // Reticul: arată unde a fost găsită o suprafață reală
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.05, 0.065, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xc9f25c, transparent: true, opacity: 0.95 })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  const labelTexture = new THREE.CanvasTexture(drawLabel(info));
  labelTexture.colorSpace = THREE.SRGBColorSpace;
  labelTexture.anisotropy = 4;
  const disposables = [reticle.geometry, reticle.material, labelTexture];

  function makeAnchor() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.06, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x5be3c4, transparent: true, opacity: 0.85 }));
    const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.032, 40, 28), new THREE.MeshStandardMaterial({ color: new THREE.Color(info.tint), roughness: 0.45, metalness: 0.05 }));
    fruit.position.y = 0.045;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.09, 8), new THREE.MeshBasicMaterial({ color: 0xc9f25c }));
    stem.position.y = 0.125;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.256, 0.16), new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true, side: THREE.DoubleSide }));
    panel.position.y = 0.25;
    // vitaminele orbitează în jurul fructului, ca mici sfere cu eticheta lor
    const orbit = new THREE.Group();
    orbit.position.y = 0.045;
    info.vitamins.slice(0, 6).forEach((v, i, arr) => {
      const cv = document.createElement("canvas"); cv.width = cv.height = 128;
      const cx = cv.getContext("2d");
      cx.fillStyle = "rgba(10,13,15,0.85)"; cx.beginPath(); cx.arc(64, 64, 58, 0, Math.PI * 2); cx.fill();
      cx.lineWidth = 6; cx.strokeStyle = "#C9F25C"; cx.stroke();
      cx.fillStyle = "#C9F25C"; cx.font = "700 52px Geist, system-ui, sans-serif"; cx.textAlign = "center"; cx.textBaseline = "middle";
      cx.fillText(v, 64, 68);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      const sp = new THREE.Sprite(mat);
      const ang = i / arr.length * Math.PI * 2;
      sp.position.set(Math.cos(ang) * 0.075, Math.sin(ang * 2) * 0.012, Math.sin(ang) * 0.075);
      sp.scale.setScalar(0.028);
      orbit.add(sp);
      disposables.push(tex, mat);
    });
    g.add(base, fruit, stem, panel, orbit);
    g.userData = { fruit, panel, orbit, t0: performance.now() };
    disposables.push(base.geometry, base.material, fruit.geometry, fruit.material, stem.geometry, stem.material, panel.geometry, panel.material);
    return g;
  }

  // Overlay DOM (dacă browserul îl suportă) pentru instrucțiuni și butonul „Închide”
  if (ui.overlay) ui.overlay.hidden = false;
  let session;
  try {
    session = await navigator.xr.requestSession("immersive-ar", {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ui.overlay ? ["dom-overlay"] : [],
      ...(ui.overlay ? { domOverlay: { root: ui.overlay } } : {})
    });
  } catch (e) {
    renderer.dispose(); renderer.domElement.remove();
    disposables.forEach(d => d.dispose && d.dispose());
    throw e;
  }
  await renderer.xr.setSession(session);

  const viewerSpace = await session.requestReferenceSpace("viewer");
  const hitSource = await session.requestHitTestSource({ space: viewerSpace });
  const anchors = [];
  const camPos = new THREE.Vector3();

  const setMsg = t => { if (ui.msg) ui.msg.textContent = t; };
  setMsg("Mișcă încet telefonul ca să găsesc o suprafață");

  session.addEventListener("select", () => {
    if (!reticle.visible) return;
    const a = makeAnchor();
    a.position.setFromMatrixPosition(reticle.matrix);
    scene.add(a);
    anchors.push(a);
    if (anchors.length > 6) { const old = anchors.shift(); scene.remove(old); }
    if (ui.hint) ui.hint.textContent = `${info.name} plasat. Atinge din nou ca să mai plasezi una.`;
  });

  const onClose = () => session.end().catch(() => {});
  ui.close && ui.close.addEventListener("click", onClose);

  renderer.setAnimationLoop((t, frame) => {
    if (frame) {
      const refSpace = renderer.xr.getReferenceSpace();
      const hits = frame.getHitTestResults(hitSource);
      if (hits.length) {
        const pose = hits[0].getPose(refSpace);
        reticle.visible = !!pose;
        if (pose) reticle.matrix.fromArray(pose.transform.matrix);
        setMsg(reticle.visible ? "Suprafață găsită" : "Caut o suprafață…");
      } else {
        reticle.visible = false;
      }
    }
    renderer.xr.getCamera().getWorldPosition(camPos);
    for (const a of anchors) {
      const { fruit, panel, orbit, t0 } = a.userData;
      const s = (t - t0) / 1000;
      const grow = Math.min(1, s * 3);
      a.scale.setScalar(0.4 + 0.6 * (1 - Math.pow(1 - grow, 3)));
      fruit.rotation.y = s * 0.8;
      orbit.rotation.y = s * 0.6;
      panel.position.y = 0.25 + Math.sin(s * 1.6) * 0.006;
      // panoul se rotește doar pe orizontală, spre utilizator
      const target = new THREE.Vector3(camPos.x, a.position.y + panel.position.y, camPos.z);
      panel.lookAt(target); // țintă la aceeași înălțime → rotație doar pe verticală
    }
    renderer.render(scene, camera);
  });

  session.addEventListener("end", () => {
    renderer.setAnimationLoop(null);
    try { hitSource.cancel(); } catch {}
    ui.close && ui.close.removeEventListener("click", onClose);
    anchors.forEach(a => scene.remove(a));
    disposables.forEach(d => d.dispose && d.dispose());
    renderer.dispose();
    renderer.domElement.remove();
    if (ui.overlay) ui.overlay.hidden = true;
    ui.onEnd && ui.onEnd();
  });

  return session;
}
