// FruitAI — interfața catalogului, generată integral din Catalog.
// Cardurile, filtrele (categorii, vitamine/minerale) și fișa educativă se construiesc
// din date: un fruct nou în data/fruits.json apare aici automat.

import { fruitArt } from "./fruit-art.js";

const $ = id => document.getElementById(id);
const fmt = v => {
  if (v == null) return "—";
  const r = v >= 100 ? Math.round(v) : v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100;
  return r.toLocaleString("ro-RO");
};
const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k === "style") n.style.cssText = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) n.append(c);
  return n;
};

let ctx = null;   // { catalog, onOpen(id), isDiscovered(id) }

export function mountCatalogUI(catalog, opts) {
  ctx = { catalog, ...opts };
  const state = { q: "", category: null, vitamin: null, scannable: null };
  const grid = $("catGrid"), filters = $("catFilters"), meta = $("catMeta"), empty = $("catEmpty");
  const search = $("catSearch"), select = $("catNutrient"), scanWrap = $("catScanWrap"), scan = $("catScan");

  // Exemplu de căutare luat din catalog, nu scris de mână
  search.placeholder = `Caută un fruct, de ex. „${catalog.pick(catalog.fruits).ro.toLowerCase()}”`;

  // Filtre de categorie: doar categoriile care au fructe
  const catButtons = [{ id: null, ro: "Toate", count: catalog.count }, ...catalog.categoryCounts()].map(c =>
    el("button", { type: "button", "aria-pressed": c.id === null ? "true" : "false", onclick: () => { state.category = c.id; sync(); } },
      c.ro, el("small", {}, String(c.count))));
  catButtons.forEach((b, i) => { b.dataset.cat = i === 0 ? "" : catalog.categoryCounts()[i - 1].id; });
  filters.replaceChildren(...catButtons);

  // Filtru de vitamine / minerale, derivat din valorile existente
  const vit = catalog.facet("vitamins"), min = catalog.facet("minerals");
  select.replaceChildren(
    el("option", { value: "" }, "Toate vitaminele și mineralele"),
    el("optgroup", { label: "Vitamine" }, vit.map(v => el("option", { value: v.value }, `Vitamina ${v.value} (${v.count})`))),
    el("optgroup", { label: "Minerale" }, min.map(v => el("option", { value: v.value }, `${v.value.charAt(0).toUpperCase() + v.value.slice(1)} (${v.count})`)))
  );
  select.addEventListener("change", () => { state.vitamin = select.value || null; sync(); });

  // Filtrul „recunoscute de scanner” apare doar dacă există și fructe care nu au mapare AI
  if (catalog.recognizable.length !== catalog.count) {
    scanWrap.hidden = false;
    scan.addEventListener("change", () => { state.scannable = scan.checked ? true : null; sync(); });
  }
  search.addEventListener("input", () => { state.q = search.value; sync(); });

  function card(f) {
    const vit = f.vitamins.map(v => v.replace(/\s*\(.*\)$/, ""));
    const found = ctx.isDiscovered(f.id);
    return el("button", { type: "button", class: "fcard" + (found ? " found" : ""), style: `--c:${f.visual.color}`, "aria-label": `${f.ro}, ${f.en}. Descoperă fructul`, onclick: () => ctx.onOpen(f.id) },
      found ? el("span", { class: "found-badge", title: "Descoperit cu scannerul" }, "✓") : null,
      el("span", { html: fruitArt(f, { size: 64 }) }).firstElementChild,
      el("b", {}, f.ro),
      el("span", { class: "en" }, f.en),
      el("span", { class: "row" },
        el("span", {}, vit.length ? ["Vit. ", el("em", {}, vit.slice(0, 3).join(", "))] : "Fără date"),
        el("span", { class: "badge" + (f.ai ? "" : " off") }, f.emoji || (f.ai ? "AI" : "catalog")))
    );
  }

  function sync() {
    filters.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String((b.dataset.cat || null) === state.category)));
    const list = catalog.filter(state);
    grid.replaceChildren(...list.map(card));
    empty.hidden = list.length > 0;
    const found = catalog.fruits.filter(f => ctx.isDiscovered(f.id)).length;
    meta.textContent = (list.length === catalog.count ? `${catalog.count} fructe · ${catalog.recognizable.length} recunoscute de scanner` : `${list.length} din ${catalog.count} fructe`) + ` · ai descoperit ${found} cu camera`;
  }
  sync();
  // colecția se actualizează când descoperi un fruct nou cu camera
  window.addEventListener("fruitai:discovered", sync);
}

