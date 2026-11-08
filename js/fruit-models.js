// FruitAI — modelele 3D ale fructelor, construite procedural din catalog.
// Fiecare fruct își ia forma (visual.shape), textura cojii (visual.texture), a doua culoare (visual.color2),
// detaliile (visual.features: codiță, frunză, caliciu, coroană, semințe, solzi…) și felia tăiată (visual.slice)
// din data/fruits.json. Același modul e folosit în ecranul „Descoperă”, în Camera AR și în AR spațial.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

// ---------- Modele reale (fructe scanate 3D, data/models/) ----------
// data/models/index.json spune ce fructe au un model scanat (.glb). Pentru ele, aplicația afișează întâi modelul
// procedural (instant), apoi îl înlocuiește cu cel real imediat ce s-a descărcat. Restul fructelor rămân procedurale.
let REAL = {};
try {
  const r = await fetch(new URL("../data/models/index.json", import.meta.url));
  if (r.ok) REAL = (await r.json()).models || {};
} catch {}
export const hasRealModel = id => !!REAL[id];
/** Adresa modelului scanat (mărime reală, în metri) sau null. */
export const realModelURL = id => REAL[id] ? new URL(`../data/models/${REAL[id].file}`, import.meta.url).href : null;
const gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const realCache = new Map();
/** Descarcă (o singură dată) și pregătește modelul real: centrat, încadrat într-un cub de latură 2, ca cel procedural. */
export function loadRealModel(id) {
  if (!REAL[id]) return Promise.resolve(null);
  if (!realCache.has(id)) realCache.set(id, gltf.loadAsync(new URL(`../data/models/${REAL[id].file}`, import.meta.url).href).then(g => {
    const s = g.scene;
    s.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(s), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    s.position.sub(ctr);
    const k = 2 / Math.max(size.x, size.y, size.z);
    const wrap = new THREE.Group(); wrap.add(s); wrap.scale.setScalar(k);
    s.traverse(o => {
      if (!o.isMesh) return;
      o.userData.shared = true;                       // geometria și texturile sunt refolosite: nu le eliberăm la închidere
      const m = o.material;
      (Array.isArray(m) ? m : [m]).forEach(x => { if (x.map) x.map.anisotropy = 4; x.envMapIntensity = 1; });
    });
    return { node: wrap, bottom: -size.y / 2 * k };
  }).catch(e => { console.warn("Model 3D real:", id, e); return null; }));
  return realCache.get(id);
}

const V = new THREE.Vector3();
const C = c => new THREE.Color(c);
const hex = c => "#" + C(c).getHexString();
const mix = (a, b, t) => "#" + C(a).lerp(C(b), t).getHexString();
const dark = (c, t) => mix(c, "#000000", t);
const light = (c, t) => mix(c, "#ffffff", t);

/** Generator pseudo-aleator determinist (același fruct arată mereu la fel). */
function rng(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const LITE = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;   // telefon: fără „sheen” (cel mai scump efect)
function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; }
function texture(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
const dot = (x, X, Y, r, fill) => { x.fillStyle = fill; x.beginPath(); x.arc(X, Y, r, 0, Math.PI * 2); x.fill(); };
const gray = v => `rgb(${v | 0},${v | 0},${v | 0})`;

// ---------------------------------------------------------------- coaja
/** Textura de culoare + textura de relief pentru coajă, după visual.texture. */
function skin(v, R) {
  const W = 1024, H = 512;
  const [mc, m] = canvas(W, H), [bc, b] = canvas(W, H);
  const c = v.color, c2 = v.color2 || light(c, 0.35);
  m.fillStyle = c; m.fillRect(0, 0, W, H);
  b.fillStyle = gray(128); b.fillRect(0, 0, W, H);
  // variație fină de culoare, pentru toate cojile
  for (let i = 0; i < 2500; i++) { m.fillStyle = `rgba(${R() < .5 ? "0,0,0" : "255,255,255"},${R() * .05})`; m.fillRect(R() * W, R() * H, 6 + R() * 40, 4 + R() * 24); }
  const out = { roughness: 0.38, clearcoat: 0.6, sheen: 0.2, bumpScale: 0.25 };
  const wrapDot = (ctx, X, Y, r, fill) => { dot(ctx, X, Y, r, fill); if (X < r) dot(ctx, X + W, Y, r, fill); if (X > W - r) dot(ctx, X - W, Y, r, fill); };

  switch (v.texture) {
    case "blush": {
      for (const X of [W * 0.28, W * 0.28 + W, W * 0.28 - W]) {
        const g = m.createRadialGradient(X, H * 0.5, 10, X, H * 0.5, H * (v.blush || 0.42));
        g.addColorStop(0, c2); g.addColorStop(0.5, c2 + "99"); g.addColorStop(1, c2 + "00");
        m.fillStyle = g; m.fillRect(0, 0, W, H);
      }
      for (let i = 0; i < 600; i++) wrapDot(m, R() * W, R() * H, 0.8 + R() * 1.6, `rgba(255,240,200,${0.25 + R() * 0.35})`);
      out.roughness = 0.3; out.clearcoat = 0.85; break;
    }
    case "dimpled": {
      for (let i = 0; i < 14000; i++) {
        const X = R() * W, Y = R() * H, r = 1 + R() * 2.4;
        wrapDot(m, X, Y, r, R() < .5 ? dark(c, .12 + R() * .1) : light(c, .1));
        wrapDot(b, X, Y, r, gray(70 + R() * 40));
      }
      out.roughness = 0.42; out.clearcoat = 0.55; out.bumpScale = 0.9; break;
    }
    case "speckled": {
      for (let i = 0; i < 900; i++) {
        const X = R() * W, Y = R() * H;
        m.fillStyle = R() < .7 ? light(c, .45) : dark(c, .35);
        m.beginPath(); m.ellipse(X, Y, 1 + R() * 2.2, 0.8 + R() * 1.4, R() * 3, 0, Math.PI * 2); m.fill();
        wrapDot(b, X, Y, 1.5, gray(165));
      }
      if (v.color2) for (const X of [W * 0.7, W * 0.7 - W]) { const g = m.createRadialGradient(X, H * .45, 10, X, H * .45, H * .6); g.addColorStop(0, c2 + "bb"); g.addColorStop(1, c2 + "00"); m.fillStyle = g; m.fillRect(0, 0, W, H); }
      out.roughness = 0.45; out.clearcoat = 0.35; break;
    }
    case "striped": {
      // dungi ondulate pe meridiane (pepene verde, agrișă)
      m.fillStyle = c2; m.fillRect(0, 0, W, H);
      const n = v.stripes || 16;
      for (let i = 0; i < n; i++) {
        const x0 = (i + 0.5) * W / n, w = W / n * (v.stripeWidth || 0.42);
        m.fillStyle = c; m.beginPath();
        for (let y = 0; y <= H; y += 8) m.lineTo(x0 - w / 2 + Math.sin(y * 0.05 + i) * 9 + (R() - .5) * 8, y);
        for (let y = H; y >= 0; y -= 8) m.lineTo(x0 + w / 2 + Math.sin(y * 0.05 + i + 1) * 9 + (R() - .5) * 8, y);
        m.closePath(); m.fill();
      }
      out.roughness = 0.35; out.clearcoat = 0.7; break;
    }
    case "fuzzy": {
      for (let i = 0; i < 60000; i++) {
        const X = R() * W, Y = R() * H;
        m.fillStyle = R() < .5 ? `rgba(0,0,0,${R() * .12})` : `rgba(255,240,220,${R() * .1})`;
        m.fillRect(X, Y, 1.4, 1.4);
        b.fillStyle = gray(100 + R() * 60); b.fillRect(X, Y, 1.5, 1.5);
      }
      if (v.color2) for (const X of [W * 0.3, W * 0.3 - W, W * 0.3 + W]) { const g = m.createRadialGradient(X, H * .5, 10, X, H * .5, H * .7); g.addColorStop(0, c2 + "dd"); g.addColorStop(1, c2 + "00"); m.fillStyle = g; m.fillRect(0, 0, W, H); }
      out.roughness = 0.85; out.clearcoat = 0; out.sheen = 1; out.bumpScale = 0.35; break;
    }
    case "netted": {
      // plasa pepenelui galben
      const gx = 44, gy = 22, pts = [];
      for (let j = 0; j <= gy; j++) for (let i = 0; i <= gx; i++) pts.push([i * W / gx + (R() - .5) * 16, j * H / gy + (R() - .5) * 14]);
      const P = (i, j) => pts[j * (gx + 1) + i];
      for (const ctx of [m, b]) {
        ctx.strokeStyle = ctx === m ? c2 : gray(210); ctx.lineCap = "round";
        for (let j = 0; j <= gy; j++) for (let i = 0; i <= gx; i++) {
          ctx.lineWidth = 2 + R() * 2.5;
          if (i < gx) { ctx.beginPath(); ctx.moveTo(...P(i, j)); ctx.lineTo(...P(i + 1, j)); ctx.stroke(); }
          if (j < gy && R() < .8) { ctx.beginPath(); ctx.moveTo(...P(i, j)); ctx.lineTo(...P(i, j + 1)); ctx.stroke(); }
        }
      }
      out.roughness = 0.7; out.clearcoat = 0.1; out.bumpScale = 1; break;
    }
    case "bloom": {
      // „pruina”: stratul de praf albăstrui de pe prune, afine, struguri
      for (let i = 0; i < 5000; i++) wrapDot(m, R() * W, R() * H, 2 + R() * 6, `rgba(200,210,235,${0.03 + R() * 0.09})`);
      out.roughness = 0.55; out.clearcoat = 0.25; out.sheen = 0.5; break;
    }
    case "diamond": {
      // solzii ananasului: romburi cu centru maro
      const cols = 18, rows = 12, cw = W / cols, ch = H / rows;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const X = (i + (j % 2) * 0.5) * cw, Y = (j + 0.5) * ch;
        for (const dx of [0, W, -W]) {
          const g = m.createRadialGradient(X + dx, Y, 2, X + dx, Y, cw * 0.62);
          g.addColorStop(0, c2); g.addColorStop(0.3, light(c, .1)); g.addColorStop(0.85, c); g.addColorStop(1, dark(c, .35));
          m.fillStyle = g; m.beginPath(); m.moveTo(X + dx, Y - ch * .55); m.lineTo(X + dx + cw * .55, Y); m.lineTo(X + dx, Y + ch * .55); m.lineTo(X + dx - cw * .55, Y); m.closePath(); m.fill();
          const gb = b.createRadialGradient(X + dx, Y, 2, X + dx, Y, cw * .55); gb.addColorStop(0, gray(230)); gb.addColorStop(1, gray(40));
          b.fillStyle = gb; b.beginPath(); b.moveTo(X + dx, Y - ch * .55); b.lineTo(X + dx + cw * .55, Y); b.lineTo(X + dx, Y + ch * .55); b.lineTo(X + dx - cw * .55, Y); b.closePath(); b.fill();
        }
        dot(m, X, Y, 3, dark(c2, .2));
      }
      out.roughness = 0.6; out.clearcoat = 0.25; out.bumpScale = 1.6; break;
    }
    case "rough": {
      for (let i = 0; i < 9000; i++) {
        const X = R() * W, Y = R() * H, r = 1.5 + R() * 4;
        wrapDot(m, X, Y, r, R() < .5 ? dark(c, .2) : light(c, .12));
        wrapDot(b, X, Y, r, gray(R() < .5 ? 60 : 200));
      }
      out.roughness = 0.75; out.clearcoat = 0.15; out.bumpScale = 1.2; break;
    }
    case "leathery": {
      for (let i = 0; i < 1800; i++) wrapDot(m, R() * W, R() * H, 4 + R() * 14, `rgba(${R() < .5 ? "0,0,0" : "255,220,200"},${R() * .07})`);
      out.roughness = 0.5; out.clearcoat = 0.4; break;
    }
    case "fibrous": {
      // fibrele nucii de cocos
      for (let i = 0; i < 9000; i++) {
        const X = R() * W, Y = R() * H, a = R() * Math.PI, l = 6 + R() * 18;
        for (const ctx of [m, b]) {
          ctx.strokeStyle = ctx === m ? (R() < .5 ? dark(c, .3) : light(c, .25)) : gray(80 + R() * 150);
          ctx.lineWidth = 1 + R() * 1.4; ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + Math.cos(a) * l, Y + Math.sin(a) * l); ctx.stroke();
        }
      }
      out.roughness = 0.95; out.clearcoat = 0; out.bumpScale = 1.4; break;
    }
    case "wrinkled": {
      for (let i = 0; i < 260; i++) {
        let X = R() * W, Y = R() * H;
        for (const ctx of [m, b]) { ctx.strokeStyle = ctx === m ? dark(c, .25) : gray(60); ctx.lineWidth = 2 + R() * 3; }
        m.beginPath(); b.beginPath(); m.moveTo(X, Y); b.moveTo(X, Y);
        for (let k = 0; k < 6; k++) { X += (R() - .5) * 40; Y += (R() - .5) * 26; m.lineTo(X, Y); b.lineTo(X, Y); }
        m.stroke(); b.stroke();
      }
      out.roughness = 0.4; out.clearcoat = 0.6; out.bumpScale = 1; break;
    }
    default: out.roughness = 0.3; out.clearcoat = 0.8;
  }
  return { map: texture(mc), bump: texture(bc, false), ...out };
}

function skinMaterial(v, R) {
  const s = skin(v, R);
  return new THREE.MeshPhysicalMaterial({
    map: s.map, bumpMap: s.bump, bumpScale: s.bumpScale, roughness: s.roughness, metalness: 0,
    clearcoat: s.clearcoat, clearcoatRoughness: 0.25, sheen: LITE ? 0 : s.sheen, sheenColor: C(light(v.color, .5)), sheenRoughness: 0.5
  });
}
const plain = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color: C(color), roughness: o.roughness ?? 0.4, clearcoat: o.clearcoat ?? 0.5, side: o.side ?? THREE.FrontSide });

// ---------------------------------------------------------------- detalii
function leafShape(len, wid) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.bezierCurveTo(wid, len * 0.25, wid * 0.9, len * 0.75, 0, len);
  s.bezierCurveTo(-wid * 0.9, len * 0.75, -wid, len * 0.25, 0, 0);
  return s;
}
function leaf(len = 0.55, wid = 0.22, color = "#4CAF50") {
  const g = new THREE.ExtrudeGeometry(leafShape(len, wid), { depth: 0.012, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2 });
  // ușoară curbură a frunzei
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { V.fromBufferAttribute(p, i); V.z += Math.pow(V.y / len, 2) * len * 0.25 + Math.pow(V.x / wid, 2) * 0.03; p.setXYZ(i, V.x, V.y, V.z); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, plain(color, { roughness: 0.45, clearcoat: 0.4, side: THREE.DoubleSide }));
  // nervura centrală
  const vein = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, len * 0.85, 5), plain(light(color, .35)));
  vein.position.set(0, len * 0.45, 0.03); m.add(vein);
  return m;
}
function stem(len = 0.32, r = 0.045, color = "#6B4423") {
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.02, len * 0.6, 0), new THREE.Vector3(0.09, len, 0));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 12, r, 8), plain(color, { roughness: 0.8, clearcoat: 0 }));
}
function stemLeaf(y, R, v = {}) {
  const g = new THREE.Group();
  const s = stem(); s.position.y = y - 0.04; g.add(s);
  const l = leaf(v.leafWidth ? 0.65 : 0.55, v.leafWidth || 0.22, v.leafColor || "#4CAF50"); l.position.set(0.06, y + 0.12, 0); l.rotation.set(0.3, 0.5 + R() * 0.4, -1.15); g.add(l);
  return g;
}
/** Caliciu: frunzulițe ascuțite așezate în stea (căpșună, curmal japonez, mangostan). */
function calyx(y, n = 7, len = 0.42, color = "#3E9B3A", droop = 0.35) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const l = leaf(len, len * 0.32, color);
    const holder = new THREE.Group(); holder.rotation.y = i / n * Math.PI * 2;
    l.rotation.set(-Math.PI / 2 + droop, 0, 0); holder.add(l); g.add(holder);
  }
  const s = stem(0.22, 0.035, dark(color, .2)); g.add(s);
  g.position.y = y;
  return g;
}
/** Coroana ananasului: frunze lungi, înguste, în trei rânduri. */
function crown(y, R) {
  const g = new THREE.Group();
  [[10, 0.62, 0.65], [8, 0.78, 0.4], [6, 0.9, 0.18]].forEach(([n, len, tilt], k) => {
    for (let i = 0; i < n; i++) {
      const l = leaf(len, 0.13, mix("#3F7F33", "#7FB24A", k / 2));
      const holder = new THREE.Group(); holder.rotation.y = i / n * Math.PI * 2 + k * 0.3 + R() * 0.2;
      l.rotation.set(-tilt - R() * 0.15, 0, 0); holder.add(l); g.add(holder);
    }
  });
  g.position.y = y;
  return g;
}
/** Coronița mică din vârf (afină, rodie). */
function blossom(y, color, size = 0.22, n = 5) {
  const g = new THREE.Group();
  const mat = plain(dark(color, .3), { roughness: 0.6 });
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.75, size * 0.6, size * 0.35, 20, 1, true), mat);
  g.add(ring);
  for (let i = 0; i < n; i++) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(size * 0.28, size * 0.55, 6), mat);
    const a = i / n * Math.PI * 2;
    t.position.set(Math.cos(a) * size * 0.7, size * 0.35, Math.sin(a) * size * 0.7); t.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    g.add(t);
  }
  const hole = new THREE.Mesh(new THREE.CircleGeometry(size * 0.55, 20), plain(dark(color, .65)));
  hole.rotation.x = -Math.PI / 2; hole.position.y = 0.02; g.add(hole);
  g.position.y = y;
  return g;
}
/** Obiecte mici așezate pe suprafață (semințe de căpșună, solzi, țepi), după un profil de rotație. */
function scatter(geo, mat, n, surface, { scale = 1, tiltOut = true, from = 0.06, to = 0.94 } = {}) {
  const inst = new THREE.InstancedMesh(geo, mat, n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const t = from + (to - from) * ((i + 0.5) / n), a = i * 2.399963;
    const { pos, normal } = surface(t, a);
    q.setFromUnitVectors(up, tiltOut ? normal : up);
    s.setScalar(scale * (0.85 + ((i * 7919) % 100) / 330));
    m4.compose(pos, q, s); inst.setMatrixAt(i, m4);
  }
  return inst;
}
// profile de rotație: r(t), y(t), t ∈ [0,1] de jos în sus
const PROFILES = {
  teardrop: t => ({ r: 0.92 * Math.sin(Math.PI * Math.min(1, t * 1.05)) * (1 - 0.48 * Math.pow(t, 1.6)) + 0.02, y: -1 + t * 2.1 }),
  heart: t => ({ r: 0.95 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.9)), 0.8) * (1 - 0.15 * t) + 0.02, y: -1.05 + t * 2 }),   // căpșună
  barrel: t => ({ r: 0.78 * Math.pow(Math.sin(Math.PI * t), 0.32), y: -1.1 + t * 2.2 }),                                                  // ananas
  lemon: t => ({ r: 0.86 * Math.pow(Math.sin(Math.PI * t), 0.75), y: -1.15 + t * 2.3 })
};
function lathe(profile, seg = 72) {
  const pts = [];
  for (let i = 0; i <= 48; i++) { const { r, y } = profile(i / 48); pts.push(new THREE.Vector2(Math.max(0.001, r), y)); }
  const g = new THREE.LatheGeometry(pts, seg); g.computeVertexNormals();
  return g;
}
function onLathe(profile) {
  return (t, a) => {
    const p = profile(t), p2 = profile(Math.min(1, t + 0.01)), dr = p2.r - p.r, dy = p2.y - p.y;
    const n = new THREE.Vector3(Math.cos(a) * dy, -dr, Math.sin(a) * dy).normalize();
    return { pos: new THREE.Vector3(Math.cos(a) * p.r, p.y, Math.sin(a) * p.r), normal: n };
  };
}
const onSphere = (sx = 1, sy = 1) => (t, a) => {
  const y = -1 + 2 * t, rr = Math.sqrt(Math.max(0, 1 - y * y));
  const pos = new THREE.Vector3(Math.cos(a) * rr * sx, y * sy, Math.sin(a) * rr * sx);
  return { pos, normal: new THREE.Vector3(pos.x / (sx * sx), pos.y / (sy * sy), pos.z / (sx * sx)).normalize() };
};
function roundGeo(dent = 0.12) {
  const geo = new THREE.SphereGeometry(1, 96, 64), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    V.fromBufferAttribute(p, i);
    V.y *= 0.94 - Math.pow(Math.abs(V.y), 6) * dent;     // adâncitura de la codiță și de la bază
    p.setXYZ(i, V.x, V.y, V.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------- forme
function bananaGeo(len = 1.25, thick = 0.36) {
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-len, 0.55, 0), new THREE.Vector3(0, -0.75, 0), new THREE.Vector3(len, 0.55, 0));
  const N = 80, M = 5, S = M * 6, pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, P = curve.getPoint(t), T = curve.getTangent(t).normalize();
    const Nn = new THREE.Vector3(0, 0, 1), Bn = new THREE.Vector3().crossVectors(T, Nn).normalize();
    const r = thick * Math.pow(Math.sin(Math.PI * t), 0.55) + 0.03;
    for (let j = 0; j <= S; j++) {
      const a = j / S * Math.PI * 2;
      const ridge = 1 + 0.07 * Math.abs(Math.cos(a * M / 2));         // muchiile cojii de banană
      pos.push(P.x + (Bn.x * Math.cos(a) + Nn.x * Math.sin(a)) * r * ridge, P.y + (Bn.y * Math.cos(a) + Nn.y * Math.sin(a)) * r * ridge, P.z + (Bn.z * Math.cos(a) + Nn.z * Math.sin(a)) * r * ridge);
      uv.push(j / S, t);
    }
  }
  const W = S + 1;
  for (let i = 0; i < N; i++) for (let j = 0; j < S; j++) { const a = i * W + j, b = a + W; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  return { geo, curve };
}

function body(v, R) {
  const f = new Set(v.features || []);
  const g = new THREE.Group();
  const mat = skinMaterial(v, R);
  const add = o => (g.add(o), o);
  switch (v.shape) {
    case "round": case "oval": {
      const m = add(new THREE.Mesh(roundGeo(f.has("nubs") ? 0 : 0.12), mat));
      const sx = v.shape === "oval" ? 0.8 : 1, sy = (v.aspect || 1) * (v.shape === "oval" ? 1.12 : 1);
      m.scale.set(sx, sy, sx);
      if (f.has("nubs")) for (const s of [1, -1]) { const n = add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), mat)); n.scale.set(1, 1.3, 1); n.position.y = s * 0.94 * sy * 0.98; }
      if (f.has("scales")) {
        // solzii fructului dragonului: frunzulițe roz cu vârf verde, ridicate de pe coajă
        const sg = new THREE.ExtrudeGeometry(leafShape(0.5, 0.2), { depth: 0.02, bevelEnabled: false });
        const cols = new Float32Array(sg.attributes.position.count * 3), a = C(v.color), b2 = C(v.spikeColor || "#8BC34A");
        for (let i = 0; i < sg.attributes.position.count; i++) { const t = Math.min(1, Math.max(0, sg.attributes.position.getY(i) / 0.5)); const cc = a.clone().lerp(b2, Math.pow(t, 1.6)); cols.set([cc.r, cc.g, cc.b], i * 3); }
        sg.setAttribute("color", new THREE.BufferAttribute(cols, 3)); sg.rotateX(-0.9);
        add(scatter(sg, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, clearcoat: 0.6, side: THREE.DoubleSide }), 46, onSphere(sx * 0.97, sy * 0.97), { from: 0.08, to: 0.97 }));
      }
      if (f.has("calyx")) add(calyx(0.9 * sy, 5, 0.46, v.calyxColor || "#4F7A2A", 1.2));
      else if (f.has("blossom")) add(blossom(0.93 * sy, v.color, 0.24));
      else if (f.has("stem") || f.has("leaf")) add(f.has("leaf") ? stemLeaf(0.86 * sy, R, v) : (() => { const s = stem(0.28); s.position.y = 0.82 * sy; return s; })());
      if (v.shape === "oval") g.rotation.z = -0.22;
      return { g, surface: onSphere(sx, sy) };
    }
    case "teardrop": {
      const prof = f.has("seeds") ? PROFILES.heart : PROFILES.teardrop;
      add(new THREE.Mesh(lathe(prof), mat));
      if (f.has("seeds")) add(scatter(new THREE.SphereGeometry(0.035, 8, 6), plain("#F5D76E", { roughness: 0.3, clearcoat: 1 }), 160, onLathe(prof), { from: 0.04, to: 0.86 }));
      const top = prof(1).y;
      if (f.has("calyx")) add(calyx(top - 0.02, 8, 0.42, v.calyxColor || "#3E9B3A", 0.15));
      else if (f.has("leaf")) add(stemLeaf(top - 0.02, R, v));
      else if (f.has("stem")) { const s = stem(0.3); s.position.y = top - 0.04; add(s); }
      if (f.has("pit-bottom")) { const p = add(new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), plain(dark(v.color, .5)))); p.rotation.x = Math.PI / 2; p.position.y = -0.995; }
      return { g, surface: onLathe(prof) };
    }
    case "elongated": {
      const { geo } = bananaGeo(v.aspect ? 1.25 * v.aspect : 1.25);
      const one = () => {
        const b = new THREE.Group();
        b.add(new THREE.Mesh(geo, mat));
        const tipMat = plain(v.color2 || "#3B2A1A", { roughness: 0.8, clearcoat: 0 });
        const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.26, 8), tipMat); tip.position.set(1.32, 0.68, 0); tip.rotation.z = -0.9; b.add(tip);
        const end = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), tipMat); end.position.set(-1.27, 0.6, 0); b.add(end);
        return b;
      };
      if (f.has("bunch")) {
        // o mână de 3 banane, prinse la același cotor
        for (let i = 0; i < 3; i++) { const b = one(); b.position.set(0, -i * 0.1, (i - 1) * 0.42); b.rotation.set((i - 1) * 0.28, (i - 1) * -0.15, 0); g.add(b); }
        const crownStem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.3, 10), plain("#5E6B2A", { roughness: 0.7 }));
        crownStem.position.set(1.42, 0.72, 0); crownStem.rotation.z = -0.9; g.add(crownStem);
      } else g.add(one());
      return { g, surface: null };
    }
    case "cluster": {
      if (f.has("pair")) {
        // două cireșe legate de aceeași codiță
        const geo = roundGeo(0.18);
        [[-0.48, -0.25, 0.05], [0.42, -0.4, -0.1]].forEach(([x, y, z], i) => {
          const m = add(new THREE.Mesh(geo, mat)); m.scale.setScalar(0.55); m.position.set(x, y, z);
          const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, y + 0.5, z), new THREE.Vector3(x * 0.4, y + 1.2, z), new THREE.Vector3(0.05, 1.25, 0));
          add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.025, 6), plain("#5E7A2A", { roughness: 0.7 })));
        });
        const l = add(leaf(0.6, 0.22)); l.position.set(0.05, 1.22, 0); l.rotation.set(0.2, 0.6, -0.6);
        return { g, surface: null };
      }
      if (f.has("berries")) {
        // câteva bace libere (afine, merișoare, coacăze)
        const geo = roundGeo(0.06), spots = [[0, -0.35, 0.1], [-0.55, -0.4, -0.2], [0.52, -0.42, -0.15], [-0.25, 0.05, -0.15], [0.28, 0.02, 0.05], [0.0, -0.3, -0.55], [-0.05, 0.42, -0.05]];
        spots.forEach(([x, y, z], i) => {
          const b = new THREE.Group(); b.position.set(x, y, z); b.rotation.set(R() * 0.8, R() * 6, R() * 0.8);
          const m = new THREE.Mesh(geo, mat); m.scale.setScalar(0.42); b.add(m);
          if (f.has("blossom")) b.add(blossom(0.38, v.color, 0.12));
          g.add(b);
        });
        if (f.has("stem")) { const s = stem(0.5, 0.02, "#5E7A2A"); s.position.set(-0.05, 0.6, -0.05); add(s); }
        return { g, surface: null };
      }
      // ciorchine (struguri, longan)
      const geo = roundGeo(0.04), rows = [4, 4, 3, 3, 2, 1];
      let y = 0.75;
      rows.forEach((n, r) => {
        const rad = 0.08 + n * 0.12, k = n * 2 - (r % 2);
        for (let i = 0; i < k; i++) {
          const a = i / k * Math.PI * 2 + r * 0.6, m = add(new THREE.Mesh(geo, mat));
          m.position.set(Math.cos(a) * rad, y + (R() - 0.5) * 0.06, Math.sin(a) * rad);
          m.scale.set(0.3, 0.33, 0.3).multiplyScalar(0.92 + R() * 0.14); m.rotation.set(R() * 3, R() * 3, 0);
        }
        y -= 0.33;
      });
      const s = add(stem(0.5, 0.04, "#6B5A2A")); s.position.y = 0.95;
      if (f.has("leaf")) { const l = add(leaf(0.85, 0.42, "#5DA04A")); l.position.set(0.05, 1.15, 0); l.rotation.set(0.4, 0.3, -1.25); }
      return { g, surface: null };
    }
    case "drupelets": {
      const core = add(new THREE.Mesh(new THREE.SphereGeometry(0.8, 32, 24), plain(dark(v.color, .35))));
      core.scale.set(0.92, v.aspect ? 1.1 * v.aspect : 1.1, 0.92);
      const surf = onSphere(0.88, v.aspect ? 1.05 * v.aspect : 1.05);
      add(scatter(new THREE.SphereGeometry(0.19, 20, 14), mat, 160, surf, { tiltOut: false }));
      if (f.has("calyx")) add(calyx(1.0 * (v.aspect || 1), 6, 0.3, "#5E8A3A", 0.8));
      return { g, surface: surf };
    }
    case "spiky": {
      if (v.texture === "diamond") {
        // ananasul: corp de butoiaș cu solzi + coroană
        const b = add(new THREE.Mesh(lathe(PROFILES.barrel), mat)); b.scale.set(1.12, 1, 1.12);
        if (f.has("crown")) add(crown(1.0, R));
        return { g, surface: onLathe(PROFILES.barrel) };
      }
      const sy = v.aspect || 1.12;
      const m = add(new THREE.Mesh(roundGeo(0.05), mat)); m.scale.set(0.9, 0.9 * sy, 0.9);
      const surf = onSphere(0.88, 0.88 * sy);
      const kind = v.spikes || "cones";
      const spikeMat = plain(v.spikeColor || dark(v.color, .18), { roughness: 0.6, clearcoat: 0.2 });
      const spec = { cones: [new THREE.ConeGeometry(0.075, 0.24, 7), 170], bumps: [new THREE.ConeGeometry(0.07, 0.09, 6), 420], hairs: [new THREE.ConeGeometry(0.022, 0.32, 5), 240], soft: [new THREE.ConeGeometry(0.035, 0.14, 6), 110] }[kind];
      add(scatter(spec[0], spikeMat, spec[1], surf, { from: 0.02, to: 0.98 }));
      if (f.has("stem")) { const s = add(stem(0.25, 0.06)); s.position.y = 0.88 * sy; }
      return { g, surface: surf };
    }
    case "star": {
      const s = new THREE.Shape();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.5 : 1.1; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      const geo = new THREE.ExtrudeGeometry(s, { depth: 1.1, bevelEnabled: true, bevelThickness: 0.22, bevelSize: 0.16, bevelSegments: 8, curveSegments: 6 });
      geo.center();
      // capetele se îngustează, ca la o carambolă întreagă
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { V.fromBufferAttribute(p, i); const k = 1 - Math.pow(Math.abs(V.z) / 1.05, 2.4) * 0.55; p.setXYZ(i, V.x * k, V.y * k, V.z); }
      geo.computeVertexNormals();
      const m = add(new THREE.Mesh(geo, mat)); m.scale.setScalar(0.85);
      g.rotation.set(0.45, 0.75, 0.1);        // vedere din trei sferturi: se vede steaua
      return { g, surface: null };
    }
  }
  return body({ ...v, shape: "round" }, R);
}

// ---------------------------------------------------------------- felia tăiată
function sliceTexture(v, R) {
  const S = 512, [cv, x] = canvas(S, S), cx = S / 2, rad = S / 2 - 4;
  const flesh = v.flesh || light(v.color, .4), rind = v.color;
  const ring = (r, fill) => dot(x, cx, cx, r, fill);
  switch (v.slice) {
    case "citrus": {
      ring(rad, rind); ring(rad * 0.9, "#FFF6E0");
      const n = 11;
      for (let i = 0; i < n; i++) {
        const a0 = i / n * Math.PI * 2 + 0.03, a1 = (i + 1) / n * Math.PI * 2 - 0.03;
        const g = x.createRadialGradient(cx, cx, rad * 0.1, cx, cx, rad * 0.86); g.addColorStop(0, light(flesh, .25)); g.addColorStop(1, flesh);
        x.fillStyle = g; x.beginPath(); x.moveTo(cx + Math.cos((a0 + a1) / 2) * rad * 0.1, cx + Math.sin((a0 + a1) / 2) * rad * 0.1);
        x.arc(cx, cx, rad * 0.85, a0, a1); x.closePath(); x.fill();
        for (let k = 0; k < 40; k++) { const a = a0 + R() * (a1 - a0), r = rad * (0.2 + R() * 0.6); x.fillStyle = `rgba(255,255,255,${R() * .25})`; x.beginPath(); x.ellipse(cx + Math.cos(a) * r, cx + Math.sin(a) * r, 6, 2, a, 0, Math.PI * 2); x.fill(); }
      }
      ring(rad * 0.08, "#FFF6E0"); break;
    }
    case "greenseeds": {
      ring(rad, rind); const g = x.createRadialGradient(cx, cx, rad * 0.2, cx, cx, rad * 0.95); g.addColorStop(0, light(flesh, .35)); g.addColorStop(1, flesh); ring(rad * 0.95, g);
      for (let i = 0; i < 70; i++) { const a = R() * Math.PI * 2; x.strokeStyle = `rgba(255,255,255,${.15 + R() * .2})`; x.lineWidth = 2; x.beginPath(); x.moveTo(cx + Math.cos(a) * rad * .3, cx + Math.sin(a) * rad * .3); x.lineTo(cx + Math.cos(a) * rad * .9, cx + Math.sin(a) * rad * .9); x.stroke(); }
      x.fillStyle = "#FFFDEB"; x.beginPath(); x.ellipse(cx, cx, rad * 0.24, rad * 0.18, 0.3, 0, Math.PI * 2); x.fill();
      for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2 + R() * .05, r = rad * (0.3 + R() * 0.05); x.fillStyle = "#1A1410"; x.beginPath(); x.ellipse(cx + Math.cos(a) * r, cx + Math.sin(a) * r, 7, 3.2, a, 0, Math.PI * 2); x.fill(); }
      break;
    }
    case "melon": {
      ring(rad, rind); ring(rad * 0.9, v.rindInner || "#E8F5C8");
      const g = x.createRadialGradient(cx, cx, 0, cx, cx, rad * .86); g.addColorStop(0, light(flesh, .15)); g.addColorStop(1, flesh); ring(rad * 0.85, g);
      if (v.seeds === "cavity") { ring(rad * 0.38, dark(flesh, .15)); for (let i = 0; i < 46; i++) { const a = R() * Math.PI * 2, r = rad * R() * 0.32; x.fillStyle = "#EAD9A8"; x.beginPath(); x.ellipse(cx + Math.cos(a) * r, cx + Math.sin(a) * r, 9, 4, a, 0, Math.PI * 2); x.fill(); } }
      else for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2, r = rad * (0.45 + (i % 2) * 0.15); x.fillStyle = "#1A1410"; x.beginPath(); x.ellipse(cx + Math.cos(a) * r, cx + Math.sin(a) * r, 9, 5, a, 0, Math.PI * 2); x.fill(); }
      break;
    }
    case "whiteseeds": {
      ring(rad, rind); ring(rad * 0.93, flesh);
      for (let i = 0; i < 700; i++) { const a = R() * Math.PI * 2, r = Math.sqrt(R()) * rad * 0.88; dot(x, cx + Math.cos(a) * r, cx + Math.sin(a) * r, 2.2, "#141014"); }
      break;
    }
    case "pit": {
      ring(rad, rind); const g = x.createRadialGradient(cx, cx, rad * .2, cx, cx, rad * .95); g.addColorStop(0, light(flesh, .2)); g.addColorStop(.8, flesh); g.addColorStop(1, mix(flesh, "#4E7A2E", .6)); ring(rad * 0.94, g);
      break;
    }
    case "stone": {
      ring(rad, rind); const g = x.createRadialGradient(cx, cx, rad * .2, cx, cx, rad * .95); g.addColorStop(0, mix(flesh, "#D9452B", .45)); g.addColorStop(.45, flesh); g.addColorStop(1, light(flesh, .1)); ring(rad * 0.95, g);
      x.fillStyle = "#7A4A2A"; x.beginPath(); x.ellipse(cx, cx, rad * 0.26, rad * 0.34, 0.2, 0, Math.PI * 2); x.fill();
      break;
    }
    case "arils": {
      ring(rad, rind); ring(rad * 0.9, "#F7E7D0");
      for (let i = 0; i < 260; i++) { const a = R() * Math.PI * 2, r = Math.sqrt(R()) * rad * 0.84; const X = cx + Math.cos(a) * r, Y = cx + Math.sin(a) * r; dot(x, X, Y, 11, flesh); dot(x, X - 3, Y - 3, 3.5, "rgba(255,255,255,.6)"); }
      break;
    }
    case "seedcenter": {
      ring(rad, rind); ring(rad * 0.93, flesh);
      x.fillStyle = dark(flesh, .15); x.beginPath();
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, r = i % 2 ? rad * 0.18 : rad * 0.34; x.lineTo(cx + Math.cos(a) * r, cx + Math.sin(a) * r); }
      x.closePath(); x.fill();
      for (let i = 0; i < 90; i++) { const a = R() * Math.PI * 2, r = R() * rad * 0.28; dot(x, cx + Math.cos(a) * r, cx + Math.sin(a) * r, 5, v.seedColor || "#1A1410"); }
      break;
    }
    case "pulp": {
      ring(rad, rind); ring(rad * 0.88, "#F5ECD8"); ring(rad * 0.8, flesh);
      for (let i = 0; i < 120; i++) { const a = R() * Math.PI * 2, r = Math.sqrt(R()) * rad * 0.72; dot(x, cx + Math.cos(a) * r, cx + Math.sin(a) * r, 6, "#1A1410"); dot(x, cx + Math.cos(a) * r - 2, cx + Math.sin(a) * r - 2, 2, "rgba(255,255,255,.5)"); }
      break;
    }
    case "cream": {
      ring(rad, rind); ring(rad * 0.86, flesh); ring(rad * 0.62, "rgba(235,245,255,0.95)");
      break;
    }
    default: ring(rad, rind); ring(rad * 0.92, flesh);
  }
  return texture(cv);
}
function sliceMesh(v, R) {
  const top = new THREE.MeshPhysicalMaterial({ map: sliceTexture(v, R), roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const side = plain(v.color, { roughness: 0.5 }), bottom = plain(v.flesh || light(v.color, .4));
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.13, 64), [side, top, bottom]);
  const g = new THREE.Group(); g.add(m);
  if (v.slice === "pit") { const pit = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), plain("#7A4A2A", { roughness: 0.35, clearcoat: 0.9 })); pit.position.y = 0.065; g.add(pit); }
  return g;
}

// ---------------------------------------------------------------- API
/**
 * Construiește modelul unui fruct din catalog, normalizat la o sferă de rază 1 centrată în origine.
 * Felia (dacă există) se adaugă alături, în fața fructului.
 */
export function buildFruitModel(fruit, { slice = false } = {}) {   // felia din interior: doar la cerere
  const v = { ...fruit.visual };
  const R = rng(fruit.id);
  const { g } = body(v, R);
  const root = new THREE.Group();
  root.add(g);
  const box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  g.position.sub(ctr);
  const k = 2 / Math.max(size.x, size.y, size.z);
  root.scale.setScalar(k);
  const out = new THREE.Group();
  out.add(root);
  if (slice && v.slice) {
    const s = sliceMesh(v, R);
    s.position.set(0.98, -0.66, 0.62); s.rotation.set(1.05, 0.25, -0.12); s.scale.setScalar(0.92);
    out.add(s);
  }
  out.userData = { fruitId: fruit.id, hasSlice: !!(slice && v.slice), bottom: -size.y / 2 * k, real: false };
  // există un model scanat? îl punem în locul celui procedural de îndată ce s-a descărcat
  out.userData.ready = !REAL[fruit.id] ? Promise.resolve(out) : loadRealModel(fruit.id).then(r => {
    if (!r || out.userData.disposed) return out;
    out.clear();
    disposeObject(root);
    out.add(r.node.clone(true));
    out.userData.bottom = r.bottom; out.userData.real = true; out.userData.hasSlice = false;
    out.dispatchEvent({ type: "real" });
    return out;
  });
  return out;
}

export function disposeObject(obj) {
  obj.userData.disposed = true;
  obj.traverse(o => {
    if (o.userData.shared) return;                    // model scanat, refolosit din memorie
    o.geometry?.dispose?.();
    const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach(x => { x.map?.dispose?.(); x.bumpMap?.dispose?.(); x.dispose?.(); });
  });
}
