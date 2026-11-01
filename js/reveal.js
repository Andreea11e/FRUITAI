// FruitAI — „dezvăluirea” fructului 3D direct în scena camerei.
// După ce fructul real (sau poza) a fost scos din cadru, aici apare fructul 3D,
// apoi, pe rând, liniuțe luminoase către: numele în română, numele în engleză și vitaminele.
// Totul se construiește din catalog.

import { fruitArt } from "./fruit-art.js";
import { nIcon } from "./discovery.js";
import { sound } from "./sound.js";

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const SVGNS = "http://www.w3.org/2000/svg";

let root = null, cur = null;   // cur = { id, scene, raf, timers, items }

function ensureRoot(stage) {
  if (root) return root;
  root = document.createElement("div");
  root.className = "fruit-reveal";   // atenție: „.reveal” e deja folosit pentru animațiile de derulare
  root.hidden = true;
  root.innerHTML = `
    <div class="rv-glow" aria-hidden="true"></div>
    <canvas class="rv-canvas" aria-hidden="true"></canvas>
    <div class="rv-art" aria-hidden="true"></div>
    <svg class="rv-links" aria-hidden="true"></svg>
    <div class="rv-col left"></div>
    <div class="rv-col right"></div>
    <div class="rv-actions"></div>`;
  stage.appendChild(root);
  return root;
}

/** Mijlocul laturii etichetei care e îndreptată spre fruct. */
function facingPoint(r, cx, cy) {
  if (r.right < cx - 4) return { x: r.right, y: (r.top + r.bottom) / 2 };      // eticheta e la stânga
  if (r.left > cx + 4) return { x: r.left, y: (r.top + r.bottom) / 2 };        // la dreapta
  return { x: (r.left + r.right) / 2, y: r.bottom < cy ? r.bottom : r.top };  // deasupra / dedesubt
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
    // curbă ușoară: punctul de control e deplasat perpendicular pe direcție
    const mx = (sx + end.x) / 2 - dy / d * 26, my = (sy + end.y) / 2 + dx / d * 26;
    const path = `M${sx.toFixed(1)} ${sy.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
    it.line.setAttribute("d", path); it.glow.setAttribute("d", path);
    it.dotA.setAttribute("cx", sx); it.dotA.setAttribute("cy", sy);
    it.dotB.setAttribute("cx", end.x); it.dotB.setAttribute("cy", end.y);
  }
  cur.raf = requestAnimationFrame(drawLinks);
}

/**
 * Arată fructul 3D în scenă.
 * opts: { catalog, reduceMotion, onMore(id), onAgain(), source }
 */
export async function showReveal(stage, id, opts) {
  const { catalog } = opts;
  const f = catalog.get(id);
  if (!f) return;
  hideReveal();
  ensureRoot(stage);
  const vitamins = catalog.nutrientsFor(id).filter(n => n.kind === "vitamin");
  root.style.setProperty("--fc", f.visual.color);
  root.classList.toggle("portrait", stage.clientWidth / Math.max(1, stage.clientHeight) < 0.95);
  root.classList.toggle("reduced", !!opts.reduceMotion);

  // etichetele, în ordinea apariției: română → engleză → vitamine
  const left = root.querySelector(".rv-col.left"), right = root.querySelector(".rv-col.right"), svg = root.querySelector(".rv-links");
  left.replaceChildren(); right.replaceChildren(); svg.replaceChildren();
  const label = (cls, html, aria) => { const d = document.createElement("div"); d.className = "rv-label " + cls; d.innerHTML = html; if (aria) d.setAttribute("aria-label", aria); return d; };
  const items = [];
  const add = (node, col, color, delay) => {
    node.style.setProperty("--d", delay + "s");
    node.style.setProperty("--lc", color);
    col.appendChild(node);
    const glow = document.createElementNS(SVGNS, "path"), line = document.createElementNS(SVGNS, "path");
    const dotA = document.createElementNS(SVGNS, "circle"), dotB = document.createElementNS(SVGNS, "circle");
    glow.setAttribute("class", "rv-glowline"); line.setAttribute("class", "rv-line");
    [glow, line].forEach(p => { p.setAttribute("pathLength", "1"); p.style.stroke = color; p.style.animationDelay = (delay - 0.45) + "s, " + (delay + 0.3) + "s"; });
    dotA.setAttribute("r", "5"); dotB.setAttribute("r", "4");
    [dotA, dotB].forEach((c, k) => { c.setAttribute("class", "rv-dot"); c.style.fill = color; c.style.animationDelay = (delay - (k ? 0.05 : 0.45)) + "s"; });
    svg.append(glow, line, dotA, dotB);
    items.push({ el: node, line, glow, dotA, dotB, delay });
  };
  const T0 = 1.25;   // fructul apare primul; liniuțele pornesc după
  add(label("ro", `<small>Română</small><b>${f.emoji ? `<span class="emo">${esc(f.emoji)}</span>` : ""}${esc(f.ro.toLocaleUpperCase("ro-RO"))}</b>`, "În română: " + f.ro), left, "#FFE27A", T0);
  // pe ecran îngust: ambele nume sus, vitaminele jos; pe ecran lat: stânga / dreapta
  const portrait = root.classList.contains("portrait");
  add(label("en", `<small>English</small><b>${esc(f.en.toUpperCase())}</b>`, "În engleză: " + f.en), portrait ? left : right, "#8EF0C9", T0 + 0.75);
  const vitCols = portrait ? [right, right] : [left, right];
  vitamins.forEach((n, i) => add(label("vit", `${nIcon(n)}<span><small>Vitamină</small><b>${esc(n.title)}</b></span>`, n.title), vitCols[i % 2], n.color, T0 + 1.6 + i * 0.5));
  if (!vitamins.length) add(label("vit none", `<span><small>Vitamine</small><b>Nu avem date</b></span>`), left, "#A3ADA8", T0 + 1.6);

  // butoanele apar la final
  const end = T0 + 1.6 + Math.max(1, vitamins.length) * 0.5 + 0.4;
  const acts = root.querySelector(".rv-actions");
  acts.style.setProperty("--d", end + "s");
  acts.innerHTML = `<button type="button" class="dbtn big primary" data-rv="more"><span aria-hidden="true">✨</span><span>Află mai multe</span></button>
    <button type="button" class="dbtn big" data-rv="again"><span>${opts.source === "photo" ? "Altă poză" : "Alt fruct"}</span></button>`;
  acts.querySelector('[data-rv="more"]').onclick = () => { sound.tick(); opts.onMore(id); };
  acts.querySelector('[data-rv="again"]').onclick = () => { sound.tick(); opts.onAgain(); };

  // pornirea animației
  root.classList.remove("play"); void root.offsetWidth;
  root.hidden = false; root.classList.add("play");
  stage.classList.add("revealing");
  const art = root.querySelector(".rv-art"), canvas = root.querySelector(".rv-canvas");
  art.innerHTML = fruitArt(f, { size: 260 }); art.hidden = false; canvas.classList.remove("ready");
  cur = { id, scene: null, raf: 0, items, timers: [] };
  sound.discover();
  items.forEach(it => cur.timers.push(setTimeout(() => sound.pop(), it.delay * 1000)));
  drawLinks();

  try {
    const { createFruitScene } = await import("./fruit3d.js");
    if (!cur || cur.id !== id) return;
    cur.scene = createFruitScene(canvas, f, { reducedMotion: !!opts.reduceMotion, distance: root.classList.contains("portrait") ? 1.0 : 1.3 });
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
  if (root) { root.hidden = true; root.classList.remove("play"); root.parentElement?.classList.remove("revealing"); }
}

export const revealActive = () => !!cur;
