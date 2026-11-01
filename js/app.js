import { loadCatalog } from "./catalog.js";
import { fruitArt, orbGradient } from "./fruit-art.js";
import { mountCatalogUI } from "./catalog-ui.js";
import { initDiscovery, openDiscovery, collection, MASCOT } from "./discovery.js";
import { showReveal, hideReveal, revealBusy } from "./reveal.js";
import { t, tf, initI18n, setLang, getLang } from "./i18n.js";
import { initGame } from "./game.js";
import { sound } from "./sound.js";


// ---------------- Configurare (ca în main.py) ----------------
const CLIP_NAME = "Xenova/clip-vit-base-patch32";
const DETECTOR_NAME = "Xenova/owlvit-base-patch32";
const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2";
const CHECK_INTERVAL = 800;     // ms între analize în modul live
const RESULT_TTL = 4000;        // ms cât rămâne valabil un rezultat live
const DETECT_THRESHOLD = 0.10;
const FRUIT_MIN_SCORE = 0.30;
const FULLFRAME_MIN_SCORE = 0.60;
const NONFRUIT_FULL_MIN = 0.25;
// Pragurile senzorilor ambientali (calibrate pe cadre reduse la 160×120)
const AMB = { dark: 0.16, bright: 0.84, blurry: 0.0009, moving: 0.045, still: 0.012, near: 0.62, far: 0.05 };
const SKIP_MAX = 2400;          // ms maxim fără o analiză nouă când scena e nemișcată

// Datele despre fructe NU stau aici: vin din catalog (data/*.json, prin js/catalog.js).
let catalog = null;
const fruitName = id => (getLang() === "en" ? catalog.get(id)?.en : catalog.get(id)?.ro) ?? id;
const nfText = label => catalog.nonFruitText(label, getLang());
const fruitEn = id => catalog.get(id)?.en ?? id;

// ---------------- Elemente ----------------
const $ = id => document.getElementById(id);
const el = {
  dot:$("dot"), status:$("status"), stage:$("stage"), video:$("video"), frame:$("frame"), empty:$("empty"),
  emptyTitle:$("emptyTitle"), emptyText:$("emptyText"), scan:$("scan"),
  live:$("live"), progress:$("progress"), progText:$("progText"), progBar:$("progBar"),
  btnCamera:$("btnCamera"), btnCapture:$("btnCapture"), btnXR:$("btnXR"), fileCam:$("fileCam"), fileUp:$("fileUp"), hint:$("hint"),
  rTop:$("rTop"), roName:$("roName"), enName:$("enName"), msg:$("msg"),
  recent:$("recent"), recentEmpty:$("recentEmpty"),
  recentCount:$("recentCount"), facts:$("facts"), btnSheet:$("btnSheet"), rArt:$("rArt"), vitList:$("vitList"), minList:$("minList"), desc:$("desc"), fact:$("fact"),
  engineNote:$("engineNote"), ar:$("ar"), btnImm:$("btnImm"), btnExitImm:$("btnExitImm"), btnImmShot:$("btnImmShot"),
  hud:$("hud"), hudLight:$("hudLight"), hudLightDot:$("hudLightDot"), hudSharp:$("hudSharp"), hudSharpDot:$("hudSharpDot"),
  hudDistChip:$("hudDistChip"), hudDist:$("hudDist"), hudDistDot:$("hudDistDot"), guide:$("guide")
};

const state = {
  engine: null,          // "claude" | "local" | "none"
  sample: null,
  live: false,
  stream: null,
  busy: false,
  result: null,          // {kind,label,score,box,time}
  shownFruit: null,
  example: true,
  recent: [],
  ambient: { light: null, sharp: null, motion: null, area: null },
  lastModelRun: 0,
  xrSupported: false,
  xrActive: false
};
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function setStatus(text, kind) {
  el.status.textContent = text;
  el.dot.className = "dot" + (kind ? " " + kind : "");
}
const fmt = v => {
  if (v == null) return "—";
  const r = v >= 100 ? Math.round(v) : v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100;
  return r.toLocaleString("ro-RO");
};
const title = s => s.replace(/\b\w/g, c => c.toUpperCase());
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------- Panoul de rezultat: română → engleză → vitamine ----------------
const vitShort = v => v.replace(/\s*\(.*\)$/, "");          // „B9 (folat)” → „B9”
function pills(list, cls, fmtLabel) {
  if (!list.length) { const s = document.createElement("span"); s.textContent = "Fără date"; return [s]; }
  return list.map(v => { const s = document.createElement("span"); s.className = cls; s.textContent = fmtLabel(v); return s; });
}

function setTop(tagText, tagClass, note) {
  el.rTop.innerHTML = "";
  const t = document.createElement("span");
  t.className = "tag" + (tagClass ? " " + tagClass : "");
  t.textContent = tagText;
  el.rTop.append(t, document.createTextNode(" " + (note || "")));
}

function showFruitCard(fruit, opts = {}) {
  state.shownFruit = fruit;
  const f = catalog.get(fruit);
  el.roName.textContent = f.ro;
  el.enName.innerHTML = "English: <b></b>";
  el.enName.querySelector("b").textContent = f.en;
  el.msg.hidden = true;
  setTop(opts.chipText || "Identificat", opts.tagClass || (opts.chipText === "Catalog" ? "cat" : opts.chipText === "Exemplu" ? "" : "ok"), opts.note);
  // totul vine din aceeași înregistrare de catalog
  el.rArt.innerHTML = fruitArt(f, { size: 68 });
  el.rArt.hidden = false;
  const I = catalog.info, en = getLang() === "en";
  el.vitList.replaceChildren(...pills(f.vitamins, "v", v => en ? (I?.vitamins[v]?.title_en || "Vitamin " + v) : "Vitamina " + v));
  el.minList.replaceChildren(...pills(f.minerals, "m", m => en ? (I?.minerals[m]?.title_en || m) : cap(m)));
  el.desc.textContent = tf(f, "description");
  el.fact.textContent = tf(f, "fact");
  el.facts.hidden = false;
  updateXRButton();
}

function showMessageCard(kind, label) {
  setTop(kind === "notfruit" ? "Nu e fruct" : "Nesigur", "bad");
  el.facts.hidden = true;
  el.rArt.hidden = true;
  el.msg.hidden = false;
  if (kind === "notfruit") {
    el.roName.textContent = "Acesta nu este un fruct";
    el.enName.textContent = t("Văd: {x}", { x: nfText(label) });
    el.msg.innerHTML = "<b>Sfat:</b> ține fructul mai aproape de cameră, să ocupe o bună parte din cadru.";
  } else {
    el.roName.textContent = "Nu văd niciun fruct";
    el.enName.textContent = "Nu sunt sigur ce este în imagine.";
    el.msg.innerHTML = "<b>Sfat:</b> folosește lumină bună și un fundal simplu.";
  }
  updateXRButton();
}

// ---------------- Stratul AR: câte o ancoră pentru fiecare obiect detectat ----------------
// Fiecare ancoră = încadrare + etichetă (română, engleză, vitamine) + vitaminele „pe orbită” în jurul fructului.
const anchors = new Map();   // cheie → ancoră
let arRaf = 0;

function mediaRect() {
  const media = state.live ? { w: el.video.videoWidth, h: el.video.videoHeight } : { w: el.frame.width, h: el.frame.height };
  if (!media.w || !media.h) return null;
  const sw = el.stage.clientWidth, sh = el.stage.clientHeight;
  const s = Math.min(sw / media.w, sh / media.h);
  const dw = media.w * s, dh = media.h * s;
  return { sw, sh, dw, dh, ox: (sw - dw) / 2, oy: (sh - dh) / 2 };
}

function createAnchor() {
  const root = document.createElement("div");
  root.className = "anchor";
  root.innerHTML = `<svg class="ar-link"><line/><circle r="3"/></svg>
    <div class="ar-frame"><i></i><i></i><i></i><i></i><span class="core"></span></div>
    <div class="ar-orbit"></div>
    <button type="button" class="ar-card"><span class="k"></span><span class="nm"></span><span class="sub"></span><span class="vit"></span><span class="tap">Atinge pentru fișa completă</span></button>`;
  el.ar.appendChild(root);
  const a = { root, frame: root.querySelector(".ar-frame"), orbit: root.querySelector(".ar-orbit"), card: root.querySelector(".ar-card"),
    line: root.querySelector("line"), dot: root.querySelector("circle"), cur: null, target: null, id: null, kind: null };
  a.card.addEventListener("click", () => { if (a.kind === "fruit") openDiscovery(a.id, { source: "scan" }); });
  return a;
}

function fillAnchor(a, item, primary) {
  a.id = item.label; a.kind = item.kind;
  a.root.classList.toggle("bad", item.kind !== "fruit");
  a.root.classList.toggle("secondary", !primary);
  const q = sel => a.card.querySelector(sel);
  if (item.kind === "fruit") {
    const f = catalog.get(item.label);
    q(".k").textContent = primary ? "Fruct identificat" : "Încă un fruct";
    q(".nm").textContent = f.ro;
    q(".sub").textContent = f.en;
    q(".vit").replaceChildren(...pills(f.vitamins, "", v => "Vitamina " + v));
    q(".vit").hidden = false; q(".tap").hidden = false;
    a.card.setAttribute("aria-label", `${f.ro}, ${f.en}. Deschide fișa completă`);
    a.card.style.setProperty("--c", f.visual.color);
    // vitaminele plutesc în jurul fructului, pe o elipsă
    const vit = f.vitamins.map(vitShort).slice(0, 6);
    a.orbit.replaceChildren(...vit.map((v, i) => {
      const ang = -Math.PI / 2 + (i / Math.max(1, vit.length)) * Math.PI * 2 + (primary ? 0 : .4);
      const b = document.createElement("span");
      b.textContent = v;
      b.style.left = (50 + Math.cos(ang) * 58) + "%";
      b.style.top = (50 + Math.sin(ang) * 58) + "%";
      b.style.animationDelay = (i * .35) + "s";
      return b;
    }));
  } else {
    q(".k").textContent = "Detectat";
    q(".nm").textContent = "Nu este un fruct";
    q(".sub").textContent = cap(nfText(item.label));
    q(".vit").hidden = true; q(".tap").hidden = true;
    a.card.removeAttribute("aria-label");
    a.orbit.replaceChildren();
  }
}

/** Primește rezultatul (fructul principal + celelalte) și sincronizează ancorele. */
function setAnchors(result) {
  const items = [];
  if (result && result.box && (result.kind === "fruit" || result.kind === "notfruit")) items.push({ key: "p", kind: result.kind, label: result.label, box: result.box });
  if (result && result.kind === "fruit") (result.others || []).forEach((o, i) => o.box && items.push({ key: "o" + i, kind: "fruit", label: o.label, box: o.box }));
  const keep = new Set(items.map(i => i.key));
  for (const [k, a] of anchors) if (!keep.has(k)) { a.root.remove(); anchors.delete(k); }
  for (const it of items) {
    let a = anchors.get(it.key);
    if (!a) { a = createAnchor(); anchors.set(it.key, a); }
    if (a.id !== it.label || a.kind !== it.kind) fillAnchor(a, it, it.key === "p");
    a.target = it.box;
  }
  el.ar.hidden = items.length === 0;
  el.btnImm.disabled = !(state.live || state.frameShown);
  scheduleAr();
}
const setArTarget = setAnchors;
function scheduleAr() { if (!arRaf) arRaf = requestAnimationFrame(arTick); }

/**
 * Așază etichetele fără să se suprapună între ele și cu fructele.
 * frames: [{x,y,w,h}], sizes: [{w,h}], bounds: {w,h,top,bottom,pad,gap}. Întoarce pozițiile + capetele liniei de ancorare.
 */
function layoutCards(frames, sizes, B) {
  const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const placed = [];
  return frames.map((f, i) => {
    const { w: cw, h: ch } = sizes[i];
    const fx = f.x + f.w / 2, fy = f.y + f.h / 2, g = B.gap;
    const cands = [
      [f.x + f.w + g, fy - ch / 2], [f.x - g - cw, fy - ch / 2],
      [fx - cw / 2, f.y + f.h + g], [fx - cw / 2, f.y - g - ch],
      [fx - cw / 2, B.top], [fx - cw / 2, B.h - ch - B.bottom]
    ];
    let best = null;
    cands.forEach(([x, y], k) => {
      const r = { x: clamp(x, B.pad, Math.max(B.pad, B.w - cw - B.pad)), y: clamp(y, B.top, Math.max(B.top, B.h - ch - B.bottom)), w: cw, h: ch };
      let cost = k * 40;                                        // preferință: dreapta, stânga, dedesubt, deasupra
      frames.forEach((o, j) => { cost += overlap(r, o) * (j === i ? 3 : 2); });
      placed.forEach(o => { cost += overlap(r, o) * 6; });     // etichetele nu au voie să se acopere
      (B.avoid || []).forEach(o => { cost += overlap(r, o) * 6; }); // nici senzorii, ghidajul sau butoanele
      if (!best || cost < best.cost) best = { ...r, cost };
    });
    placed.push(best);
    const ax = clamp(best.x + cw / 2, f.x, f.x + f.w), ay = clamp(best.y + ch / 2, f.y, f.y + f.h);
    return { x: best.x, y: best.y, ax, ay, bx: clamp(ax, best.x, best.x + cw), by: clamp(ay, best.y, best.y + ch) };
  });
}

function obstacles() {
  const sr = el.stage.getBoundingClientRect();
  return [el.hud, el.guide, el.live, el.btnExitImm, el.btnImmShot].filter(n => n && !n.hidden).map(n => {
    const r = n.getBoundingClientRect();
    return { x: r.left - sr.left - 6, y: r.top - sr.top - 6, w: r.width + 12, h: r.height + 12 };
  });
}

function arTick() {
  arRaf = 0;
  if (el.ar.hidden || !anchors.size) return;
  const m = mediaRect();
  if (!m) return;
  let moving = false;
  for (const a of anchors.values()) {
    const [x1, y1, x2, y2] = a.target;
    const t = { x: m.ox + x1 * m.dw, y: m.oy + y1 * m.dh, w: Math.max(28, (x2 - x1) * m.dw), h: Math.max(28, (y2 - y1) * m.dh) };
    if (!a.cur || reduceMotion) a.cur = { ...t };
    else for (const k of ["x", "y", "w", "h"]) {
      const d = t[k] - a.cur[k];
      if (Math.abs(d) > 0.4) { a.cur[k] += d * 0.2; moving = true; } else a.cur[k] = t[k];
    }
    const c = a.cur;
    for (const node of [a.frame, a.orbit]) {
      node.style.transform = `translate(${c.x}px, ${c.y}px)`;
      node.style.width = c.w + "px";
      node.style.height = c.h + "px";
    }
  }
  const list = [...anchors.values()];
  list.forEach(a => a.card.classList.toggle("compact", m.sw < 520 || a.root.classList.contains("secondary")));
  const pos = layoutCards(list.map(a => a.cur), list.map(a => ({ w: a.card.offsetWidth, h: a.card.offsetHeight })), {
    w: m.sw, h: m.sh, pad: 10, gap: 22, top: 10, bottom: 10,
    avoid: obstacles()                                          // senzorii, ghidajul, insigna LIVE, butoanele din ecran complet
  });
  list.forEach((a, i) => {
    const p = pos[i], c = a.cur;
    // ușoară înclinare 3D a etichetei după poziția fructului în cadru (efect de profunzime)
    const tilt = reduceMotion ? 0 : clamp(((c.x + c.w / 2) / m.sw - .5) * -14, -8, 8);
    a.card.style.transform = `translate(${p.x}px, ${p.y}px) perspective(700px) rotateY(${tilt}deg)`;
    a.line.setAttribute("x1", p.ax); a.line.setAttribute("y1", p.ay);
    a.line.setAttribute("x2", p.bx); a.line.setAttribute("y2", p.by);
    a.dot.setAttribute("cx", p.ax); a.dot.setAttribute("cy", p.ay);
  });
  if (moving) scheduleAr();
}
new ResizeObserver(() => { el.stage.style.setProperty("--h", el.stage.clientHeight + "px"); for (const a of anchors.values()) a.cur = null; scheduleAr(); }).observe(el.stage);

// ---------------- AR pe tot ecranul ----------------
function setImmersive(on) {
  el.stage.classList.toggle("immersive", on);
  document.documentElement.classList.toggle("imm-lock", on);
  el.btnExitImm.hidden = el.btnImmShot.hidden = !on;
  if (on && el.stage.requestFullscreen && !document.fullscreenElement) el.stage.requestFullscreen().catch(() => {});
  if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  for (const a of anchors.values()) a.cur = null;
  scheduleAr();
}

// ---------------- Senzori ambientali (calculați din pixelii reali ai cadrului) ----------------
const SENSE_W = 160, SENSE_H = 120;
const senseCanvas = document.createElement("canvas");
senseCanvas.width = SENSE_W; senseCanvas.height = SENSE_H;
const senseCtx = senseCanvas.getContext("2d", { willReadFrequently: true });
let prevLuma = null;

function sense(source, resetMotion) {
  senseCtx.drawImage(source, 0, 0, SENSE_W, SENSE_H);
  const d = senseCtx.getImageData(0, 0, SENSE_W, SENSE_H).data;
  const N = SENSE_W * SENSE_H, g = new Float32Array(N);
  let sum = 0;
  for (let i = 0; i < N; i++) { const v = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255; g[i] = v; sum += v; }
  let lap = 0, n = 0;
  for (let y = 1; y < SENSE_H - 1; y++) for (let x = 1; x < SENSE_W - 1; x++) {
    const i = y * SENSE_W + x, l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - SENSE_W] - g[i + SENSE_W];
    lap += l * l; n++;
  }
  let motion = null;
  if (prevLuma && !resetMotion) { let s = 0; for (let i = 0; i < N; i++) s += Math.abs(g[i] - prevLuma[i]); motion = s / N; }
  prevLuma = resetMotion ? null : g;
  return { light: sum / N, sharp: lap / n, motion };
}

const lvl = {
  light: v => v == null ? null : v < AMB.dark ? ["slabă", "bad"] : v > AMB.bright ? ["foarte puternică", "warn"] : ["bună", "ok"],
  sharp: v => v == null ? null : v < AMB.blurry ? ["neclară", "warn"] : ["clară", "ok"],
  motion: v => v == null ? null : v > AMB.moving ? ["în mișcare", "warn"] : v < AMB.still ? ["nemișcată", "ok"] : ["stabilă", "ok"],
  area: v => v == null ? null : v < AMB.far ? ["prea departe", "warn"] : v > AMB.near ? ["prea aproape", "warn"] : ["bună", "ok"]
};

function renderAmbient() {
  const a = state.ambient;
  const L = lvl.light(a.light), S = lvl.sharp(a.sharp), M = lvl.motion(a.motion), D = lvl.area(a.area);
  // HUD din scenă
  el.hud.hidden = !L;
  if (L) {
    el.hudLight.textContent = L[0]; el.hudLightDot.className = L[1];
    const img = M && M[1] === "warn" ? M : S;
    el.hudSharp.textContent = img ? img[0] : "—"; el.hudSharpDot.className = img ? img[1] : "";
    el.hudDistChip.hidden = !D;
    if (D) { el.hudDist.textContent = D[0]; el.hudDistDot.className = D[1]; }
  }
  // Contrast adaptiv al etichetei AR
  el.stage.classList.toggle("bright", a.light != null && a.light > 0.66);
  // Cardurile din secțiunea „Inteligență ambientală”
  const card = (key, info, value, max, idle) => {
    $("a" + key).textContent = info ? cap(info[0]) : idle;
    $("a" + key + "Dot").className = info ? info[1] : "";
    $("a" + key + "Bar").style.width = info ? clamp(value / max * 100, 2, 100) + "%" : "0%";
  };
  const idle = state.live ? "Se măsoară…" : (state.frameShown ? "—" : "Camera oprită");
  card("Light", L, a.light, 1, idle);
  card("Sharp", S, Math.sqrt(a.sharp || 0), Math.sqrt(0.02), idle);
  card("Motion", M, a.motion || 0, 0.12, state.live ? "Se măsoară…" : "Doar în modul live");
  card("Dist", D, a.area || 0, 1, "Fără fruct în cadru");
  renderGuide();
}

// Ghidaj contextual, în ordinea priorităților
function renderGuide() {
  const a = state.ambient, r = state.result;
  let text = null, ok = false;
  if (!state.live && !state.frameShown) { el.guide.hidden = true; return; }
  if (flow.phase === "remove" || flow.phase === "reveal" || flow.phase === "prepare") { el.guide.hidden = true; return; }
  if (state.busy && !state.live) { el.guide.hidden = true; return; }
  const fruit = r && r.kind === "fruit";
  if (fruit && state.live) { text = "Ține fructul nemișcat o clipă… îl recunosc!"; ok = true; }
  else if (fruit) {
    // Fructul e identificat: sfaturile despre încadrare contează, cele despre calitatea imaginii nu
    if (a.area != null && a.area < AMB.far) text = "Apropie fructul, ocupă prea puțin din cadru.";
    else if (a.area != null && a.area > AMB.near) text = "Depărtează puțin fructul ca să-l văd întreg.";
    else {
      const n = 1 + (r.others || []).length;
      text = (n > 1 ? t("{n} fructe ancorate.", { n }) : t(state.live ? "Fruct ancorat." : "Fruct identificat.")) + " " + t("Atinge o etichetă pentru fișa completă."); ok = true;
    }
  } else if (a.light != null && a.light < AMB.dark) text = state.live ? "Lumina e slabă. Apropie-te de o fereastră sau aprinde o lumină." : "Fotografia e prea întunecată. Încearcă una făcută la lumină.";
  else if (state.live && a.motion != null && a.motion > AMB.moving) text = "Ține camera nemișcată o clipă.";
  else if (a.sharp != null && a.sharp < AMB.blurry) text = state.live ? "Imaginea e neclară. Atinge ecranul ca să focalizezi." : "Fotografia pare neclară. Încearcă una mai focalizată.";
  else if (state.live) text = "Arată-mi un fruct adevărat sau poza unui fruct.";
  else if (r && r.kind === "notfruit") text = "Pune fructul în centrul cadrului, pe un fundal simplu.";
  el.guide.hidden = !text;
  if (text) { el.guide.textContent = text; el.guide.classList.toggle("ok", ok); }
}

function boxArea(box) { return box ? (box[2] - box[0]) * (box[3] - box[1]) : null; }

// ---------------- Aplicarea unui rezultat ----------------
function applyResult(result, thumb) {
  state.result = result;
  state.example = false;
  setArTarget(result);
  state.ambient.area = result.kind === "fruit" && result.box ? boxArea(result.box) : null;
  if (result.kind === "fruit") {
    showFruitCard(result.label, { chip: "ok", chipText: "Identificat", note: state.live ? "în cadrul live" : "în fotografie" });
    setStatus(t("Identificat: {name}", { name: [result.label, ...(result.others || []).map(o => o.label)].map(fruitName).join(", ") }), "ok");
    // colecția de fructe descoperite cu camera
    const isNew = collection.add(result.label);
    (result.others || []).forEach(o => collection.add(o.label));
    window.dispatchEvent(new Event("fruitai:discovered"));
    // la o fotografie încărcată: „Am găsit fructul!” → poza dispare → fructul 3D cu etichetele
    if (!state.live) {
      const id = result.label;
      flow.id = id; flow.isNew = isNew; flow.src = "photo"; flow.score = result.score;
      setFlow("prepare");
      sound.pop();
      clearTimeout(state.discTimer);
      state.discTimer = setTimeout(() => {
        if (state.live || flow.phase !== "prepare" || flow.id !== id) return;
        el.stage.classList.add("photo-out");
        state.discTimer = setTimeout(startReveal, 650);
      }, 1500);
    }
  } else if (result.kind === "notfruit") {
    showMessageCard("notfruit", result.label);
    setStatus(result.box ? t("Nu este un fruct: {x}", { x: nfText(result.label) }) : t("Nu văd niciun fruct, văd {x}", { x: nfText(result.label) }), "err");
  } else {
    showMessageCard("none");
    setStatus(state.live ? "Caut un fruct…" : "Nu văd niciun fruct", state.live ? "busy" : "err");
  }
  renderAmbient();
  if (thumb && result.kind !== "none") addRecent(result, thumb);
}

// ---------------- Recente ----------------
function addRecent(result, thumb) {
  const last = state.recent[0];
  if (last && last.label === result.label && Date.now() - last.t < 15000) return; // fără dubluri în live
  state.recent.unshift({ ...result, thumb, t: Date.now() });
  state.recent = state.recent.slice(0, 8);
  renderRecent();
}
function renderRecent() {
  el.recent.innerHTML = "";
  el.recentEmpty.hidden = state.recent.length > 0;
  el.recentCount.textContent = state.recent.length;
  state.recent.forEach(r => {
    const b = document.createElement("button");
    b.type = "button";
    const img = document.createElement("img");
    img.src = r.thumb; img.alt = "";
    const s = document.createElement("span");
    s.textContent = r.kind === "fruit" ? fruitName(r.label) : nfText(r.label);
    if (r.kind !== "fruit") s.className = "bad";
    b.append(img, s);
    b.title = r.kind === "fruit" ? fruitName(r.label) : "Nu este un fruct";
    b.addEventListener("click", () => {
      if (r.kind === "fruit") { showFruitCard(r.label, { chipText: "Identificat", note: "din istoric" }); openDiscovery(r.label, { source: "history" }); }
      else showMessageCard("notfruit", r.label);
    });
    el.recent.appendChild(b);
  });
}


// ---------------- Imagini ----------------
function canvasFrom(source, sw, sh, maxSide) {
  const s = Math.min(1, maxSide / Math.max(sw, sh));
  const c = document.createElement("canvas");
  c.width = Math.round(sw * s); c.height = Math.round(sh * s);
  c.getContext("2d").drawImage(source, 0, 0, c.width, c.height);
  return c;
}
function cropCanvas(src, box) {
  const [x1, y1, x2, y2] = box;
  const w = Math.max(1, Math.round((x2 - x1) * src.width)), h = Math.max(1, Math.round((y2 - y1) * src.height));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d").drawImage(src, x1 * src.width, y1 * src.height, w, h, 0, 0, w, h);
  return c;
}
const toBlob = (c, q = 0.9) => new Promise(r => c.toBlob(r, "image/jpeg", q));
function thumbOf(src, box) {
  const c = box ? cropCanvas(src, box) : src;
  return canvasFrom(c, c.width, c.height, 220).toDataURL("image/jpeg", 0.8);
}

// ---------------- Motor 1: Claude (în pagina publicată ca artifact) ----------------
async function claudeAnalyze(canvas) {
  const prompt = [
    "You are the vision engine of a fruit recognition app. Look at the attached photo.",
    "Decide if it shows a fruit. If several fruits are visible, pick the most prominent one.",
    "Allowed fruit labels: " + JSON.stringify(catalog.aiFruitLabels()),
    "Allowed non-fruit labels (use these when the main subject is not a fruit; tomato, cucumber and other vegetables are non-fruits here): " + JSON.stringify(catalog.aiNonFruitLabels()),
    'Reply with only one JSON object: {"kind":"fruit"|"notfruit"|"none","label":string|null,"score":number,"box":[x1,y1,x2,y2]|null,"others":[{"label":string,"box":[x1,y1,x2,y2]}]}',
    "others lists up to 2 additional distinct fruits visible in the photo (fruit labels only, same box format); use [] if there are none.",
    "label must be copied exactly from the allowed lists. score is your confidence from 0 to 1.",
    "box is the tight bounding box of that object, as fractions of image width and height (0 to 1, top-left origin). Use kind \"none\" with label null if you cannot tell.",
    `Example: {"kind":"fruit","label":${JSON.stringify(catalog.aiFruitLabels()[0])},"score":0.93,"box":[0.21,0.30,0.78,0.71]}`
  ].join("\n");
  const blob = await toBlob(canvas, 0.88);
  const r = await state.sample.json(prompt, { images: [blob], modelTier: "quick" });
  const kind = r && r.kind;
  const label = r && typeof r.label === "string" ? r.label.toLowerCase().trim() : null;
  const score = Math.max(0, Math.min(1, Number(r && r.score) || 0));
  let box = Array.isArray(r && r.box) && r.box.length === 4 ? r.box.map(Number) : null;
  if (box && box.every(Number.isFinite)) {
    box = box.map(v => Math.max(0, Math.min(1, v)));
    if (box[2] <= box[0] || box[3] <= box[1]) box = null;
  } else box = null;
  const hit = catalog.resolveAiLabel(label);   // eticheta modelului → id din catalog
  const others = (Array.isArray(r && r.others) ? r.others : []).slice(0, MAX_FRUITS - 1).map(o => {
    const h = catalog.resolveAiLabel(o && o.label);
    const b = Array.isArray(o && o.box) && o.box.length === 4 ? o.box.map(v => clamp(Number(v), 0, 1)) : null;
    return h?.kind === "fruit" && b && b.every(Number.isFinite) && b[2] > b[0] && b[3] > b[1] ? { label: h.id, box: b } : null;
  }).filter(Boolean);
  if (kind === "fruit" && hit?.kind === "fruit") return { kind, label: hit.id, score, box, others };
  if (kind === "notfruit" && hit?.kind === "notfruit") return { kind, label: hit.label, score, box };
  return { kind: "none", score: 0 };
}

// ---------------- Motor 2: modele locale în browser (OWL-ViT + CLIP) ----------------
const local = { T: null, clip: null, det: null, loading: null };
// Fructele pot fi reale, fotografiate, tipărite într-o carte sau desenate: toate cele trei întrebări înseamnă „fruct”.
const FRUIT_QUERIES = ["a photo of a fruit", "a drawing of a fruit", "a picture of a fruit in a book"];
const DET_QUERIES = [...FRUIT_QUERIES, "a photo of a person", "a photo of a human face", "a photo of a hand"];

// Alegem varianta de model: fp16 pe WebGPU (dacă placa suportă shader-f16), altfel q8 pe WASM.
// (fp32 însemna ~1,2 GB și putea depăși spațiul de cache al browserului, deci se descărca din nou la fiecare vizită.)
async function pickBackend() {
  if (navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter && adapter.features.has("shader-f16")) return { device: "webgpu", dtype: "fp16", suffix: "_fp16", mb: 611 };
    } catch {}
  }
  return { device: "wasm", dtype: "q8", suffix: "_quantized", mb: 309 };
}

// Sunt modelele deja salvate pe dispozitiv? (transformers.js le ține în Cache Storage, „transformers-cache”)
async function modelsCached(suffix) {
  try {
    if (!("caches" in window) || !(await caches.has("transformers-cache"))) return false;
    const keys = (await (await caches.open("transformers-cache")).keys()).map(r => r.url);
    return [CLIP_NAME, DETECTOR_NAME].every(m => keys.some(u => u.includes(m) && u.endsWith(`/onnx/model${suffix}.onnx`)));
  } catch { return false; }
}

function loadLocal() {
  if (local.loading) return local.loading;
  local.loading = (async () => {
    const backend = await pickBackend();
    const cached = await modelsCached(backend.suffix);
    local.cached = cached;
    el.progress.hidden = false;
    el.progBar.style.width = "0%";
    el.progText.textContent = cached ? "Se pornesc modelele AI salvate pe dispozitiv…" : `Prima pornire: se descarcă modelele AI (~${backend.mb} MB, o singură dată)…`;
    setStatus(cached ? "Se pornesc modelele AI…" : "Prima pornire: se descarcă modelele…", "busy");
    const T = await import(TRANSFORMERS_URL);
    local.T = T;
    T.env.allowLocalModels = false;
    T.env.useBrowserCache = true;
    const files = {};
    const progress_callback = p => {
      if (p.status === "progress" && p.total) {
        files[p.file + p.name] = [p.loaded, p.total];
        let a = 0, b = 0;
        Object.values(files).forEach(([l, t]) => { a += l; b += t; });
        const pct = Math.min(100, a / b * 100);
        el.progBar.style.width = pct.toFixed(1) + "%";
        el.progText.textContent = cached
          ? `Se pornesc modelele AI salvate pe dispozitiv… ${Math.round(pct)}%`
          : `Prima pornire: se descarcă modelele AI (o singură dată)… ${(a / 1048576).toFixed(0)} / ${(b / 1048576).toFixed(0)} MB`;
      }
    };
    const make = async (task, name) => {
      if (backend.device === "webgpu") {
        try { return await T.pipeline(task, name, { device: "webgpu", dtype: backend.dtype, progress_callback }); }
        catch (e) { console.warn("WebGPU indisponibil, trec pe WASM:", e); }
      }
      return T.pipeline(task, name, { device: "wasm", dtype: "q8", progress_callback });
    };
    local.clip = await make("zero-shot-image-classification", CLIP_NAME);
    local.det = await make("zero-shot-object-detection", DETECTOR_NAME);
    // Cerem browserului să nu șteargă modelele din cache când are nevoie de spațiu
    try { await navigator.storage?.persist?.(); } catch {}
    // Încălzire: o analiză pe o imagine mică, ca prima imagine reală să fie procesată imediat
    el.progText.textContent = "Se pregătește analiza…";
    try {
      const w = document.createElement("canvas"); w.width = w.height = 224;
      const g = w.getContext("2d"); g.fillStyle = "#888"; g.fillRect(0, 0, 224, 224);
      await findFruitBox(w); await classify(w);
    } catch (e) { console.warn("Încălzirea modelelor a eșuat:", e); }
    el.progress.hidden = true;
    local.ready = true;
    setStatus("Gata: pune o imagine sau pornește camera", "ok");
    if (!state.frameShown && !state.live) el.emptyTitle.textContent = "Gata. Arată-mi un fruct";
  })().catch(e => {
    local.loading = null;
    el.progress.hidden = true;
    throw e;
  });
  return local.loading;
}

async function rawFrom(canvas) { return local.T.RawImage.fromBlob(await toBlob(canvas, 0.92)); }

async function classify(canvas) {
  const img = await rawFrom(canvas), labels = catalog.aiAllLabels();
  const out = await local.clip(img, labels, { hypothesis_template: "a photo of a {}" });
  // Când fotografia nu e clară (desen, ilustrație dintr-o carte), mai întrebăm o dată, ca pentru un desen.
  // Păstrăm răspunsul cel mai sigur dintre cele două; dacă niciunul nu e sigur, pragurile obișnuite îl resping.
  if (out[0].score < 0.45) {
    const alt = await local.clip(img, labels, { hypothesis_template: "a drawing of a {}" });
    if (alt[0].score > out[0].score) return { label: alt[0].label, score: alt[0].score, drawing: true };
  }
  return { label: out[0].label, score: out[0].score };
}

const iou = (a, b) => {
  const x1 = Math.max(a.xmin, b.xmin), y1 = Math.max(a.ymin, b.ymin), x2 = Math.min(a.xmax, b.xmax), y2 = Math.min(a.ymax, b.ymax);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const u = (a.xmax - a.xmin) * (a.ymax - a.ymin) + (b.xmax - b.xmin) * (b.ymax - b.ymin) - inter;
  return u > 0 ? inter / u : 0;
};

const MAX_FRUITS = 3;            // câte fructe pot primi etichetă AR în același cadru

/** Casetele fructelor din cadru, cel mult MAX_FRUITS, fără suprapuneri (NMS). */
async function findFruitBoxes(canvas) {
  const small = canvasFrom(canvas, canvas.width, canvas.height, 640);
  const dets = await local.det(await rawFrom(small), DET_QUERIES, { threshold: DETECT_THRESHOLD, percentage: true });
  const fruits = dets.filter(d => FRUIT_QUERIES.includes(d.label));
  const others = dets.filter(d => !FRUIT_QUERIES.includes(d.label));
  // exclude casetele unde o persoană / mână / față are scor mai mare în același loc
  const valid = fruits.filter(f => !others.some(o => o.score >= f.score && iou(o.box, f.box) > 0.6)).sort((a, b) => b.score - a.score);
  const picked = [];
  for (const d of valid) {
    if (picked.length >= MAX_FRUITS) break;
    if (picked.some(p => iou(p.box, d.box) > 0.3)) continue;
    picked.push(d);
  }
  return picked.map(d => {
    let { xmin, ymin, xmax, ymax } = d.box;
    [xmin, ymin, xmax, ymax] = [xmin, ymin, xmax, ymax].map(v => Math.max(0, Math.min(1, v)));
    const mx = (xmax - xmin) * 0.12, my = (ymax - ymin) * 0.12;
    return [Math.max(0, xmin - mx), Math.max(0, ymin - my), Math.min(1, xmax + mx), Math.min(1, ymax + my)];
  }).filter(box => (box[2] - box[0]) * canvas.width >= 40 && (box[3] - box[1]) * canvas.height >= 40);
}
const findFruitBox = async canvas => (await findFruitBoxes(canvas))[0] || null;

async function localAnalyze(canvas) {
  await loadLocal();
  const boxes = await findFruitBoxes(canvas);
  if (boxes.length) {
    const found = [];
    for (const box of boxes) {
      const { label, score } = await classify(cropCanvas(canvas, box));
      found.push({ hit: catalog.resolveAiLabel(label), score, box });   // eticheta CLIP → id din catalog
    }
    const fruits = found.filter(f => f.hit?.kind === "fruit" && f.score >= FRUIT_MIN_SCORE);
    if (fruits.length) {
      const [p, ...rest] = fruits;
      return { kind: "fruit", label: p.hit.id, score: p.score, box: p.box, others: rest.map(f => ({ label: f.hit.id, box: f.box })) };
    }
    const top = found[0];
    if (top.hit?.kind === "notfruit") return { kind: "notfruit", label: top.hit.label, score: top.score, box: top.box };
    return { kind: "none", score: top.score };
  }
  // Niciun fruct găsit: verificăm tot cadrul
  const { label, score } = await classify(canvas);
  const hit = catalog.resolveAiLabel(label);
  if (hit?.kind === "fruit" && score >= FULLFRAME_MIN_SCORE) return { kind: "fruit", label: hit.id, score, box: [0, 0, 1, 1] };
  if (hit?.kind === "notfruit" && score >= NONFRUIT_FULL_MIN) return { kind: "notfruit", label: hit.label, score, box: null };
  return { kind: "none", score };
}

const analyze = c => state.engine === "claude" ? claudeAnalyze(c) : localAnalyze(c);

function explainError(e) {
  const code = e && e.code;
  if (code === "not_granted" || code === "sampling_disabled") return "Analiza AI nu a fost permisă în această pagină.";
  if (code === "rate_limited") return "Prea multe analize într-un timp scurt. Încearcă din nou peste un minut.";
  if (code === "image_rejected") return "Imaginea nu a putut fi citită. Încearcă o altă fotografie (JPG sau PNG).";
  if (code === "refused") return "Imaginea nu a putut fi analizată. Încearcă o altă fotografie.";
  if (code === "invalid_json" || code === "upstream_error" || code === "empty_completion") return "Analiza nu a reușit. Încearcă din nou.";
  if (code === "session_expired") return "Sesiunea a expirat. Autentifică-te din nou și reîncearcă.";
  if (state.engine === "local") return "Modelele AI nu s-au putut încărca. Verifică conexiunea la internet și reîncarcă pagina.";
  return "Ceva nu a mers. Încearcă din nou.";
}

// ---------------- Fotografii ----------------
async function handleFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  if (state.engine === "none") { setStatus("Analiza AI nu este disponibilă aici", "err"); return; }
  if (state.busy) return;
  stopCamera();
  hideReveal(); clearTimeout(state.discTimer);
  el.stage.classList.remove("photo-out");
  setFlow("idle");
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { setStatus("Imaginea nu a putut fi deschisă. Încearcă JPG sau PNG.", "err"); return; }
  const c = canvasFrom(bmp, bmp.width, bmp.height, 1600);
  el.frame.width = c.width; el.frame.height = c.height;
  el.frame.getContext("2d").drawImage(c, 0, 0);
  el.frame.hidden = false; el.empty.hidden = true;
  setArTarget(null);
  state.result = null;
  state.frameShown = true;
  el.stage.style.aspectRatio = `${c.width} / ${c.height}`;
  const s = sense(c, true);
  state.ambient = { light: s.light, sharp: s.sharp, motion: null, area: null };
  state.busy = true; el.scan.hidden = false;
  renderAmbient();
  el.btnCapture.disabled = el.btnImm.disabled = false;
  setStatus(state.engine === "claude" ? "Analizez fotografia…" : (local.ready ? "Caut un fruct…" : "Imaginea se analizează imediat ce modelele sunt gata…"), "busy");
  try {
    const r = await analyze(c);
    state.busy = false;
    applyResult({ ...r, time: Date.now() }, thumbOf(c, r.box));
  } catch (e) {
    console.error(e);
    setStatus(explainError(e), "err");
    if (e && (e.code === "not_granted" || e.code === "sampling_disabled")) disableAnalysis();
  } finally {
    state.busy = false; el.scan.hidden = true;
    renderGuide();
  }
}
[el.fileCam, el.fileUp].forEach(inp => inp.addEventListener("change", () => { handleFile(inp.files[0]); inp.value = ""; }));
el.stage.addEventListener("dragover", e => { e.preventDefault(); el.stage.classList.add("drag"); });
el.stage.addEventListener("dragleave", () => el.stage.classList.remove("drag"));
el.stage.addEventListener("drop", e => { e.preventDefault(); el.stage.classList.remove("drag"); handleFile(e.dataTransfer.files[0]); });
window.addEventListener("paste", e => {
  const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith("image/"));
  if (item) handleFile(item.getAsFile());
});

// ---------------- Fluxul automat: arată fructul → scoate-l → fructul 3D cu etichete ----------------
// scan:    camera caută un fruct (real sau poză)
// remove:  fructul a fost recunoscut stabil → „Scoate fructul din fața camerei”
// reveal:  fructul nu mai e în cadru → apare fructul 3D, apoi liniuțele către RO, EN și vitamine
// prepare: (doar pentru poze încărcate) scurtă pauză înainte de 3D
const flow = { phase: "idle", cand: null, candNew: false, streak: 0, miss: 0, id: null, isNew: false, t: 0, src: "camera" };
const LOCK_STREAK = 2;        // de câte ori la rând trebuie văzut același fruct ca să fie „sigur”
const REMOVE_MISS = 2;        // de câte ori la rând nu trebuie să mai fie văzut ca să considerăm că a fost scos
const REMOVE_MIN_MS = 1400;   // cât rămâne mesajul „scoate fructul” cel puțin
const REVEAL_MIN_MS = 7000;   // după cât timp un fruct nou arătat camerei poate porni un flux nou
const flowMsg = $("flowMsg");

function setFlow(phase) {
  flow.phase = phase; flow.t = Date.now();
  el.stage.dataset.flow = phase;
  renderFlowMsg();
  renderGuide();
}

/** Indicatorul de încredere, fără procente: 3 niveluri după scorul modelului. */
function confidenceOf(score) {
  if (score == null) return null;
  return score >= 0.6 ? { level: 3, text: "Sigur" } : score >= 0.42 ? { level: 2, text: "Destul de sigur" } : { level: 1, text: "Nu foarte sigur" };
}
function foundHtml() {
  const f = catalog.get(flow.id), c = confidenceOf(flow.score);
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  return `<div class="fm-badge" aria-hidden="true">✓</div>
    <div class="fm-name" data-no-i18n>${f.emoji ? `<span>${esc(f.emoji)}</span>` : ""}<span>${esc(f.ro.toLocaleUpperCase("ro-RO"))}</span><em>${esc(f.en.toUpperCase())}</em></div>
    ${c ? `<span class="fm-conf"><span class="conf conf-${c.level}"><i></i><i></i><i></i></span>${esc(t(c.text))}</span>` : ""}`;
}
function renderFlowMsg() {
  const p = flow.phase;
  clearTimeout(flow.slowTimer);
  if (p === "remove") {
    flowMsg.innerHTML = `${foundHtml()}
      <span>Acum scoate fructul sau poza din fața camerei</span>
      <div class="fm-anim" aria-hidden="true"><i class="fm-frame"></i><i class="fm-item"></i><i class="fm-arrow">➜</i></div>
      <button type="button" class="dbtn fm-now" data-flow-now hidden>Arată-mi-l acum</button>`;
    flowMsg.querySelector("[data-flow-now]").onclick = () => { sound.tick(); startReveal(); };
    // dacă fructul nu e scos în câteva secunde, apare și un buton
    flow.slowTimer = setTimeout(() => { const b = flowMsg.querySelector("[data-flow-now]"); if (b && flow.phase === "remove") b.hidden = false; }, 6000);
  } else if (p === "prepare") {
    flowMsg.innerHTML = `${foundHtml()}<span>Îl transform în 3D…</span><div class="fm-spin" aria-hidden="true"></div>`;
  } else { flowMsg.innerHTML = ""; }
  flowMsg.hidden = !(p === "remove" || p === "prepare");
  if (!flowMsg.hidden) { flowMsg.classList.remove("in"); void flowMsg.offsetWidth; flowMsg.classList.add("in"); }
}

/** Primește fiecare rezultat brut din camera live și avansează fluxul. */
function flowOnResult(r) {
  const fruit = r.kind === "fruit";
  if (flow.phase === "scan" || flow.phase === "reveal") {
    if (fruit && r.label === flow.cand) flow.streak++;
    else { flow.cand = fruit ? r.label : null; flow.candNew = fruit && !collection.has(r.label); flow.streak = fruit ? 1 : 0; }
    const canLock = flow.phase === "scan" || (Date.now() - flow.t > REVEAL_MIN_MS && !revealBusy());
    if (fruit && flow.streak >= LOCK_STREAK && canLock) {
      hideReveal();
      flow.id = r.label; flow.isNew = flow.candNew; flow.miss = 0; flow.score = r.score;
      sound.pop();
      setFlow("remove");
    }
  } else if (flow.phase === "remove") {
    flow.miss = fruit ? 0 : flow.miss + 1;
    if (flow.miss >= REMOVE_MISS && Date.now() - flow.t >= REMOVE_MIN_MS) startReveal();
  }
}

function startReveal() {
  if (!flow.id) return;
  clearTimeout(state.discTimer);
  setFlow("reveal");
  flow.cand = null; flow.streak = 0;
  setArTarget(null);
  showFruitCard(flow.id, { chipText: "Identificat", note: "fruct 3D" });
  setStatus(t("{name}, în 3D", { name: fruitName(flow.id) }), "ok");
  window.dispatchEvent(new CustomEvent("fruitai:reveal", { detail: { id: flow.id, isNew: flow.isNew } }));
  showReveal(el.stage, flow.id, {
    catalog, reduceMotion, source: flow.src, confidence: confidenceOf(flow.score),
    canPlaceAR: () => state.xrSupported && !state.xrActive,
    onPlaceAR: id => { showFromCatalog(id); startXR(); },
    onNutrient: n => window.dispatchEvent(new CustomEvent("fruitai:nutrient", { detail: n.key })),
    onMore: id => openDiscovery(id, { source: "scan", isNew: flow.isNew }),
    onAgain: restartFlow
  });
}

function restartFlow() {
  hideReveal();
  clearTimeout(state.discTimer);
  el.stage.classList.remove("photo-out");
  if (state.live) { state.result = null; setArTarget(null); setFlow("scan"); setStatus("Caut un fruct…", "busy"); return; }
  setFlow("idle");
  el.frame.hidden = true; el.empty.hidden = false; state.frameShown = false; state.result = null;
  el.stage.style.aspectRatio = "4 / 3"; setArTarget(null);
  state.ambient = { light: null, sharp: null, motion: null, area: null };
  el.btnCapture.disabled = el.btnImm.disabled = true;
  renderAmbient();
  el.fileUp.click();
}

// ---------------- Camera AR live (cu modelele locale) ----------------
async function startCamera() {
  if (state.live) { stopCamera(); return; }
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "environment" }, audio: false });
  } catch (e) {
    setStatus("Camera nu pornește. Permite accesul la cameră din browser.", "err");
    return;
  }
  el.video.srcObject = state.stream;
  await el.video.play();
  state.live = true;
  state.result = null; setArTarget(null);
  el.video.hidden = false; el.frame.hidden = true; el.empty.hidden = true; el.live.hidden = false;
  state.frameShown = false;
  el.stage.style.aspectRatio = `${el.video.videoWidth || 16} / ${el.video.videoHeight || 9}`;
  el.btnCamera.querySelector("span").textContent = "Oprește camera";
  el.btnCapture.disabled = el.btnImm.disabled = false;
  prevLuma = null;
  hideReveal(); el.stage.classList.remove("photo-out");
  flow.src = "camera"; flow.cand = null; flow.streak = 0;
  setFlow("scan");
  setImmersive(true);                        // camera ocupă tot ecranul: experiența e automată de aici
  ambientLoop();
  try { await loadLocal(); } catch (e) { setStatus(explainError(e), "err"); stopCamera(); return; }
  if (!state.live) return;
  setStatus("Caut un fruct…", "busy");
  liveLoop();
}
function stopCamera() {
  if (!state.live) return;
  state.live = false;
  state.stream?.getTracks().forEach(t => t.stop());
  state.stream = null;
  el.video.hidden = true; el.live.hidden = true;
  setArTarget(null);
  hideReveal(); clearTimeout(state.discTimer); setFlow("idle");
  if (el.stage.classList.contains("immersive")) setImmersive(false);
  state.ambient = { light: null, sharp: null, motion: null, area: null };
  el.btnCamera.querySelector("span").textContent = "Pornește camera AR";
  if (el.frame.hidden) { el.empty.hidden = false; el.stage.style.aspectRatio = "4 / 3"; el.btnCapture.disabled = el.btnImm.disabled = true; if (el.stage.classList.contains("immersive")) setImmersive(false); }
  renderAmbient();
}

// Senzorii ambientali rulează separat de AI, la ~4 cadre/s, ca feedback-ul să fie imediat
async function ambientLoop() {
  while (state.live) {
    if (el.video.videoWidth) {
      const s = sense(el.video);
      state.ambient.light = s.light; state.ambient.sharp = s.sharp;
      if (s.motion != null) state.ambient.motion = s.motion;
      renderAmbient();
    }
    await new Promise(r => setTimeout(r, 250));
  }
}

async function liveLoop() {
  while (state.live) {
    const t0 = performance.now();
    if (el.video.videoWidth) {
      const a = state.ambient;
      // Scenă nemișcată + rezultat valid → păstrăm rezultatul fără a rula modelele (economie de baterie)
      const still = a.motion != null && a.motion < AMB.still && flow.phase !== "remove";
      const fresh = state.result && state.result.kind === "fruit" && Date.now() - state.lastModelRun < SKIP_MAX;
      if (still && fresh) {
        state.result.time = Date.now();
      } else {
        const c = canvasFrom(el.video, el.video.videoWidth, el.video.videoHeight, 1280);
        try {
          const r = await localAnalyze(c);
          state.lastModelRun = Date.now();
          if (!state.live) break;
          flowOnResult(r);
          if (r.kind === "none" && state.result && Date.now() - state.result.time < RESULT_TTL) {
            // păstrăm ultimul rezultat cât e încă valabil
          } else {
            applyResult({ ...r, time: Date.now() }, r.kind === "fruit" ? thumbOf(c, r.box) : null);
          }
        } catch (e) { console.error(e); setStatus("Eroare AI: " + String(e.message || e).slice(0, 80), "err"); }
      }
    }
    const wait = CHECK_INTERVAL - (performance.now() - t0);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
  }
}
// Expirarea rezultatului în modul live
setInterval(() => {
  if (state.live && state.result && Date.now() - state.result.time > RESULT_TTL) {
    state.result = null; setArTarget(null); state.ambient.area = null;
    setStatus("Caut un fruct…", "busy");
    renderAmbient();
  }
}, 300);
el.btnCamera.addEventListener("click", startCamera);

// ---------------- Captură AR (imaginea + eticheta, la rezoluția sursei) ----------------
function roundRect(x, X, Y, W, H, R) { x.beginPath(); x.moveTo(X + R, Y); x.arcTo(X + W, Y, X + W, Y + H, R); x.arcTo(X + W, Y + H, X, Y + H, R); x.arcTo(X, Y + H, X, Y, R); x.arcTo(X, Y, X + W, Y, R); x.closePath(); }
function captureAR() {
  const src = state.live ? el.video : (!el.frame.hidden ? el.frame : null);
  if (!src) return;
  const w = state.live ? el.video.videoWidth : el.frame.width, h = state.live ? el.video.videoHeight : el.frame.height;
  if (!w || !h) return;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d");
  x.drawImage(src, 0, 0, w, h);
  const r = state.result;
  const u = Math.max(w, h) / 900;            // unitate de scalare
  const font = (wt, px) => `${wt} ${Math.round(px * u)}px Geist, system-ui, sans-serif`;
  const items = !r || !r.box || (r.kind !== "fruit" && r.kind !== "notfruit") ? [] :
    [{ kind: r.kind, label: r.label, box: r.box }, ...(r.kind === "fruit" ? (r.others || []) .map(o => ({ kind: "fruit", ...o })) : [])];
  const frames = items.map(it => ({ x: it.box[0] * w, y: it.box[1] * h, w: (it.box[2] - it.box[0]) * w, h: (it.box[3] - it.box[1]) * h }));
  const labels = items.map(it => {
    const f = it.kind === "fruit" ? catalog.get(it.label) : null;
    return f ? { k: "FRUCT IDENTIFICAT", t: f.ro, s: f.en, v: f.vitamins.length ? "Vitamine: " + f.vitamins.map(vitShort).join(", ") : "" }
             : { k: "DETECTAT", t: "Nu este un fruct", s: cap(nfText(it.label)), v: "" };
  });
  const sizes = labels.map(l => ({ w: 250 * u, h: (l.v ? 108 : 88) * u }));
  const pos = layoutCards(frames, sizes, { w, h, pad: 10 * u, gap: 20 * u, top: 10 * u, bottom: 30 * u });
  items.forEach((it, i) => {
    const col = it.kind === "fruit" ? "#C9F25C" : "#FF5F7E";
    const { x: bx, y: by, w: bw, h: bh } = frames[i], L = Math.min(bw, bh) * 0.22;
    x.strokeStyle = col; x.lineWidth = 3.5 * u; x.lineCap = "round"; x.shadowColor = col; x.shadowBlur = 10 * u;
    x.beginPath();
    x.moveTo(bx, by + L); x.lineTo(bx, by); x.lineTo(bx + L, by);
    x.moveTo(bx + bw - L, by); x.lineTo(bx + bw, by); x.lineTo(bx + bw, by + L);
    x.moveTo(bx, by + bh - L); x.lineTo(bx, by + bh); x.lineTo(bx + L, by + bh);
    x.moveTo(bx + bw - L, by + bh); x.lineTo(bx + bw, by + bh); x.lineTo(bx + bw, by + bh - L);
    x.stroke(); x.shadowBlur = 0;
    // linia de ancorare + eticheta: română → engleză → vitamine
    const p = pos[i], l = labels[i], cw = sizes[i].w, ch = sizes[i].h;
    x.strokeStyle = col; x.lineWidth = 1.5 * u; x.setLineDash([3 * u, 4 * u]);
    x.beginPath(); x.moveTo(p.ax, p.ay); x.lineTo(p.bx, p.by); x.stroke(); x.setLineDash([]);
    x.fillStyle = "rgba(10,13,15,.85)"; roundRect(x, p.x, p.y, cw, ch, 16 * u); x.fill();
    x.strokeStyle = "rgba(255,255,255,.18)"; x.lineWidth = 1 * u; x.stroke();
    x.fillStyle = col; x.font = font(600, 11); x.fillText(l.k, p.x + 16 * u, p.y + 26 * u);
    x.fillStyle = "#F2F5F3"; x.font = font(600, 24); x.fillText(l.t, p.x + 16 * u, p.y + 56 * u);
    x.fillStyle = "#A3ADA8"; x.font = font(500, 14); x.fillText(l.s, p.x + 16 * u, p.y + 78 * u);
    if (l.v) { x.fillStyle = "#C9F25C"; x.font = font(500, 13); x.fillText(l.v, p.x + 16 * u, p.y + 98 * u); }
  });
  x.fillStyle = "rgba(255,255,255,.75)"; x.font = font(600, 13); x.fillText("FruitAI", 14 * u, h - 14 * u);
  c.toBlob(b => {
    if (!b) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = `fruitai-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    setStatus("Captura a fost salvată", "ok");
  }, "image/png");
}
el.btnCapture.addEventListener("click", captureAR);
el.btnImmShot.addEventListener("click", captureAR);
el.btnImm.addEventListener("click", () => setImmersive(true));
el.btnExitImm.addEventListener("click", () => setImmersive(false));
document.addEventListener("keydown", e => { if (e.key === "Escape" && el.stage.classList.contains("immersive") && !document.querySelector("dialog.disc[open]")) setImmersive(false); });
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && el.stage.classList.contains("immersive")) setImmersive(false); });

// ---------------- AR spațial (WebXR), încărcat doar la cerere ----------------
function updateXRButton() {
  if (!state.xrSupported) return;
  const ready = !state.example && el.facts.hidden === false && catalog.has(state.shownFruit);
  el.btnXR.disabled = !ready || state.xrActive;
  el.btnXR.title = ready ? t("Pune fructul {name} pe o suprafață reală", { name: fruitName(state.shownFruit) }) : t("Identifică sau alege mai întâi un fruct");
}
async function startXR() {
  if (el.btnXR.disabled || state.xrActive) return;
  stopCamera();
  state.xrActive = true; updateXRButton();
  const f = catalog.get(state.shownFruit);
  const overlay = $("xrOverlay");
  try {
    setStatus("Se pornește AR spațial…", "busy");
    const xr = await import("./xr.js");   // relativ la js/app.js
    await xr.startSession(f, catalog.nutrientsFor(f.id), {
      overlay, msg: $("xrMsg"), hint: $("xrHint"), close: $("xrClose"), tools: $("xrTools"), card: $("xrCard"), t,
      onNutrient: n => window.dispatchEvent(new CustomEvent("fruitai:nutrient", { detail: n.key })),
      onEnd: () => { state.xrActive = false; overlay.hidden = true; updateXRButton(); setStatus("Sesiunea AR spațial s-a încheiat", "ok"); }
    });
    setStatus("AR spațial activ", "ok");
  } catch (e) {
    console.error(e);
    state.xrActive = false; overlay.hidden = true; updateXRButton();
    setStatus("AR spațial nu a putut porni pe acest dispozitiv", "err");
  }
}
el.btnXR.addEventListener("click", startXR);

async function checkSupport() {
  const camOk = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const supCam = $("supCam");
  supCam.className = "support " + (camOk ? "ok" : "no");
  supCam.querySelector("span").textContent = camOk ? (isSecureContext ? "Disponibil pe acest dispozitiv" : "Necesită https sau localhost") : "Camera nu e accesibilă în acest browser";
  let xrOk = false;
  try { xrOk = !!(navigator.xr && await navigator.xr.isSessionSupported("immersive-ar")); } catch {}
  state.xrSupported = xrOk && state.engine !== "claude";
  const supXR = $("supXR");
  supXR.className = "support " + (state.xrSupported ? "ok" : "no");
  supXR.querySelector("span").textContent = state.xrSupported ? "Compatibil cu acest dispozitiv" : "Indisponibil pe acest dispozitiv sau browser";
  el.btnXR.hidden = !state.xrSupported;
  if (catalog) renderArHub();
  updateXRButton();
}

// ---------------- Hero: înclinare 3D după pointer + pauză în afara ecranului ----------------
(() => {
  const scene = $("scene3d"), rig = $("rig");
  if (reduceMotion) return;
  let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
  const tick = () => {
    cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08;
    rig.style.transform = `rotateY(${cx}deg) rotateX(${cy}deg)`;
    raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.02 ? requestAnimationFrame(tick) : 0;
  };
  window.addEventListener("pointermove", e => {
    if (e.pointerType !== "mouse") return;
    const r = scene.getBoundingClientRect();
    tx = clamp((e.clientX - (r.left + r.width / 2)) / r.width * 18, -12, 12);
    ty = clamp(-(e.clientY - (r.top + r.height / 2)) / r.height * 14, -10, 10);
    if (!raf) raf = requestAnimationFrame(tick);
  }, { passive: true });
  new IntersectionObserver(([en]) => scene.classList.toggle("paused", !en.isIntersecting)).observe(scene);
})();

// Apariție la derulare
(() => {
  const els = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || reduceMotion) { els.forEach(e => e.classList.add("in")); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
  els.forEach(e => io.observe(e));
})();

// Butoanele „Încearcă / Pornește scannerul”: duc la scanner și pornesc direct acțiunea principală
document.querySelectorAll("[data-start]").forEach(b => b.addEventListener("click", e => {
  e.preventDefault();
  $("scanner").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  if (state.engine === "local" && !el.btnCamera.hidden) { if (!state.live) startCamera(); }
  else if (state.engine === "claude") el.fileCam.click();
  else if (state.engine === null) state.pendingStart = true;   // pagina încă pornește: camera pornește imediat ce e gata
}));

// ---------------- Pornire: alegem motorul ----------------
function disableAnalysis() {
  state.engine = "none";
  el.emptyTitle.textContent = "Analiza AI nu este disponibilă aici";
  el.emptyText.textContent = "Poți totuși consulta valorile nutriționale din catalogul de mai jos.";
}

// ---------------- Conținut generat din catalog ----------------
function bindCounts() {
  const counts = { fruits: catalog.count, scannable: catalog.recognizable.length, nonfruits: catalog.nonFruitCount };
  document.querySelectorAll("[data-count]").forEach(n => { n.textContent = counts[n.dataset.count] ?? "—"; });
}

// Exemplele din hero și din secțiunea AR: fructe alese din catalog (cele marcate „showcase”)
let showcasePicks = null;
function renderShowcase(rerender = false) {
  if (!showcasePicks) { const pool = [...catalog.showcase()].sort(() => Math.random() - 0.5); showcasePicks = [pool[0], pool[1 % pool.length], pool[2 % pool.length]]; }
  const [a, b, c] = showcasePicks;
  $("heroOrb").style.background = orbGradient(a);
  const hc = $("heroCard");
  hc.innerHTML = `<span class="k">Identificat</span><b></b><span class="t"></span><div class="hv"></div>`;
  const en = getLang() === "en", I = catalog.info;
  hc.querySelector("b").textContent = en ? a.en : a.ro;
  hc.querySelector(".t").textContent = en ? a.ro : a.en;
  hc.querySelector(".hv").replaceChildren(...pills(a.vitamins.map(vitShort).slice(0, 4), "", v => "Vit. " + v));
  const hp = $("heroPortion");
  hp.innerHTML = `<span class="k">Mineral principal</span><b></b><span class="t"></span>`;
  hp.querySelector("b").textContent = a.minerals[0] ? (en ? (I?.minerals[a.minerals[0]]?.title_en || a.minerals[0]) : cap(a.minerals[0])) : "—";
  hp.querySelector(".t").textContent = a.minerals.length > 1 ? t("și {n} altele", { n: a.minerals.length - 1 }) : "";
  if (!rerender) heroScene(a);
  const demo = (node, f) => { node.innerHTML = "<b></b><span></span>"; node.firstChild.textContent = en ? f.en : f.ro; node.lastChild.textContent = ` · ${en ? f.ro : f.en} · Vit. ${f.vitamins.map(vitShort).slice(0, 3).join(", ") || "—"}`; };
  demo($("arDemo1"), b);
  $("arDemo1Art").style.setProperty("--demo-bg", orbGradient(b));
  demo($("arDemo2"), c);
}

// Fructul 3D mare din prima pagină, cu nutrienții pe orbită (se încarcă după ce pagina e afișată)
function heroScene(f) {
  const orbit = $("heroOrbit"), list = catalog.nutrientsFor(f.id).slice(0, 6);
  orbit.innerHTML = list.map((n, i) => `<span class="ho" style="--a:${(i / list.length * 360).toFixed(0)}deg;--nc:${n.color}"><span class="nicon ${n.kind}" style="--nc:${n.color}"><b>${n.symbol}</b></span></span>`).join("");
  $("heroHit").onclick = () => openDiscovery(f.id, { source: "catalog" });
  const scene3d = $("scene3d");
  const start = async () => {
    try {
      const { createFruitScene } = await import("./fruit3d.js");
      const sc = createFruitScene($("heroCanvas"), f, { reducedMotion: reduceMotion, interactive: false, distance: 1.3 });
      sc.celebrate();
      scene3d.classList.add("has3d");
      new IntersectionObserver(([en]) => en.isIntersecting ? sc.resume() : sc.pause()).observe(scene3d);
    } catch (e) { console.warn("Fructul 3D din prima pagină nu s-a încărcat:", e); }
  };
  ("requestIdleCallback" in window) ? requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 600);
}

// Hub-ul AR: alegerea fructului pentru AR spațial, doar dacă dispozitivul îl suportă
function renderArHub() {
  $("hubXR").hidden = !state.xrSupported;
  $("hubFallback").hidden = state.xrSupported || state.engine === "none";
  if (!state.xrSupported) return;
  const picks = [...new Set([...catalog.fruits.filter(f => collection.has(f.id)).map(f => f.id), ...catalog.showcase().map(f => f.id)])].slice(0, 10);
  $("hubFruits").replaceChildren(...picks.map(id => {
    const f = catalog.get(id), b = document.createElement("button");
    b.type = "button"; b.className = "hub-fruit";
    b.innerHTML = `${f.emoji ? `<span class="e">${f.emoji}</span>` : fruitArt(f, { size: 36 })}<span></span>`;
    b.lastChild.textContent = f.ro;
    b.onclick = () => { showFromCatalog(id); startXR(); };
    return b;
  }));
}

function showFromCatalog(id) {
  state.example = false;
  showFruitCard(id, { chipText: "Catalog", note: "din catalog" });
}

async function boot() {
  const i18nReady = initI18n();
  try {
    catalog = await loadCatalog();
  } catch (e) {
    console.error(e);
    setStatus("Catalogul de fructe nu a putut fi încărcat", "err");
    el.emptyTitle.textContent = "Catalogul nu s-a încărcat";
    el.emptyText.textContent = "Pornește site-ul printr-un server (vezi README) și reîncarcă pagina.";
    return;
  }
  bindCounts();
  renderShowcase();
  initGame(catalog, { openFruit: id => openDiscovery(id, { source: "catalog" }) });
  // selectorul de limbă
  const paintLang = () => document.querySelectorAll("[data-lang]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lang === getLang())));
  document.querySelectorAll("[data-lang]").forEach(b => b.addEventListener("click", () => { setLang(b.dataset.lang); paintLang(); }));
  await i18nReady; paintLang();
  window.addEventListener("fruitai:lang", () => { if (state.shownFruit && !el.facts.hidden) showFruitCard(state.shownFruit, { chipText: state.example ? "Exemplu" : "Identificat", note: state.example ? "așa arată un rezultat" : "" }); renderShowcase(true); });
  initDiscovery({
    catalog, reduceMotion,
    canPlaceAR: () => state.xrSupported && !state.xrActive,
    onPlaceAR: id => { showFromCatalog(id); startXR(); }
  });
  mountCatalogUI(catalog, {
    onOpen: id => openDiscovery(id, { source: "catalog" }),
    isDiscovered: id => collection.has(id)
  });
  // pagina principală: Vita în hero + o descoperire demonstrativă, fără cameră
  document.querySelector("#heroVita .mascot").innerHTML = MASCOT.replace(/id="vita/g, 'id="hvita').replace(/url\(#vita/g, "url(#hvita");
  $("btnDemo").addEventListener("click", () => openDiscovery(catalog.pick().id, { source: "catalog" }));
  el.btnSheet.addEventListener("click", () => state.shownFruit && openDiscovery(state.shownFruit, { source: state.example ? "catalog" : "scan" }));
  showFruitCard(catalog.pick().id, { chipText: "Exemplu", note: "așa arată un rezultat" });
  renderAmbient();
  if (window.claude && typeof window.claude.use === "function") {
    let sample = null, caps = null;
    try { sample = await window.claude.use("sample"); } catch {}
    if (sample) { try { caps = await sample.limits(); } catch {} }
    if (sample && caps && caps.images) {
      state.sample = sample; state.engine = "claude";
      $("btnPhoto").classList.add("primary");
      el.fileUp.accept = el.fileCam.accept = caps.images.mediaTypes.join(",");
      el.engineNote.textContent = "FruitAI 9 · recunoaștere cu Claude";
      el.hint.textContent = "Fotografia este analizată de Claude. Prima dată ți se cere permisiunea. Cel mai bine merge un singur fruct, bine luminat.";
      setStatus("Pregătit: fă o fotografie unui fruct", "ok");
      checkSupport();
      return;
    }
    disableAnalysis();
    setStatus("Analiza AI nu este disponibilă în această vizualizare", "err");
    checkSupport();
    return;
  }
  // Site găzduit normal: modele locale în browser + cameră AR live
  state.engine = "local";
  el.engineNote.textContent = "FruitAI 9 · OWL-ViT + CLIP rulează local în browser";
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    el.btnCamera.hidden = false;
    el.emptyText.textContent = "Pornește camera AR și arată un fruct oriunde în cadru, sau încarcă o fotografie.";
  } else {
    // fără cameră live, fotografia devine acțiunea principală
    $("btnPhoto").classList.add("primary");
  }
  el.hint.textContent = "Modelele AI pornesc singure la deschiderea paginii. Prima dată se descarcă, apoi rămân salvate în browser. Imaginile nu pleacă nicăieri.";
  checkSupport();
  if (state.pendingStart && !el.btnCamera.hidden && !state.live) startCamera();
  // Pornim modelele imediat, în fundal: când pui o imagine, analiza începe pe loc
  loadLocal().catch(e => { console.error(e); setStatus(explainError(e), "err"); });
}
boot();
