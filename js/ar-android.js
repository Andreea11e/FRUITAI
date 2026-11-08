// FruitAI — fructul pe masă pe Android (Samsung etc.), prin <model-viewer> de la Google.
// model-viewer alege singur cea mai bună variantă: AR în pagină (WebXR) sau aplicația Google de AR (Scene Viewer).
// În ambele, telefonul găsește masa, iar fructul se mută cu un deget, se mărește și se rotește cu două degete.
const MV_URL = "https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js";
const HIDDEN = "position:fixed;left:0;top:0;width:4px;height:4px;opacity:0;pointer-events:none;z-index:-1;";
const SHOWN = "position:fixed;inset:0;width:100vw;height:100vh;opacity:1;pointer-events:auto;z-index:3000;background:transparent;";

let loading = null, mv = null, onEnd = null;

/** Încarcă model-viewer din timp, ca la atingerea butonului totul să fie gata. */
export function preload() {
  if (!loading) loading = import(MV_URL).then(() => customElements.whenDefined("model-viewer"));
  return loading;
}

function element() {
  if (mv) return mv;
  mv = document.createElement("model-viewer");
  for (const [k, v] of Object.entries({ ar: "", "ar-modes": "webxr scene-viewer", "ar-scale": "auto", "ar-placement": "floor",
    "shadow-intensity": "1", "environment-image": "neutral", loading: "eager", reveal: "auto", "interaction-prompt": "none" })) mv.setAttribute(k, v);
  mv.style.cssText = HIDDEN;
  const btn = document.createElement("button"); btn.slot = "ar-button"; btn.style.display = "none";   // fără butonul implicit
  mv.appendChild(btn);
  mv.addEventListener("ar-status", e => {
    const s = e.detail?.status;
    if (s === "session-started") mv.style.cssText = SHOWN;
    else if (s === "not-presenting" || s === "failed") { mv.style.cssText = HIDDEN; const f = onEnd; onEnd = null; f?.(s); }
  });
  document.body.appendChild(mv);
  return mv;
}

/** Pregătește modelul fructului (îl descarcă din timp). */
export async function prepare(url, title) {
  await preload();
  const m = element();
  if (m.getAttribute("src") !== url) { m.setAttribute("alt", title); m.setAttribute("src", url); }
  if (!m.loaded) await new Promise(res => {
    const done = () => { m.removeEventListener("load", done); m.removeEventListener("error", done); res(); };
    m.addEventListener("load", done); m.addEventListener("error", done); setTimeout(done, 8000);
  });
  return m;
}

/** Pune fructul pe masă. Întoarce false dacă telefonul nu are AR (atunci aplicația folosește camera). */
export async function openAR(url, title, end, modes = "webxr scene-viewer") {
  const m = await prepare(url, title);
  m.setAttribute("ar-modes", modes);
  await new Promise(r => requestAnimationFrame(() => r()));
  if (!m.canActivateAR) return false;
  onEnd = end || null;
  await m.activateAR();
  return true;
}
