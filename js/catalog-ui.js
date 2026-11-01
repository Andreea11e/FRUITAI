// FruitAI — interfața catalogului, generată integral din Catalog.
// Cardurile, filtrele (categorii, vitamine/minerale) și fișa educativă se construiesc
// din date: un fruct nou în data/fruits.json apare aici automat.

import { fruitArt } from "./fruit-art.js";
import { t, getLang } from "./i18n.js";

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
  const ex = catalog.pick(catalog.fruits);
  const paintPlaceholder = () => { search.placeholder = t("Caută un fruct, de ex. „{name}”", { name: (getLang() === "en" ? ex.en : ex.ro).toLowerCase() }); };
  paintPlaceholder();

  // Filtre de categorie (doar categoriile care au fructe) și filtrul de vitamine / minerale, derivate din date
  const vit = catalog.facet("vitamins"), min = catalog.facet("minerals");
  const en = () => getLang() === "en";
  const vName = v => en() ? (catalog.info?.vitamins[v]?.title_en || "Vitamin " + v) : (catalog.info?.vitamins[v]?.title || "Vitamina " + v);
  const mName = m => en() ? (catalog.info?.minerals[m]?.title_en || m) : m.charAt(0).toUpperCase() + m.slice(1);
  function paintFilters() {
    const catButtons = [{ id: null, ro: t("Toate"), count: catalog.count }, ...catalog.categoryCounts()].map(c =>
      el("button", { type: "button", "data-no-i18n": "", "aria-pressed": String((c.id || null) === state.category), onclick: () => { state.category = c.id; sync(); } },
        c.id ? (en() ? c.en || c.ro : c.ro) : c.ro, el("small", {}, String(c.count))));
    catButtons.forEach((b, i) => { b.dataset.cat = i === 0 ? "" : catalog.categoryCounts()[i - 1].id; });
    filters.replaceChildren(...catButtons);
    select.replaceChildren(
      el("option", { value: "" }, t("Toate vitaminele și mineralele")),
      el("optgroup", { label: t("Vitamine") }, vit.map(v => el("option", { value: v.value }, `${vName(v.value)} (${v.count})`))),
      el("optgroup", { label: t("Minerale") }, min.map(v => el("option", { value: v.value }, `${mName(v.value)} (${v.count})`)))
    );
    select.value = state.vitamin || "";
  }
  paintFilters();
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
    const [first, second] = en() ? [f.en, f.ro] : [f.ro, f.en];
    return el("button", { type: "button", "data-no-i18n": "", class: "fcard" + (found ? " found" : ""), style: `--c:${f.visual.color}`, "aria-label": `${first}, ${second}. ${t("Descoperă fructul")}`, onclick: () => ctx.onOpen(f.id) },
      found ? el("span", { class: "found-badge", title: t("Descoperit cu scannerul") }, "✓") : null,
      el("span", { html: fruitArt(f, { size: 64 }) }).firstElementChild,
      el("b", {}, first),
      el("span", { class: "en" }, second),
      el("span", { class: "row" },
        el("span", {}, vit.length ? ["Vit. ", el("em", {}, vit.slice(0, 3).join(", "))] : t("Fără date")),
        el("span", { class: "badge" + (f.ai ? "" : " off") }, f.emoji || (f.ai ? "AI" : "catalog")))
    );
  }

  function sync() {
    filters.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String((b.dataset.cat || null) === state.category)));
    const list = catalog.filter(state);
    grid.replaceChildren(...list.map(card));
    empty.hidden = list.length > 0;
    const found = catalog.fruits.filter(f => ctx.isDiscovered(f.id)).length;
    meta.textContent = (list.length === catalog.count ? t("{n} fructe · {r} recunoscute de scanner", { n: catalog.count, r: catalog.recognizable.length }) : t("{a} din {b} fructe", { a: list.length, b: catalog.count })) + " · " + t("ai descoperit {n} cu camera", { n: found });
  }
  sync();
  // colecția se actualizează când descoperi un fruct nou cu camera
  window.addEventListener("fruitai:discovered", sync);
  window.addEventListener("fruitai:lang", () => { paintPlaceholder(); paintFilters(); sync(); });
}

