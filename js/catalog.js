// FruitAI — catalogul de fructe.
// Singurul loc din aplicație care citește datele despre fructe. Toate secțiunile
// (catalog, fișe educative, scanner AI, AR, hero) primesc datele de aici.
// Sursa: data/fruits.json, data/non-fruits.json, data/nutrients.json.

const SHAPES = new Set(["round", "oval", "teardrop", "elongated", "cluster", "drupelets", "spiky", "star"]);
const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export class Catalog {
  constructor({ fruits, categories, nonFruits, nutrients, kcalDailyValue, nutrientInfo = null }) {
    this.issues = [];
    this.categories = categories;
    this.nutrients = nutrients;              // [{key, ro, short, unit, dailyValue, color}]
    this.kcalDailyValue = kcalDailyValue;
    const catIds = new Set(categories.map(c => c.id));
    const nutrientKeys = new Set(nutrients.map(n => n.key));

    // --- validare + index după id ---
    this.byId = new Map();
    for (const f of fruits) {
      const problem = this.#validate(f, catIds, nutrientKeys);
      if (problem) { this.issues.push(`${f && f.id || "?"}: ${problem}`); continue; }
      this.byId.set(f.id, Object.freeze(f));
    }
    this.fruits = [...this.byId.values()].sort((a, b) => a.ro.localeCompare(b.ro, "ro"));

    // --- maparea etichetă AI → id (sursa unică pentru scanner) ---
    this.aiToFruit = new Map();
    for (const f of this.fruits) for (const label of (f.ai?.labels || [])) {
      const k = norm(label);
      if (this.aiToFruit.has(k)) { this.issues.push(`${f.id}: eticheta AI „${label}” e deja folosită de ${this.aiToFruit.get(k)}`); continue; }
      this.aiToFruit.set(k, f.id);
    }
    this.aiToNonFruit = new Map();
    for (const n of nonFruits) {
      const k = norm(n.label);
      if (this.aiToFruit.has(k)) { this.issues.push(`non-fruct „${n.label}” se suprapune cu un fruct`); continue; }
      this.aiToNonFruit.set(k, n);
    }
    // explicațiile pentru copii: fiecare vitamină / mineral din catalog trebuie să aibă una
    this.info = nutrientInfo;
    if (nutrientInfo) for (const f of this.fruits) {
      for (const v of f.vitamins) if (!nutrientInfo.vitamins[v]) this.issues.push(`${f.id}: vitamina „${v}” nu are explicație în nutrient-info.json`);
      for (const m of f.minerals) if (!nutrientInfo.minerals[m]) this.issues.push(`${f.id}: mineralul „${m}” nu are explicație în nutrient-info.json`);
    }
    if (this.issues.length) console.warn("Catalog FruitAI — înregistrări ignorate sau conflicte:\n" + this.issues.join("\n"));
  }

  #validate(f, catIds, nutrientKeys) {
    if (!f || typeof f !== "object") return "înregistrare invalidă";
    for (const k of ["id", "ro", "en", "category", "description", "fact"]) if (!f[k] || typeof f[k] !== "string") return `lipsește „${k}”`;
    if (!/^[a-z][a-z0-9-]*$/.test(f.id)) return "id invalid (doar litere mici, cifre și cratimă)";
    if (this.byId.has(f.id)) return "id duplicat";
    if (!catIds.has(f.category)) return `categoria „${f.category}” nu există`;
    if (!Array.isArray(f.vitamins) || !Array.isArray(f.minerals)) return "vitamins / minerals trebuie să fie liste";
    const p = f.nutrition?.per100g;
    if (!p || typeof p !== "object") return "lipsește nutrition.per100g";
    for (const k of ["kcal", ...nutrientKeys]) if (!(k in p) || (p[k] !== null && typeof p[k] !== "number")) return `nutrition.per100g.${k} lipsește sau nu e număr/null`;
    if (!/^#[0-9a-f]{6}$/i.test(f.visual?.color || "")) return "visual.color trebuie să fie #RRGGBB";
    if (!SHAPES.has(f.visual?.shape)) return `visual.shape trebuie să fie unul dintre: ${[...SHAPES].join(", ")}`;
    if (f.ai && (!Array.isArray(f.ai.labels) || !f.ai.labels.length)) return "ai.labels trebuie să fie o listă nevidă";
    return null;
  }

  // ---------- acces ----------
  get(id) { return this.byId.get(id) || null; }
  has(id) { return this.byId.has(id); }
  get count() { return this.fruits.length; }
  get recognizable() { return this.fruits.filter(f => f.ai); }
  get nonFruitCount() { return this.aiToNonFruit.size; }
  categoryName(id) { return this.categories.find(c => c.id === id)?.ro || id; }
  showcase() { const s = this.fruits.filter(f => f.showcase && this.hasNutrition(f.id)); return s.length ? s : this.fruits; }
  pick(list = this.showcase(), seed = Math.random()) { return list[Math.floor(seed * list.length) % list.length]; }
  hasNutrition(id) { const f = this.get(id); return !!f && f.nutrition.per100g.kcal != null; }

  // ---------- recunoaștere AI ----------
  /** Etichetele de fructe date modelului (în ordinea catalogului). */
  aiFruitLabels() { return [...this.aiToFruit.keys()]; }
  aiNonFruitLabels() { return [...this.aiToNonFruit.keys()]; }
  aiAllLabels() { return [...this.aiFruitLabels(), ...this.aiNonFruitLabels()]; }
  /** Rezultatul modelului (o etichetă text) → înregistrarea din catalog. */
  resolveAiLabel(label) {
    const k = norm(label || "");
    if (this.aiToFruit.has(k)) return { kind: "fruit", id: this.aiToFruit.get(k) };
    if (this.aiToNonFruit.has(k)) return { kind: "notfruit", label: k };
    return null;
  }
  nonFruitText(label) { return this.aiToNonFruit.get(norm(label))?.ro || "un obiect"; }

  // ---------- nutriție ----------
  nutritionFor(id, grams = 100) {
    const f = this.get(id);
    const p = f ? f.nutrition.per100g : {};
    const k = grams / 100;
    const scale = v => (v == null ? null : v * k);
    return {
      source: f ? f.nutrition.source : "—",
      kcal: scale(p.kcal ?? null),
      values: this.nutrients.map(n => scale(p[n.key] ?? null))
    };
  }

  /** Observații derivate din valorile per 100 g (aceleași reguli pentru orice fruct). */
  insightsFor(id) {
    const f = this.get(id);
    if (!f || f.nutrition.per100g.kcal == null) return [];
    const { kcal, protein, carbs, fat, fiber } = f.nutrition.per100g;
    const out = [];
    if (kcal < 60) out.push("Densitate energetică scăzută");
    else if (kcal >= 150) out.push("Densitate energetică ridicată");
    if (fiber != null && fiber >= 3) out.push("Bogat în fibre");
    if (fat != null && fat >= 5) out.push("Conține grăsimi");
    if (carbs != null && carbs >= 20) out.push("Bogat în carbohidrați");
    if (protein != null && protein >= 2) out.push("Proteine peste medie pentru un fruct");
    return out.slice(0, 3);
  }

  // ---------- nutrienți explicați pentru copii ----------
  /** Doar nutrienții din înregistrarea fructului (+ fibrele, dacă depășesc pragul). Nimic atribuit automat. */
  nutrientsFor(id) {
    const f = this.get(id), I = this.info;
    if (!f || !I) return [];
    const out = [];
    for (const v of f.vitamins) if (I.vitamins[v]) out.push({ kind: "vitamin", key: v, ...I.vitamins[v] });
    for (const m of f.minerals) if (I.minerals[m]) out.push({ kind: "mineral", key: m, ...I.minerals[m] });
    const fiber = f.nutrition.per100g.fiber;
    if (fiber != null && fiber >= I.fiber.minPer100g) out.push({ kind: "fiber", key: "fiber", ...I.fiber, amount: fiber });
    return out;
  }
  /** Beneficiile pentru organism, adunate din nutrienții fructului (fără duplicate). */
  benefitsFor(id) {
    const seen = new Map();
    for (const n of this.nutrientsFor(id)) for (const b of n.benefits || []) {
      if (!seen.has(b) && this.info.benefits[b]) seen.set(b, { key: b, ...this.info.benefits[b], from: [] });
      seen.get(b)?.from.push(n.title);
    }
    return [...seen.values()];
  }

  // ---------- filtre derivate din date ----------
  /** Valorile distincte ale unui câmp listă (ex. „vitamins”), cu numărul de fructe. */
  facet(field) {
    const m = new Map();
    for (const f of this.fruits) for (const v of f[field] || []) m.set(v, (m.get(v) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ro")).map(([value, count]) => ({ value, count }));
  }
  categoryCounts() {
    return this.categories
      .map(c => ({ ...c, count: this.fruits.filter(f => f.category === c.id).length }))
      .filter(c => c.count > 0);
  }
  /** Căutare în nume (ro/en), etichete AI, vitamine și minerale; fără diacritice. */
  filter({ q = "", category = null, vitamin = null, scannable = null } = {}) {
    const nq = norm(q);
    return this.fruits.filter(f =>
      (!category || f.category === category) &&
      (!vitamin || f.vitamins.includes(vitamin) || f.minerals.includes(vitamin)) &&
      (scannable == null || !!f.ai === scannable) &&
      (!nq || [f.ro, f.en, ...(f.ai?.labels || []), ...f.vitamins, ...f.minerals].some(s => norm(s).includes(nq)))
    );
  }
}

/** Încarcă cele trei fișiere de date și construiește catalogul. */
export async function loadCatalog(base = new URL("../data/", import.meta.url)) {
  const get = async name => {
    const r = await fetch(new URL(name, base), { cache: "no-cache" });
    if (!r.ok) throw new Error(`Nu pot citi ${name} (${r.status})`);
    return r.json();
  };
  const [fruitsDoc, nonDoc, nutDoc, infoDoc] = await Promise.all([get("fruits.json"), get("non-fruits.json"), get("nutrients.json"), get("nutrient-info.json")]);
  return new Catalog({
    fruits: fruitsDoc.fruits,
    categories: fruitsDoc.categories,
    nonFruits: nonDoc.labels,
    nutrients: nutDoc.nutrients,
    kcalDailyValue: nutDoc.kcalDailyValue,
    nutrientInfo: infoDoc
  });
}
