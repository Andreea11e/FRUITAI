// FruitAI — ecranul „Descoperă fructul”, gândit pentru copii.
// Sus: numele în română și engleză. În centru: fructul 3D interactiv.
// În jur: vitaminele, mineralele și fibrele, legate de fruct prin săgeți luminoase.
// Jos: personajul Vita, beneficiile și curiozitatea. Totul vine din catalog.

import { fruitArt } from "./fruit-art.js";
import { sound } from "./sound.js";

const KEY = "fruitai.discovered";
/** Colecția fructelor descoperite cu scannerul (păstrată doar în acest browser). */
export const collection = {
  all() { try { return new Set(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { return new Set(); } },
  has(id) { return this.all().has(id); },
  add(id) {
    const s = this.all(), isNew = !s.has(id);
    s.add(id);
    try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch {}
    return isNew;
  }
};

// Personajul Vita: un mugure prietenos (desen original, SVG)
export const MASCOT = `<svg viewBox="0 0 120 130" aria-hidden="true">
  <defs>
    <radialGradient id="vitaBody" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#F1FFB8"/><stop offset=".5" stop-color="#C9F25C"/><stop offset="1" stop-color="#6FB52C"/></radialGradient>
    <linearGradient id="vitaLeaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8BE26A"/><stop offset="1" stop-color="#2F8F3A"/></linearGradient>
  </defs>
  <g class="v-leaf"><path d="M60 26 C60 14 66 6 78 4 C78 16 70 24 60 26Z" fill="url(#vitaLeaf)"/><path d="M60 26 C58 16 50 10 40 10 C42 20 50 26 60 26Z" fill="url(#vitaLeaf)" opacity=".85"/><path d="M60 34 L60 24" stroke="#2F8F3A" stroke-width="3" stroke-linecap="round"/></g>
  <g class="v-arm-l"><path d="M22 78 C10 74 6 64 10 58" stroke="#7DBE34" stroke-width="7" fill="none" stroke-linecap="round"/></g>
  <g class="v-arm-r"><path d="M98 78 C110 72 114 60 108 52" stroke="#7DBE34" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="108" cy="50" r="5" fill="#C9F25C"/></g>
  <ellipse cx="60" cy="78" rx="40" ry="44" fill="url(#vitaBody)"/>
  <ellipse cx="46" cy="58" rx="10" ry="6" fill="#fff" opacity=".45" transform="rotate(-25 46 58)"/>
  <g class="v-eyes">
    <ellipse cx="46" cy="74" rx="8.5" ry="10" fill="#1B2A12"/><ellipse cx="74" cy="74" rx="8.5" ry="10" fill="#1B2A12"/>
    <circle cx="49" cy="70" r="3.2" fill="#fff"/><circle cx="77" cy="70" r="3.2" fill="#fff"/>
    <circle cx="44" cy="78" r="1.4" fill="#fff" opacity=".8"/><circle cx="72" cy="78" r="1.4" fill="#fff" opacity=".8"/>
  </g>
  <ellipse cx="34" cy="90" rx="7" ry="4" fill="#FF8FA3" opacity=".55"/><ellipse cx="86" cy="90" rx="7" ry="4" fill="#FF8FA3" opacity=".55"/>
  <path d="M50 92 Q60 102 70 92" stroke="#1B2A12" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  <ellipse cx="45" cy="121" rx="10" ry="5" fill="#6FB52C"/><ellipse cx="75" cy="121" rx="10" ry="5" fill="#6FB52C"/>
</svg>`;

const ICONS = {
  rotate: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
  zin: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/>',
  zout: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/><circle cx="12" cy="12" r="2"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  soundOn: '<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  soundOff: '<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M22 9l-6 6M16 9l6 6"/>',
  ar: '<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/>'
};
const svgIcon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const cheers = ["Super!", "Uau!", "Excelent!", "Bravo!", "Fantastic!"];

let ctx = null;            // { catalog, reduceMotion, canPlaceAR, onPlaceAR }
let dlg = null, q = null;  // dialogul și un helper de selecție
let current = null;        // { id, scene, raf, nutrients }

export function initDiscovery(opts) {
  ctx = opts;
  dlg = document.createElement("dialog");
  dlg.className = "disc";
  dlg.setAttribute("aria-labelledby", "discRo");
  dlg.innerHTML = `
    <div class="disc-bg" aria-hidden="true"><i></i><i></i><i></i></div>
    <header class="disc-top">
      <button type="button" class="dbtn round" data-act="sound" aria-label="Sunet pornit sau oprit"></button>
      <div class="disc-title">
        <div class="disc-badge" id="discBadge"></div>
        <h2 class="disc-ro" id="discRo"></h2>
        <div class="disc-en" id="discEn"></div>
      </div>
      <button type="button" class="dbtn round" data-act="close" aria-label="Închide">${svgIcon("close")}</button>
    </header>
    <section class="disc-stage" id="discStage">
      <div class="disc-art" id="discArt" aria-hidden="true"></div>
      <canvas class="disc-canvas" id="discCanvas" aria-label="Fructul 3D: trage ca să-l rotești"></canvas>
      <svg class="disc-links" id="discLinks" aria-hidden="true"><defs id="discDefs"></defs></svg>
      <div class="disc-col left" id="discLeft"></div>
      <div class="disc-col right" id="discRight"></div>
      <div class="disc-tools" role="group" aria-label="Controale model 3D">
        <button type="button" class="dbtn round" data-act="rotate" aria-pressed="true" title="Rotire automată">${svgIcon("rotate")}</button>
        <button type="button" class="dbtn round" data-act="zin" title="Mărește">${svgIcon("zin")}</button>
        <button type="button" class="dbtn round" data-act="zout" title="Micșorează">${svgIcon("zout")}</button>
        <button type="button" class="dbtn round" data-act="reset" title="Resetează">${svgIcon("reset")}</button>
      </div>
      <div class="disc-panel" id="discPanel" hidden role="dialog" aria-live="polite"></div>
      <p class="disc-hint" id="discHint">Trage fructul ca să-l rotești · Atinge o vitamină</p>
    </section>
    <footer class="disc-bottom">
      <div class="disc-mascot">
        <div class="mascot" aria-hidden="true">${MASCOT}</div>
        <div class="bubble" id="discBubble" aria-live="polite"></div>
      </div>
      <div class="disc-info">
        <div class="disc-card"><h3>Ce face bine corpului</h3><div class="disc-benefits" id="discBenefits"></div></div>
        <div class="disc-card fact"><h3>Știai că?</h3><p id="discFact"></p><p class="desc" id="discDesc"></p></div>
      </div>
      <div class="disc-actions" id="discActions"></div>
    </footer>`;
  document.body.appendChild(dlg);
  q = id => dlg.querySelector("#" + id);

  dlg.addEventListener("click", e => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act, s = current?.scene;
    if (act !== "close" && act !== "sound") sound.tick();
    if (act === "close") dlg.close();
    else if (act === "sound") { sound.toggle(); paintSound(); }
    else if (act === "rotate" && s) { const on = s.setAuto(!s.auto); b.setAttribute("aria-pressed", String(on)); }
    else if (act === "zin") s?.zoom(1);
    else if (act === "zout") s?.zoom(-1);
    else if (act === "reset") { s?.reset(); dlg.querySelector('[data-act="rotate"]').setAttribute("aria-pressed", "true"); }
    else if (act === "panel-close") closePanel();
    else if (act === "ar") { dlg.close(); ctx.onPlaceAR(current_id); }
  });
  dlg.addEventListener("close", teardown);
  paintSound();
}
let current_id = null;

function paintSound() {
  const b = dlg.querySelector('[data-act="sound"]');
  b.innerHTML = svgIcon(sound.enabled ? "soundOn" : "soundOff");
  b.setAttribute("aria-pressed", String(sound.enabled));
}

function teardown() {
  if (!current) return;
  cancelAnimationFrame(current.raf);
  current.scene?.dispose();
  current = null;
  document.documentElement.classList.remove("disc-lock");
}

/** Pictograma „3D” a unui nutrient: sferă (vitamine), cristal (minerale), frunză (fibre). */
export function nIcon(n, big = false) {
  return `<span class="nicon ${n.kind}${big ? " big" : ""}" style="--nc:${n.color}"><b>${esc(n.symbol)}</b></span>`;
}

function say(text) {
  const b = q("discBubble");
  b.classList.remove("in"); void b.offsetWidth;
  b.textContent = text;
  b.classList.add("in");
  dlg.querySelector(".mascot").classList.remove("talk"); void dlg.offsetWidth;
  dlg.querySelector(".mascot").classList.add("talk");
}

function closePanel() {
  q("discPanel").hidden = true;
  dlg.querySelectorAll(".ncard.active").forEach(c => c.classList.remove("active"));
}

function openNutrient(n, card) {
  const { catalog } = ctx;
  dlg.querySelectorAll(".ncard.active").forEach(c => c.classList.remove("active"));
  card.classList.add("active");
  card.classList.remove("pop"); void card.offsetWidth; card.classList.add("pop");
  sound.pop();
  // fructul „sare”, iar particulele zboară spre vitamina aleasă
  const st = q("discStage").getBoundingClientRect(), r = card.getBoundingClientRect();
  const info = current?.scene?.screenInfo();
  if (current?.scene && info) current.scene.poke(n.color, Math.sign(r.left + r.width / 2 - st.left - info.cx), 0);
  const count = n.kind === "fiber" ? null : catalog.fruits.filter(f => (n.kind === "vitamin" ? f.vitamins : f.minerals).includes(n.key)).length;
  const benefits = (n.benefits || []).map(b => catalog.info.benefits[b]).filter(Boolean);
  const p = q("discPanel");
  p.innerHTML = `
    <button type="button" class="dbtn round small" data-act="panel-close" aria-label="Închide explicația">${svgIcon("close")}</button>
    <div class="p-head">${nIcon(n, true)}<div><div class="p-kind">${n.kind === "vitamin" ? "Vitamină" : n.kind === "mineral" ? "Mineral" : "Fibre"}</div><h4>${esc(n.title)}</h4></div></div>
    <p class="p-kid">${esc(n.kid)}</p>
    <div class="p-helps">${benefits.map(b => `<span>${b.icon} ${esc(b.ro)}</span>`).join("")}</div>
    <p class="p-stat">${n.kind === "fiber" ? `${esc(String(n.amount).replace(".", ","))} g de fibre la 100 g de fruct.` : `O găsești în ${count} din ${catalog.count} fructe din catalog.`}</p>`;
  p.style.setProperty("--nc", n.color);
  p.hidden = false;
  p.classList.remove("in"); void p.offsetWidth; p.classList.add("in");
  say(`${cheers[Math.floor(Math.random() * cheers.length)]} ${n.title} te ajută la: ${benefits.map(b => b.ro.toLowerCase()).join(", ")}.`);
}

/** Linii luminoase cu săgeți, de la marginea fructului la fiecare card. Recalculate la fiecare cadru. */
function drawLinks() {
  if (!current) return;
  const stage = q("discStage"), sr = stage.getBoundingClientRect();
  let c = current.scene?.screenInfo();
  if (!c) { const a = q("discArt").getBoundingClientRect(); c = { cx: a.left - sr.left + a.width / 2, cy: a.top - sr.top + a.height / 2, r: a.width * 0.4 }; }
  const svg = q("discLinks");
  svg.setAttribute("viewBox", `0 0 ${sr.width} ${sr.height}`);
  current.cards.forEach(({ el: card, path, glow, n }) => {
    const r = card.getBoundingClientRect();
    if (!r.width) return;
    const left = r.left - sr.left + r.width / 2 < c.cx;
    const ax = left ? r.right - sr.left + 4 : r.left - sr.left - 4, ay = r.top - sr.top + r.height / 2;
    const dx = ax - c.cx, dy = ay - c.cy, d = Math.hypot(dx, dy) || 1;
    const px = c.cx + dx / d * c.r * 0.95, py = c.cy + dy / d * c.r * 0.95;
    const mx = px + (ax - px) * 0.55;
    const dpath = `M${px.toFixed(1)} ${py.toFixed(1)} C${mx.toFixed(1)} ${py.toFixed(1)} ${(ax + (left ? 40 : -40)).toFixed(1)} ${ay.toFixed(1)} ${ax.toFixed(1)} ${ay.toFixed(1)}`;
    path.setAttribute("d", dpath); glow.setAttribute("d", dpath);
  });
  current.raf = requestAnimationFrame(drawLinks);
}

/**
 * Deschide experiența pentru un fruct.
 * source: "scan" (descoperit cu camera), "catalog" sau "history".
 */
export async function openDiscovery(id, { source = "catalog", isNew = false } = {}) {
  const { catalog } = ctx;
  const f = catalog.get(id);
  if (!f) return;
  teardown();
  current_id = id;
  const nutrients = catalog.nutrientsFor(id);
  const benefits = catalog.benefitsFor(id);
  dlg.style.setProperty("--fc", f.visual.color);
  dlg.classList.toggle("reduced", !!ctx.reduceMotion);

  // titlul: emoji + nume în română (litere animate), apoi engleza
  const total = collection.all().size;
  q("discBadge").innerHTML = source === "scan"
    ? (isNew ? `🎉 Fruct nou descoperit! <small>${total} din ${catalog.count}</small>` : `🔎 Descoperit din nou <small>${total} din ${catalog.count}</small>`)
    : source === "history" ? "🕘 Din istoric" : "📚 Din catalog";
  const ro = f.ro.toLocaleUpperCase("ro-RO");
  q("discRo").innerHTML = `<span class="emo">${f.emoji ? esc(f.emoji) : fruitArt(f, { size: 52, className: "emo-art" })}</span><span class="word">${[...ro].map((ch, i) => `<span style="--i:${i}">${ch === " " ? "&nbsp;" : esc(ch)}</span>`).join("")}</span>`;
  q("discRo").setAttribute("aria-label", f.ro);
  q("discEn").textContent = f.en.toUpperCase();

  // cardurile nutrienților, alternând stânga / dreapta, cu linii luminoase
  const left = q("discLeft"), right = q("discRight"), svg = q("discLinks"), defs = q("discDefs");
  left.replaceChildren(); right.replaceChildren();
  svg.querySelectorAll("path").forEach(p => p.remove());
  defs.innerHTML = "";
  const cards = nutrients.map((n, i) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "ncard";
    card.style.setProperty("--nc", n.color);
    card.style.setProperty("--d", (0.55 + i * 0.09) + "s");
    card.innerHTML = `${nIcon(n)}<span class="nt"><b>${esc(n.title)}</b><small>${n.kind === "fiber" ? esc(String(n.amount).replace(".", ",")) + " g / 100 g" : "Atinge să afli"}</small></span>`;
    card.addEventListener("click", () => openNutrient(n, card));
    (i % 2 ? right : left).appendChild(card);
    const mid = "arr" + i;
    defs.insertAdjacentHTML("beforeend", `<marker id="${mid}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${n.color}"/></marker>`);
    const glow = document.createElementNS("http://www.w3.org/2000/svg", "path");
    glow.setAttribute("class", "lglow"); glow.style.stroke = n.color; glow.style.animationDelay = card.style.getPropertyValue("--d");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "lpath"); path.style.stroke = n.color; path.setAttribute("marker-end", `url(#${mid})`); path.style.animationDelay = card.style.getPropertyValue("--d");
    svg.append(glow, path);
    return { el: card, path, glow, n };
  });
  left.dataset.n = Math.ceil(nutrients.length / 2); right.dataset.n = Math.floor(nutrients.length / 2);
  if (!nutrients.length) left.innerHTML = `<p class="disc-none">Pentru acest fruct nu avem date despre vitamine.</p>`;

  // jos: beneficii (atingerea evidențiază nutrienții care le aduc), curiozitate, acțiuni
  q("discBenefits").replaceChildren(...benefits.map(b => {
    const chip = document.createElement("button");
    chip.type = "button"; chip.className = "bchip";
    chip.innerHTML = `<span class="bi">${b.icon}</span>${esc(b.ro)}`;
    chip.addEventListener("click", () => {
      sound.tick();
      cards.forEach(c => c.el.classList.toggle("glow", (c.n.benefits || []).includes(b.key)));
      setTimeout(() => cards.forEach(c => c.el.classList.remove("glow")), 1800);
      say(`${b.icon} ${b.ro}: vine de la ${b.from.join(", ")}.`);
    });
    return chip;
  }));
  if (!benefits.length) q("discBenefits").innerHTML = `<p class="disc-none">Nu avem încă date pentru acest fruct.</p>`;
  q("discFact").textContent = f.fact;
  q("discDesc").textContent = f.description;
  const acts = q("discActions");
  acts.innerHTML = "";
  if (ctx.canPlaceAR()) acts.insertAdjacentHTML("beforeend", `<button type="button" class="dbtn big ar" data-act="ar">${svgIcon("ar")}<span>Pune-l pe masă (AR)</span></button>`);
  acts.insertAdjacentHTML("beforeend", `<button type="button" class="dbtn big primary" data-act="close"><span>${source === "catalog" ? "Înapoi la catalog" : "Caută alt fruct"}</span></button>`);

  q("discPanel").hidden = true;
  q("discArt").innerHTML = fruitArt(f, { size: 240 });
  q("discArt").hidden = false;
  q("discCanvas").classList.remove("ready");
  dlg.querySelector('[data-act="rotate"]').setAttribute("aria-pressed", "true");

  // animația de deschidere
  dlg.classList.remove("play"); void dlg.offsetWidth; dlg.classList.add("play");
  document.documentElement.classList.add("disc-lock");
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
  current = { id, scene: null, raf: 0, cards };
  drawLinks();
  sound.discover();
  const n = nutrients.length;
  say(source === "scan"
    ? `${isNew ? "Uau, un fruct nou!" : "Iar ai găsit"} ${f.ro}! ${f.ro.toLowerCase() === f.en.toLowerCase() ? "Și în engleză îi spune tot așa" : `În engleză îi spune „${f.en}”`}. ${n ? `Are ${n} ${n === 1 ? "comoară ascunsă" : "comori ascunse"}: atinge-le ca să afli ce fac!` : ""}`
    : `Salut, eu sunt Vita! Hai să descoperim ${f.ro.toLowerCase()}. ${n ? "Atinge vitaminele din jurul lui!" : ""}`);

  // modelul 3D se încarcă abia acum (three.js), cu ilustrația 2D ca rezervă
  try {
    const { createFruitScene } = await import("./fruit3d.js");
    if (!current || current.id !== id) return;
    current.scene = createFruitScene(q("discCanvas"), f, { reducedMotion: !!ctx.reduceMotion });
    current.scene.celebrate();
    q("discCanvas").classList.add("ready");
    q("discArt").hidden = true;
  } catch (e) {
    console.warn("Modelul 3D nu a putut fi încărcat, folosesc ilustrația:", e);
    q("discArt").classList.add("float");
  }
}
