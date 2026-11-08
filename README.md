# heic2jpg
Convert HEIC to different formats

Zet HEIC/HEIF-foto's (iPhone) om naar **JPG**, **JPEG** of **PNG**. Je kiest het formaat, de kwaliteit, een maximale afmeting, of de EXIF-metadata behouden blijft, en waar en onder welke naam het resultaat wordt opgeslagen.

Het project bestaat uit drie onderdelen:

| Onderdeel | Map | Waar draait het? | Geschikt voor |
|---|---|---|---|
| **Browserversie** | `web-static/` | volledig in de browser (WebAssembly) | publiceren op gewone webhosting |
| **Lokale webapp** | `heic2jpg/web/` | Python/Flask op je eigen pc | eigen gebruik, zonder internet |
| **Commandline** | `heic2jpg/cli.py` | Python | scripts en grote mappen in één keer |

In alle drie de versies blijven je foto's bij jou: er wordt niets naar een externe server gestuurd.

## Branches
- `main`: beginpunt van de repo
- `dev`: Python-versie (conversiekern, commandline en lokale webapp)
- `webstatic`: `dev` + de browserversie voor webhosting

## Mogelijkheden
- Invoer: `.heic` en `.heif`, ook meerdere bestanden tegelijk (slepen of kiezen)
- Uitvoer: JPG, JPEG of PNG
- Kwaliteit 1–100 voor JPG/JPEG
- Optioneel verkleinen tot een maximale afmeting (langste zijde in pixels)
- EXIF-metadata (camera, datum, ...) behouden of weglaten
- Correcte oriëntatie: gedraaide foto's worden rechtgezet
- Het ICC-kleurprofiel blijft behouden, dus iPhone-foto's (Display P3) behouden hun kleuren
- Map en bestandsnaam zelf kiezen via het venster *Opslaan als* (Edge/Chrome), of alles in één keer naar een gekozen map

---

## 1. Browserversie voor gewone webhosting (`web-static/`)
Een versie zonder server. De HEIC-decoder ([libheif](https://github.com/strukturag/libheif) via [libheif-js](https://github.com/catdad-experiments/libheif-js) 1.23.5, WebAssembly) draait in een Web Worker in de browser van de bezoeker. Foto's worden dus niet geüpload.

### Publiceren
Upload de **inhoud** van `web-static/` (ook het verborgen bestand `.htaccess`) naar je webhosting, bv. naar `public_html/heic2jpg/`. Meer is niet nodig: geen PHP, geen database, geen Python.

- Gebruik **https**. Het venster *Opslaan als* en *map kiezen* werken alleen via https (of `localhost`) en alleen in Edge en Chrome. In Firefox en Safari gaan de bestanden naar de Downloads-map, met de naam die je opgaf.
- `.htaccess` zorgt dat Apache het `.wasm`-bestand met het juiste type (`application/wasm`) en met caching aanbiedt. Gebruik je nginx, voeg dan `application/wasm wasm;` toe aan de MIME-types.
- Upload de map `tests/` niet; die is alleen voor ontwikkeling.

### Lokaal proberen
```powershell
cd web-static
python -m http.server 8000
```
Open daarna http://localhost:8000. Het `index.html`-bestand openen met een dubbelklik (`file://`) werkt niet, omdat browsers dan geen Web Worker of WebAssembly laden.

### Bestanden
| Bestand | Rol |
|---|---|
| `index.html`, `style.css`, `fonts/` | pagina en vormgeving |
| `app.js` | interface: bestanden toevoegen, instellingen, opslaan |
| `converter-client.js` | stuurt het werk naar de worker (`HeicConverter.convert()` / `.preview()`) |
| `convert-worker.js` | decodeert HEIC met libheif en zet om met `OffscreenCanvas` |
| `heif-meta.js` | haalt EXIF en het ICC-profiel uit de HEIC en zet ze in de JPEG/PNG |
| `vendor/libheif/` | libheif-js (WebAssembly) + licenties |
| `.htaccess` | MIME-types en caching voor Apache |

### Verschillen met de Python-versie
- Bij PNG is er geen compressie-instelling (de browser biedt die niet aan).
- De decoder (~1,5 MB) wordt bij het eerste bezoek gedownload en daarna uit de cache gehaald.
- Werkt in recente versies van Edge, Chrome, Firefox en Safari (16.4+). Oudere browsers krijgen een melding.

---

## 2. Python-versie (lokale webapp + commandline)

### Installatie
Vereist Python 3.10+.

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
```

De HEIC-decoder zit in `pillow-heif`; de HEIF/HEVC-extensies van Windows zijn niet nodig.

### Lokale webapp
Dubbelklik `run_web.bat` (installeert bij de eerste keer automatisch) of:

```powershell
.venv\Scripts\python -m heic2jpg.web.app
```

De browser opent op http://127.0.0.1:5000. De server is alleen bereikbaar vanaf je eigen pc.

1. Sleep HEIC-bestanden in het vak of klik **Kies bestanden**.
2. Kies het formaat, de kwaliteit, eventueel een maximale afmeting, en of EXIF behouden moet blijven.
3. Pas de bestandsnaam aan en klik **Converteren & opslaan…**. In Edge/Chrome kies je in het venster *Opslaan als* zelf de map en de naam.
   Met **Alles converteren naar map…** zet je alle bestanden in één keer om naar een map die je kiest.

In Firefox komen de bestanden in je Downloads-map terecht.

### Commandline
```powershell
# één bestand, met eigen pad en naam
.venv\Scripts\python -m heic2jpg.cli foto.heic -f jpg -q 85 -o C:\Foto's\vakantie.jpg

# een hele map naar PNG in een andere map
.venv\Scripts\python -m heic2jpg.cli C:\Import -f png -o C:\Export

# wildcard, verkleinen tot max. 2000 px, zonder metadata
.venv\Scripts\python -m heic2jpg.cli "C:\Import\IMG_*.heic" -o C:\Export --max-size 2000 --no-exif
```

| Optie | Betekenis |
|---|---|
| `-f`, `--format` | `jpg` (standaard), `jpeg` of `png` |
| `-q`, `--quality` | 1–100, standaard 90 |
| `-o`, `--output` | doelbestand (bij één invoer) of doelmap |
| `--max-size PX` | langste zijde verkleinen tot PX pixels |
| `--no-exif` | EXIF-metadata niet overnemen |
| `--overwrite` | bestaande bestanden overschrijven |

Bij PNG (verliesvrij) bepaalt de kwaliteit het compressieniveau: lager geeft een kleiner bestand, maar het duurt langer.

### Projectstructuur
```
heic2jpg/
├─ converter.py          # conversiekern (Pillow + pillow-heif)
├─ cli.py                # commandline
└─ web/
   ├─ app.py             # Flask-server (/api/preview, /api/convert)
   ├─ templates/index.html
   └─ static/            # app.js, style.css, fonts/
```

---

## Tests
```powershell
.venv\Scripts\python -m pytest
```

- `tests/test_converter.py`: conversiekern, commandline en Flask-webapp
- `tests/test_webstatic.py`: de browserversie. Die test start een kleine testserver en een onzichtbaar Edge- of Chrome-venster, dat `tests/webstatic/selftest.html` uitvoert. Daarna controleert Pillow de resultaten. Zonder Edge of Chrome wordt deze test overgeslagen (kies een browser met de omgevingsvariabele `BROWSER_BIN`).

Het HEIC-testbestand wordt bij elke test opnieuw aangemaakt; er staan geen foto's in de repo.

## Vormgeving
De kleuren en lettertypen volgen [graduaatiot.be/subnetting](https://graduaatiot.be/subnetting). De lettertypen Nunito en Open Sans staan in de app zelf (`heic2jpg/web/static/fonts` en `web-static/fonts`), dus er wordt geen extern lettertype geladen. Licht of donker volgt de instelling van je systeem.

## Licenties
- libheif en libheif-js: LGPL-3.0 (zie `web-static/vendor/libheif/`). Ze worden ongewijzigd als losse bestanden meegeleverd, wat deze licentie toelaat.
- Nunito en Open Sans: SIL Open Font License 1.1.
- Python-pakketten (via pip geïnstalleerd, niet meegeleverd): Pillow (MIT-CMU), pillow-heif (BSD-3-Clause; de ingebouwde codecs hebben hun eigen licenties), Flask (BSD-3-Clause).
- Dit project: GPL-3.0 (zie `LICENSE`).
