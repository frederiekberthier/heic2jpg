# heic2jpg
Convert HEIC to different formats

Zet HEIC/HEIF-foto's (iPhone) om naar **JPG**, **JPEG** of **PNG** – via een lokale webinterface of de commandline. Alles draait lokaal; foto's verlaten je pc niet.

## Installatie
Vereist Python 3.10+.

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
```

De HEIC-decoder zit in `pillow-heif`; de Windows HEIF/HEVC-extensies zijn niet nodig.

## Webapp
Dubbelklik `run_web.bat` (installeert bij de eerste keer automatisch) of:

```powershell
.venv\Scripts\python -m heic2jpg.web.app
```

De browser opent op http://127.0.0.1:5000.

1. Sleep HEIC-bestanden in het vak of klik **Kies bestanden**.
2. Kies het formaat, de kwaliteit, eventueel een max. afmeting en of EXIF behouden moet blijven.
3. Pas de bestandsnaam aan en klik **Converteren & opslaan…**. In Edge/Chrome kies je in het venster *Opslaan als* zelf de map en de naam.
   Met **Alles converteren naar map…** zet je alle bestanden in één keer om naar een map die je kiest.

In Firefox komen de bestanden in je Downloads-map terecht.

## Commandline
```powershell
# één bestand, met eigen pad en naam
.venv\Scripts\python -m heic2jpg.cli foto.heic -f jpg -q 85 -o C:\Foto's\vakantie.jpg

# een hele map naar PNG in een andere map
.venv\Scripts\python -m heic2jpg.cli C:\Import -f png -o C:\Export

# opties
#   -f/--format jpg|jpeg|png   -q/--quality 1-100   --max-size PX
#   --no-exif                  --overwrite
```

Bij PNG (verliesvrij) bepaalt de kwaliteit het compressieniveau: lager = kleiner bestand, maar trager.

## Browserversie voor gewone webhosting (`web-static/`)
Een versie zonder server: de HEIC-decoder ([libheif](https://github.com/strukturag/libheif) via [libheif-js](https://github.com/catdad-experiments/libheif-js) 1.23.5, WebAssembly) draait in de browser van de bezoeker. Foto's worden dus niet geüpload.

**Publiceren:** upload de *inhoud* van `web-static/` (inclusief `.htaccess`) naar je webhosting, bv. naar `public_html/heic2jpg/`. Meer is niet nodig: geen PHP, geen database.

- Gebruik **https**: het venster *Opslaan als* en *map kiezen* werken enkel via https (en enkel in Edge/Chrome). In Firefox en Safari gaan bestanden naar de Downloads-map.
- `.htaccess` zorgt dat Apache `.wasm` met het juiste type (`application/wasm`) en met caching serveert. Bij nginx: voeg `application/wasm wasm;` toe aan de MIME-types.
- Lokaal proberen: `cd web-static` en `python -m http.server 8000`, open http://localhost:8000. Openen via dubbelklik (`file://`) werkt niet, omdat browsers dan geen Web Worker/WebAssembly laden.

Hetzelfde als de Python-versie: JPG/JPEG/PNG, kwaliteit, max. afmeting, EXIF behouden, correcte oriëntatie en het ICC-kleurprofiel (belangrijk voor iPhone-foto's in Display P3).
Verschil: bij PNG is er geen compressie-instelling. De decoder (~1,5 MB) wordt bij het eerste bezoek gedownload en daarna uit de cache gehaald.

Licenties: libheif en libheif-js zijn LGPL-3.0 (zie `web-static/vendor/libheif/`). Ze worden ongewijzigd als losse bestanden meegeleverd, wat dit toelaat.

## Vormgeving
Kleuren en lettertypen volgen [graduaatiot.be/subnetting](https://graduaatiot.be/subnetting). De lettertypen Nunito en Open Sans (SIL Open Font License) staan lokaal in `heic2jpg/web/static/fonts` en `web-static/fonts`, dus de app heeft geen extern lettertype nodig. Licht/donker volgt de instelling van Windows.

## Tests
```powershell
.venv\Scripts\python -m pytest
```
