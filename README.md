# FruitAI 9 pentru web

Scanner de fructe cu realitate augmentată, care rulează direct în browser. Îndrepți camera spre unul sau mai multe fructe, iar FruitAI le recunoaște și le ancorează în imagine numele în română, numele în engleză și vitaminele.

## Ce conține

| Fișier | Rol |
|---|---|
| `index.html` | Structura paginii (fără date despre fructe) |
| `css/app.css` | Stilurile |
| `data/fruits.json` | **Catalogul de fructe — sursa unică de date** |
| `data/fruits.schema.json` | Schema catalogului (documentează și validează fiecare câmp) |
| `data/non-fruits.json` | Etichetele AI pentru obiecte care nu sunt fructe |
| `data/nutrients.json` | Nutrienții afișați și dozele zilnice de referință |
| `js/catalog.js` | Citește și validează datele; oferă căutare, filtre și maparea AI → fruct |
| `js/catalog-ui.js` | Generează catalogul, filtrele și fișele educative din date |
| `js/fruit-art.js` | Imaginea fiecărui fruct (fotografie sau ilustrație generată) |
| `js/app.js` | Scannerul, AI, AR în cameră, senzorii ambientali |
| `js/xr.js` | AR spațial (WebXR), încărcat doar la cerere |
| `scripts/check-catalog.mjs` | Verifică datele și că niciun fruct nu e scris direct în cod |
| `start-mac-linux.sh` | Pornește un server local și deschide site-ul (macOS / Linux) |
| `start-windows.bat` | Același lucru pe Windows |

## Cum îl pornești

Browserele permit camera doar pe `https://` sau pe `http://localhost`, deci **nu deschide `index.html` cu dublu-click**. Pornește-l printr-un server local:

- **macOS / Linux:** în Terminal, în acest dosar: `sh start-mac-linux.sh`
- **Windows:** dublu-click pe `start-windows.bat`
- **Manual:** `python3 -m http.server 8000`, apoi deschide http://localhost:8000

Ai nevoie doar de Python 3, fără alte pachete.

## Funcționalități

### Recunoaștere (ca în versiunea 8)
- **Detecție:** OWL-ViT (`Xenova/owlvit-base-patch32`) găsește fructul în cadru și separă mâini, fețe, persoane.
- **Clasificare:** CLIP (`Xenova/clip-vit-base-patch32`) alege dintre etichetele din catalog: 61 de fructe și 56 de obiecte care nu sunt fructe.
- Modelele rulează **în browser** prin transformers.js. Imaginile nu sunt trimise nicăieri.
- **Pornire automată:** modelele încep să se încarce imediat ce deschizi pagina, în fundal. Când pui o imagine, analiza începe pe loc. Dacă o pui înainte să fie gata, imaginea așteaptă și e analizată automat.
- **Descărcare o singură dată:** prima vizită descarcă modelele (~310 MB în varianta q8 pentru WASM, ~610 MB în varianta fp16 pentru WebGPU). După aceea pornesc din memoria browserului (Cache Storage), fără descărcare. Aplicația cere browserului stocare persistentă, ca să nu le șteargă.
- Varianta e aleasă automat: fp16 pe WebGPU, dacă placa video suportă `shader-f16`, altfel q8 pe WASM. Versiunea 8 folosea fp32 pe WebGPU (~1,2 GB), care putea depăși spațiul de cache și se descărca din nou la fiecare vizită.
- După încărcare, aplicația rulează o analiză de încălzire pe o imagine mică, ca prima analiză reală să fie rapidă.
- Modelele trebuie descărcate din nou doar dacă ștergi datele site-ului, folosești o fereastră privată sau alt browser.
- Pragurile sunt cele din `main.py`: detector 0,10, fruct 0,30, cadru întreg 0,60, o analiză la 0,8 s, iar un rezultat rămâne afișat 4 s.
- Când pagina rulează ca artifact Claude, recunoașterea se face cu Claude (fotografii), ca înainte.

### Realitate augmentată
- **AR în cameră** (orice browser modern cu cameră): fiecare fruct detectat e încadrat, iar eticheta lui arată, în ordine, **numele în română, numele în engleză și vitaminele**. Eticheta urmărește lin fructul când miști camera.
- **Mai multe fructe deodată:** până la 3 fructe din același cadru primesc fiecare propria etichetă. Etichetele se așază automat, fără să se acopere între ele, peste fructe sau peste indicatori.
- **Vitaminele pe orbită:** vitaminele fiecărui fruct plutesc în jurul lui, ancorate de fruct.
- **Etichete interactive:** atingi eticheta AR și se deschide fișa completă a fructului.
- **AR pe tot ecranul:** camera și etichetele ocupă tot ecranul, cu buton de captură și de ieșire (Esc pe desktop).
- **Salvează captura:** descarcă imaginea cu toate încadrările și etichetele, la rezoluția sursei.
- **AR spațial (WebXR):** pe dispozitivele compatibile (ex. Chrome pe Android cu ARCore), plasezi pe o suprafață reală o etichetă 3D cu numele, vitaminele și mineralele fructului, cu vitaminele orbitând în jurul unui fruct 3D. Butonul apare doar dacă browserul suportă `immersive-ar`.

### Inteligență ambientală
Calculată din pixelii reali ai cadrului (redus la 160×120), de ~4 ori pe secundă:
- **Lumină:** luminozitatea medie. În lumină slabă primești un sfat, iar într-un cadru foarte luminos eticheta AR devine mai opacă.
- **Claritate:** varianța laplacianului (cât detaliu are imaginea).
- **Mișcare:** diferența dintre cadre consecutive. Când scena e nemișcată și există deja un rezultat, analiza AI e sărită până la 2,4 s, ca să economisească bateria.
- **Distanță:** cât din cadru ocupă fructul detectat.

Semnalele apar în HUD-ul scannerului, în secțiunea „Inteligență ambientală” și ca ghidaj contextual în partea de jos a camerei.

### Informații despre fructe
- La identificare: numele în română, numele în engleză, vitaminele și mineralele principale, o descriere și o curiozitate. Aplicația nu afișează calorii.
- Fișa completă mai conține proteinele, carbohidrații, grăsimile și fibrele la 100 g, după USDA FoodData Central (SR Legacy). Sunt valori orientative.

## Catalogul dinamic

Toate secțiunile (catalogul, fișele educative, panoul de rezultat, scannerul AI, eticheta AR, AR spațial, hero și contoarele) citesc din **aceeași sursă**: `data/fruits.json`. Niciun nume de fruct nu e scris în HTML, CSS sau JavaScript.

### O înregistrare

```json
{
  "id": "apple",
  "ro": "Măr",
  "en": "Apple",
  "category": "pome",
  "description": "Fruct crocant și suculent…",
  "fact": "Mărul face parte din familia trandafirului…",
  "vitamins": ["C"],
  "minerals": ["potasiu"],
  "nutrition": { "source": "Apples, raw, with skin", "per100g": { "kcal": 52, "protein": 0.26, "carbs": 13.81, "fat": 0.17, "fiber": 2.4 } },
  "visual": { "color": "#E2433B", "shape": "round" },
  "ai": { "labels": ["apple"] }
}
```

Câmpuri opționale: `image` (calea către o fotografie, ex. `img/fruits/apple.webp`; fără ea se desenează o ilustrație din `visual`) și `showcase` (fructul poate apărea ca exemplu în hero și în secțiunea AR). Toate câmpurile sunt descrise în `data/fruits.schema.json`.

### Cum adaugi un fruct

1. Adaugi **o singură înregistrare** în lista `fruits` din `data/fruits.json`.
2. Rulezi `node scripts/check-catalog.mjs` (opțional, dar recomandat).

Atât. Fructul apare automat în catalog, în filtre, în contoare, în fișe și în AR. Nu modifici nimic altceva.

### Fructe noi și modelul AI

Modelul de recunoaștere nu a fost reantrenat. CLIP primește o listă de etichete text, iar catalogul le asociază cu fructele:

- **Cu `ai.labels`:** eticheta (sau etichetele, în engleză) este adăugată la lista dată lui CLIP. Când modelul alege una dintre ele, aplicația o mapează la `id`-ul fructului. CLIP este un model „zero-shot”, deci poate încerca să recunoască și un fruct nou, dar **precizia pentru fructele adăugate ulterior nu a fost testată**. Verifică-le cu fotografii reale.
- **Fără `ai`:** fructul apare doar în catalog, cu eticheta „catalog”, și nu e trimis modelului. În acest caz apare automat și filtrul „Doar cele recunoscute de scanner”.

Maparea e unică: o etichetă AI poate aparține unui singur fruct, iar validarea refuză duplicatele.

### Verificare

`node scripts/check-catalog.mjs` (Node 18+, fără dependențe) verifică:
- că fiecare înregistrare e completă (id unic, categorie existentă, valori numerice, culoare, formă);
- că fiecare etichetă AI duce la exact un fruct;
- că niciun nume de fruct (român, englez sau etichetă AI) nu e scris direct în `index.html`, `css/` sau `js/`.

O înregistrare invalidă e ignorată în browser (cu un avertisment în consolă), fără să blocheze restul catalogului.

## Ce s-a schimbat față de versiunea 8

- Identitate vizuală nouă (temă întunecată, sticlă discretă, accente lime/mentă) și pagină de prezentare: hero cu scenă 3D în CSS, „Cum funcționează”, „Inteligență ambientală”, „Realitate augmentată”, „Beneficii” și „Ce face / ce nu face”.
- Eticheta AR atașată fructului înlocuiește caseta simplă.
- Au fost eliminate toate procentele de încredere (din panou, de pe imagine, din bara de stare și din istoric). Procentele din eticheta nutrițională sunt din doza zilnică de referință, nu niveluri de încredere.
- Fără ecran de încărcare la deschidere: pagina apare imediat, modelele AI pornesc singure în fundal, iar modulul WebXR se încarcă doar când e nevoie de el.
- Animațiile din hero se opresc când nu sunt vizibile și respectă setarea „reduce motion” a sistemului.

## Publicare online

Poți urca dosarul pe orice hosting static cu HTTPS: GitHub Pages, Netlify, Vercel sau Cloudflare Pages. Nu are nevoie de server propriu. WebXR și camera cer HTTPS.
