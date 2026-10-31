#!/usr/bin/env node
// Verifică datele FruitAI și că niciun fruct nu e scris direct în cod.
// Rulează: node scripts/check-catalog.mjs   (fără dependențe)
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Catalog } from "../js/catalog.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = p => readFileSync(join(root, p), "utf8");
const json = p => JSON.parse(read(p));
let failed = 0;
const fail = m => { failed++; console.error("✗ " + m); };
const ok = m => console.log("✓ " + m);

// 1) Catalogul se construiește fără probleme
const fd = json("data/fruits.json"), nf = json("data/non-fruits.json"), nu = json("data/nutrients.json");
const cat = new Catalog({ fruits: fd.fruits, categories: fd.categories, nonFruits: nf.labels, nutrients: nu.nutrients, kcalDailyValue: nu.kcalDailyValue });
if (cat.issues.length) cat.issues.forEach(i => fail("catalog: " + i));
else ok(`catalog valid: ${cat.count} fructe, ${cat.recognizable.length} recunoscute de AI, ${cat.nonFruitCount} etichete non-fruct, ${cat.categories.length} categorii`);
if (cat.count !== fd.fruits.length) fail(`${fd.fruits.length - cat.count} înregistrări au fost respinse`);

// 2) Fiecare etichetă AI duce la exact un fruct și înapoi
for (const label of cat.aiFruitLabels()) {
  const hit = cat.resolveAiLabel(label);
  if (!hit || hit.kind !== "fruit" || !cat.get(hit.id)?.ai.labels.map(s => s.toLowerCase()).includes(label)) fail(`eticheta AI „${label}” nu se mapează corect`);
}
for (const label of cat.aiNonFruitLabels()) if (cat.resolveAiLabel(label)?.kind !== "notfruit") fail(`eticheta non-fruct „${label}” nu se mapează`);
if (!failed) ok("toate etichetele AI se mapează la catalog");

// 3) Niciun nume de fruct scris direct în interfață sau în logică
const files = ["index.html", "css/app.css", ...readdirSync(join(root, "js")).filter(f => f.endsWith(".js")).map(f => "js/" + f)];
const terms = new Map();
for (const f of cat.fruits) {
  terms.set(f.ro, f.id);
  terms.set(f.en, f.id);
  for (const l of f.ai?.labels || []) terms.set(l, f.id);
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
for (const file of files) {
  const src = read(file).replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""); // fără comentarii
  for (const [term, id] of terms) {
    // numele în română: oriunde ca cuvânt; numele/etichetele în engleză: doar ca șir de caractere în cod
    const isRo = cat.fruits.some(f => f.ro === term);
    const re = isRo ? new RegExp(`(?<![\\p{L}])${esc(term)}(?![\\p{L}])`, "u") : new RegExp(`["'\`]${esc(term)}["'\`]`, "i");
    const m = src.match(re);
    if (m) fail(`${file}: „${term}” (${id}) apare scris direct în cod`);
  }
}
const hardcoded = failed; if (!hardcoded) ok(`niciun fruct scris direct în ${files.length} fișiere de cod`);

if (failed) { console.error(`\n${failed} probleme găsite.`); process.exit(1); }
console.log("\nTotul e în regulă.");
