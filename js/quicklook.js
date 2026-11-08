// FruitAI — fructul pe masă pe iPhone / iPad, prin AR Quick Look (Apple).
// Safari nu are WebXR, dar deschide modele 3D în format USDZ direct în AR: telefonul găsește masa,
// iar copilul mută fructul cu un deget, îl mărește și îl rotește cu două degete.
// Modelul USDZ e generat pe loc din același model 3D ca în restul aplicației.
import * as THREE from "three";
import { USDZExporter } from "three/addons/exporters/USDZExporter.js";
import { buildFruitModel, disposeObject } from "./fruit-models.js";

const R = 0.085;          // raza fructului în metri (~8,5 cm), ca în AR-ul de pe Android
const cache = new Map();  // id fruct → URL-ul fișierului USDZ generat

/** iOS / iPadOS cu AR Quick Look (Safari și celelalte browsere de pe iPhone). */
export function quickLookSupported() {
  try { return document.createElement("a").relList.supports("ar"); } catch { return false; }
}

/** USDZ nu păstrează culorile pe vârfuri: le înlocuim cu culoarea lor medie. */
function flattenVertexColors(root) {
  root.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const col = o.geometry?.attributes?.color;
    for (const m of mats) {
      if (!m?.vertexColors) continue;
      if (col) {
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < col.count; i++) { r += col.getX(i); g += col.getY(i); b += col.getZ(i); }
        m.color.setRGB(r / col.count, g / col.count, b / col.count);
      }
      m.vertexColors = false;
    }
  });
}

export async function buildUSDZ(fruit) {
  if (cache.has(fruit.id)) return cache.get(fruit.id);
  const scene = new THREE.Scene();
  const model = buildFruitModel(fruit);
  await model.userData.ready;           // modelul scanat, dacă există
  model.scale.setScalar(R);
  model.position.y = -model.userData.bottom * R;   // fructul stă pe masă, nu în ea
  scene.add(model);
  flattenVertexColors(model);
  scene.updateMatrixWorld(true);
  const ex = new USDZExporter(), opts = { quickLookCompatible: true };
  const data = ex.parseAsync ? await ex.parseAsync(scene, opts) : await new Promise((res, rej) => ex.parse(scene, res, rej, opts));
  disposeObject(model);
  const url = URL.createObjectURL(new Blob([data], { type: "model/vnd.usdz+zip" }));
  cache.set(fruit.id, url);
  return url;
}

/** Deschide fructul în AR Quick Look. */
export async function openQuickLook(fruit) {
  const url = await buildUSDZ(fruit);
  const a = document.createElement("a");
  a.rel = "ar";
  a.href = url;
  a.download = `${fruit.id}.usdz`;
  a.appendChild(document.createElement("img"));   // Quick Look cere un <img> în link
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 1000);
}
