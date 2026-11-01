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
| `data/nutrients.json` | Macronutrienții din fișă și dozele zilnice de referință |
| `data/nutrient-info.json` | Explicațiile pentru copii: ce face fiecare vitamină, mineral și fibrele |
| `js/catalog.js` | Citește și validează datele; oferă căutare, filtre și maparea AI → fruct |
| `js/catalog-ui.js` | Generează catalogul și filtrele din date |
| `js/discovery.js` | Ecranul „Descoperă fructul”, cu personajul Vita, vitaminele interactive și beneficiile |
| `js/fruit3d.js` | Scena 3D a fructului (three.js): lumini, strălucire, gesturi, rotire, zoom, mutare |
| `js/fruit-models.js` | Modelele 3D ale fructelor, construite din câmpul `visual` din catalog (formă, textură, detalii, felie) |
| `js/reveal.js` | Camera AR: fructul 3D peste cameră, cu liniuțe spre nume și nutrienți, controale și fișa bilingvă |
| `js/game.js` | Steluțe, insigne, provocări, colecție și quiz-uri |
| `js/i18n.js` | Româna / engleza: traduce automat interfața |
| `data/i18n/en.json` | Traducerile în engleză (cheia = textul în română) |
| `js/sound.js` | Efecte sonore sintetizate (fără fișiere audio) |
| `js/fruit-art.js` | Imaginea fiecărui fruct (fotografie sau ilustrație generată) |
| `js/app.js` | Scannerul, AR în cameră, senzorii ambientali |
| `js/ai-worker.js` | Modelele AI (CLIP, OWL-ViT), rulate într-un Web Worker, ca pagina să rămână fluidă |
| `js/xr.js` | AR spațial (WebXR) cu fructul 3D pe masă, încărcat doar la cerere |
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
- **Fără model de text în browser:** vectorii de text ai lui CLIP (pentru toate etichetele și formulările din `data/clip-prompts.json`) sunt calculați o singură dată, în GitHub Actions (`scripts/build-embeddings.mjs`), și salvați în `data/clip-text.bin` (~750 KB). Browserul descarcă doar modelul de imagine (~89 MB pe telefon, o singură dată) și începe imediat să recunoască. Dacă se schimbă catalogul, GitHub Actions recalculează automat fișierul; până atunci, browserul îi calculează singur.
- **Învățat și din fotografii reale:** același script adună fotografii reale de pe Wikimedia Commons pentru fiecare fruct și calculează „aspectul mediu” al fiecăruia. Asemănarea cu el se adaugă la scorul din text. Rezultatul testului, pe fotografii nefolosite la învățare, e în `scripts/eval-report.txt`.
- **Fructe exotice:** `ai.prior` (în catalog) le scade puțin greutatea, ca să nu fie confundate cu fructele obișnuite care seamănă cu ele.
- **Totul rulează într-un Web Worker** (`js/ai-worker.js`): pagina, animațiile și camera rămân fluide cât timp lucrează AI-ul, inclusiv pe telefon.
- **Clasificare:** CLIP (`Xenova/clip-vit-base-patch32`) alege dintre etichetele din catalog: 61 de fructe și 56 de obiecte care nu sunt fructe. CLIP e împărțit în modelul de text și cel de imagine: descrierile („a photo of a banana”, „a drawing of a banana”…) se calculează **o singură dată** și se păstrează în browser. La fiecare cadru rulează doar modelul de imagine, de aproximativ 15–20 de ori mai puțin calcul decât înainte, când toate descrierile erau recalculate la fiecare analiză.
- **Găsirea imediată pe ecran:** de 5 ori pe secundă, fără AI (~1 ms), aplicația compară pixelii cu culoarea fundalului și încadrează cea mai mare zonă diferită (un fruct, o poză, o pagină de carte), cu rama „Caut fructul…”. Exact acea zonă e trimisă apoi lui CLIP.
- **Live:** obiectul găsit, centrul cadrului și cadrul întreg (pe telefoanele fără WebGPU, doar obiectul găsit). O analiză la 0,3–0,45 s. **Fotografii:** obiectul găsit, imaginea întreagă, centrul și colțurile.
- **Fundalul nu mai „acoperă” fructul:** mâinile, oamenii, masa, peretele, cartea sau ecranul (marcate `"background": true` în `data/non-fruits.json`) nu concurează cu fructul; scorul fructului e calculat față de celelalte obiecte.
- **Mai multe descrieri pentru fiecare fruct:** mai multe etichete în catalog (ex. „kiwi fruit”, „bunch of bananas”, „red apple”) și mai multe formulări („a photo / close-up photo / drawing / illustration of a …”), cu media lor.
- **Rapid:** un rezultat sigur (peste 60%) e acceptat din prima; altfel, când același fruct apare în 2 din ultimele 3 analize.
- **Detecție:** OWL-ViT (`Xenova/owlvit-base-patch32`, foarte greu) se încarcă doar pe calculatoare cu WebGPU și e folosit doar la fotografii, pentru mai multe fructe în aceeași poză. Pe telefon nu se descarcă deloc.
- Modelele rulează **în browser** prin transformers.js. Imaginile nu sunt trimise nicăieri.
- **Pornire automată:** modelele încep să se încarce imediat ce deschizi pagina, în fundal. Dacă pui o imagine înainte să fie gata, ea așteaptă și e analizată automat.
- **Descărcare o singură dată:** prima vizită descarcă ~154 MB (q8, WASM) sau ~303 MB (fp16, WebGPU). După aceea pornesc din memoria browserului (Cache Storage). Aplicația cere stocare persistentă, ca browserul să nu le șteargă. (Cine a folosit versiunea anterioară descarcă o singură dată fișierele noi, separate, ale lui CLIP.)
- Modelele trebuie descărcate din nou doar dacă ștergi datele site-ului, folosești o fereastră privată sau alt browser.
- **Pe telefon:** 3D la rezoluție redusă (1,5×), fructul decorativ din prima pagină la 30 de cadre/s, estompări mai mici în spatele panourilor.
- **Fructe reale, poze, cărți și desene:** detectorul caută și „a drawing of a fruit” și „a picture of a fruit in a book”. Când CLIP nu e sigur pe o imagine, mai întreabă o dată ca pentru un desen și păstrează răspunsul mai sigur. Dacă niciun răspuns nu trece pragurile, aplicația spune că nu e sigură, nu inventează un fruct.
- **Viteză:** toate casetele găsite și cadrul întreg sunt clasificate de CLIP într-un singur apel (transformers.js recodifică toate etichetele text la fiecare apel). Scorurile etichetelor care țin de același fruct se adună.
- **Diagnostic:** deschide site-ul cu `?debug` la final (ex. `.../FRUITAI/?debug`) și în consola browserului (F12) apar primele răspunsuri ale modelului pentru fiecare imagine.
- **Cât de sigur e:** după identificare apare un indicator cu trei trepte (Sigur / Destul de sigur / Nu foarte sigur), fără procente.
- Praguri: casetă de detector 0,30, decupaj 0,40, cadru întreg 0,50 (scoruri adunate pe fiecare fruct). O analiză la 0,8 s, iar un rezultat rămâne afișat 4 s.
- Când pagina rulează ca artifact Claude, recunoașterea se face cu Claude (fotografii), ca înainte.

### Fluxul automat (camera)
Totul se întâmplă singur, fără butoane:
1. **Arăți un fruct** camerei: un fruct adevărat sau poza unui fruct (pe telefon, tabletă sau hârtie). Camera trece automat pe tot ecranul.
2. Când același fruct e recunoscut de 2 ori la rând, apare mesajul **„Am găsit fructul! Acum scoate fructul sau poza din fața camerei”**. Numele nu se dezvăluie încă.
3. Când fructul nu mai e văzut de 2 ori la rând (și după cel puțin 1,4 s), în locul lui apare **fructul 3D**, peste imaginea camerei, cu strălucire și particule.
4. Apoi, pe rând, se desenează **liniuțe luminoase** către: **numele în română** (cu emoji), **numele în engleză** și fiecare **vitamină** a fructului, fiecare cu un mic sunet.
5. Fructul 3D rămâne pe ecran, independent de obiectul scanat. Îl rotești cu un deget, îl mărești cu două degete (sau rotița), îl muți cu modul „Mută” și ai butoane pentru rotire automată, mărire, micșorare și resetare.
6. Atingi un nutrient și se deschide fișa lui în română și engleză. Butoane: „Află mai multe” (ecranul „Descoperă”), „Pune-l în spațiu” (doar pe dispozitive cu WebXR) și „Alt fruct”. Dacă arăți camerei un alt fruct (după cel puțin 7 s), fluxul pornește din nou automat.

Dacă fructul nu e scos din cadru în 6 secunde, apare și butonul „Arată-mi-l acum”. La o **poză încărcată**: „Am găsit fructul!”, poza dispare, apoi apare fructul 3D cu aceleași etichete.

### Realitate augmentată
- **AR în cameră** (orice browser modern cu cameră): fiecare fruct detectat e încadrat, iar eticheta lui arată, în ordine, **numele în română, numele în engleză și vitaminele**. Eticheta urmărește lin fructul când miști camera.
- **Mai multe fructe deodată:** până la 3 fructe din același cadru primesc fiecare propria etichetă. Etichetele se așază automat, fără să se acopere între ele, peste fructe sau peste indicatori.
- **Vitaminele pe orbită:** vitaminele fiecărui fruct plutesc în jurul lui, ancorate de fruct.
- **Etichete interactive:** atingi eticheta AR și se deschide fișa completă a fructului.
- **AR pe tot ecranul:** camera și etichetele ocupă tot ecranul, cu buton de captură și de ieșire (Esc pe desktop).
- **Salvează captura:** descarcă imaginea cu toate încadrările și etichetele, la rezoluția sursei.
- **AR spațial (WebXR):** pe dispozitivele compatibile (ex. Chrome pe Android cu ARCore), telefonul găsește masa sau podeaua și pui acolo **modelul 3D al fructului**, cu numele în română și engleză deasupra și nutrienții pe orbită. Îl rotești cu un deget, îl scalezi cu două, îl muți atingând altă suprafață; atingi un nutrient și apare fișa bilingvă. Butoanele AR spațial apar doar dacă browserul suportă `immersive-ar`; altfel secțiunea AR recomandă Camera AR.

### Inteligență ambientală
Calculată din pixelii reali ai cadrului (redus la 160×120), de ~4 ori pe secundă:
- **Lumină:** luminozitatea medie. În lumină slabă primești un sfat, iar într-un cadru foarte luminos eticheta AR devine mai opacă.
- **Claritate:** varianța laplacianului (cât detaliu are imaginea).
- **Mișcare:** diferența dintre cadre consecutive. Când scena e nemișcată și există deja un rezultat, analiza AI e sărită până la 2,4 s, ca să economisească bateria.
- **Distanță:** cât din cadru ocupă fructul detectat.

Semnalele apar în HUD-ul scannerului, în secțiunea „Inteligență ambientală” și ca ghidaj contextual în partea de jos a camerei.

### „Descoperă fructul”: experiența pentru copii
Se deschide automat după ce o fotografie e recunoscută. Se mai deschide la atingerea unei etichete AR, din catalog, din istoric sau cu butonul „Descoperă fructul”.
- **Sus:** numele mare în română (cu emoji, unde există) și numele în engleză, cu litere care apar animat.
- **În centru:** fructul 3D, generat din forma și culoarea din catalog. Se rotește cu degetul sau cu mouse-ul. Are strălucire, particule, inel luminos și o animație elastică la apariție. Dacă three.js nu se poate încărca, se afișează ilustrația 2D.
- **În jur:** carduri de sticlă pentru vitamine (sfere), minerale (cristale) și fibre (frunză), legate de fruct prin săgeți luminoase animate. Atingerea unui card deschide un panou cu o explicație scurtă pentru copii, beneficiile și numărul de fructe din catalog care conțin nutrientul. Fructul „sare”, apar particule în culoarea nutrientului și se aude un sunet.
- **În lateral:** butoane mari pentru rotire automată, mărire, micșorare și resetare. Merge și zoom-ul cu degetele sau cu rotița.
- **Jos:** personajul Vita (desen original) prezintă fructul și comentează fiecare vitamină. Urmează beneficiile pentru corp (atingerea unuia evidențiază nutrienții care îl aduc), curiozitatea și descrierea.
- **Sunet:** arpegiu la descoperire și „pop” la atingere, sintetizate în browser. Se pot opri din butonul de sus.
- **Colecție:** fructele găsite cu camera sunt marcate „descoperit” în catalog și numărate („3 din 61”). Prima descoperire primește insigna „Fruct nou descoperit!”. Colecția e păstrată doar în browserul respectiv.

**Corectitudinea informațiilor:** un fruct afișează doar vitaminele și mineralele din propria înregistrare din `data/fruits.json`. Nimic nu e atribuit automat. Fibrele apar doar la fructele cu cel puțin 3 g la 100 g (pragul UE pentru „sursă de fibre”). Explicațiile din `data/nutrient-info.json` descriu rolurile recunoscute ale fiecărui nutrient, pe înțelesul copiilor. Validarea verifică că fiecare vitamină și mineral din catalog are o explicație.

### Modele 3D
Fiecare fruct are modelul lui, construit din câmpul `visual` din `data/fruits.json`: formă (rotund, oval, picătură, alungit, ciorchine, drupeole, țepi, stea), textură generată (pete, puf, plasă, solzi, pori de citrice, dungi, brumă), detalii (codiță, frunză, coroană, caliciu, semințe la suprafață, perechi de cireșe, mănunchi de banane) și o felie cu interiorul specific (citrice, kiwi, pepene, sâmburi, arile).

### Joacă
- **Steluțe:** +3 pentru un fruct nou, +1 pentru unul regăsit, +1 la primul contact cu fiecare nutrient, +2 pentru o provocare reușită.
- **Provocări:** ex. „Găsește un fruct bogat în vitamina C!”. Se verifică doar cu datele din catalog.
- **Insigne și colecție:** butonul cu steluța din meniu.
- **Quiz:** 5 întrebări generate din catalog (vitamine, nume în engleză, beneficii).
- Totul se păstrează doar în browserul respectiv.

### Română și engleză
Selectorul RO / EN din meniu traduce meniurile, instrucțiunile, mesajele, numele fructelor, vitaminele, explicațiile nutrienților și quiz-urile. Alegerea e ținută minte. În modul AR apar mereu ambele nume, pentru învățare. Traducerile sunt în `data/i18n/en.json`, iar descrierile fructelor în câmpurile `descriptionEn` / `factEn` din catalog.

### Limitări cunoscute
- AR spațial a fost testat doar simulat (fără un telefon ARCore real); pe dispozitiv real comportamentul poate diferi.
- Recunoașterea desenelor și a imaginilor din cărți e mai puțin sigură decât a fructelor reale; desenele foarte stilizate pot fi respinse.
- Modelele 3D sunt procedurale (generate din cod), nu scanări fotorealiste.

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
