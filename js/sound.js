// FruitAI — efecte sonore scurte, sintetizate cu Web Audio (fără fișiere audio).
// Browserele pornesc sunetul doar după o atingere/click, așa că „deblocăm” contextul la prima interacțiune.

const KEY = "fruitai.sound";
let ctx = null;
let enabled = (() => { try { return localStorage.getItem(KEY) !== "off"; } catch { return true; } })();

function ac() {
  if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}
["pointerdown", "keydown", "touchstart"].forEach(ev => window.addEventListener(ev, () => { if (enabled) ac(); }, { once: true, passive: true }));

function tone(freq, start, dur, { type = "sine", gain = 0.18, slide = 0 } = {}) {
  const c = ac(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + start;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t); o.stop(t + dur + 0.05);
}

export const sound = {
  get enabled() { return enabled; },
  toggle() { enabled = !enabled; try { localStorage.setItem(KEY, enabled ? "on" : "off"); } catch {} if (enabled) ac(); return enabled; },
  /** Arpegiu vesel: un fruct a fost descoperit. */
  discover() {
    if (!enabled) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.09, 0.35, { type: "triangle", gain: 0.14 }));
    tone(1567.98, 0.38, 0.6, { type: "sine", gain: 0.08 });
  },
  /** „Pop” scurt la atingerea unei vitamine. */
  pop() { if (enabled) tone(660, 0, 0.16, { type: "sine", gain: 0.16, slide: 1.8 }); },
  /** Clic discret pentru butoane. */
  tick() { if (enabled) tone(1200, 0, 0.05, { type: "square", gain: 0.03 }); }
};
