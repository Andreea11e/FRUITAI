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

// ---------------- Învățare din fotografii reale ----------------
// Pentru fiecare fruct: fotografii reale de pe Wikimedia Commons → vectorii lor de imagine → „aspectul mediu”
// (prototipul). În browser, asemănarea cu prototipul se adaugă la scorul din text (metoda Tip-Adapter, simplificată).
// 70% din poze sunt folosite pentru învățare și 30% doar pentru test, ca rezultatul raportat să fie cinstit.
const UA = { "user-agent": "FruitAI/1.0 (https://github.com/Andreea11e/FRUITAI; educational app)" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(url) {
  for (let a = 0; a < 5; a++) { try { const r = await fetch(url, { headers: UA }); if (r.ok) return await r.json(); } catch {} await sleep(1500 * (a + 1)); }
  throw new Error("serverul nu răspunde");
}
const fruitsAI = catalog.fruits.filter(f => f.ai);
const processor = await AutoProcessor.from_pretrained(model);
const vision = await CLIPVisionModelWithProjection.from_pretrained(model, { dtype: "q8" });
const PER = Number(process.env.PER || 40);
const imgEmb = {};                  // id fruct → [Float32Array(D)]
let visMs = 0, visN = 0;
for (const f of fruitsAI) {
  // mai multe căutări pe fruct (numele englez + fiecare etichetă), fără dubluri
  const queries = [...new Set([`${f.en} fruit`, ...f.ai.labels.map(l => `${l} fruit`), ...f.ai.labels])];
  const seen = new Set(); let urls = [];
  for (const q of queries) {
    if (urls.length >= PER) break;
    try {
      const r = await getJSON(`https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=50&gsrsearch=${encodeURIComponent("filetype:bitmap " + q)}&prop=imageinfo&iiprop=url|mime&iiurlwidth=336`);
      for (const i of Object.values(r.query?.pages || {}).sort((a, b) => a.index - b.index).map(p => p.imageinfo?.[0]))
        if (i && /jpeg|png/.test(i.mime) && !seen.has(i.thumburl)) { seen.add(i.thumburl); urls.push(i.thumburl); }
    } catch (e) { console.log(`${f.id}: ${e.message}`); }
    await sleep(200);
  }
  urls = urls.slice(0, PER);
  const list = [];
  for (let i = 0; i < urls.length; i += 4) {
    const batch = await Promise.all(urls.slice(i, i + 4).map(async u => { try { return await RawImage.fromURL(u); } catch { return null; } }));
    for (const img of batch.filter(Boolean)) {
      const t0 = performance.now();
      const { image_embeds } = await vision(await processor(img));
      visMs += performance.now() - t0; visN++;
      list.push(normalize(Float32Array.from(image_embeds.data), 1, D));
    }
    await sleep(150);
  }
  imgEmb[f.id] = list;
  console.log(`  ${f.id}: ${list.length} fotografii`);
}

// fotografii FĂRĂ fructe: camere, oameni, obiecte — ca să măsurăm câte „fructe” vede unde nu sunt
const NEG_Q = ["living room interior", "office desk", "portrait of a child", "human hand", "bedroom", "kitchen counter", "laptop on table", "toy car", "stuffed animal toy", "book cover", "street", "dog", "coffee mug", "shoes", "classroom", "television"];
const negEmb = [];
for (const q of NEG_Q) {
  try {
    const r = await getJSON(`https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=14&gsrsearch=${encodeURIComponent("filetype:bitmap " + q)}&prop=imageinfo&iiprop=url|mime&iiurlwidth=336`);
    const urls = Object.values(r.query?.pages || {}).map(p => p.imageinfo?.[0]).filter(i => i && /jpeg|png/.test(i.mime)).map(i => i.thumburl).slice(0, 10);
    for (const u of urls) { try { const img = await RawImage.fromURL(u); const { image_embeds } = await vision(await processor(img)); negEmb.push(normalize(Float32Array.from(image_embeds.data), 1, D)); } catch {} }
  } catch {}
  await sleep(200);
}
console.log(`  fără fructe: ${negEmb.length} fotografii`);

const fruitIdx = fruitsAI.map(f => f.id);
const labelProto = labels.map(l => { const h = catalog.resolveAiLabel(l); return h?.kind === "fruit" ? fruitIdx.indexOf(h.id) : -1; });
const proto = (ids, pick) => {
  const P = new Float32Array(fruitIdx.length * D);
  fruitIdx.forEach((id, c) => { const L = pick(imgEmb[id] || []); for (const v of L) for (let j = 0; j < D; j++) P[c * D + j] += v[j]; });
  return normalize(P, fruitIdx.length, D);
};
const split = L => [L.filter(v => !v.test), L.filter(v => v.test)];     // 70% învățare / 30% test
const prior = k => hits[k]?.kind === "fruit" ? (catalog.get(hits[k].id)?.ai?.prior ?? 1) : 1;
// scorurile, exact ca în browser: text (×100) + alpha · exp(-beta · (1 − asemănarea cu prototipul fructului))
function probs(img, Es, P, alpha, beta) {
  const z = new Float32Array(N); let m = -1e9;
  let ps = P && alpha ? fruitIdx.map((_, c) => { let s = 0; for (let j = 0; j < D; j++) s += img[j] * P[c * D + j]; return alpha * Math.exp(-beta * (1 - s)); }) : null;
  if (ps) { const max = Math.max(...ps); ps = ps.map(b => b - max); }      // doar coboară fructele nepotrivite, ca în browser
  for (let k = 0; k < N; k++) {
    let s = 0; for (let j = 0; j < D; j++) s += img[j] * Es[k * D + j];
    z[k] = 100 * s + (ps && labelProto[k] >= 0 ? ps[labelProto[k]] : 0);
    if (z[k] > m) m = z[k];
  }
  let t = 0; for (let k = 0; k < N; k++) { z[k] = Math.exp(z[k] - m); t += z[k]; }
  for (let k = 0; k < N; k++) z[k] /= t;
  return z;
}
function decide(p, usePrior = true) {
  const g = new Map();
  const raw = new Map();
  p.forEach((v, k) => { const h = hits[k]; if (!h || (h.kind === "notfruit" && h.bg)) return; const key = h.kind === "fruit" ? h.id : "~" + h.label; g.set(key, (g.get(key) || 0) + v * (usePrior ? prior(k) : 1)); raw.set(key, (raw.get(key) || 0) + v); });
  const tot = [...raw.values()].reduce((a, b) => a + b, 0) || 1;       // total neponderat, ca în aplicație
  return [...g.entries()].map(([k, v]) => [k, v / tot, raw.get(k)]).sort((a, b) => b[1] - a[1]);
}
function predict(img, P, alpha, beta) {
  const p = probs(img, chosen[0], P, alpha, beta);
  let d = decide(p);
  if (d[0][1] < 0.5) { const q = probs(img, chosen[1], P, alpha, beta).map((x, i) => (x + p[i]) / 2); const d2 = decide(q); if (d2[0][1] > d[0][1]) d = d2; }
  return d;
}
const COMMON = new Set(fruitsAI.filter(f => (f.ai.prior ?? 1) >= 1).map(f => f.id));
function evaluate(P, alpha, beta) {
  let n = 0, ok1 = 0, ok3 = 0, cn = 0, cok = 0;
  for (const id of fruitIdx) for (const v of split(imgEmb[id] || [])[1]) {
    const d = predict(v, P, alpha, beta); n++;
    const a = d[0][0] === id; ok1 += a; ok3 += d.slice(0, 3).some(t => t[0] === id);
    if (COMMON.has(id)) { cn++; cok += a; }
  }
  return { n, top1: ok1 / n, top3: ok3 / n, common: cok / Math.max(1, cn), cn };
}
// curățare: la învățare păstrăm doar fotografiile în care fructul e printre primele 5 după text
// (căutarea pe Commons aduce și copaci, flori, hărți sau alte obiecte); pozele de test rămân neatinse
const clean = id => v => predict(v, null, 0, 0).slice(0, 5).some(t => t[0] === id);
for (const id of fruitIdx) imgEmb[id] = (imgEmb[id] || []).map((v, i) => Object.assign(v, { test: i % 10 >= 7 }));
const trainOf = id => (imgEmb[id] || []).filter(v => !v.test && clean(id)(v));
const Ptrain = proto(fruitIdx, (L) => L.length ? trainOf(fruitIdx.find(id => imgEmb[id] === L)) : []);
const base = evaluate(null, 0, 0);
let best = { alpha: 0, beta: 0, ...base };
const grid = [];
for (const alpha of [4, 8, 12, 16, 24, 32, 48]) for (const beta of [2, 4, 6, 8, 12]) {
  const r = evaluate(Ptrain, alpha, beta); grid.push(`α=${alpha} β=${beta}: ${(r.top1 * 100).toFixed(1)}% (obișnuite ${(r.common * 100).toFixed(1)}%)`);
  if (r.top1 > best.top1) best = { alpha, beta, ...r };
}
const pc = x => (x * 100).toFixed(0) + "%";
const report = [
  `Fotografii reale de pe Wikimedia Commons: ${Object.values(imgEmb).reduce((a, l) => a + l.length, 0)} (învățare 70%, test 30%). Model de imagine q8, ${(visMs / Math.max(1, visN)).toFixed(0)} ms/imagine pe serverul GitHub.`,
  `Doar din text:            corect din prima ${pc(base.top1)}, în primele 3 ${pc(base.top3)}, fructe obișnuite ${pc(base.common)} (test pe ${base.n} poze)`,
  `Text + fotografii reale:  corect din prima ${pc(best.top1)}, în primele 3 ${pc(best.top3)}, fructe obișnuite ${pc(best.common)} (α=${best.alpha}, β=${best.beta})`
].join("\n");
// praguri: câte fructe reale sunt recunoscute corect vs. câte imagini fără fruct ar da „un fruct”
const isFruit = d => !d[0][0].startsWith("~");
const thr = [];
for (const RAW of [0.1, 0.2, 0.3]) for (const REL of [0.45, 0.55, 0.65]) {
  let ok = 0, n = 0, fp = 0;
  for (const id of fruitIdx) for (const v of split(imgEmb[id] || [])[1]) { const d = predict(v, Ptrain, best.alpha, best.beta); n++; if (d[0][0] === id && d[0][1] >= REL && d[0][2] >= RAW) ok++; }
  for (const v of negEmb) { const d = predict(v, Ptrain, best.alpha, best.beta); if (isFruit(d) && d[0][1] >= REL && d[0][2] >= RAW) fp++; }
  thr.push(`brut ≥ ${RAW}, relativ ≥ ${REL}: fructe recunoscute corect ${pc(ok / n)} · alarme false ${(fp / Math.max(1, negEmb.length) * 100).toFixed(0)}% (${fp}/${negEmb.length} poze fără fruct)`);
}
const report2 = report + "\n\nPraguri (cu fotografii):\n" + thr.join("\n");
console.log("\n" + grid.join("\n") + "\n\n" + report2);
await writeFile(new URL("../scripts/eval-report.txt", import.meta.url), report2 + "\n\n" + grid.join("\n") + "\n");

// Prototipurile finale: din toate fotografiile; se salvează după vectorii de text, în același fișier
const Pall = proto(fruitIdx, L => { const id = fruitIdx.find(x => imgEmb[x] === L); return L.filter(v => clean(id)(v)); });
const bin = new Float32Array(out.length + Pall.length);
bin.set(out); bin.set(Pall, out.length);
await writeFile(new URL("clip-text.bin", root), Buffer.from(bin.buffer));
await writeFile(new URL("clip-text.json", root), JSON.stringify({
  description: "Generat automat de scripts/build-embeddings.mjs. Nu se editează manual.",
  model, dim: D, dtype: "float32", sets: prompts.sets, fruitTemplates: prompts.fruitTemplates || null, labels,
  protos: { fruits: fruitIdx, labelProto, alpha: best.alpha, beta: best.beta, photos: Object.fromEntries(fruitIdx.map(id => [id, imgEmb[id]?.length || 0])) },
  eval: report2
}, null, 1) + "\n");
console.log(`Salvat cu prototipuri: α=${best.alpha}, β=${best.beta}`);
