// FruitAI — română / engleză.
// Textele din interfață sunt scrise în română; traducerile englezești stau în data/i18n/en.json
// (cheia = textul românesc). Textele din pagină se traduc automat (și cele adăugate ulterior din cod);
// textele cu valori variabile se traduc în cod cu t("Text cu {nume}", { nume }).

const KEY = "fruitai.lang";
let lang = (() => { try { return localStorage.getItem(KEY) || "ro"; } catch { return "ro"; } })();
let dict = {};
const ATTRS = ["placeholder", "aria-label", "title", "alt"];
const orig = new WeakMap(), mine = new WeakMap();      // nod → textul românesc / ultimul text pus de noi
const aorig = new WeakMap();                             // element → { atribut: [original, ultimul pus de noi] }
let observer = null;

export const getLang = () => lang;

/** Traduce un text românesc. vars înlocuiește {nume} în text. */
export function t(ro, vars) {
  let s = lang === "en" ? (dict[ro] ?? ro) : ro;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
  return s;
}
/** Un câmp de text al unui obiect din date, în limba curentă (ex. description / descriptionEn). */
export const tf = (obj, field) => (lang === "en" && obj[field + "En"]) || obj[field];
/** Numele fructului: [în limba curentă, în cealaltă limbă]. */
export const names = f => lang === "en" ? [f.en, f.ro] : [f.ro, f.en];

function trText(node) {
  const v = node.nodeValue;
  if (!v || !v.trim()) return;
  if (mine.get(node) !== v) orig.set(node, v);          // schimbat din cod (sau văzut prima dată)
  const ro = orig.get(node), key = ro.trim(), en = dict[key];
  const want = lang === "en" && en ? ro.replace(key, en) : ro;
  if (v !== want) node.nodeValue = want;
  mine.set(node, want);
}
function trAttrs(el) {
  if (!el.getAttribute) return;
  let rec = aorig.get(el);
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v == null || !v.trim()) continue;
    rec = rec || {}; aorig.set(el, rec);
    if (!rec[a] || rec[a][1] !== v) rec[a] = [v, null];
    const ro = rec[a][0], want = lang === "en" && dict[ro.trim()] ? dict[ro.trim()] : ro;
    if (v !== want) el.setAttribute(a, want);
    rec[a][1] = want;
  }
}
function translate(root) {
  if (!root) return;
  if (root.nodeType === 3) { if (!root.parentElement?.closest("[data-no-i18n],script,style")) trText(root); return; }
  if (root.nodeType !== 1 || root.closest("[data-no-i18n]")) return;
  trAttrs(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: n => n.nodeType === 1 && (n.tagName === "SCRIPT" || n.tagName === "STYLE" || n.hasAttribute("data-no-i18n")) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
  });
  let n;
  while ((n = w.nextNode())) n.nodeType === 3 ? trText(n) : trAttrs(n);
}

export async function initI18n() {
  try { dict = await (await fetch(new URL("../data/i18n/en.json", import.meta.url))).json(); } catch (e) { console.warn("Traducerile nu s-au încărcat:", e); }
  document.documentElement.lang = lang;
  translate(document.body);
  observer = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === "characterData") translate(m.target);
      else if (m.type === "attributes") trAttrs(m.target);
      else m.addedNodes.forEach(translate);
    }
    observer.takeRecords();                               // modificările făcute chiar acum de noi
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

export function setLang(l) {
  if (l === lang) return;
  lang = l;
  try { localStorage.setItem(KEY, l); } catch {}
  document.documentElement.lang = l;
  translate(document.body);
  observer?.takeRecords();
  window.dispatchEvent(new CustomEvent("fruitai:lang", { detail: l }));
}
