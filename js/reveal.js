// FruitAI — Camera AR: fructul digital 3D, independent de obiectul scanat.
// După ce fructul real (sau poza) a fost scos din cadru, fructul 3D apare peste imaginea camerei și rămâne acolo.
// Pe rând se desenează săgeți luminoase către: numele în română, numele în engleză și fiecare nutrient
// (vitamine, minerale, fibre). Atingerea unui nutrient deschide un card bilingv. Copilul poate roti, mări,
// micșora, muta și reseta fructul (butoane sau gesturi). Totul vine din catalog.

import { fruitArt } from "./fruit-art.js";
import { nIcon } from "./discovery.js";
import { sound } from "./sound.js";
import { t, getLang } from "./i18n.js";

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const SVGNS = "http://www.w3.org/2000/svg";
const ICON = {
  auto: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
  zin: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/>',
  zout: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6"/>',
  move: '<path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/><circle cx="12" cy="12" r="2"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  ar: '<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/>'
};
const svgIcon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
const KIND = { vitamin: "Vitamină", mineral: "Mineral", fiber: "Fibre" };

let root = null, cur = null;   // cur = { id, scene, raf, timers, items, opts }

function ensureRoot(stage) {
  if (root) return root;
  root = document.createElement("div");
  root.className = "fruit-reveal";   // atenție: „.reveal” e deja folosit pentru animațiile de derulare
  root.hidden = true;
  root.innerHTML = `
    <div class="rv-glow" aria-hidden="true"></div>
    <canvas class="rv-canvas" aria-label="Fructul 3D: trage ca să-l rotești, apropie două degete ca să-l mărești"></canvas>
    <div class="rv-art" aria-hidden="true"></div>
    <svg class="rv-links" aria-hidden="true"></svg>
    <div class="rv-top"></div>
    <div class="rv-col left"></div>
    <div class="rv-col right"></div>
    <div class="rv-tools" role="group" aria-label="Controale fruct 3D">
      <button type="button" class="dbtn round" data-tool="auto" aria-pressed="true" title="Rotire automată">${svgIcon("auto")}</button>
      <button type="button" class="dbtn round" data-tool="zin" title="Mărește">${svgIcon("zin")}</button>
      <button type="button" class="dbtn round" data-tool="zout" title="Micșorează">${svgIcon("zout")}</button>
      <button type="button" class="dbtn round" data-tool="move" aria-pressed="false" title="Mută fructul">${svgIcon("move")}</button>
      <button type="button" class="dbtn round" data-tool="reset" title="Resetează poziția">${svgIcon("reset")}</button>
    </div>
    <div class="rv-card" hidden role="dialog" aria-live="polite"></div>
    <div class="rv-actions"></div>`;
  stage.appendChild(root);
  root.querySelector(".rv-tools").addEventListener("click", e => {
    const b = e.target.closest("[data-tool]"), s = cur?.scene;
    if (!b || !s) return;
    sound.tick();
    const k = b.dataset.tool;
    if (k === "auto") b.setAttribute("aria-pressed", String(s.setAuto(!s.auto)));
    else if (k === "zin") s.zoom(1);
    else if (k === "zout") s.zoom(-1);
    else if (k === "move") { const on = s.setMode(s.mode === "move" ? "rotate" : "move") === "move"; b.setAttribute("aria-pressed", String(on)); root.classList.toggle("moving", on); }
    else if (k === "reset") { s.reset(); root.querySelector('[data-tool="auto"]').setAttribute("aria-pressed", "true"); root.querySelector('[data-tool="move"]').setAttribute("aria-pressed", "false"); root.classList.remove("moving"); }
    cur.touched = performance.now();
  });
  return root;
}

/** Mijlocul laturii etichetei care e îndreptată spre fruct. */
function facingPoint(r, cx, cy) {
  if (r.right < cx - 4) return { x: r.right + 2, y: (r.top + r.bottom) / 2 };
  if (r.left > cx + 4) return { x: r.left - 2, y: (r.top + r.bottom) / 2 };
  return { x: (r.left + r.right) / 2, y: r.bottom < cy ? r.bottom + 2 : r.top - 2 };
}

function drawLinks() {
  if (!cur) return;
  const sr = root.getBoundingClientRect();
  let c = cur.scene?.screenInfo();
  if (!c) { const a = root.querySelector(".rv-art").getBoundingClientRect(); c = { cx: a.left - sr.left + a.width / 2, cy: a.top - sr.top + a.height / 2, r: a.width * 0.42 }; }
  root.querySelector(".rv-links").setAttribute("viewBox", `0 0 ${sr.width} ${sr.height}`);
  for (const it of cur.items) {
    const r = it.el.getBoundingClientRect();
    if (!r.width) continue;
    const rel = { left: r.left - sr.left, right: r.right - sr.left, top: r.top - sr.top, bottom: r.bottom - sr.top };
    const end = facingPoint(rel, c.cx, c.cy);
    const dx = end.x - c.cx, dy = end.y - c.cy, d = Math.hypot(dx, dy) || 1;
    const sx = c.cx + dx / d * c.r * 0.92, sy = c.cy + dy / d * c.r * 0.92;
    const mx = (sx + end.x) / 2 - dy / d * 26, my = (sy + end.y) / 2 + dx / d * 26;
    const path = `M${sx.toFixed(1)} ${sy.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
    it.line.setAttribute("d", path); it.glow.setAttribute("d", path);
    it.dotA.setAttribute("cx", sx); it.dotA.setAttribute("cy", sy);
    // vârful de săgeată, orientat după ultima porțiune a curbei
    const ang = Math.atan2(end.y - my, end.x - mx) * 180 / Math.PI;
    it.arrow.setAttribute("transform", `translate(${end.x.toFixed(1)} ${end.y.toFixed(1)}) rotate(${ang.toFixed(1)})`);
  }
  cur.raf = requestAnimationFrame(drawLinks);
}

function closeCard() {
  root.querySelector(".rv-card").hidden = true;
  root.querySelectorAll(".rv-label.active").forEach(l => l.classList.remove("active"));
}

/** Cardul unui nutrient: explicație scurtă în română și în engleză. */
function openCard(n, labelEl) {
  const { catalog } = cur.opts;
  root.querySelectorAll(".rv-label.active").forEach(l => l.classList.remove("active"));
  labelEl.classList.add("active");
  labelEl.classList.remove("pop"); void labelEl.offsetWidth; labelEl.classList.add("pop");
  sound.pop();
  const info = cur.scene?.screenInfo(), sr = root.getBoundingClientRect(), lr = labelEl.getBoundingClientRect();
  if (cur.scene && info) cur.scene.poke(n.color, Math.sign(lr.left + lr.width / 2 - sr.left - info.cx), 0);
  const benefits = (n.benefits || []).map(b => catalog.info.benefits[b]).filter(Boolean);
  const card = root.querySelector(".rv-card");
  card.style.setProperty("--nc", n.color);
  card.innerHTML = `
    <button type="button" class="dbtn round small rv-card-x" aria-label="Închide">${svgIcon("close")}</button>
    <div class="rc-head">${nIcon(n, true)}<div><div class="rc-kind">${esc(t(KIND[n.kind]))}</div></div></div>
    <div class="rc-lang" data-no-i18n><span class="flag">RO</span><h4>${esc(n.title.toLocaleUpperCase("ro-RO"))}</h4><p>${esc(n.kid)}</p></div>
    <div class="rc-lang en" data-no-i18n><span class="flag">EN</span><h4>${esc((n.title_en || n.title).toUpperCase())}</h4><p>${esc(n.kid_en || "")}</p></div>
    <div class="rc-helps" data-no-i18n>${benefits.map(b => `<span>${b.icon} ${esc(b.ro)} · <i>${esc(b.en || "")}</i></span>`).join("")}</div>
    ${n.kind === "fiber" ? `<p class="rc-stat">${esc(t("{g} g de fibre la 100 g de fruct.", { g: String(n.amount).replace(".", ",") }))}</p>` : ""}`;
  card.querySelector(".rv-card-x").onclick = () => { sound.tick(); closeCard(); };
  card.hidden = false;
  card.classList.remove("in"); void card.offsetWidth; card.classList.add("in");
  cur.touched = performance.now();
  cur.opts.onNutrient?.(n);
}

/**
 * Arată fructul 3D în scenă.
 * opts: { catalog, reduceMotion, source, confidence: {level,text}|null, canPlaceAR(), onPlaceAR(id), onMore(id), onAgain(), onNutrient(n) }
 */
export async function showReveal(stage, id, opts) {
  const { catalog } = opts;
  const f = catalog.get(id);
  if (!f) return;
  hideReveal();
  ensureRoot(stage);
  const nutrients = catalog.nutrientsFor(id);
  root.style.setProperty("--fc", f.visual.color);
  const portrait = stage.clientWidth / Math.max(1, stage.clientHeight) < 0.95;
  root.classList.toggle("portrait", portrait);
  root.classList.toggle("reduced", !!opts.reduceMotion);
  root.classList.remove("moving");
  closeCard();

  // insigna de sus: confirmarea + încrederea (fără procente)
  const top = root.querySelector(".rv-top");
  top.innerHTML = opts.confidence ? `<span class="rv-ok">✓</span><span>${esc(t("Identificat"))}</span><span class="conf conf-${opts.confidence.level}"><i></i><i></i><i></i></span><b>${esc(t(opts.confidence.text))}</b>` : "";
  top.hidden = !opts.confidence;

  // etichetele, în ordinea apariției: română → engleză → nutrienți
  const left = root.querySelector(".rv-col.left"), right = root.querySelector(".rv-col.right"), svg = root.querySelector(".rv-links");
  left.replaceChildren(); right.replaceChildren(); svg.replaceChildren();
  const items = [];
  const add = (node, col, color, delay) => {
    node.style.setProperty("--d", delay + "s");
    node.style.setProperty("--lc", color);
    col.appendChild(node);
    const glow = document.createElementNS(SVGNS, "path"), line = document.createElementNS(SVGNS, "path");
    const dotA = document.createElementNS(SVGNS, "circle"), arrow = document.createElementNS(SVGNS, "path");
    glow.setAttribute("class", "rv-glowline"); line.setAttribute("class", "rv-line");
    [glow, line].forEach(p => { p.setAttribute("pathLength", "1"); p.style.stroke = color; p.style.animationDelay = (delay - 0.45) + "s, " + (delay + 0.3) + "s"; });
    dotA.setAttribute("r", "5"); dotA.setAttribute("class", "rv-dot"); dotA.style.fill = color; dotA.style.animationDelay = (delay - 0.45) + "s";
    arrow.setAttribute("d", "M-11 -7 L1 0 L-11 7 Z"); arrow.setAttribute("class", "rv-arrow"); arrow.style.fill = color; arrow.style.animationDelay = (delay - 0.05) + "s";
    svg.append(glow, line, dotA, arrow);
    items.push({ el: node, line, glow, dotA, arrow, delay });
  };
  const div = (cls, html, aria) => { const d = document.createElement("div"); d.className = "rv-label " + cls; d.innerHTML = html; if (aria) d.setAttribute("aria-label", aria); d.setAttribute("data-no-i18n", ""); return d; };
  const T0 = 1.25;   // fructul apare primul; săgețile pornesc după
  add(div("ro", `<small>${t("Română")}</small><b>${f.emoji ? `<span class="emo">${esc(f.emoji)}</span>` : ""}${esc(f.ro.toLocaleUpperCase("ro-RO"))}</b>`, "Română: " + f.ro), left, "#FFE27A", T0);
  add(div("en", `<small>${t("English")}</small><b>${esc(f.en.toUpperCase())}</b>`, "English: " + f.en), portrait ? left : right, "#8EF0C9", T0 + 0.7);
  const cols = portrait ? [right, right] : [left, right];
  nutrients.forEach((n, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "rv-label nut " + n.kind;
    b.innerHTML = `${nIcon(n)}<span><small>${esc(t(KIND[n.kind]))}</small><b>${esc(getLang() === "en" ? (n.title_en || n.title) : n.title)}</b></span>`;
    b.setAttribute("aria-label", `${n.title}: ${t("atinge ca să afli ce face")}`);
    b.addEventListener("click", () => openCard(n, b));
    add(b, cols[i % 2], n.color, T0 + 1.5 + i * 0.42);
  });
  if (!nutrients.length) add(div("nut none", `<span><small>${esc(t("Vitamine"))}</small><b>${esc(t("Nu avem date"))}</b></span>`), left, "#A3ADA8", T0 + 1.5);

  // butoanele apar la final
  const end = T0 + 1.5 + Math.max(1, nutrients.length) * 0.42 + 0.3;
  const acts = root.querySelector(".rv-actions");
  acts.style.setProperty("--d", end + "s");
  root.querySelector(".rv-tools").style.setProperty("--d", (T0 + 0.4) + "s");
  acts.innerHTML = `<button type="button" class="dbtn big primary" data-rv="more"><span aria-hidden="true">✨</span><span>${esc(t("Află mai multe"))}</span></button>
    ${opts.canPlaceAR?.() ? `<button type="button" class="dbtn big ar" data-rv="space">${svgIcon("ar")}<span>${esc(t("Pune-l în spațiu"))}</span></button>` : ""}
    <button type="button" class="dbtn big" data-rv="again"><span>${esc(t(opts.source === "photo" ? "Altă poză" : "Alt fruct"))}</span></button>`;
  acts.querySelector('[data-rv="more"]').onclick = () => { sound.tick(); opts.onMore(id); };
  acts.querySelector('[data-rv="again"]').onclick = () => { sound.tick(); opts.onAgain(); };
  acts.querySelector('[data-rv="space"]')?.addEventListener("click", () => { sound.tick(); opts.onPlaceAR(id); });

  // pornirea animației
  root.classList.remove("play"); void root.offsetWidth;
  root.hidden = false; root.classList.add("play");
  stage.classList.add("revealing");
  const art = root.querySelector(".rv-art"), canvas = root.querySelector(".rv-canvas");
  art.innerHTML = fruitArt(f, { size: 260 }); art.hidden = false; canvas.classList.remove("ready");
  root.querySelector('[data-tool="auto"]').setAttribute("aria-pressed", "true");
  root.querySelector('[data-tool="move"]').setAttribute("aria-pressed", "false");
  cur = { id, scene: null, raf: 0, items, timers: [], opts, touched: 0 };
  sound.discover();
  items.forEach(it => cur.timers.push(setTimeout(() => sound.pop(), it.delay * 1000)));
  drawLinks();

  try {
    const { createFruitScene } = await import("./fruit3d.js");
    if (!cur || cur.id !== id) return;
    cur.scene = createFruitScene(canvas, f, { reducedMotion: !!opts.reduceMotion, distance: portrait ? 1.05 : 1.3 });
    cur.scene.celebrate();
    canvas.classList.add("ready"); art.hidden = true;
  } catch (e) {
    console.warn("Modelul 3D nu a putut fi încărcat, folosesc ilustrația:", e);
    art.classList.add("float");
  }
}

export function hideReveal() {
  if (cur) {
    cancelAnimationFrame(cur.raf);
    cur.timers.forEach(clearTimeout);
    cur.scene?.dispose();
    cur = null;
  }
  if (root) { root.hidden = true; root.classList.remove("play"); root.parentElement?.classList.remove("revealing"); closeCard(); }
}

export const revealActive = () => !!cur;
/** Copilul s-a jucat cu fructul în ultimele `ms` milisecunde? (atunci nu-l înlocuim cu alt fruct) */
export const revealBusy = (ms = 8000) => !!cur && (performance.now() - Math.max(cur.touched, cur.scene?.lastTouch || 0) < ms || !root.querySelector(".rv-card").hidden);
