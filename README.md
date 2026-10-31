# FruitAI 9 pentru web

Scanner nutrițional cu realitate augmentată, care rulează direct în browser. Îndrepți camera spre un fruct, iar FruitAI îl recunoaște și îi ancorează alături, în imagine, eticheta nutrițională (USDA) calculată pentru porția aleasă.

## Ce conține

| Fișier | Rol |
|---|---|
| `index.html` | Site-ul complet: pagina de prezentare, scannerul AR, stilurile și codul principal |
| `js/xr.js` | Modul AR spațial (WebXR). Se încarcă doar când apeși „Plasează în spațiu” |
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
- **Clasificare:** CLIP (`Xenova/clip-vit-base-patch32`) alege dintre 61 de fructe și 58 de etichete care nu sunt fructe.
- Modelele rulează **în browser** prin transformers.js (WebGPU dacă există, altfel WASM). Prima dată se descarcă aproximativ 240 MB, după care rămân în cache. Imaginile nu sunt trimise nicăieri.
- Pragurile sunt cele din `main.py`: detector 0,10, fruct 0,30, cadru întreg 0,60, o analiză la 0,8 s, iar un rezultat rămâne afișat 4 s.
- Când pagina rulează ca artifact Claude, recunoașterea se face cu Claude (fotografii), ca înainte.

### Realitate augmentată
- **AR în cameră** (orice browser modern cu cameră): fructul detectat e încadrat, iar eticheta cu calorii și macronutrienți e prinsă de el printr-o linie de ancorare. Eticheta se mută lin după fruct și își alege singură partea liberă a cadrului.
- **Salvează captura:** descarcă imaginea (cameră sau fotografie) cu încadrarea și eticheta AR, la rezoluția sursei.
- **AR spațial (WebXR):** pe dispozitivele compatibile (de ex. Chrome pe Android cu ARCore), aplicația detectează suprafețele reale și îți permite să plasezi o etichetă 3D a fructului identificat. Butonul apare doar dacă browserul raportează suport pentru `immersive-ar`. three.js se încarcă de pe CDN doar în acel moment.

### Inteligență ambientală
Calculată din pixelii reali ai cadrului (redus la 160×120), de ~4 ori pe secundă:
- **Lumină:** luminozitatea medie. În lumină slabă primești un sfat, iar într-un cadru foarte luminos eticheta AR devine mai opacă.
- **Claritate:** varianța laplacianului (cât detaliu are imaginea).
- **Mișcare:** diferența dintre cadre consecutive. Când scena e nemișcată și există deja un rezultat, analiza AI e sărită până la 2,4 s, ca să economisească bateria.
- **Distanță:** cât din cadru ocupă fructul detectat.

Semnalele apar în HUD-ul scannerului, în secțiunea „Inteligență ambientală” și ca ghidaj contextual în partea de jos a camerei.

### Nutriție
- Valorile USDA FoodData Central (SR Legacy) sunt incluse în cod, deci nu e nevoie de cheie API. Sunt orientative. Pentru moșmon nu există date USDA.
- Glisorul de porție (25–500 g) recalculează eticheta, inclusiv pe cea din AR.
- Observațiile („bogat în fibre”, „densitate energetică scăzută” etc.) sunt derivate direct din valorile USDA.

## Ce s-a schimbat față de versiunea 8

- Identitate vizuală nouă (temă întunecată, sticlă discretă, accente lime/mentă) și pagină de prezentare: hero cu scenă 3D în CSS, „Cum funcționează”, „Inteligență ambientală”, „Realitate augmentată”, „Beneficii” și „Ce face / ce nu face”.
- Eticheta AR atașată fructului înlocuiește caseta simplă.
- Au fost eliminate toate procentele de încredere (din panou, de pe imagine, din bara de stare și din istoric). Procentele din eticheta nutrițională sunt din doza zilnică de referință, nu niveluri de încredere.
- Fără ecran de încărcare la deschidere: pagina apare imediat, iar modelele AI (~240 MB) și modulul WebXR se încarcă doar când e nevoie de ele.
- Animațiile din hero se opresc când nu sunt vizibile și respectă setarea „reduce motion” a sistemului.

## Publicare online

Poți urca dosarul pe orice hosting static cu HTTPS: GitHub Pages, Netlify, Vercel sau Cloudflare Pages. Nu are nevoie de server propriu. WebXR și camera cer HTTPS.
