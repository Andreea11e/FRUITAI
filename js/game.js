// FruitAI — jocul: steluțe, insigne, provocări și quiz-uri.
// Toate întrebările sunt generate din datele verificate ale catalogului (fructe, vitamine, beneficii),
// deci nu se inventează nimic. Progresul se păstrează doar în acest browser.

import { sound } from "./sound.js";
import { collection, nIcon } from "./discovery.js";
import { fruitArt } from "./fruit-art.js";
import { t, getLang, names } from "./i18n.js";

const KEY = "fruitai.game";
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const BADGES = [
  { id: "first", icon: "🌱", ro: "Primul fruct", how: "Descoperă un fruct cu camera", test: g => g.found >= 1 },
  { id: "basket", icon: "🧺", ro: "Coș cu 5 fructe", how: "Descoperă 5 fructe diferite", test: g => g.found >= 5 },
  { id: "collector", icon: "🏅", ro: "Colecționar", how: "Descoperă 10 fructe diferite", test: g => g.found >= 10 },
  { id: "detective", icon: "🔬", ro: "Detectiv de vitamine", how: "Atinge 5 vitamine sau minerale diferite", test: g => g.s.nutrients.length >= 5 },
  { id: "quiz", icon: "🧠", ro: "Campion la quiz", how: "Răspunde corect la 5 întrebări", test: g => g.s.quizCorrect >= 5 },
  { id: "challenge", icon: "🎯", ro: "Provocare reușită", how: "Termină o provocare din scanner", test: g => g.s.challengesDone >= 1 },
  { id: "stars", icon: "⭐", ro: "20 de steluțe", how: "Strânge 20 de steluțe", test: g => g.s.stars >= 20 }
];

let catalog = null, s = null, ui = {};
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }
const kidFruits = () => { const k = catalog.fruits.filter(f => f.emoji && catalog.hasNutrition(f.id)); return k.length >= 6 ? k : catalog.fruits; };
const vitInfo = key => catalog.info.vitamins[key];
const vitTitle = key => getLang() === "en" ? (vitInfo(key).title_en || vitInfo(key).title) : vitInfo(key).title;
const ctx = () => ({ s, found: catalog.fruits.filter(f => collection.has(f.id)).length });

// ---------------------------------------------------------------- recompense
function toast(icon, title, sub = "") {
  const el = ui.toast;
  el.innerHTML = `<span class="ti">${icon}</span><span><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span>`;
  el.hidden = false; el.classList.remove("in"); void el.offsetWidth; el.classList.add("in");
  clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, 3200);
}
function addStars(n, why) {
  s.stars += n; save(); paintStars();
  ui.pill.classList.remove("bump"); void ui.pill.offsetWidth; ui.pill.classList.add("bump");
  if (why) toast("⭐", t("+{n} steluțe!", { n }), why);
  checkBadges();
}
function checkBadges() {
  const c = ctx();
  for (const b of BADGES) if (!s.badges.includes(b.id) && b.test(c)) {
    s.badges.push(b.id); save();
    setTimeout(() => { sound.discover(); toast(b.icon, t("Insignă nouă: {name}!", { name: t(b.ro) }), t("Bravo, continuă tot așa!")); }, 900);
  }
}
function paintStars() { ui.pill.querySelector("b").textContent = s.stars; }

// ---------------------------------------------------------------- provocarea din scanner
function newChallenge() {
  const common = ["C", "A", "K", "B6"].filter(v => vitInfo(v) && kidFruits().some(f => f.vitamins.includes(v)));
  s.challenge = { vitamin: pick(common.filter(v => v !== s.challenge?.vitamin)) || "C" }; save(); paintChallenge();
}
function paintChallenge() {
  if (!ui.chip || !s.challenge) return;
  const v = vitInfo(s.challenge.vitamin);
  ui.chip.innerHTML = `<span class="cc-i">🎯</span><span>${esc(t("Provocare: găsește un fruct bogat în {v}!", { v: vitTitle(s.challenge.vitamin) }))}</span><span class="nicon vitamin" style="--nc:${v.color}"><b>${esc(v.symbol)}</b></span>`;
  ui.chip.hidden = false;
}

// ---------------------------------------------------------------- quiz
function makeQuestion() {
  const kids = kidFruits(), types = shuffle(["vitFruit", "english", "fruitVit", "benefit"]);
  for (const type of types) {
    if (type === "vitFruit") {
      const vits = Object.keys(catalog.info.vitamins).filter(v => { const n = kids.filter(f => f.vitamins.includes(v)).length; return n >= 1 && kids.length - n >= 2; });
      if (!vits.length) continue;
      const v = pick(vits), yes = pick(kids.filter(f => f.vitamins.includes(v))), no = shuffle(kids.filter(f => !f.vitamins.includes(v))).slice(0, 2);
      return { q: t("Care fruct este bogat în {v}?", { v: vitTitle(v) }), icon: nIcon({ kind: "vitamin", ...vitInfo(v) }), options: shuffle([yes, ...no]).map(f => ({ fruit: f, ok: f === yes })), explain: t("{fruit} are {v} printre vitaminele lui principale.", { fruit: names(yes)[0], v: vitTitle(v) }) };
    }
    if (type === "english") {
      const [a, ...rest] = shuffle(kids).slice(0, 3);
      const en = getLang() === "en";
      return { q: en ? t("Cum se spune „{name}” în română?", { name: a.en }) : t("Cum se spune „{name}” în engleză?", { name: a.ro }), icon: "🌍",
        options: shuffle([a, ...rest]).map(f => ({ text: en ? f.ro : f.en, fruit: f, ok: f === a, hideName: true })), explain: `${a.ro} = ${a.en}` };
    }
    if (type === "fruitVit") {
      const cands = kids.filter(f => f.vitamins.length && Object.keys(catalog.info.vitamins).filter(v => !f.vitamins.includes(v)).length >= 2);
      if (!cands.length) continue;
      const f = pick(cands), yes = pick(f.vitamins), no = shuffle(Object.keys(catalog.info.vitamins).filter(v => !f.vitamins.includes(v))).slice(0, 2);
      return { q: t("Ce vitamină importantă are {fruit}?", { fruit: names(f)[0] }), icon: f.emoji || "🍓", options: shuffle([yes, ...no]).map(v => ({ text: vitTitle(v), nutrient: { kind: "vitamin", ...vitInfo(v) }, ok: v === yes })), explain: t("{fruit} are {v}.", { fruit: names(f)[0], v: vitTitle(yes) }) };
    }
    if (type === "benefit") {
      const keys = Object.keys(catalog.info.vitamins), v = pick(keys), info = vitInfo(v);
      const all = Object.keys(catalog.info.benefits), yes = pick(info.benefits), no = shuffle(all.filter(b => !info.benefits.includes(b))).slice(0, 2);
      const bn = b => { const x = catalog.info.benefits[b]; return `${x.icon} ${getLang() === "en" ? x.en : x.ro}`; };
      return { q: t("La ce te ajută {v}?", { v: vitTitle(v) }), icon: nIcon({ kind: "vitamin", ...info }), options: shuffle([yes, ...no]).map(b => ({ text: bn(b), ok: b === yes })), explain: getLang() === "en" ? info.kid_en : info.kid };
    }
  }
}

let quiz = null;
function openQuiz() {
  quiz = { i: 0, n: 5, correct: 0, q: null };
  if (!ui.dlg.open) ui.dlg.showModal();
  nextQuestion();
}
function nextQuestion() {
  if (quiz.i >= quiz.n) return quizEnd();
  quiz.q = makeQuestion(); quiz.answered = false;
  const q = quiz.q;
  ui.body.innerHTML = `
    <div class="qz-top"><span>${esc(t("Întrebarea {i} din {n}", { i: quiz.i + 1, n: quiz.n }))}</span><span class="qz-dots">${Array.from({ length: quiz.n }, (_, k) => `<i class="${k < quiz.i ? "done" : k === quiz.i ? "now" : ""}"></i>`).join("")}</span></div>
    <div class="qz-q"><span class="qz-icon">${q.icon.startsWith?.("<") ? q.icon : esc(q.icon)}</span><h3>${esc(q.q)}</h3></div>
    <div class="qz-opts">${q.options.map((o, k) => `<button type="button" class="qz-opt" data-k="${k}">
      ${o.fruit && !o.hideName ? (o.fruit.emoji ? `<span class="qe">${esc(o.fruit.emoji)}</span>` : fruitArt(o.fruit, { size: 52 })) : o.nutrient ? nIcon(o.nutrient) : o.fruit ? (o.fruit.emoji ? `<span class="qe">${esc(o.fruit.emoji)}</span>` : "") : ""}
      <span>${esc(o.text || names(o.fruit)[0])}</span></button>`).join("")}</div>
    <p class="qz-explain" hidden></p>
    <div class="qz-next" hidden><button type="button" class="dbtn big primary" data-g="next">${esc(t(quiz.i + 1 < quiz.n ? "Următoarea" : "Vezi rezultatul"))}</button></div>`;
  ui.body.querySelectorAll(".qz-opt").forEach(b => b.onclick = () => answer(+b.dataset.k, b));
}
function answer(k, btn) {
  if (quiz.answered) return;
  quiz.answered = true;
  const o = quiz.q.options[k];
  ui.body.querySelectorAll(".qz-opt").forEach((b, j) => { b.disabled = true; if (quiz.q.options[j].ok) b.classList.add("right"); });
  if (o.ok) {
    quiz.correct++; s.quizCorrect++; save();
    btn.classList.add("right", "yay"); sound.discover();
    addStars(1); confetti(btn);
  } else { btn.classList.add("wrong"); sound.tick(); }
  const ex = ui.body.querySelector(".qz-explain");
  ex.innerHTML = `<b>${esc(o.ok ? t(pick(["Super!", "Bravo!", "Corect!", "Excelent!"])) : t("Aproape! Răspunsul corect e marcat cu verde."))}</b> ${esc(quiz.q.explain)}`;
  ex.hidden = false;
  ui.body.querySelector(".qz-next").hidden = false;
  quiz.i++;
}
function quizEnd() {
  const stars = quiz.correct;
  ui.body.innerHTML = `<div class="qz-end"><div class="qz-trophy">${stars >= 4 ? "🏆" : stars >= 2 ? "🥈" : "🌱"}</div>
    <h3>${esc(t("Ai răspuns corect la {c} din {n} întrebări!", { c: quiz.correct, n: quiz.n }))}</h3>
    <p>${esc(stars >= 4 ? t("Ești un adevărat expert în fructe!") : t("Fiecare quiz te face mai deștept. Mai încearcă!"))}</p>
    <div class="qz-stars">${"⭐".repeat(stars)}<span>${esc(t("+{n} steluțe", { n: stars }))}</span></div>
    <div class="qz-end-btns"><button type="button" class="dbtn big primary" data-g="quiz">${esc(t("Încă un quiz"))}</button><button type="button" class="dbtn big" data-g="collection">${esc(t("Colecția mea"))}</button></div></div>`;
  checkBadges();
}
function confetti(near) {
  const r = near.getBoundingClientRect(), box = document.createElement("div");
  box.className = "confetti";
  box.style.left = (r.left + r.width / 2) + "px"; box.style.top = (r.top + r.height / 2) + "px";
  box.innerHTML = Array.from({ length: 18 }, (_, i) => `<i style="--a:${i * 20}deg;--c:${["#FFE27A", "#8EF0C9", "#FF6FB5", "#8B6CFF", "#FFB547"][i % 5]}"></i>`).join("");
  document.body.appendChild(box); setTimeout(() => box.remove(), 1100);
}

// ---------------------------------------------------------------- colecția mea
function openCollection() {
  if (!ui.dlg.open) ui.dlg.showModal();
  const c = ctx(), v = s.challenge && vitInfo(s.challenge.vitamin);
  const found = catalog.fruits.filter(f => collection.has(f.id));
  ui.body.innerHTML = `
    <div class="gc-head"><div class="gc-stars">⭐ <b>${s.stars}</b><span>${esc(t("steluțe"))}</span></div><div class="gc-found">🧺 <b>${c.found}</b><span>${esc(t("din {n} fructe", { n: catalog.count }))}</span></div></div>
    ${v ? `<div class="gc-chal"><span class="cc-i">🎯</span><div><b>${esc(t("Provocarea ta"))}</b><span>${esc(t("Găsește cu camera un fruct bogat în {v}.", { v: vitTitle(s.challenge.vitamin) }))}</span></div><span class="nicon vitamin" style="--nc:${v.color}"><b>${esc(v.symbol)}</b></span></div>` : ""}
    <h4>${esc(t("Insigne"))}</h4>
    <div class="gc-badges">${BADGES.map(b => { const ok = s.badges.includes(b.id); return `<div class="gb ${ok ? "ok" : ""}" title="${esc(t(b.how))}"><span class="gi">${ok ? b.icon : "🔒"}</span><b>${esc(t(b.ro))}</b><small>${esc(t(b.how))}</small></div>`; }).join("")}</div>
    <h4>${esc(t("Fructele descoperite"))}</h4>
    ${found.length ? `<div class="gc-fruits">${found.map(f => `<button type="button" class="gf" data-id="${esc(f.id)}">${f.emoji ? `<span class="qe">${esc(f.emoji)}</span>` : fruitArt(f, { size: 48 })}<span>${esc(names(f)[0])}</span></button>`).join("")}</div>`
      : `<p class="gc-empty">${esc(t("Încă nu ai descoperit niciun fruct cu camera. Scanează unul ca să-l adaugi aici!"))}</p>`}
    <div class="gc-btns"><button type="button" class="dbtn big primary" data-g="quiz">🎯 ${esc(t("Joacă un quiz"))}</button></div>`;
  ui.body.querySelectorAll(".gf").forEach(b => b.onclick = () => { ui.dlg.close(); ui.openFruit(b.dataset.id); });
}

// ---------------------------------------------------------------- pornire
export function initGame(cat, opts) {
  catalog = cat;
  s = Object.assign({ stars: 0, nutrients: [], quizCorrect: 0, challengesDone: 0, badges: [], challenge: null }, load() || {});
  ui.openFruit = opts.openFruit;
  ui.pill = document.getElementById("starPill");
  ui.chip = document.getElementById("challengeChip");
  ui.toast = document.createElement("div"); ui.toast.className = "game-toast"; ui.toast.hidden = true; ui.toast.setAttribute("role", "status"); document.body.appendChild(ui.toast);
  ui.dlg = document.createElement("dialog"); ui.dlg.className = "game";
  ui.dlg.innerHTML = `<button type="button" class="dbtn round game-x" data-g="close" aria-label="Închide">×</button><div class="game-body"></div>`;
  document.body.appendChild(ui.dlg);
  ui.body = ui.dlg.querySelector(".game-body");
  ui.dlg.addEventListener("click", e => {
    const b = e.target.closest("[data-g]"); if (e.target === ui.dlg) return ui.dlg.close();
    if (!b) return;
    sound.tick();
    const k = b.dataset.g;
    if (k === "close") ui.dlg.close(); else if (k === "next") nextQuestion(); else if (k === "quiz") openQuiz(); else if (k === "collection") openCollection();
  });
  ui.pill.addEventListener("click", () => { sound.tick(); openCollection(); });
  document.querySelectorAll("[data-quiz]").forEach(b => b.addEventListener("click", () => { sound.tick(); openQuiz(); }));
  paintStars();
  if (!s.challenge) newChallenge(); else paintChallenge();

  // evenimentele aplicației
  window.addEventListener("fruitai:reveal", e => {
    const { id, isNew } = e.detail, f = catalog.get(id);
    addStars(isNew ? 3 : 1, isNew ? t("Fruct nou în colecție: {fruit}", { fruit: names(f)[0] }) : t("Ai găsit din nou: {fruit}", { fruit: names(f)[0] }));
    if (s.challenge && f.vitamins.includes(s.challenge.vitamin)) {
      s.challengesDone++; save();
      const v = vitTitle(s.challenge.vitamin);
      setTimeout(() => { sound.discover(); addStars(2); toast("🎯", t("Provocare reușită!"), t("{fruit} e bogat în {v}. +2 steluțe", { fruit: names(f)[0], v })); newChallenge(); }, 3400);
    }
  });
  window.addEventListener("fruitai:nutrient", e => {
    if (s.nutrients.includes(e.detail)) return;
    s.nutrients.push(e.detail); save(); addStars(1, t("Ai descoperit un nutrient nou!"));
  });
  window.addEventListener("fruitai:lang", () => { paintChallenge(); if (ui.dlg.open && !quiz) openCollection(); });
  ui.dlg.addEventListener("close", () => { quiz = null; });
}
