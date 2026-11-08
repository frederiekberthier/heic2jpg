"""Test de browserversie (web-static/) in een headless Edge/Chrome.

Een kleine HTTP-server serveert de repo + een gegenereerd HEIC-bestand; de selftest-pagina
draait de echte worker/libheif en POST de resultaten terug.
"""

import io
import json
import os
import shutil
import subprocess
import tempfile
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest
from PIL import Image, ImageCms
from pillow_heif import register_heif_opener

register_heif_opener()
ROOT = Path(__file__).resolve().parent.parent


def find_browser():
    candidates = [
        os.environ.get("BROWSER_BIN"),
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        shutil.which("chromium"), shutil.which("google-chrome"), shutil.which("msedge"),
    ]
    return next((c for c in candidates if c and Path(c).exists()), None)


def make_sample() -> bytes:
    img = Image.new("RGB", (400, 200))
    px = img.load()
    for x in range(400):
        for y in range(200):
            px[x, y] = (x % 256, (y * 3) % 256, (x * y) % 256)
    exif = Image.Exif()
    exif[0x0112] = 6
    exif[0x010F] = "TestCam"
    icc = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    buf = io.BytesIO()
    img.save(buf, "HEIF", quality=95, exif=exif.tobytes(), icc_profile=icc)
    return buf.getvalue()


@pytest.fixture(scope="module")
def results():
    browser = find_browser()
    if not browser:
        pytest.skip("Geen Edge/Chrome gevonden")

    sample = make_sample()
    # Verwachte afmetingen volgens Python (pillow-heif) als referentie.
    ref = Image.open(io.BytesIO(sample))
    from PIL import ImageOps
    expected = ImageOps.exif_transpose(ref).size

    got = {}
    done = threading.Event()

    class Handler(SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def do_GET(self):
            if self.path == "/sample.heic":
                self.send_response(200)
                self.send_header("Content-Type", "image/heic")
                self.send_header("Content-Length", str(len(sample)))
                self.end_headers()
                self.wfile.write(sample)
            else:
                super().do_GET()

        def do_POST(self):
            body = self.rfile.read(int(self.headers["Content-Length"]))
            got.update(json.loads(body))
            self.send_response(204)
            self.end_headers()
            done.set()

    Handler.extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".wasm": "application/wasm",
                              ".js": "text/javascript"}
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}/tests/webstatic/selftest.html"

    profile = tempfile.mkdtemp(prefix="heic-selftest-")
    proc = subprocess.Popen([browser, "--headless=new", "--disable-gpu", "--no-first-run",
                             f"--user-data-dir={profile}", url],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        finished = done.wait(90)
    finally:
        proc.kill()
        proc.wait()
        server.shutdown()
        shutil.rmtree(profile, ignore_errors=True)
    assert finished, "Selftest in de browser gaf geen resultaat binnen 90 s"
    assert "fatal" not in got, got.get("fatal")
    got["_expected"] = expected
    got["_icc"] = ref.info["icc_profile"]
    return got


def test_formats(results):
    assert results["jpg"]["type"] == "image/jpeg"
    assert results["jpeg"]["type"] == "image/jpeg"
    assert results["png"]["type"] == "image/png"


def test_orientation(results):
    w, h = results["_expected"]
    for k in ("jpg", "png"):
        assert (results[k]["width"], results[k]["height"]) == (w, h)


def test_quality_changes_size(results):
    assert results["jpg_q20"]["size"] < results["jpg_q95"]["size"]


def test_metadata(results):
    for k in ("jpg", "png"):
        assert results[k]["exif"] and results[k]["make"], k
        assert results[k]["icc"], k
    assert not results["noexif"]["make"]


def test_max_size_and_preview(results):
    assert max(results["max100"]["width"], results["max100"]["height"]) == 100
    assert max(results["preview"]["width"], results["preview"]["height"]) == 320
    assert results["preview"]["type"] == "image/jpeg"


@pytest.mark.parametrize("key", ["jpg", "png"])
def test_output_readable_with_correct_metadata(results, key):
    """Pillow moet de uitvoer kunnen lezen, met exact één (ons) ICC-profiel en EXIF-oriëntatie 1."""
    import base64
    data = base64.b64decode(results[key]["b64"])
    img = Image.open(io.BytesIO(data))
    img.load()
    assert img.info.get("icc_profile") == results["_icc"]
    exif = img.getexif()
    assert exif.get(0x010F) == "TestCam"
    assert exif.get(0x0112, 1) == 1
    if key == "jpg":
        assert data.count(b"ICC_PROFILE\0") == 1
        assert data.count(b"Exif\0\0") == 1


def test_invalid(results):
    assert "geen geldig HEIC" in results["invalid"]
