@echo off
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  echo Virtuele omgeving aanmaken...
  python -m venv .venv || goto :err
  .venv\Scripts\python -m pip install -r requirements.txt || goto :err
)
echo HEIC Converter draait op http://127.0.0.1:5000  (Ctrl+C om te stoppen)
.venv\Scripts\python -m heic2jpg.web.app
goto :eof
:err
echo Er ging iets mis bij de installatie.
pause
