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

## Vormgeving
Kleuren en lettertypen volgen [graduaatiot.be/subnetting](https://graduaatiot.be/subnetting). De lettertypen Nunito en Open Sans (SIL Open Font License) staan lokaal in `heic2jpg/web/static/fonts`, dus de app heeft geen internet nodig. Licht/donker volgt de instelling van Windows.

## Tests
```powershell
.venv\Scripts\python -m pytest
```
