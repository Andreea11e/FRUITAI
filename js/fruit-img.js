// FruitAI — imaginile fructelor reale (randate din modelele 3D realiste, img/fruits/<id>.png).
// Se folosesc în locul desenelor acolo unde există; restul fructelor păstrează desenul din fruit-art.js.
const REAL = new Set(["apple", "apricot", "avocado", "banana", "blackberry", "blood-orange", "blueberry", "cantaloupe", "cherimoya", "cherry", "clementine", "coconut", "custard-apple", "dragon-fruit", "durian", "fig", "grape", "grapefruit", "jackfruit", "kiwi", "lemon", "lime", "lychee", "mango", "nectarine", "orange", "papaya", "passion-fruit", "peach", "pear", "persimmon", "pineapple", "plantain", "pomegranate", "pomelo", "raspberry", "starfruit", "strawberry", "tangerine", "watermelon"]);
export const realImg = id => REAL.has(id) ? `img/fruits/${id}.png` : null;
