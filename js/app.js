import { loadCatalog } from "./catalog.js";
import { fruitArt, orbGradient } from "./fruit-art.js";
import { mountCatalogUI, openFruitSheet, nutrientPills } from "./catalog-ui.js";


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
const fruitName = id => catalog.get(id)?.ro ?? id;
const fruitEn = id => catalog.get(id)?.en ?? id;

// ---------------- Elemente ----------------
const $ = id => document.getElementById(id);
const el = {
  dot:$("dot"), status:$("status"), stage:$("stage"), video:$("video"), frame:$("frame"), empty:$("empty"),
  emptyTitle:$("emptyTitle"), emptyText:$("emptyText"), scan:$("scan"),
  live:$("live"), progress:$("progress"), progText:$("progText"), progBar:$("progBar"),
  btnCamera:$("btnCamera"), btnCapture:$("btnCapture"), btnXR:$("btnXR"), fileCam:$("fileCam"), fileUp:$("fileUp"), hint:$("hint"),
  rTop:$("rTop"), roName:$("roName"), enName:$("enName"), insights:$("insights"), msg:$("msg"), nl:$("nl"),
  portion:$("portion"), portionOut:$("portionOut"),
  kcal:$("kcal"), rows:$("rows"), src:$("src"), recent:$("recent"), recentEmpty:$("recentEmpty"),
  recentCount:$("recentCount"), facts:$("facts"), btnSheet:$("btnSheet"), rArt:$("rArt"), vm:$("vm"), fact:$("fact"),
  engineNote:$("engineNote"),
  ar:$("ar"), arFrame:$("arFrame"), arCard:$("arCard"), arLine:$("arLine"), arDot:$("arDot"),
  arKicker:$("arKicker"), arName:$("arName"), arSub:$("arSub"), arKc:$("arKc"), arKcal:$("arKcal"), arPortion:$("arPortion"), arMac:$("arMac"),
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

// ---------------- Calcule nutriționale ----------------
const nutritionFor = (id, grams) => catalog.nutritionFor(id, grams);

// ---------------- Eticheta nutrițională ----------------
function renderNutrition(fruit) {
  const g = +el.portion.value;
  const n = nutritionFor(fruit, g);
  el.portionOut.textContent = g + " g";
  el.kcal.textContent = n.kcal == null ? "—" : Math.round(n.kcal).toLocaleString("ro-RO");
  el.rows.innerHTML = "";
  catalog.nutrients.forEach(({ ro: label, unit, dailyValue: dv }, i) => {
    const v = n.values[i];
    const row = document.createElement("div");
    row.className = "nrow" + (v == null ? " na" : "");
    row.innerHTML = `<span><b></b></span><span class="v"></span><span class="dv"></span>`;
    row.querySelector("b").textContent = label;
    row.querySelector(".v").textContent = v == null ? "indisponibil" : fmt(v) + " " + unit;
    row.querySelector(".dv").textContent = v == null ? "" : Math.round(v / dv * 100) + "%";
    el.rows.appendChild(row);
  });
  const kcalPct = n.kcal == null ? "" : ` · ${Math.round(n.kcal / catalog.kcalDailyValue * 100)}% din necesarul caloric zilnic`;
  el.src.textContent = `USDA FoodData Central (SR Legacy): ${n.source}${kcalPct}. *Doză de referință pentru o dietă de 2000 kcal.`;
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
  el.roName.textContent = fruitName(fruit);
  el.enName.innerHTML = "English: <b></b>";
  el.enName.querySelector("b").textContent = fruitEn(fruit);
  el.msg.hidden = true;
  el.nl.hidden = false;
  setTop(opts.chipText || "Identificat", opts.tagClass || (opts.chipText === "Catalog" ? "cat" : opts.chipText === "Exemplu" ? "" : "ok"), opts.note);
  el.insights.innerHTML = "";
  catalog.insightsFor(fruit).forEach(t => { const s = document.createElement("span"); s.textContent = t; el.insights.appendChild(s); });
  el.insights.hidden = !el.insights.children.length;
  renderNutrition(fruit);
  // imaginea, vitaminele, mineralele și curiozitatea vin din aceeași înregistrare de catalog
  const f = catalog.get(fruit);
  el.rArt.innerHTML = fruitArt(f, { size: 68 });
  el.rArt.hidden = false;
  el.vm.replaceChildren(...nutrientPills(f));
  el.fact.textContent = f.fact;
  el.facts.hidden = false;
  updateXRButton();
}

function showMessageCard(kind, label) {
  setTop(kind === "notfruit" ? "Nu e fruct" : "Nesigur", "bad");
  el.nl.hidden = true;
  el.insights.hidden = true;
  el.facts.hidden = true;
  el.rArt.hidden = true;
  el.msg.hidden = false;
  if (kind === "notfruit") {
    el.roName.textContent = "Acesta nu este un fruct";
    el.enName.textContent = "Văd: " + catalog.nonFruitText(label);
    el.msg.innerHTML = "<b>Sfat:</b> ține fructul mai aproape de cameră, să ocupe o bună parte din cadru.";
  } else {
    el.roName.textContent = "Nu văd niciun fruct";
    el.enName.textContent = "Nu sunt sigur ce este în imagine.";
    el.msg.innerHTML = "<b>Sfat:</b> folosește lumină bună și un fundal simplu, cu un singur fruct.";
  }
  updateXRButton();
}

// ---------------- Stratul AR: ancoră + etichetă atașată obiectului ----------------
const arState = { target: null, cur: null, raf: 0 };

function mediaRect() {
  const media = state.live ? { w: el.video.videoWidth, h: el.video.videoHeight } : { w: el.frame.width, h: el.frame.height };
  if (!media.w || !media.h) return null;
  const sw = el.stage.clientWidth, sh = el.stage.clientHeight;
  const s = Math.min(sw / media.w, sh / media.h);
  const dw = media.w * s, dh = media.h * s;
  return { sw, sh, dw, dh, ox: (sw - dw) / 2, oy: (sh - dh) / 2 };
}

function fillArCard(result) {
  const isFruit = result.kind === "fruit";
  el.ar.classList.toggle("bad", !isFruit);
  if (isFruit) {
    const g = +el.portion.value;
    const n = nutritionFor(result.label, g);
    el.arKicker.textContent = "Fruct identificat";
    el.arName.textContent = fruitName(result.label);
    el.arSub.textContent = fruitEn(result.label);
    el.arKc.hidden = false;
    el.arKcal.textContent = n.kcal == null ? "—" : Math.round(n.kcal).toLocaleString("ro-RO");
    el.arPortion.textContent = `kcal · ${g} g`;
    el.arMac.innerHTML = "";
    catalog.nutrients.forEach(({ short, unit, dailyValue: dv, color }, i) => {
      const v = n.values[i];
      const row = document.createElement("div");
      row.innerHTML = `<span></span><i></i><em></em>`;
      row.querySelector("span").textContent = short;
      row.querySelector("em").textContent = v == null ? "—" : fmt(v) + " " + unit;
      const bar = row.querySelector("i");
      bar.style.setProperty("--w", v == null ? "0%" : clamp(v / dv * 100 * 2.5, 3, 100) + "%");
      bar.style.setProperty("--c", color);
      el.arMac.appendChild(row);
    });
  } else {
    el.arKicker.textContent = "Detectat";
    el.arName.textContent = "Nu este un fruct";
    el.arSub.textContent = cap(catalog.nonFruitText(result.label));
    el.arKc.hidden = true;
    el.arMac.innerHTML = "";
  }
}

function setArTarget(result) {
  if (!result || !result.box || (result.kind !== "fruit" && result.kind !== "notfruit")) {
    arState.target = null; arState.cur = null; el.ar.hidden = true; return;
  }
  const changed = !arState.target || arState.target.label !== result.label;
  arState.target = { box: result.box, kind: result.kind, label: result.label };
  if (changed) fillArCard(result);
  if (el.ar.hidden) { arState.cur = null; el.ar.hidden = false; }
  scheduleAr();
}
function scheduleAr() { if (!arState.raf) arState.raf = requestAnimationFrame(arTick); }

function arTick() {
  arState.raf = 0;
  if (!arState.target || el.ar.hidden) return;
  const m = mediaRect();
  if (!m) return;
  const [x1, y1, x2, y2] = arState.target.box;
  const t = { x: m.ox + x1 * m.dw, y: m.oy + y1 * m.dh, w: Math.max(28, (x2 - x1) * m.dw), h: Math.max(28, (y2 - y1) * m.dh) };
  let moving = false;
  if (!arState.cur || reduceMotion) arState.cur = { ...t };
  else for (const k of ["x", "y", "w", "h"]) {
    const d = t[k] - arState.cur[k];
    if (Math.abs(d) > 0.4) { arState.cur[k] += d * 0.2; moving = true; } else arState.cur[k] = t[k];
  }
  const c = arState.cur;
  el.arFrame.style.transform = `translate(${c.x}px, ${c.y}px)`;
  el.arFrame.style.width = c.w + "px";
  el.arFrame.style.height = c.h + "px";

  // Plasarea etichetei: dreapta, stânga, dedesubt / deasupra, altfel în interiorul cadrului
  el.arCard.classList.toggle("compact", m.sw < 520);
  const cw = el.arCard.offsetWidth, ch = el.arCard.offsetHeight, gap = 22, pad = 10;
  // zone rezervate: senzorii (sus) și ghidajul (jos), ca eticheta să nu le acopere
  const pt = !el.hud.hidden ? (m.sw < 560 ? 92 : 14) : pad;
  const pb = !el.guide.hidden ? 62 : pad;
  const fitY = y => clamp(y, pt, Math.max(pt, m.sh - ch - pb));
  let cx, cy, ax, ay, bx, by;
  if (c.x + c.w + gap + cw + pad <= m.sw) {
    cx = c.x + c.w + gap; cy = fitY(c.y + c.h / 2 - ch / 2);
    ax = c.x + c.w; ay = c.y + c.h / 2; bx = cx; by = cy + ch / 2;
  } else if (c.x - gap - cw >= pad) {
    cx = c.x - gap - cw; cy = fitY(c.y + c.h / 2 - ch / 2);
    ax = c.x; ay = c.y + c.h / 2; bx = cx + cw; by = cy + ch / 2;
  } else {
    cx = clamp(c.x + c.w / 2 - cw / 2, pad, m.sw - cw - pad);
    if (c.y + c.h + gap + ch + pb <= m.sh) { cy = c.y + c.h + gap; ax = c.x + c.w / 2; ay = c.y + c.h; bx = cx + cw / 2; by = cy; }
    else if (c.y - gap - ch >= pt) { cy = c.y - gap - ch; ax = c.x + c.w / 2; ay = c.y; bx = cx + cw / 2; by = cy + ch; }
    else {
      // nu încape nicăieri complet: alegem marginea (sus/jos) cea mai depărtată de fruct, ca să-l acopere cât mai puțin
      const topY = pt, botY = Math.max(pt, m.sh - ch - pb), mid = c.y + c.h / 2;
      if (Math.abs(mid - (topY + ch / 2)) > Math.abs(mid - (botY + ch / 2))) { cy = topY; ax = c.x + c.w / 2; ay = c.y; bx = cx + cw / 2; by = cy + ch; }
      else { cy = botY; ax = c.x + c.w / 2; ay = c.y + c.h; bx = cx + cw / 2; by = cy; }
    }
  }
  el.arCard.style.transform = `translate(${cx}px, ${cy}px)`;
  el.arLine.setAttribute("x1", ax); el.arLine.setAttribute("y1", ay);
  el.arLine.setAttribute("x2", bx); el.arLine.setAttribute("y2", by);
  el.arDot.setAttribute("cx", ax); el.arDot.setAttribute("cy", ay);
  if (moving) scheduleAr();
}
new ResizeObserver(() => { el.stage.style.setProperty("--h", el.stage.clientHeight + "px"); if (arState.target) { arState.cur = null; scheduleAr(); } }).observe(el.stage);

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
  if (state.busy && !state.live) { el.guide.hidden = true; return; }
  const fruit = r && r.kind === "fruit";
  if (fruit) {
    // Fructul e identificat: sfaturile despre încadrare contează, cele despre calitatea imaginii nu
    if (a.area != null && a.area < AMB.far) text = "Apropie fructul, ocupă prea puțin din cadru.";
    else if (a.area != null && a.area > AMB.near) text = "Depărtează puțin fructul ca să-l văd întreg.";
    else { text = state.live ? "Fruct ancorat. Ajustează porția din panou." : "Fruct identificat. Ajustează porția din panou."; ok = true; }
  } else if (a.light != null && a.light < AMB.dark) text = state.live ? "Lumina e slabă. Apropie-te de o fereastră sau aprinde o lumină." : "Fotografia e prea întunecată. Încearcă una făcută la lumină.";
  else if (state.live && a.motion != null && a.motion > AMB.moving) text = "Ține camera nemișcată o clipă.";
  else if (a.sharp != null && a.sharp < AMB.blurry) text = state.live ? "Imaginea e neclară. Atinge ecranul ca să focalizezi." : "Fotografia pare neclară. Încearcă una mai focalizată.";
  else if (state.live) text = "Arată un fruct oriunde în cadru.";
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
    setStatus(`Identificat: ${fruitName(result.label)}`, "ok");
  } else if (result.kind === "notfruit") {
    showMessageCard("notfruit", result.label);
    setStatus(result.box ? `Nu este un fruct: ${catalog.nonFruitText(result.label)}` : `Nu văd niciun fruct, văd ${catalog.nonFruitText(result.label)}`, "err");
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
    s.textContent = r.kind === "fruit" ? fruitName(r.label) : catalog.nonFruitText(r.label);
    if (r.kind !== "fruit") s.className = "bad";
    b.append(img, s);
    b.title = r.kind === "fruit" ? fruitName(r.label) : "Nu este un fruct";
    b.addEventListener("click", () => {
      if (r.kind === "fruit") showFruitCard(r.label, { chipText: "Identificat", note: "din istoric" });
      else showMessageCard("notfruit", r.label);
    });
    el.recent.appendChild(b);
  });
}

el.portion.addEventListener("input", () => {
  if (!el.nl.hidden) renderNutrition(state.shownFruit);
  if (arState.target && arState.target.kind === "fruit") fillArCard(arState.target);
});

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
    'Reply with only one JSON object: {"kind":"fruit"|"notfruit"|"none","label":string|null,"score":number,"box":[x1,y1,x2,y2]|null}',
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
  if (kind === "fruit" && hit?.kind === "fruit") return { kind, label: hit.id, score, box };
  if (kind === "notfruit" && hit?.kind === "notfruit") return { kind, label: hit.label, score, box };
  return { kind: "none", score: 0 };
}

// ---------------- Motor 2: modele locale în browser (OWL-ViT + CLIP) ----------------
const local = { T: null, clip: null, det: null, loading: null };
const DET_QUERIES = ["a photo of a fruit", "a photo of a person", "a photo of a human face", "a photo of a hand"];

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
  const out = await local.clip(await rawFrom(canvas), catalog.aiAllLabels(), { hypothesis_template: "a photo of a {}" });
  return { label: out[0].label, score: out[0].score };
}

const iou = (a, b) => {
  const x1 = Math.max(a.xmin, b.xmin), y1 = Math.max(a.ymin, b.ymin), x2 = Math.min(a.xmax, b.xmax), y2 = Math.min(a.ymax, b.ymax);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const u = (a.xmax - a.xmin) * (a.ymax - a.ymin) + (b.xmax - b.xmin) * (b.ymax - b.ymin) - inter;
  return u > 0 ? inter / u : 0;
};

async function findFruitBox(canvas) {
  const small = canvasFrom(canvas, canvas.width, canvas.height, 640);
  const dets = await local.det(await rawFrom(small), DET_QUERIES, { threshold: DETECT_THRESHOLD, percentage: true });
  const fruits = dets.filter(d => d.label === DET_QUERIES[0]);
  const others = dets.filter(d => d.label !== DET_QUERIES[0]);
  // exclude casetele unde o persoană / mână / față are scor mai mare în același loc
  const valid = fruits.filter(f => !others.some(o => o.score >= f.score && iou(o.box, f.box) > 0.6)).sort((a, b) => b.score - a.score);
  if (!valid.length) return null;
  let { xmin, ymin, xmax, ymax } = valid[0].box;
  [xmin, ymin, xmax, ymax] = [xmin, ymin, xmax, ymax].map(v => Math.max(0, Math.min(1, v)));
  const mx = (xmax - xmin) * 0.12, my = (ymax - ymin) * 0.12;
  const box = [Math.max(0, xmin - mx), Math.max(0, ymin - my), Math.min(1, xmax + mx), Math.min(1, ymax + my)];
  if ((box[2] - box[0]) * canvas.width < 40 || (box[3] - box[1]) * canvas.height < 40) return null;
  return box;
}

async function localAnalyze(canvas) {
  await loadLocal();
  const box = await findFruitBox(canvas);
  if (box) {
    const { label, score } = await classify(cropCanvas(canvas, box));
    const hit = catalog.resolveAiLabel(label);   // eticheta CLIP → id din catalog
    if (hit?.kind === "fruit" && score >= FRUIT_MIN_SCORE) return { kind: "fruit", label: hit.id, score, box };
    if (hit?.kind === "notfruit") return { kind: "notfruit", label: hit.label, score, box };
    return { kind: "none", score };
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
  el.btnCapture.disabled = false;
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
  el.btnCapture.disabled = false;
  prevLuma = null;
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
  state.ambient = { light: null, sharp: null, motion: null, area: null };
  el.btnCamera.querySelector("span").textContent = "Pornește camera AR";
  if (el.frame.hidden) { el.empty.hidden = false; el.stage.style.aspectRatio = "4 / 3"; el.btnCapture.disabled = true; }
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
      const still = a.motion != null && a.motion < AMB.still;
      const fresh = state.result && state.result.kind === "fruit" && Date.now() - state.lastModelRun < SKIP_MAX;
      if (still && fresh) {
        state.result.time = Date.now();
      } else {
        const c = canvasFrom(el.video, el.video.videoWidth, el.video.videoHeight, 1280);
        try {
          const r = await localAnalyze(c);
          state.lastModelRun = Date.now();
          if (!state.live) break;
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
  if (r && r.box && (r.kind === "fruit" || r.kind === "notfruit")) {
    const col = r.kind === "fruit" ? "#C9F25C" : "#FF5F7E";
    const [x1, y1, x2, y2] = r.box;
    const bx = x1 * w, by = y1 * h, bw = (x2 - x1) * w, bh = (y2 - y1) * h, L = Math.min(bw, bh) * 0.22;
    x.strokeStyle = col; x.lineWidth = 3.5 * u; x.lineCap = "round"; x.shadowColor = col; x.shadowBlur = 10 * u;
    x.beginPath();
    x.moveTo(bx, by + L); x.lineTo(bx, by); x.lineTo(bx + L, by);
    x.moveTo(bx + bw - L, by); x.lineTo(bx + bw, by); x.lineTo(bx + bw, by + L);
    x.moveTo(bx, by + bh - L); x.lineTo(bx, by + bh); x.lineTo(bx + L, by + bh);
    x.moveTo(bx + bw - L, by + bh); x.lineTo(bx + bw, by + bh); x.lineTo(bx + bw, by + bh - L);
    x.stroke(); x.shadowBlur = 0;
    // eticheta
    const g = +el.portion.value;
    const lines = r.kind === "fruit"
      ? (() => { const n = nutritionFor(r.label, g); return { k: "FRUCT IDENTIFICAT", t: fruitName(r.label), s: `${n.kcal == null ? "—" : Math.round(n.kcal)} kcal · ${g} g`,
          m: catalog.nutrients.map(({ short: sh, unit: un }, i) => `${sh} ${fmt(n.values[i])} ${n.values[i] == null ? "" : un}`) }; })()
      : { k: "DETECTAT", t: "Nu este un fruct", s: cap(catalog.nonFruitText(r.label)), m: [] };
    const cw = 250 * u, ch = (96 + lines.m.length * 19) * u;
    let cx = bx + bw + 20 * u; if (cx + cw > w - 10 * u) cx = Math.max(10 * u, bx - 20 * u - cw);
    const cy = clamp(by + bh / 2 - ch / 2, 10 * u, h - ch - 10 * u);
    x.fillStyle = "rgba(10,13,15,.82)"; roundRect(x, cx, cy, cw, ch, 16 * u); x.fill();
    x.strokeStyle = "rgba(255,255,255,.18)"; x.lineWidth = 1 * u; x.stroke();
    x.fillStyle = col; x.font = font(600, 11); x.fillText(lines.k, cx + 16 * u, cy + 26 * u);
    x.fillStyle = "#F2F5F3"; x.font = font(600, 24); x.fillText(lines.t, cx + 16 * u, cy + 56 * u);
    x.fillStyle = "#A3ADA8"; x.font = font(500, 14); x.fillText(lines.s, cx + 16 * u, cy + 80 * u);
    lines.m.forEach((t, i) => x.fillText(t, cx + 16 * u, cy + (102 + i * 19) * u));
  }
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

// ---------------- AR spațial (WebXR), încărcat doar la cerere ----------------
function updateXRButton() {
  if (!state.xrSupported) return;
  const ready = !state.example && el.nl.hidden === false && catalog.hasNutrition(state.shownFruit);
  el.btnXR.disabled = !ready || state.xrActive;
  el.btnXR.title = ready ? `Plasează eticheta pentru ${fruitName(state.shownFruit)} pe o suprafață reală` : "Identifică sau alege mai întâi un fruct";
}
async function startXR() {
  if (el.btnXR.disabled || state.xrActive) return;
  stopCamera();
  state.xrActive = true; updateXRButton();
  const fruit = state.shownFruit, g = +el.portion.value, n = nutritionFor(fruit, g);
  const overlay = $("xrOverlay");
  try {
    setStatus("Se pornește AR spațial…", "busy");
    const xr = await import("./js/xr.js");
    await xr.startSession({
      name: fruitName(fruit), en: fruitEn(fruit), grams: g,
      kcal: n.kcal == null ? null : Math.round(n.kcal),
      macros: catalog.nutrients.map(({ short, unit, dailyValue: dv, color }, i) => ({ label: short, value: n.values[i] == null ? "—" : fmt(n.values[i]) + " " + unit, ratio: n.values[i] == null ? 0 : Math.min(1, n.values[i] / dv * 2.5), color })),
      tint: catalog.get(fruit).visual.color
    }, {
      overlay, msg: $("xrMsg"), hint: $("xrHint"), close: $("xrClose"),
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
  supXR.querySelector("span").textContent = state.xrSupported ? "Compatibil: identifică sau alege un fruct, apoi apasă „Plasează în spațiu”" : "Indisponibil pe acest dispozitiv sau browser";
  el.btnXR.hidden = !state.xrSupported;
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
function renderShowcase() {
  const pool = [...catalog.showcase()].sort(() => Math.random() - 0.5);
  const [a, b, c] = [pool[0], pool[1 % pool.length], pool[2 % pool.length]];
  const kcal = (f, g = 100) => Math.round(catalog.nutritionFor(f.id, g).kcal);
  $("heroOrb").style.background = orbGradient(a);
  // cei doi nutrienți cei mai importanți pentru fructul ales (raportat la doza zilnică)
  const n = catalog.nutritionFor(a.id, 100);
  const top = catalog.nutrients.map((d, i) => ({ d, v: n.values[i] })).filter(x => x.v != null)
    .sort((x, y) => y.v / y.d.dailyValue - x.v / x.d.dailyValue).slice(0, 2);
  const hc = $("heroCard");
  hc.innerHTML = `<span class="k">Identificat</span><b></b><span class="t"></span><div class="mini"></div>`;
  hc.querySelector("b").textContent = a.ro;
  hc.querySelector(".t").textContent = `${kcal(a)} kcal · 100 g`;
  top.forEach(({ d, v }) => {
    const row = document.createElement("div");
    row.innerHTML = "<span></span><i></i><span></span>";
    row.firstChild.textContent = d.short;
    row.lastChild.textContent = `${fmt(v)} ${d.unit}`;
    row.querySelector("i").style.setProperty("--w", clamp(v / d.dailyValue * 250, 8, 100) + "%");
    hc.querySelector(".mini").appendChild(row);
  });
  const hp = $("heroPortion");
  hp.innerHTML = `<span class="k">Porție</span><b>150 g</b><span class="t"></span>`;
  hp.querySelector(".t").textContent = `${kcal(a, 150)} kcal`;
  const demo = (node, f) => { node.innerHTML = "<b></b><span></span>"; node.firstChild.textContent = f.ro; node.lastChild.textContent = ` · ${kcal(f)} kcal · 100 g`; };
  demo($("arDemo1"), b);
  $("arDemo1Art").style.setProperty("--demo-bg", orbGradient(b));
  demo($("arDemo2"), c);
}

function showFromCatalog(id) {
  state.example = false;
  showFruitCard(id, { chipText: "Catalog", note: "valori pentru " + fruitEn(id) });
}

async function boot() {
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
  mountCatalogUI(catalog, {
    onShow: id => { showFromCatalog(id); $("result").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" }); },
    onPlaceAR: id => { showFromCatalog(id); startXR(); },
    canPlaceAR: () => state.xrSupported && !state.xrActive
  });
  el.btnSheet.addEventListener("click", () => state.shownFruit && openFruitSheet(state.shownFruit));
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
  // Pornim modelele imediat, în fundal: când pui o imagine, analiza începe pe loc
  loadLocal().catch(e => { console.error(e); setStatus(explainError(e), "err"); });
}
boot();
