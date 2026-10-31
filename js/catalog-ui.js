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

let ctx = null;   // { catalog, onShow, onPlaceAR, canPlaceAR }

/** Pastilele de vitamine și minerale ale unui fruct (folosite în fișă și în panoul de rezultat). */
export function nutrientPills(fruit) {
  const pills = [
    ...fruit.vitamins.map(v => el("span", { class: "v" }, "Vitamina " + v)),
    ...fruit.minerals.map(m => el("span", { class: "m" }, m.charAt(0).toUpperCase() + m.slice(1)))
  ];
  return pills.length ? pills : [el("span", {}, "Fără date despre vitamine și minerale")];
}

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
    const n = f.nutrition.per100g;
    return el("button", { type: "button", class: "fcard", style: `--c:${f.visual.color}`, "aria-label": `${f.ro}, deschide fișa`, onclick: () => openFruitSheet(f.id) },
      el("span", { html: fruitArt(f, { size: 64 }) }).firstElementChild,
      el("b", {}, f.ro),
      el("span", { class: "en" }, f.en),
      el("span", { class: "row" },
        el("span", {}, el("em", {}, n.kcal == null ? "—" : String(n.kcal)), " kcal/100 g"),
        el("span", { class: "badge" + (f.ai ? "" : " off") }, f.ai ? "AI" : "catalog"))
    );
  }

  function sync() {
    filters.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String((b.dataset.cat || null) === state.category)));
    const list = catalog.filter(state);
    grid.replaceChildren(...list.map(card));
    empty.hidden = list.length > 0;
    meta.textContent = list.length === catalog.count ? `${catalog.count} fructe · ${catalog.recognizable.length} recunoscute de scanner` : `${list.length} din ${catalog.count} fructe`;
  }
  sync();
}

/** Fișa educativă a unui fruct, într-un <dialog>. */
export function openFruitSheet(id) {
  const { catalog } = ctx;
  const f = catalog.get(id);
  if (!f) return;
  const sheet = $("sheet");
  const n = catalog.nutritionFor(id, 100);
  const close = el("button", { type: "button", class: "sh-close", "aria-label": "Închide fișa", onclick: () => sheet.close(),
    html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' });

  const actions = [el("button", { type: "button", class: "btn primary sm", onclick: () => { sheet.close(); ctx.onShow(id); } }, "Vezi valorile pe porție")];
  if (ctx.canPlaceAR() && catalog.hasNutrition(id)) actions.push(el("button", { type: "button", class: "btn ar sm", onclick: () => { sheet.close(); ctx.onPlaceAR(id); } }, "Plasează în spațiu (AR)"));

  sheet.style.setProperty("--c", f.visual.color);
  sheet.replaceChildren(
    close,
    el("div", { class: "sh-hero" },
      el("span", { html: fruitArt(f, { size: 112 }) }).firstElementChild,
      el("div", {},
        el("div", { class: "k" }, catalog.categoryName(f.category) + (f.ai ? " · recunoscut de scanner" : " · doar în catalog")),
        el("h3", { id: "sheetTitle" }, f.ro),
        el("div", { class: "en" }, "English: " + f.en))),
    el("div", { class: "sh-body" },
      el("p", {}, f.description),
      el("div", {},
        el("h4", {}, "Valori la 100 g"),
        el("div", { class: "sh-grid" },
          el("div", {}, el("small", {}, "Calorii"), el("b", {}, n.kcal == null ? "—" : String(Math.round(n.kcal))), el("small", {}, "kcal")),
          catalog.nutrients.map((d, i) => el("div", {}, el("small", {}, d.ro), el("b", {}, fmt(n.values[i])), el("small", {}, n.values[i] == null ? "indisponibil" : d.unit))))),
      el("div", {}, el("h4", {}, "Vitamine și minerale principale"), el("div", { class: "vm" }, nutrientPills(f))),
      el("p", { class: "sh-fact" }, el("b", {}, "Știai că? "), f.fact),
      el("p", { class: "sh-src" }, "Sursa valorilor: USDA FoodData Central (SR Legacy) — " + f.nutrition.source + ". Valori orientative."),
      el("div", { class: "sh-actions" }, actions))
  );
  if (!sheet.open) sheet.showModal();
  sheet.scrollTop = 0;
}

// închidere la click pe fundal
document.addEventListener("click", e => { const s = $("sheet"); if (s && e.target === s) s.close(); });
