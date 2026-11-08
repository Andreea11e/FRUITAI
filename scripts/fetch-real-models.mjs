// FruitAI — descarcă modele 3D scanate după fructe reale de pe Poly Haven (licență CC0, gratuite și pentru uz comercial)
// și le adaugă în data/models/ (folosite de aplicație în locul modelelor procedurale și pentru AR pe masă).
// Rulează în GitHub Actions (.github/workflows/real-models.yml).
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const API = "https://api.polyhaven.com";
const UA = { "User-Agent": "FruitAI-model-fetch" };
const OUT = "data/models";
const TMP = "/tmp/polyhaven";
const RES = process.env.RES || "1k";

// potriviri sigure (verificate pe polyhaven.com); restul se caută automat după nume
const PREFERRED = {
  apple: "food_apple_01", banana: "bananas", kiwi: "food_kiwi_01", lemon: "lemon", lime: "food_lime_01",
  lychee: "food_lychee_01", avocado: "food_avocado_01", pear: "food_pears_asian_01",
};
const NOT_FRUIT = /(juice|bowl|crate|basket|box|tree|plant|bush|stand|cart|jar|bottle|can_|knife|board|cake|pie)/i;

const getJSON = async u => { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); };
const download = async (u, file) => {
  const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error(`${u}: ${r.status}`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, Buffer.from(await r.arrayBuffer()));
};

const catalog = JSON.parse(await fs.readFile("data/fruits.json", "utf8")).fruits;
const assets = await getJSON(`${API}/assets?t=models`);
const food = Object.entries(assets).filter(([id, a]) => (a.categories || []).some(c => /food/i.test(c)));
const report = { food: food.map(([id, a]) => ({ id, name: a.name, categories: a.categories, tags: a.tags })), chosen: {} };

// alegere: potrivirea sigură sau un model „food” al cărui nume conține numele englezesc al fructului
const words = s => String(s).toLowerCase().replace(/[^a-z]+/g, " ").trim().split(" ");
for (const f of catalog) {
  let id = PREFERRED[f.id] && assets[PREFERRED[f.id]] ? PREFERRED[f.id] : null;
  if (!id) {
    const target = words(f.en).join(" ");
    const hit = food.find(([aid, a]) => !NOT_FRUIT.test(aid) && !NOT_FRUIT.test(a.name) && (` ${words(a.name).join(" ")} `.includes(` ${target} `) || ` ${words(a.name).join(" ")} `.includes(` ${target}s `)));
    id = hit?.[0] || null;
  }
  if (id) report.chosen[f.id] = { asset: id, name: assets[id].name };
}
console.log("Modele alese:", report.chosen);

const index = JSON.parse(await fs.readFile(path.join(OUT, "index.json"), "utf8"));
for (const [fruit, { asset, name }] of Object.entries(report.chosen)) {
  try {
    const files = await getJSON(`${API}/files/${asset}`);
    const g = files.gltf?.[RES]?.gltf || files.gltf?.["1k"]?.gltf;
    if (!g) { console.log(`${fruit}: fără glTF`); continue; }
    const dir = path.join(TMP, asset), main = path.join(dir, path.basename(new URL(g.url).pathname));
    await download(g.url, main);
    for (const [rel, inc] of Object.entries(g.include || {})) await download(inc.url, path.join(dir, rel));
    const glb = path.join(OUT, `${fruit}.glb`);
    const cli = (...a) => execFileSync("npx", ["--yes", "@gltf-transform/cli@4.1.1", ...a], { stdio: "inherit" });
    cli("copy", main, glb);
    cli("dedup", glb, glb);
    cli("prune", glb, glb);
    cli("resize", glb, glb, "--width", "1024", "--height", "1024");
    const kb = Math.round((await fs.stat(glb)).size / 1024);
    index.models[fruit] = { file: `${fruit}.glb`, source: `Poly Haven – ${name}`, license: "CC0 1.0", url: `https://polyhaven.com/a/${asset}` };
    console.log(`${fruit}: ${asset} → ${glb} (${kb} KB)`);
  } catch (e) { console.log(`${fruit}: eroare ${e.message}`); }
}
await fs.writeFile(path.join(OUT, "index.json"), JSON.stringify(index, null, 1) + "\n");
await fs.writeFile(path.join(OUT, "polyhaven-report.json"), JSON.stringify(report, null, 1) + "\n");
