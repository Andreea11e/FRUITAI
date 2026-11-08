// FruitAI — imaginea unui fruct, generată din catalog.
// Dacă înregistrarea are „image”, se folosește fotografia; altfel se desenează
// o ilustrație SVG din „visual.color” și „visual.shape”. Nimic specific unui fruct anume.
import { realImg } from "./fruit-img.js";

let uid = 0;

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(h, target, t) {
  const a = hexToRgb(h), b = hexToRgb(target);
  return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const LEAF = `<path d="M50 20 C58 10 70 8 76 12 C70 20 60 24 50 22Z" fill="url(#LF)"/><path d="M50 22 L49 13" stroke="#5B3A1E" stroke-width="2.4" stroke-linecap="round"/>`;

// fiecare formă primește „f” (umplerea cu gradient) și întoarce marcajul SVG în cutia 0..100
const SHAPES = {
  round: f => `${LEAF}<circle cx="50" cy="56" r="32" fill="${f}"/>`,
  oval: f => `${LEAF}<ellipse cx="50" cy="57" rx="26" ry="33" transform="rotate(-18 50 57)" fill="${f}"/>`,
  teardrop: f => `${LEAF}<path d="M50 22 C60 22 62 34 62 40 C62 48 80 54 80 70 C80 86 66 92 50 92 C34 92 20 86 20 70 C20 54 38 48 38 40 C38 34 40 22 50 22Z" fill="${f}"/>`,
  elongated: f => `<path d="M18 30 C14 60 34 86 70 86 C82 86 88 80 86 76 C60 76 36 62 30 30 C28 24 20 22 18 30Z" fill="${f}"/><path d="M18 30 L16 22" stroke="#5B3A1E" stroke-width="4" stroke-linecap="round"/>`,
  cluster: f => `<path d="M50 14 L50 26" stroke="#5B3A1E" stroke-width="2.4" stroke-linecap="round"/>` +
    [[38, 36], [62, 36], [50, 40], [30, 54], [50, 56], [70, 54], [40, 72], [60, 72], [50, 87]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="12" fill="${f}"/>`).join(""),
  drupelets: f => `${LEAF}` + (() => { let s = ""; for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++) {
      const x = 32 + c * 9 + (r % 2) * 4.5, y = 32 + r * 10; const dx = (x - 50) / 22, dy = (y - 58) / 30;
      if (dx * dx + dy * dy <= 1.05) s += `<circle cx="${x}" cy="${y}" r="6" fill="${f}"/>`; } return s; })(),
  spiky: f => `<path d="M42 18 L50 6 L58 18 L50 22Z" fill="#5E8C3A"/><ellipse cx="50" cy="58" rx="28" ry="32" fill="${f}"/>` +
    Array.from({ length: 16 }, (_, i) => { const a = i / 16 * Math.PI * 2, x = 50 + Math.cos(a) * 28, y = 58 + Math.sin(a) * 32, x2 = 50 + Math.cos(a) * 35, y2 = 58 + Math.sin(a) * 39;
      return `<path d="M${(x + Math.sin(a) * 4).toFixed(1)} ${(y - Math.cos(a) * 4).toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)} L${(x - Math.sin(a) * 4).toFixed(1)} ${(y + Math.cos(a) * 4).toFixed(1)}Z" fill="${f}"/>`; }).join("") +
    `<path d="M30 46 L70 70 M30 70 L70 46 M50 30 L50 86" stroke="rgba(0,0,0,.12)" stroke-width="1.5"/>`,
  star: f => `<path d="${Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 17 : 38; return `${i ? "L" : "M"}${(50 + Math.cos(a) * r).toFixed(1)} ${(55 + Math.sin(a) * r).toFixed(1)}`; }).join(" ")}Z" fill="${f}" stroke-linejoin="round"/>`
};

/** Întoarce marcajul HTML pentru imaginea fructului. */
export function fruitArt(fruit, { size = 96, className = "art" } = {}) {
  // imaginea fructului real (din modelul 3D realist), dacă există; altfel desenul de mai jos
  const real = fruit.image || realImg(fruit.id);
  if (real) {
    return `<img class="${className} real" src="${esc(real)}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async" style="object-fit:contain">`;
  }
  const id = "g" + (++uid);
  const c = fruit.visual.color;
  const shape = SHAPES[fruit.visual.shape] || SHAPES.round;
  return `<svg class="${className}" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true" focusable="false">
<defs>
<radialGradient id="${id}" cx="36%" cy="34%" r="70%"><stop offset="0" stop-color="${mix(c, "#ffffff", .45)}"/><stop offset=".45" stop-color="${c}"/><stop offset="1" stop-color="${mix(c, "#000000", .45)}"/></radialGradient>
<linearGradient id="${id}l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8BE26A"/><stop offset="1" stop-color="#2F8F3A"/></linearGradient>
<filter id="${id}s" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000" flood-opacity=".35"/></filter>
</defs>
<g filter="url(#${id}s)">${shape(`url(#${id})`).replace(/url\(#LF\)/g, `url(#${id}l)`)}</g>
<ellipse cx="38" cy="44" rx="7" ry="4.5" fill="#fff" opacity=".35" transform="rotate(-30 38 44)"/>
</svg>`;
}

/** Gradient CSS pentru elemente mari (ex. globul din hero), din aceeași culoare. */
export function orbGradient(fruit) {
  const c = fruit.visual.color;
  return `radial-gradient(circle at 32% 28%, rgba(255,255,255,.9) 0 3%, rgba(255,255,255,.35) 7%, transparent 18%),` +
    `radial-gradient(circle at 70% 78%, ${mix(c, "#000000", .55)}aa, transparent 55%),` +
    `radial-gradient(circle at 40% 35%, ${mix(c, "#ffffff", .35)}, ${c} 45%, ${mix(c, "#000000", .3)} 75%, ${mix(c, "#000000", .6)} 100%)`;
}
