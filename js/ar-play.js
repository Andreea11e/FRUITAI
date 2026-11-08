// FruitAI — joaca cu fructul pus lângă tine (comun pentru AR-ul cu ARCore și pentru varianta cu camera + giroscop):
//  • două degete trase împreună: fructul se rostogolește în orice direcție, și cu susul în jos;
//  • o atingere pe fruct: sare în aer, face o tumbă și aterizează, cu o ploaie de steluțe colorate.
import * as THREE from "three";

/**
 * Inserează între `spin` și `model` două grupuri: `tumble` (rotirea făcută de copil) și `flip` (tumba din săritură).
 * R = raza fructului (m); lift() = înălțimea centrului fructului deasupra mesei.
 */
export function createPlay({ spin, model, R, color, lift, sound }) {
  const tumble = new THREE.Group(), flip = new THREE.Group();
  spin.remove(model); spin.add(tumble); tumble.add(flip); flip.add(model);
  model.position.set(0, 0, 0);

  // steluțele de la săritură
  const tex = starTexture();
  const base = new THREE.Color(color);
  const N = 26, stars = [];
  const burst = new THREE.Group(); spin.parent.add(burst);
  for (let i = 0; i < N; i++) {
    const c = i % 3 === 0 ? new THREE.Color(0xFFE27A) : i % 3 === 1 ? base.clone().lerp(new THREE.Color(0xffffff), 0.35) : new THREE.Color(0x8EF0C9);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: c, transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending }));
    s.visible = false; burst.add(s); stars.push({ s, v: new THREE.Vector3(), life: 0 });
  }

  const st = { jump: 0, jumping: false };
  const qTmp = new THREE.Quaternion(), qInv = new THREE.Quaternion(), axis = new THREE.Vector3();

  return {
    tumble,
    /** Rostogolire cu două degete: dx, dy în pixeli; camQ = orientarea camerei (pentru „sus/jos” față de copil). */
    roll(dx, dy, camQ) {
      qInv.copy(spin.getWorldQuaternion(new THREE.Quaternion())).invert();
      // stânga/dreapta: în jurul verticalei; sus/jos: în jurul axei „dreapta” a camerei → peste cap
      axis.set(0, 1, 0).applyQuaternion(qInv); qTmp.setFromAxisAngle(axis, dx * 0.012); tumble.quaternion.premultiply(qTmp);
      axis.set(1, 0, 0).applyQuaternion(camQ); axis.y = 0;
      if (axis.lengthSq() < 1e-4) axis.set(1, 0, 0);
      axis.normalize().applyQuaternion(qInv); qTmp.setFromAxisAngle(axis, dy * 0.012); tumble.quaternion.premultiply(qTmp);
    },
    reset() { tumble.quaternion.identity(); },
    /** A atins fructul? (rază din punctul atins) */
    hits(raycaster) {
      // ținta e mereu modelul de acum (cel realist îl înlocuiește pe cel desenat după ce se descarcă)
      const meshes = []; model.traverseVisible(o => { if (o.isMesh) meshes.push(o); });
      model.updateMatrixWorld(true);
      if (raycaster.intersectObjects(meshes, false).length) return true;
      // atingere „aproape” de fruct (degetul acoperă fructul mic): sfera din jurul lui
      const box = new THREE.Box3().setFromObject(model), sph = box.getBoundingSphere(new THREE.Sphere());
      sph.radius *= 1.25;
      return !box.isEmpty() && raycaster.ray.intersectsSphere(sph);
    },
    /** Săritura cu tumbă + steluțe. */
    jump() {
      if (st.jumping) return;
      st.jumping = true; st.jump = 0;
      sound?.discover?.();
      const origin = new THREE.Vector3(); spin.getWorldPosition(origin);
      origin.y += lift() + R;
      stars.forEach((p, i) => {
        const a = (i / N) * Math.PI * 2, up = 0.6 + Math.random() * 0.9;
        p.v.set(Math.cos(a) * (0.35 + Math.random() * 0.4), up, Math.sin(a) * (0.35 + Math.random() * 0.4)).multiplyScalar(R * 6);
        p.s.position.copy(origin); burst.worldToLocal(p.s.position);
        p.life = 1; p.s.visible = true; p.s.material.opacity = 1;
      });
    },
    /** Se apelează la fiecare cadru; întoarce înălțimea suplimentară a fructului (săritura). */
    update(dt, scale = 1) {
      let h = 0;
      if (st.jumping) {
        st.jump = Math.min(1, st.jump + dt / 1.1);
        const p = st.jump;
        h = Math.sin(Math.PI * p) * R * 3.2;                                   // sus și înapoi jos
        flip.rotation.x = -easeInOut(Math.min(1, p * 1.15)) * Math.PI * 2;     // tumba
        const sq = p > 0.92 ? 1 - Math.sin((p - 0.92) / 0.08 * Math.PI) * 0.12 : 1;   // mică „turtire” la aterizare
        flip.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
        if (p >= 1) { st.jumping = false; flip.rotation.x = 0; flip.scale.set(1, 1, 1); }
      }
      stars.forEach(p => {
        if (p.life <= 0) return;
        p.life -= dt / 1.3;
        p.v.y -= 9.8 * R * 1.2 * dt;
        p.s.position.addScaledVector(p.v, dt);
        p.s.material.opacity = Math.max(0, p.life);
        p.s.scale.setScalar(R * 0.32 * scale * (0.5 + p.life * 0.7));
        if (p.life <= 0) p.s.visible = false;
      });
      return h;
    },
    dispose() { burst.parent?.remove(burst); tex.dispose(); stars.forEach(p => p.s.material.dispose()); }
  };
}

const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

function starTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.25, "rgba(255,255,255,.9)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  // o steluță în patru colțuri peste strălucire
  x.fillStyle = "rgba(255,255,255,.95)"; x.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 6 : 30; x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
  x.closePath(); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
