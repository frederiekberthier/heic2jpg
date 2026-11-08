import io

import pytest
from PIL import Image

from heic2jpg.cli import main as cli_main
from heic2jpg.converter import ConversionError, Options, convert_file, convert_to_bytes
from heic2jpg.web.app import app


@pytest.fixture(scope="session")
def heic_path(tmp_path_factory):
    """Maak een HEIC-testbeeld met verloop (zodat kwaliteit invloed heeft) en EXIF-oriëntatie 6."""
    img = Image.new("RGB", (400, 200))
    px = img.load()
    for x in range(400):
        for y in range(200):
            px[x, y] = (x % 256, (y * 3) % 256, (x * y) % 256)
    exif = Image.Exif()
    exif[0x0112] = 6  # 90° roteren
    exif[0x010F] = "TestCam"
    path = tmp_path_factory.mktemp("fx") / "sample.heic"
    img.save(path, "HEIF", quality=95, exif=exif.tobytes())
    return path


@pytest.mark.parametrize("fmt,pil", [("jpg", "JPEG"), ("jpeg", "JPEG"), ("png", "PNG")])
def test_formats(heic_path, fmt, pil):
    out = Image.open(io.BytesIO(convert_to_bytes(heic_path, Options(fmt=fmt))))
    assert out.format == pil


def test_quality_changes_size(heic_path):
    low = convert_to_bytes(heic_path, Options(fmt="jpg", quality=20))
    high = convert_to_bytes(heic_path, Options(fmt="jpg", quality=95))
    assert len(low) < len(high)


def test_orientation_and_exif(heic_path):
    out = Image.open(io.BytesIO(convert_to_bytes(heic_path, Options(fmt="jpg"))))
    assert out.size == (200, 400)  # rotatie toegepast
    exif = out.getexif()
    assert exif.get(0x010F) == "TestCam"
    assert exif.get(0x0112, 1) == 1


def test_no_exif(heic_path):
    out = Image.open(io.BytesIO(convert_to_bytes(heic_path, Options(fmt="jpg", keep_exif=False))))
    assert 0x010F not in out.getexif()


def test_max_size(heic_path):
    out = Image.open(io.BytesIO(convert_to_bytes(heic_path, Options(fmt="png", max_size=100))))
    assert max(out.size) == 100


def test_invalid_file():
    with pytest.raises(ConversionError):
        convert_to_bytes(b"dit is geen afbeelding")


def test_convert_file_and_overwrite(heic_path, tmp_path):
    dest = convert_file(heic_path, tmp_path / "mijn foto.jpg")
    assert dest.exists()
    with pytest.raises(ConversionError):
        convert_file(heic_path, dest)
    convert_file(heic_path, dest, overwrite=True)


def test_cli(heic_path, tmp_path):
    assert cli_main([str(heic_path), "-f", "png", "-o", str(tmp_path / "x.png")]) == 0
    assert Image.open(tmp_path / "x.png").format == "PNG"


def test_web(heic_path):
    c = app.test_client()
    assert c.get("/").status_code == 200
    data = {"file": (open(heic_path, "rb"), "sample.heic"), "format": "png", "quality": "80"}
    r = c.post("/api/convert", data=data, content_type="multipart/form-data")
    assert r.status_code == 200 and r.mimetype == "image/png"
    r = c.post("/api/preview", data={"file": (open(heic_path, "rb"), "s.heic")}, content_type="multipart/form-data")
    assert r.mimetype == "image/jpeg"
    r = c.post("/api/convert", data={"file": (io.BytesIO(b"x"), "bad.heic")}, content_type="multipart/form-data")
    assert r.status_code == 400 and "error" in r.get_json()
