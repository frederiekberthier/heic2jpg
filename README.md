# heic2jpg
Convert HEIC to different formats

**Online: [graduaatiot.be/heic](https://graduaatiot.be/heic)**

Een website die HEIC/HEIF-foto's (iPhone) omzet naar **JPG**, **JPEG** of **PNG**, volledig in de browser. Foto's worden niet geüpload: de HEIC-decoder ([libheif](https://github.com/strukturag/libheif) via [libheif-js](https://github.com/catdad-experiments/libheif-js) 1.23.5, WebAssembly) draait op de computer van de bezoeker. Daardoor werkt de site op gewone webhosting, zonder PHP, database of Python.

## Mogelijkheden
- Invoer: `.heic` en `.heif`, ook meerdere bestanden tegelijk (slepen of kiezen), met miniatuur
- Uitvoer: JPG, JPEG of PNG
- Kwaliteit 1–100 voor JPG/JPEG
- Optioneel verkleinen tot een maximale afmeting (langste zijde in pixels)
- EXIF-metadata (camera, datum, ...) behouden of weglaten
- Correcte oriëntatie: gedraaide foto's worden rechtgezet
- Het ICC-kleurprofiel blijft behouden, dus iPhone-foto's (Display P3) behouden hun kleuren
- Map en bestandsnaam zelf kiezen via het venster *Opslaan als* (Edge/Chrome), of alles in één keer naar een gekozen map

## Publiceren
De site staat online op **https://graduaatiot.be/heic**.

Een nieuwe versie publiceer je door de **inhoud** van `web-static/` (ook het verborgen bestand `.htaccess`) naar de map `heic/` op de webhosting te uploaden. Meer is niet nodig.

- Gebruik **https**. Het venster *Opslaan als* en *map kiezen* werken alleen via https (of `localhost`) en alleen in Edge en Chrome. In Firefox en Safari gaan de bestanden naar de Downloads-map, met de naam die je opgaf.
- `.htaccess` zorgt dat Apache het `.wasm`-bestand met het juiste type (`application/wasm`) en met caching aanbiedt. Gebruik je nginx, voeg dan `application/wasm wasm;` toe aan de MIME-types.
- Upload alleen `web-static/`. De rest van de repo (`tests/`, `requirements.txt`) is alleen voor ontwikkeling.

## Lokaal proberen
Je hebt een eenvoudige webserver nodig, bv. die van Python:

```powershell
cd web-static
python -m http.server 8000
```

Open daarna http://localhost:8000. Het `index.html`-bestand openen met een dubbelklik (`file://`) werkt niet, omdat browsers dan geen Web Worker of WebAssembly laden.

## Browserondersteuning
Recente versies van Edge, Chrome, Firefox en Safari (16.4+). Oudere browsers krijgen een melding.
De decoder (~1,5 MB) wordt bij het eerste bezoek gedownload en daarna uit de cache gehaald.
Bij PNG is er geen compressie-instelling, omdat de browser die niet aanbiedt.

## Bestanden
| Bestand | Rol |
|---|---|
| `web-static/index.html`, `style.css`, `fonts/` | pagina en vormgeving |
| `web-static/app.js` | interface: bestanden toevoegen, instellingen, opslaan |
| `web-static/converter-client.js` | stuurt het werk naar de worker (`HeicConverter.convert()` / `.preview()`) |
| `web-static/convert-worker.js` | decodeert HEIC met libheif en zet om met `OffscreenCanvas` |
| `web-static/heif-meta.js` | haalt EXIF en het ICC-profiel uit de HEIC en zet ze in de JPEG/PNG |
| `web-static/vendor/libheif/` | libheif-js (WebAssembly) + licenties |
| `web-static/.htaccess` | MIME-types en caching voor Apache |
| `tests/` | automatische tests (niet publiceren) |

## Tests
De tests draaien de echte website in een onzichtbaar Edge- of Chrome-venster en controleren de resultaten met Python (Pillow).

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m pytest
```

`tests/test_webstatic.py` maakt een HEIC-testbestand aan en start een kleine testserver. Daarna opent een onzichtbaar browservenster `tests/webstatic/selftest.html`. Gecontroleerd worden:
- de formaten en de oriëntatie;
- dat een lagere kwaliteit een kleiner bestand geeft;
- de maximale afmeting en de miniatuur;
- dat EXIF en het ICC-profiel correct (en maar één keer) in de uitvoer staan;
- de foutmelding bij een ongeldig bestand.

Zonder Edge of Chrome wordt de test overgeslagen. Met de omgevingsvariabele `BROWSER_BIN` kies je zelf een browser.

## Vormgeving
De kleuren en lettertypen volgen [graduaatiot.be/subnetting](https://graduaatiot.be/subnetting). De lettertypen Nunito en Open Sans staan in de site zelf (`web-static/fonts`), dus er wordt geen extern lettertype geladen. Licht of donker volgt de instelling van het systeem van de bezoeker.

## Licenties
- libheif en libheif-js: LGPL-3.0 (zie `web-static/vendor/libheif/`). Ze worden ongewijzigd als losse bestanden meegeleverd, wat deze licentie toelaat.
- Nunito en Open Sans: SIL Open Font License 1.1.
- Dit project: GPL-3.0 (zie `LICENSE`).
