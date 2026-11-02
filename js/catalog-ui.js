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

  // Colecția crește pe măsură ce copilul descoperă fructe: catalogul arată DOAR fructele descoperite
  // (cu camera sau dintr-o poză), iar restul sunt ascunse sub un card „lacăt” care îndeamnă la scanare.
  const owned = () => catalog.fruits.filter(f => ctx.isDiscovered(f.id));
  const facet = key => {
    const m = new Map();
    for (const f of owned()) for (const v of f[key]) m.set(v, (m.get(v) || 0) + 1);
    return [...m].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
  };

  // Exemplu de căutare luat din fructele descoperite, nu scris de mână
  const paintPlaceholder = () => {
    const ex = owned()[0];
    search.placeholder = ex ? t("Caută un fruct, de ex. „{name}”", { name: (getLang() === "en" ? ex.en : ex.ro).toLowerCase() }) : t("Caută în colecția ta");
  };
  paintPlaceholder();

  // Filtre de categorie și de vitamine / minerale, calculate doar din fructele descoperite
  const en = () => getLang() === "en";
  const vName = v => en() ? (catalog.info?.vitamins[v]?.title_en || "Vitamin " + v) : (catalog.info?.vitamins[v]?.title || "Vitamina " + v);
  const mName = m => en() ? (catalog.info?.minerals[m]?.title_en || m) : m.charAt(0).toUpperCase() + m.slice(1);
  function paintFilters() {
    const mine = owned(), vit = facet("vitamins"), min = facet("minerals");
    const cats = catalog.categoryCounts().map(c => ({ ...c, count: mine.filter(f => f.category === c.id).length })).filter(c => c.count);
    const catButtons = [{ id: null, ro: t("Toate"), count: mine.length }, ...cats].map(c =>
      el("button", { type: "button", "data-no-i18n": "", "aria-pressed": String((c.id || null) === state.category), onclick: () => { state.category = c.id; sync(); } },
        c.id ? (en() ? c.en || c.ro : c.ro) : c.ro, el("small", {}, String(c.count))));
    catButtons.forEach((b, i) => { b.dataset.cat = i === 0 ? "" : cats[i - 1].id; });
    if (state.category && !cats.some(c => c.id === state.category)) state.category = null;
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

  // (filtrul „recunoscute de scanner” nu mai are sens: tot ce e în colecție a fost găsit cu scannerul)
  scanWrap.hidden = true;
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

  // În română, de la 20 în sus se spune „20 de fructe”
  const useDe = n => n % 100 >= 20 || (n >= 100 && n % 100 === 0);
  // Cardul „lacăt”: câte fructe mai sunt de descoperit; pornește camera
  function lockedCard(left, first) {
    return el("button", { type: "button", class: "fcard locked", onclick: () => document.querySelector("[data-start]")?.click() },
      el("span", { class: "lock", "aria-hidden": "true" }, first ? "📷" : "🔒"),
      el("b", {}, first ? t("Descoperă primul fruct!") : left === 1 ? t("Încă un fruct ascuns") : t(useDe(left) ? "Încă {n} de fructe ascunse" : "Încă {n} fructe ascunse", { n: left })),
      el("span", { class: "en" }, first ? t("Arată camerei un fruct și apare aici") : t("Arată camerei un fruct nou")));
  }

  function sync() {
    const mine = owned();
    // uneltele de căutare apar doar când colecția are destule fructe ca să merite
    search.hidden = select.hidden = mine.length < 6;
    filters.hidden = mine.length < 4;
    if (search.hidden) state.q = "";
    if (select.hidden) state.vitamin = null;
    filters.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String((b.dataset.cat || null) === state.category)));
    const list = catalog.filter(state).filter(f => ctx.isDiscovered(f.id));
    const left = catalog.recognizable.filter(f => !ctx.isDiscovered(f.id)).length;
    const filtered = state.q || state.category || state.vitamin;
    // la început nu apare nimic; cardul cu lacăt apare doar după primul fruct descoperit
    grid.replaceChildren(...list.map(card), ...(left && !filtered && mine.length ? [lockedCard(left, false)] : []));
    empty.hidden = !(filtered && list.length === 0);
    const total = catalog.recognizable.length;
    meta.textContent = mine.length ? t(useDe(total) ? "Ai descoperit {a} din {b} de fructe" : "Ai descoperit {a} din {b} fructe", { a: mine.length, b: total })
      : t("Încă nu ai descoperit niciun fruct. Arată camerei unul și apare aici!");
    meta.classList.toggle("cat-start", !mine.length);
    const cta = document.getElementById("catCta"); if (cta) cta.hidden = !!mine.length;
  }
  sync();
  // colecția crește când descoperi un fruct nou (cu camera sau dintr-o poză)
  window.addEventListener("fruitai:discovered", () => { paintPlaceholder(); paintFilters(); sync(); });
  window.addEventListener("fruitai:lang", () => { paintPlaceholder(); paintFilters(); sync(); });
}

