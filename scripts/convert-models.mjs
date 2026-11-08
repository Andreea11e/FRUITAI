// FruitAI — transformă fructele scanate 3D (FBX sau GLB/glTF) în modele mici pentru telefon: data/models/<id>.glb.
//
//   npm install --no-save fbx2gltf @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
//   node scripts/convert-models.mjs <map.json>
//
// map.json: { "source": "KIRI Engine – Fruit and Veg asset pack", "license": "CC0 1.0", "url": "https://…",
//             "models": { "<id fruct din catalog>": "<cale către .fbx / .glb / .gltf>", … } }
//
// Ce face, pentru fiecare model: FBX → GLB (FBX2glTF), apoi curăță scena, sudează vârfurile, reduce numărul de
// triunghiuri (max. ~12.000), micșorează texturile la 1024 px în WebP și comprimă geometria (meshopt).
// Rezultatul: ~0,3–1,5 MB pe fruct, în loc de zeci de MB. La final scrie data/models/index.json.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, weld, simplify, textureCompress, resample, meshopt, quantize, flatten, join } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "data/models");
const MAX_TRIS = 12000, TEX = 1024;

const mapFile = process.argv[2];
if (!mapFile) { console.error("Folosire: node scripts/convert-models.mjs <map.json>"); process.exit(1); }
const map = JSON.parse(fs.readFileSync(mapFile, "utf8"));
const base = path.dirname(path.resolve(mapFile));
const catalog = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, "data/fruits.json"), "utf8")).fruits.map(f => f.id));

await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
fs.mkdirSync(OUT, { recursive: true });
const indexFile = path.join(OUT, "index.json");
const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, "utf8")) : { models: {} };

async function fbxToGlb(src) {
  const convert = require("fbx2gltf");                   // convert(sursă, destinație.glb, opțiuni) → Promise
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fbx-"));
  return convert(src, path.join(tmp, "model.glb"), ["--pbr-metallic-roughness"]);
}

const triCount = doc => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => {
  const idx = p.getIndices(); return k + (idx ? idx.getCount() : p.getAttribute("POSITION").getCount()) / 3;
}, 0), 0);

for (const [id, rel] of Object.entries(map.models)) {
  if (!catalog.has(id)) { console.warn(`! ${id}: nu există în catalog, îl sar`); continue; }
  const src = path.resolve(base, rel);
  if (!fs.existsSync(src)) { console.warn(`! ${id}: lipsește ${src}`); continue; }
  try {
    const input = /\.fbx$/i.test(src) ? await fbxToGlb(src) : src;
    const doc = await io.read(input);
    const before = triCount(doc);
    // FBX2glTF poate lăsa texturile ca fișiere separate lângă model: le citim dacă lipsesc din GLB
    await doc.transform(dedup(), flatten(), join(), weld({ tolerance: 0.0001 }), resample(), prune());
    const tris = triCount(doc);
    if (tris > MAX_TRIS) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: MAX_TRIS / tris, error: 0.002 }), prune());
    await doc.transform(
      textureCompress({ encoder: sharp, targetFormat: "webp", quality: 82, resize: [TEX, TEX] }),
      quantize(), meshopt({ encoder: MeshoptEncoder, level: "medium" }), prune(), dedup()
    );
    const file = `${id}.glb`;
    await io.write(path.join(OUT, file), doc);
    const kb = Math.round(fs.statSync(path.join(OUT, file)).size / 1024);
    index.models[id] = { file, source: map.source || "", license: map.license || "", url: map.url || "" };
    console.log(`✓ ${id}: ${Math.round(before)} → ${Math.round(triCount(doc))} triunghiuri, ${kb} KB`);
  } catch (e) {
    console.warn(`! ${id}: ${e.message?.split("\n")[0]}`);
  }
}
index.note = "Modele 3D scanate, folosite în locul celor procedurale. Vezi licența fiecărei surse.";
fs.writeFileSync(indexFile, JSON.stringify(index, null, 1) + "\n");
console.log(`index.json: ${Object.keys(index.models).length} modele`);
