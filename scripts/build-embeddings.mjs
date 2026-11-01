// Calculează o singură dată vectorii de text CLIP pentru toate etichetele din catalog și îi salvează în
// data/clip-text.bin + data/clip-text.json. Browserul îi folosește direct: nu mai descarcă modelul de text
// (~64 MB) și nu mai pierde timp „învățând” numele fructelor.
// Rulează automat în GitHub Actions (.github/workflows/clip-embeddings.yml) când se schimbă catalogul.
// Cu EVAL=1, testează și modelul de imagine (același fișier ca în browser) pe fotografii reale de pe Wikipedia,
// comparând variantele: cu / fără formulările speciale pentru fructe și cu / fără „prior” (fructe rare).
import { readFile, writeFile } from "node:fs/promises";
import { Catalog } from "../js/catalog.js";
import { env, AutoTokenizer, CLIPTextModelWithProjection, AutoProcessor, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";
if (process.env.HF_CACHE) env.cacheDir = process.env.HF_CACHE;

const root = new URL("../data/", import.meta.url);
const J = async f => JSON.parse(await readFile(new URL(f, root), "utf8"));
const [fruitsDoc, nonDoc, nutDoc, infoDoc, prompts] = await Promise.all(["fruits.json", "non-fruits.json", "nutrients.json", "nutrient-info.json", "clip-prompts.json"].map(J));
const catalog = new Catalog({ fruits: fruitsDoc.fruits, categories: fruitsDoc.categories, nonFruits: nonDoc.labels, nutrients: nutDoc.nutrients, kcalDailyValue: nutDoc.kcalDailyValue, nutrientInfo: infoDoc });
const labels = catalog.aiAllLabels();
const hits = labels.map(l => catalog.resolveAiLabel(l));
const model = prompts.model;
const N = labels.length;

const normalize = (a, n, d) => { for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < d; j++) s += a[i * d + j] ** 2; s = Math.sqrt(s) || 1; for (let j = 0; j < d; j++) a[i * d + j] /= s; } return a; };

console.log(`Etichete: ${N}, seturi: ${prompts.sets.map(s => s.name).join(", ")}`);
const tokenizer = await AutoTokenizer.from_pretrained(model);
const textModel = await CLIPTextModelWithProjection.from_pretrained(model, { dtype: "fp32" });
let D = 0;
const cache = new Map();
async function embed(tpl) {                       // vectorii (normalizați) ai tuturor etichetelor pentru o formulare
  if (cache.has(tpl)) return cache.get(tpl);
  const { text_embeds } = await textModel(tokenizer(labels.map(l => tpl.replace("{}", l)), { padding: true, truncation: true }));
  D = text_embeds.dims[1];
  const e = normalize(Float32Array.from(text_embeds.data), N, D);
  cache.set(tpl, e);
  return e;
}
/** Media formulărilor unui set; fructele primesc în plus formulările lor speciale (dacă withFruit). */
async function buildSet(set, withFruit) {
  const acc = new Float32Array(N * D || N * 512), cnt = new Float32Array(N);
  const extra = withFruit ? (prompts.fruitTemplates?.[set.name] || []) : [];
  for (const tpl of [...set.templates, ...extra]) {
    const e = await embed(tpl), onlyFruit = extra.includes(tpl);
    for (let k = 0; k < N; k++) {
      if (onlyFruit && hits[k]?.kind !== "fruit") continue;
      cnt[k]++;
      for (let j = 0; j < D; j++) acc[k * D + j] += e[k * D + j];
    }
  }
  return normalize(acc, N, D);
}
const variants = {};
for (const withFruit of [false, true]) variants[withFruit ? "fruit" : "plain"] = await Promise.all(prompts.sets.map(s => buildSet(s, withFruit)));
const chosen = variants[prompts.fruitTemplates ? "fruit" : "plain"];

const out = new Float32Array(chosen.length * N * D);
chosen.forEach((v, i) => out.set(v, i * N * D));
await writeFile(new URL("clip-text.bin", root), Buffer.from(out.buffer));
await writeFile(new URL("clip-text.json", root), JSON.stringify({
  description: "Generat automat de scripts/build-embeddings.mjs. Nu se editează manual.",
  model, dim: D, dtype: "float32", sets: prompts.sets, fruitTemplates: prompts.fruitTemplates || null, labels
}, null, 1) + "\n");
console.log(`Salvat: ${chosen.length} × ${N} × ${D} (${(out.byteLength / 1024).toFixed(0)} KB)`);

if (process.env.EVAL) {
  // Fotografii reale: până la 3 imagini din articolul Wikipedia al fiecărui fruct
  const WIKI = { apple: "Apple", banana: "Banana", orange: "Orange (fruit)", pear: "Pear", peach: "Peach", mango: "Mango", pineapple: "Pineapple", strawberry: "Strawberry", grape: "Grape", watermelon: "Watermelon", lemon: "Lemon", lime: "Key lime", kiwi: "Kiwifruit", plum: "Plum", cherry: "Cherry", coconut: "Coconut", papaya: "Papaya", pomegranate: "Pomegranate", avocado: "Avocado", apricot: "Apricot", blueberry: "Blueberry", raspberry: "Raspberry", blackberry: "Blackberry", grapefruit: "Grapefruit", fig: "Common fig", guava: "Guava", "dragon-fruit": "Pitaya", "passion-fruit": "Passiflora edulis", lychee: "Lychee", nectarine: "Nectarine", cranberry: "Cranberry", tangerine: "Tangerine", clementine: "Clementine", persimmon: "Persimmon", date: "Date palm", durian: "Durian", jackfruit: "Jackfruit", starfruit: "Carambola", longan: "Longan", rambutan: "Rambutan", quince: "Quince", mulberry: "Mulberry", gooseberry: "Gooseberry", pomelo: "Pomelo", kumquat: "Kumquat", tamarind: "Tamarind", cantaloupe: "Cantaloupe", honeydew: "Honeydew (melon)", plantain: "Cooking banana", soursop: "Soursop", "custard-apple": "Annona reticulata", elderberry: "Sambucus", mangosteen: "Purple mangosteen", blackcurrant: "Blackcurrant", redcurrant: "Redcurrant", greengage: "Greengage", "blood-orange": "Blood orange", "prickly-pear": "Opuntia ficus-indica", cherimoya: "Cherimoya", medlar: "Mespilus germanica", olive: "Olive" };
  const UA = { "user-agent": "FruitAI-eval/1.0 (https://github.com/Andreea11e/FRUITAI)" };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function getJSON(url) {
    for (let a = 0; a < 5; a++) {
      const r = await fetch(url, { headers: UA });
      if (r.ok) return r.json();
      await sleep(1500 * (a + 1));
    }
    throw new Error("Wikipedia nu răspunde");
  }
  const processor = await AutoProcessor.from_pretrained(model);
  const vision = await CLIPVisionModelWithProjection.from_pretrained(model, { dtype: "q8" });
  const prior = k => hits[k]?.kind === "fruit" ? (catalog.get(hits[k].id)?.ai?.prior ?? 1) : 1;
  const softmax = (img, Es) => { const p = new Float32Array(N); let m = -1e9; for (let k = 0; k < N; k++) { let s = 0; for (let j = 0; j < D; j++) s += img[j] * Es[k * D + j]; p[k] = 100 * s; if (p[k] > m) m = p[k]; } let z = 0; for (let k = 0; k < N; k++) { p[k] = Math.exp(p[k] - m); z += p[k]; } for (let k = 0; k < N; k++) p[k] /= z; return p; };
  // aceeași decizie ca în aplicație: fundalul nu concurează, scoruri adunate pe fruct, „prior” opțional
  const decide = (p, usePrior) => {
    const g = new Map();
    p.forEach((v, k) => { const h = hits[k]; if (!h || (h.kind === "notfruit" && h.bg)) return; const key = h.kind === "fruit" ? h.id : "~" + h.label; g.set(key, (g.get(key) || 0) + v * (usePrior ? prior(k) : 1)); });
    const tot = [...g.values()].reduce((a, b) => a + b, 0) || 1;
    return [...g.entries()].map(([k, v]) => [k, v / tot]).sort((a, b) => b[1] - a[1]);
  };
  const run = (img, sets, usePrior) => {
    const p = softmax(img, sets[0]);
    let d = decide(p, usePrior);
    if (d[0][1] < 0.5) { const q = softmax(img, sets[1]).map((x, i) => (x + p[i]) / 2); const d2 = decide(q, usePrior); if (d2[0][1] > d[0][1]) d = d2; }
    return d;
  };
  const combos = [["plain", false], ["plain", true], ["fruit", false], ["fruit", true]];
  const stats = combos.map(() => ({ ok1: 0, ok3: 0 }));
  const rows = []; let n = 0, ms = 0;
  for (const f of catalog.fruits.filter(f => f.ai)) {
    const title = (WIKI[f.id] || f.en).replace(/ /g, "_");
    let urls = [];
    try {
      const media = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(title)}`);
      urls = media.items.filter(i => i.type === "image" && i.srcset?.length && !/\.svg/i.test(i.title)).slice(0, 3).map(i => "https:" + i.srcset[0].src);
    } catch (e) { rows.push(`${f.id}: ${e.message}`); }
    for (const url of urls) {
      try {
        await sleep(250);
        const img = await RawImage.fromURL(url);
        const t0 = performance.now();
        const { image_embeds } = await vision(await processor(img));
        ms += performance.now() - t0; n++;
        const v = normalize(Float32Array.from(image_embeds.data), 1, D);
        const res = combos.map(([vn, pr]) => run(v, variants[vn], pr));
        res.forEach((d, i) => { stats[i].ok1 += d[0][0] === f.id; stats[i].ok3 += d.slice(0, 3).some(t => t[0] === f.id); });
        const d = res[3];
        rows.push(`${d[0][0] === f.id ? "✓" : d.slice(0, 3).some(t => t[0] === f.id) ? "~" : "✗"} ${f.id.padEnd(14)} → ${d.slice(0, 3).map(t => t[0] + " " + t[1].toFixed(2)).join(" · ")}`);
      } catch (e) { rows.push(`${f.id}: imagine ilizibilă (${e.message.slice(0, 40)})`); }
    }
  }
  const pct = x => (x / n * 100).toFixed(0) + "%";
  const lines = combos.map(([vn, pr], i) => `  ${vn === "fruit" ? "cu formulări pt. fructe" : "formulări simple      "} · ${pr ? "cu prior " : "fără prior"} → corect din prima ${pct(stats[i].ok1)}, în primele 3 ${pct(stats[i].ok3)}`);
  const summary = `Test pe ${n} fotografii reale (Wikipedia), model de imagine q8, ${(ms / n).toFixed(0)} ms/imagine pe serverul GitHub:\n${lines.join("\n")}`;
  console.log("\n" + rows.join("\n") + "\n\n" + summary);
  await writeFile(new URL("../scripts/eval-report.txt", import.meta.url), rows.join("\n") + "\n\n" + summary + "\n");
}
