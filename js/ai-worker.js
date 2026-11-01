// FruitAI — modelele AI rulează aici, într-un Web Worker, ca pagina să rămână fluidă (mai ales pe telefon).
//
// De ce e rapid:
// • CLIP e împărțit în două: modelul de text (descrierile „a photo of a banana”…) și modelul de imagine.
//   Descrierile se codifică O SINGURĂ DATĂ și se păstrează în Cache Storage; la fiecare cadru rulează
//   doar modelul de imagine. Înainte, toate cele ~120 de descrieri erau recodificate la fiecare analiză.
// • OWL-ViT (detectorul, foarte greu) se încarcă doar când e cerut, nu la fiecare cadru live.

let T = null, cfg = null;
let tokenizer = null, processor = null, textModel = null, visionModel = null, detector = null, detLoading = null;
const emb = {};                       // șablon → Float32Array [N × D], vectori normalizați
let D = 512;
const post = m => self.postMessage(m);

function progressCb(tag) {
  const files = {};
  return p => {
    if (p.status === "progress" && p.total) {
      files[p.file + p.name] = [p.loaded, p.total];
      let a = 0, b = 0;
      for (const [l, t] of Object.values(files)) { a += l; b += t; }
      post({ type: "progress", tag, loaded: a, total: b });
    }
  };
}

async function pickBackend() {
  if (self.navigator?.gpu) {
    try {
      const ad = await navigator.gpu.requestAdapter();
      if (ad && ad.features.has("shader-f16")) return { device: "webgpu", dtype: "fp16", suffix: "_fp16" };
    } catch {}
  }
  return { device: "wasm", dtype: "q8", suffix: "_quantized" };
}

// fp16 pe WebGPU: ieșirile pot veni ca float16 (Uint16Array) → le convertim în float32
function f32(t) {
  if (t.type !== "float16") return Float32Array.from(t.data);
  const h = t.data, o = new Float32Array(h.length);
  for (let i = 0; i < h.length; i++) {
    const x = h[i], s = x & 0x8000 ? -1 : 1, e = (x >> 10) & 0x1f, m = x & 0x3ff;
    o[i] = e === 0 ? s * 2 ** -14 * (m / 1024) : e === 31 ? (m ? NaN : s * Infinity) : s * 2 ** (e - 15) * (1 + m / 1024);
  }
  return o;
}
const normalize = (data, n, d) => {
  for (let i = 0; i < n; i++) {
    let s = 0; for (let j = 0; j < d; j++) s += data[i * d + j] ** 2;
    s = Math.sqrt(s) || 1; for (let j = 0; j < d; j++) data[i * d + j] /= s;
  }
  return data;
};

// Cache pentru vectorii de text: cheia depinde de model, precizie, șablon și lista de etichete
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
async function cacheGet(key) {
  try { const c = await caches.open("fruitai-embeddings"); const r = await c.match("https://fruitai.local/" + key); return r ? new Float32Array(await r.arrayBuffer()) : null; } catch { return null; }
}
async function cachePut(key, arr) {
  try { const c = await caches.open("fruitai-embeddings"); await c.put("https://fruitai.local/" + key, new Response(arr.buffer.slice(0))); } catch {}
}

async function textEmbeddings(tpl, backend) {
  const key = `${cfg.clip}|${backend.dtype}|${hash(tpl + "\n" + cfg.labels.join("\n"))}`;
  const cached = await cacheGet(key);
  if (cached && cached.length === cfg.labels.length * D) { emb[tpl] = cached; return; }
  const texts = cfg.labels.map(l => tpl.replace("{}", l));
  const out = new Float32Array(texts.length * D);
  const B = 16;
  for (let i = 0; i < texts.length; i += B) {
    const inputs = tokenizer(texts.slice(i, i + B), { padding: true, truncation: true });
    const { text_embeds } = await textModel(inputs);
    out.set(f32(text_embeds), i * D);
    post({ type: "textProgress", tpl, done: Math.min(texts.length, i + B), total: texts.length });
  }
  emb[tpl] = normalize(out, texts.length, D);
  cachePut(key, emb[tpl]);
}

function toRaw({ data, width, height }) {
  // RGBA (din canvas) → RGB, cum se așteaptă procesorul
  const px = width * height, rgb = new Uint8ClampedArray(px * 3), src = new Uint8ClampedArray(data);
  for (let i = 0, j = 0; i < px; i++, j += 4) { rgb[i * 3] = src[j]; rgb[i * 3 + 1] = src[j + 1]; rgb[i * 3 + 2] = src[j + 2]; }
  return new T.RawImage(rgb, width, height, 3);
}

async function init(msg) {
  cfg = msg;
  T = await import(msg.url);
  T.env.allowLocalModels = false;
  T.env.useBrowserCache = true;
  const backend = await pickBackend();
  post({ type: "backend", ...backend });
  const opts = d => ({ device: d.device, dtype: d.dtype, progress_callback: progressCb("clip") });
  const load = async (Cls, name) => {
    if (backend.device === "webgpu") {
      try { return await Cls.from_pretrained(name, opts(backend)); }
      catch (e) { console.warn("WebGPU indisponibil, trec pe WASM:", e); backend.device = "wasm"; backend.dtype = "q8"; backend.suffix = "_quantized"; post({ type: "backend", ...backend }); }
    }
    return Cls.from_pretrained(name, opts(backend));
  };
  tokenizer = await T.AutoTokenizer.from_pretrained(cfg.clip);
  processor = await T.AutoProcessor.from_pretrained(cfg.clip);
  visionModel = await load(T.CLIPVisionModelWithProjection, cfg.clip);
  textModel = await load(T.CLIPTextModelWithProjection, cfg.clip);
  D = textModel.config?.projection_dim || 512;
  for (const tpl of cfg.templates) await textEmbeddings(tpl, backend);
  // modelul de text nu mai e necesar: eliberăm memoria (important pe telefon)
  try { await textModel.dispose?.(); } catch {}
  textModel = null;
  // încălzire: o imagine gri, ca primul cadru real să fie analizat imediat
  const gray = new Uint8ClampedArray(224 * 224 * 4).fill(128);
  await classify({ images: [{ data: gray.buffer, width: 224, height: 224 }] });
  self.__backend = backend;
  post({ type: "ready", ...backend });
}

async function classify({ images }) {
  const raws = images.map(toRaw);
  const inputs = await processor(raws);
  const { image_embeds } = await visionModel(inputs);
  const n = raws.length, img = normalize(f32(image_embeds), n, D);
  const N = cfg.labels.length;
  // pentru fiecare imagine și fiecare șablon: probabilitățile (softmax peste toate etichetele)
  return images.map((_, i) => cfg.templates.map(tpl => {
    const E = emb[tpl], logits = new Float32Array(N);
    let max = -Infinity;
    for (let k = 0; k < N; k++) {
      let s = 0; for (let j = 0; j < D; j++) s += img[i * D + j] * E[k * D + j];
      logits[k] = 100 * s; if (logits[k] > max) max = logits[k];
    }
    let sum = 0; for (let k = 0; k < N; k++) { logits[k] = Math.exp(logits[k] - max); sum += logits[k]; }
    for (let k = 0; k < N; k++) logits[k] /= sum;
    return logits;
  }));
}

async function loadDetector() {
  if (detector) return detector;
  if (!detLoading) detLoading = (async () => {
    const b = self.__backend || { device: "wasm", dtype: "q8" };
    try { detector = await T.pipeline("zero-shot-object-detection", cfg.detector, { device: b.device, dtype: b.dtype, progress_callback: progressCb("det") }); }
    catch (e) { if (b.device !== "webgpu") throw e; detector = await T.pipeline("zero-shot-object-detection", cfg.detector, { device: "wasm", dtype: "q8", progress_callback: progressCb("det") }); }
    return detector;
  })();
  return detLoading;
}

async function detect({ image, queries, threshold }) {
  const d = await loadDetector();
  return d(toRaw(image), queries, { threshold, percentage: true });
}

self.onmessage = async e => {
  const { id, type } = e.data;
  try {
    let result;
    if (type === "init") result = await init(e.data);
    else if (type === "classify") result = await classify(e.data);
    else if (type === "detect") result = await detect(e.data);
    else if (type === "loadDetector") { await loadDetector(); result = true; }
    post({ id, ok: true, result });
  } catch (err) {
    post({ id, ok: false, error: String(err?.message || err) });
  }
};
