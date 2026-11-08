// FruitAI — jocul: provocări (fiecare reușită = o stea), insigne și quiz-uri.
// Toate întrebările sunt generate din datele verificate ale catalogului (fructe, vitamine, beneficii),
// deci nu se inventează nimic. Progresul începe de la zero la fiecare deschidere a paginii, ca și colecția.

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
  { id: "stars3", icon: "⭐", ro: "3 stele", how: "Câștigă 3 stele rezolvând provocări", test: g => g.s.stars >= 3 }
];

let catalog = null, s = null, ui = {};
// progresul ține cât e deschisă pagina (ca și colecția de fructe): fără date păstrate în browser
function load() { try { localStorage.removeItem(KEY); } catch {} return null; }
function save() {}
const kidFruits = () => { const k = catalog.fruits.filter(f => f.emoji && catalog.hasNutrition(f.id)); return k.length >= 6 ? k : catalog.fruits; };
// fructele descoperite cu camera (cu fișă nutrițională): quiz-ul pune întrebări DOAR despre ele
const foundFruits = () => catalog.fruits.filter(f => collection.has(f.id) && catalog.hasNutrition(f.id));
/** Variante greșite: întâi alte fructe descoperite, apoi (dacă nu ajung) fructe cunoscute din catalog. */
const others = (exclude, n, ok = () => true) => {
  const pool = [...shuffle(foundFruits()), ...shuffle(kidFruits())].filter((f, i, a) => !exclude.includes(f) && ok(f) && a.indexOf(f) === i);
  return pool.slice(0, n);
};
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
/** Un pas înainte în joc (fruct găsit, răspuns corect): verificăm insignele și, dacă e cazul, anunțăm. */
function progress(n, why, icon = "✨") {
  if (why) toast(icon, why);
  checkBadges();
}
/** Stelele vin DOAR din provocări: fiecare provocare reușită = o stea. */
function addStar() {
  s.stars++; paintStars();
  ui.pill?.classList.remove("bump"); void ui.pill?.offsetWidth; ui.pill?.classList.add("bump");
}
function paintStars() {
  if (!ui.pill) return;
  ui.pill.querySelector("b").textContent = s.stars;
  ui.pill.title = t("Stele câștigate din provocări: {n}", { n: s.stars });
}
function checkBadges() {
  const c = ctx();
  for (const b of BADGES) if (!s.badges.includes(b.id) && b.test(c)) {
    s.badges.push(b.id); save();
    setTimeout(() => { sound.discover(); toast(b.icon, t("Insignă nouă: {name}!", { name: t(b.ro) }), t("Bravo, continuă tot așa!")); }, 900);
  }
}


// ---------------------------------------------------------------- provocarea din scanner
function newChallenge() {
  const common = ["C", "A", "K", "B6"].filter(v => vitInfo(v) && kidFruits().some(f => f.vitamins.includes(v)));
  s.challenge = { vitamin: pick(common.filter(v => v !== s.challenge?.vitamin)) || "C" }; save(); paintChallenge();
}
function paintChallenge() {
  if (!ui.chip || !s.challenge) return;
  const v = vitInfo(s.challenge.vitamin);
  ui.chip.innerHTML = `<span class="cc-i">🎯</span><span>${esc(t("Provocare: găsește un fruct bogat în {v}!", { v: vitTitle(s.challenge.vitamin) }))}</span><span class="cc-star">+1 ⭐</span><span class="nicon vitamin" style="--nc:${v.color}"><b>${esc(v.symbol)}</b></span>`;
  ui.chip.hidden = false;
}

// ---------------------------------------------------------------- quiz
function makeQuestion() {
  const mine = foundFruits(), used = quiz?.types || [];
  // tipurile de întrebări încă nefolosite în acest quiz vin primele, ca întrebările să fie variate
  const types = shuffle(["vitFruit", "english", "fruitVit", "benefit"]).sort((x, y) => used.filter(u => u === x).length - used.filter(u => u === y).length);
  const recent = quiz?.asked || [];
  const fresh = list => { const f = list.filter(x => !recent.includes(x.id)); return f.length ? f : list; };
  for (const type of types) {
    if (type === "vitFruit") {
      // „Care fruct este bogat în vitamina X?” — răspunsul corect e unul dintre fructele tale
      const vits = [...new Set(mine.flatMap(f => f.vitamins))].filter(v => vitInfo(v) && others([], 2, f => !f.vitamins.includes(v)).length === 2);
      if (!vits.length) continue;
      const v = pick(vits), yes = pick(fresh(mine.filter(f => f.vitamins.includes(v)))), no = others([yes], 2, f => !f.vitamins.includes(v));
      quiz && quiz.asked.push(yes.id);
      return { type, q: t("Care fruct este bogat în {v}?", { v: vitTitle(v) }), icon: nIcon({ kind: "vitamin", ...vitInfo(v) }), options: shuffle([yes, ...no]).map(f => ({ fruit: f, ok: f === yes })), explain: t("{fruit} are {v} printre vitaminele lui principale.", { fruit: names(yes)[0], v: vitTitle(v) }) };
    }
    if (type === "english") {
      const a = pick(fresh(mine)), rest = others([a], 2);
      if (rest.length < 2) continue;
      quiz && quiz.asked.push(a.id);
      const en = getLang() === "en";
      return { type, q: en ? t("Cum se spune „{name}” în română?", { name: a.en }) : t("Cum se spune „{name}” în engleză?", { name: a.ro }), icon: "🌍",
        options: shuffle([a, ...rest]).map(f => ({ text: en ? f.ro : f.en, fruit: f, ok: f === a, hideName: true })), explain: `${a.ro} = ${a.en}` };
    }
    if (type === "fruitVit") {
      const cands = mine.filter(f => f.vitamins.length && Object.keys(catalog.info.vitamins).filter(v => !f.vitamins.includes(v)).length >= 2);
      if (!cands.length) continue;
      const f = pick(fresh(cands)), yes = pick(f.vitamins), no = shuffle(Object.keys(catalog.info.vitamins).filter(v => !f.vitamins.includes(v))).slice(0, 2);
      quiz && quiz.asked.push(f.id);
      return { type, q: t("Ce vitamină importantă are {fruit}?", { fruit: names(f)[0] }), icon: f.emoji || "🍓", options: shuffle([yes, ...no]).map(v => ({ text: vitTitle(v), nutrient: { kind: "vitamin", ...vitInfo(v) }, ok: v === yes })), explain: t("{fruit} are {v}.", { fruit: names(f)[0], v: vitTitle(yes) }) };
    }
    if (type === "benefit") {
      // o vitamină pe care o au fructele tale: la ce te ajută?
      const keys = [...new Set(mine.flatMap(f => f.vitamins))].filter(v => vitInfo(v)?.benefits?.length);
      if (!keys.length) continue;
      const v = pick(keys), info = vitInfo(v), from = pick(mine.filter(f => f.vitamins.includes(v)));
      const all = Object.keys(catalog.info.benefits), yes = pick(info.benefits), no = shuffle(all.filter(b => !info.benefits.includes(b))).slice(0, 2);
      const bn = b => { const x = catalog.info.benefits[b]; return `${x.icon} ${getLang() === "en" ? x.en : x.ro}`; };
      return { type, q: t("{fruit} are {v}. La ce te ajută această vitamină?", { fruit: names(from)[0], v: vitTitle(v) }), icon: nIcon({ kind: "vitamin", ...info }), options: shuffle([yes, ...no]).map(b => ({ text: bn(b), ok: b === yes })), explain: getLang() === "en" ? info.kid_en : info.kid };
    }
  }
}

let quiz = null;
function openQuiz() {
  if (!ui.dlg.open) ui.dlg.showModal();
  const mine = foundFruits();
  // quiz-ul e despre fructele TALE: fără niciun fruct descoperit, te invităm întâi să scanezi unul
  if (!mine.length) {
    quiz = null;
    ui.body.innerHTML = `<div class="qz-end"><div class="qz-trophy">🔍</div>
      <h3>${esc(t("Quiz-ul e despre fructele tale"))}</h3>
      <p>${esc(t("Descoperă mai întâi un fruct cu camera, apoi te întreb despre el."))}</p>
      <div class="qz-end-btns"><button type="button" class="dbtn big primary" data-g="scan">📷 ${esc(t("Pornește camera"))}</button></div></div>`;
    return;
  }
  // mai puține fructe → mai puține întrebări (1 fruct: 3 întrebări; 3 sau mai multe: 5)
  quiz = { i: 0, n: Math.min(5, 2 + mine.length), correct: 0, q: null, asked: [], types: [] };
  nextQuestion();
}
function nextQuestion() {
  if (quiz.i >= quiz.n) return quizEnd();
  quiz.q = makeQuestion(); quiz.answered = false; quiz.types.push(quiz.q.type);
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
    progress(1); confetti(btn);
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
    <div class="gc-head"><div class="gc-stars">⭐ <b>${s.stars}</b><span>${esc(t("stele din provocări"))}</span></div><div class="gc-stars">🏅 <b>${s.badges.length}</b><span>${esc(t("din {n} insigne", { n: BADGES.length }))}</span></div><div class="gc-found">🧺 <b>${c.found}</b><span>${esc(t("din {n} fructe", { n: catalog.count }))}</span></div></div>
    ${v ? `<div class="gc-chal"><span class="cc-i">🎯</span><div><b>${esc(t("Provocarea ta"))}</b><span>${esc(t("Găsește cu camera un fruct bogat în {v}. Primești o stea.", { v: vitTitle(s.challenge.vitamin) }))}</span></div><span class="nicon vitamin" style="--nc:${v.color}"><b>${esc(v.symbol)}</b></span></div>` : ""}
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
  ui.chip = document.getElementById("challengeChip");
  ui.pill = document.getElementById("starPill");
  ui.pill?.addEventListener("click", () => { sound.tick(); openCollection(); });
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
    else if (k === "scan") { ui.dlg.close(); document.querySelector(".hero [data-start]")?.click(); }
  });
  document.querySelectorAll("[data-quiz]").forEach(b => b.addEventListener("click", () => { sound.tick(); openQuiz(); }));
  paintStars();
  if (!s.challenge) newChallenge(); else paintChallenge();

  // evenimentele aplicației
  window.addEventListener("fruitai:reveal", e => {
    const { id, isNew } = e.detail, f = catalog.get(id);
    progress(1, isNew ? t("Fruct nou în colecție: {fruit}", { fruit: names(f)[0] }) : null, "🧺");
    if (s.challenge && f.vitamins.includes(s.challenge.vitamin)) {
      s.challengesDone++; save();
      const v = vitTitle(s.challenge.vitamin);
      setTimeout(() => { sound.discover(); addStar(); toast("⭐", t("Provocare reușită! +1 stea"), t("{fruit} e bogat în {v}.", { fruit: names(f)[0], v })); checkBadges(); newChallenge(); }, 3400);
    }
  });
  window.addEventListener("fruitai:nutrient", e => {
    if (s.nutrients.includes(e.detail)) return;
    s.nutrients.push(e.detail); save(); progress(1);
  });
  window.addEventListener("fruitai:lang", () => { paintChallenge(); if (ui.dlg.open && !quiz) openCollection(); });
  ui.dlg.addEventListener("close", () => { quiz = null; });
}
