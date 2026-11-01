// Calculează o singură dată vectorii de text CLIP pentru toate etichetele din catalog și îi salvează în
// data/clip-text.bin + data/clip-text.json. Browserul îi folosește direct: nu mai descarcă modelul de text
// (~64 MB) și nu mai pierde timp „învățând” numele fructelor.
// Rulează automat în GitHub Actions (.github/workflows/clip-embeddings.yml) când se schimbă catalogul.
// Opțional (EVAL=1): testează modelul de imagine pe fotografii reale (imaginea principală de pe Wikipedia).
import { readFile, writeFile } from "node:fs/promises";
import { Catalog } from "../js/catalog.js";
import { env, AutoTokenizer, CLIPTextModelWithProjection, AutoProcessor, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";
if (process.env.HF_CACHE) env.cacheDir = process.env.HF_CACHE;

const root = new URL("../data/", import.meta.url);
const J = async f => JSON.parse(await readFile(new URL(f, root), "utf8"));
const [fruitsDoc, nonDoc, nutDoc, infoDoc, prompts] = await Promise.all(["fruits.json", "non-fruits.json", "nutrients.json", "nutrient-info.json", "clip-prompts.json"].map(J));
const catalog = new Catalog({ fruits: fruitsDoc.fruits, categories: fruitsDoc.categories, nonFruits: nonDoc.labels, nutrients: nutDoc.nutrients, kcalDailyValue: nutDoc.kcalDailyValue, nutrientInfo: infoDoc });
const labels = catalog.aiAllLabels();
const model = prompts.model;

const normalize = (a, n, d) => { for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < d; j++) s += a[i * d + j] ** 2; s = Math.sqrt(s) || 1; for (let j = 0; j < d; j++) a[i * d + j] /= s; } return a; };

console.log(`Etichete: ${labels.length}, seturi: ${prompts.sets.map(s => s.name).join(", ")}`);
const tokenizer = await AutoTokenizer.from_pretrained(model);
const textModel = await CLIPTextModelWithProjection.from_pretrained(model, { dtype: "fp32" });
let D = 0;
const setVecs = [];
for (const set of prompts.sets) {
  let acc = null;
  for (const tpl of set.templates) {
    const texts = labels.map(l => tpl.replace("{}", l));
    const { text_embeds } = await textModel(tokenizer(texts, { padding: true, truncation: true }));
    D = text_embeds.dims[1];
    const e = normalize(Float32Array.from(text_embeds.data), labels.length, D);
    acc = acc || new Float32Array(e.length);
    for (let i = 0; i < e.length; i++) acc[i] += e[i];
    console.log(`  ${set.name}: „${tpl}”`);
  }
  setVecs.push(normalize(acc, labels.length, D));
}
const out = new Float32Array(setVecs.length * labels.length * D);
setVecs.forEach((v, i) => out.set(v, i * labels.length * D));
await writeFile(new URL("clip-text.bin", root), Buffer.from(out.buffer));
await writeFile(new URL("clip-text.json", root), JSON.stringify({
  description: "Generat automat de scripts/build-embeddings.mjs. Nu se editează manual.",
  model, dim: D, dtype: "float32", sets: prompts.sets, labels
}, null, 1) + "\n");
console.log(`Salvat: ${prompts.sets.length} × ${labels.length} × ${D} (${(out.byteLength / 1024).toFixed(0)} KB)`);

if (process.env.EVAL) {
  // Test pe fotografii reale: imaginea principală a articolului Wikipedia al fiecărui fruct
  const WIKI = { apple: "Apple", banana: "Banana", orange: "Orange (fruit)", pear: "Pear", peach: "Peach", mango: "Mango", pineapple: "Pineapple", strawberry: "Strawberry", grape: "Grape", watermelon: "Watermelon", lemon: "Lemon", lime: "Key lime", kiwi: "Kiwifruit", plum: "Plum", cherry: "Cherry", coconut: "Coconut", papaya: "Papaya", pomegranate: "Pomegranate", avocado: "Avocado", apricot: "Apricot", blueberry: "Blueberry", raspberry: "Raspberry", blackberry: "Blackberry", grapefruit: "Grapefruit", fig: "Common fig", guava: "Guava", "dragon-fruit": "Pitaya", "passion-fruit": "Passiflora edulis", lychee: "Lychee", nectarine: "Nectarine", cranberry: "Cranberry", tangerine: "Tangerine", clementine: "Clementine", persimmon: "Persimmon", date: "Date palm", durian: "Durian", jackfruit: "Jackfruit", starfruit: "Carambola", longan: "Longan", rambutan: "Rambutan", quince: "Quince", mulberry: "Mulberry", gooseberry: "Gooseberry", pomelo: "Pomelo", kumquat: "Kumquat", tamarind: "Tamarind", cantaloupe: "Cantaloupe", honeydew: "Honeydew (melon)", plantain: "Cooking banana", soursop: "Soursop", "custard-apple": "Annona reticulata", elderberry: "Sambucus", mangosteen: "Purple mangosteen", blackcurrant: "Blackcurrant", redcurrant: "Redcurrant", greengage: "Greengage", "blood-orange": "Blood orange", "prickly-pear": "Opuntia ficus-indica", cherimoya: "Cherimoya", medlar: "Mespilus germanica", olive: "Olive" };
  const processor = await AutoProcessor.from_pretrained(model);
  const vision = await CLIPVisionModelWithProjection.from_pretrained(model, { dtype: "q8" });
  const N = labels.length, E = setVecs[0], Edraw = setVecs[1];
  const hits = labels.map(l => catalog.resolveAiLabel(l));
  const score = (img, Es) => { const p = new Float32Array(N); let m = -1e9; for (let k = 0; k < N; k++) { let s = 0; for (let j = 0; j < D; j++) s += img[j] * Es[k * D + j]; p[k] = 100 * s; m = Math.max(m, p[k]); } let z = 0; for (let k = 0; k < N; k++) { p[k] = Math.exp(p[k] - m); z += p[k]; } for (let k = 0; k < N; k++) p[k] /= z; return p; };
  const decide = p => { const g = new Map(); let bg = 0; p.forEach((v, k) => { const h = hits[k]; if (!h) return; if (h.kind === "notfruit" && h.bg) { bg += v; return; } const key = h.kind === "fruit" ? h.id : "~" + h.label; g.set(key, (g.get(key) || 0) + v); }); const top = [...g.entries()].sort((a, b) => b[1] - a[1]); return { top: top.slice(0, 3).map(([k, v]) => [k, +(v / Math.max(1e-6, 1 - bg)).toFixed(2)]), bg: +bg.toFixed(2) }; };
  let ok1 = 0, ok3 = 0, n = 0, ms = 0; const rows = [];
  for (const f of catalog.fruits.filter(f => f.ai)) {
    const title = WIKI[f.id] || f.en;
    try {
      const s = await (await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`, { headers: { "user-agent": "FruitAI-eval (github.com/Andreea11e/FRUITAI)" } })).json();
      const url = s.thumbnail?.source || s.originalimage?.source;
      if (!url) { rows.push(`${f.id}: fără imagine`); continue; }
      const img = await RawImage.fromURL(url);
      const t0 = performance.now();
      const { image_embeds } = await vision(await processor(img));
      ms += performance.now() - t0;
      const v = normalize(Float32Array.from(image_embeds.data), 1, D);
      let p = score(v, E), d = decide(p);
      if (d.top[0][1] < 0.5) { const q = score(v, Edraw).map((x, i) => (x + p[i]) / 2); const d2 = decide(q); if (d2.top[0][1] > d.top[0][1]) d = d2; }
      n++; const top1 = d.top[0][0] === f.id, top3 = d.top.some(t => t[0] === f.id);
      ok1 += top1; ok3 += top3;
      rows.push(`${top1 ? "✓" : top3 ? "~" : "✗"} ${f.id.padEnd(14)} → ${d.top.map(t => t.join(" ")).join(" · ")}  (fundal ${d.bg})`);
    } catch (e) { rows.push(`${f.id}: eroare ${e.message}`); }
  }
  const summary = `Test pe ${n} fotografii reale (Wikipedia): corect din prima ${ok1}/${n} (${(ok1 / n * 100).toFixed(0)}%), în primele 3: ${ok3}/${n} (${(ok3 / n * 100).toFixed(0)}%). Model de imagine q8, ${(ms / n).toFixed(0)} ms/imagine pe serverul GitHub.`;
  console.log("\n" + rows.join("\n") + "\n\n" + summary);
  await writeFile(new URL("../scripts/eval-report.txt", import.meta.url), rows.join("\n") + "\n\n" + summary + "\n");
}
