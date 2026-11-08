"""Kernlogica: HEIC/HEIF omzetten naar JPEG/JPG of PNG.

Gebruikt Pillow + pillow-heif (bundelt eigen libheif-decoder, dus geen
afhankelijkheid van de Windows HEIF/HEVC-extensies).
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Union

from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

register_heif_opener()

FORMATS = {
    "jpg": ("JPEG", ".jpg", "image/jpeg"),
    "jpeg": ("JPEG", ".jpeg", "image/jpeg"),
    "png": ("PNG", ".png", "image/png"),
}

Source = Union[str, Path, bytes, BinaryIO]


class ConversionError(Exception):
    """Fout bij het inlezen of converteren van een bestand."""


@dataclass
class Options:
    fmt: str = "jpg"
    quality: int = 90          # 1-100
    keep_exif: bool = True
    max_size: int | None = None  # langste zijde in pixels (None = origineel)


def normalize_format(fmt: str) -> str:
    key = fmt.lower().lstrip(".")
    if key not in FORMATS:
        raise ConversionError(f"Onbekend uitvoerformaat: {fmt!r} (kies jpg, jpeg of png)")
    return key


def extension_for(fmt: str) -> str:
    return FORMATS[normalize_format(fmt)][1]


def mimetype_for(fmt: str) -> str:
    return FORMATS[normalize_format(fmt)][2]


def _open(src: Source) -> Image.Image:
    if isinstance(src, (bytes, bytearray)):
        src = io.BytesIO(src)
    try:
        img = Image.open(src)
        img.load()
    except FileNotFoundError:
        raise ConversionError(f"Bestand niet gevonden: {src}") from None
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ConversionError(f"Kan afbeelding niet lezen (geen geldig HEIC-bestand?): {exc}") from None
    return img


def _prepare(img: Image.Image, opts: Options, target: str) -> tuple[Image.Image, dict]:
    exif = img.getexif() if opts.keep_exif else None
    icc = img.info.get("icc_profile")

    # Oriëntatie toepassen en daarna de Orientation-tag resetten.
    img = ImageOps.exif_transpose(img)
    if exif is not None and 0x0112 in exif:
        exif[0x0112] = 1

    if opts.max_size:
        img.thumbnail((opts.max_size, opts.max_size), Image.Resampling.LANCZOS)

    if target == "JPEG":
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
    elif img.mode not in ("RGB", "RGBA", "L", "LA", "I;16"):
        img = img.convert("RGBA" if "A" in img.mode else "RGB")

    params: dict = {}
    if icc:
        params["icc_profile"] = icc
    if exif is not None and len(exif):
        params["exif"] = exif.tobytes()
    return img, params


def convert_to_bytes(src: Source, opts: Options | None = None) -> bytes:
    """Converteer `src` en geef de bytes van het resultaat terug."""
    opts = opts or Options()
    key = normalize_format(opts.fmt)
    target = FORMATS[key][0]
    quality = max(1, min(100, int(opts.quality)))

    with _open(src) as original:
        img, params = _prepare(original, opts, target)
        buf = io.BytesIO()
        if target == "JPEG":
            img.save(buf, "JPEG", quality=quality, optimize=True, **params)
        else:
            # Hogere "kwaliteit" = minder compressie (sneller, groter); PNG blijft verliesvrij.
            compress_level = round((100 - quality) / 100 * 9)
            img.save(buf, "PNG", compress_level=compress_level, optimize=compress_level == 9, **params)
    return buf.getvalue()


def convert_file(src: Union[str, Path], dest: Union[str, Path, None] = None,
                 opts: Options | None = None, overwrite: bool = False) -> Path:
    """Converteer een bestand op schijf; `dest` default = zelfde naam/map met nieuwe extensie."""
    opts = opts or Options()
    src = Path(src)
    dest = Path(dest) if dest else src.with_suffix(extension_for(opts.fmt))
    if dest.is_dir():
        dest = dest / (src.stem + extension_for(opts.fmt))
    if dest.exists() and not overwrite:
        raise ConversionError(f"Doelbestand bestaat al: {dest} (gebruik overwrite)")
    data = convert_to_bytes(src, opts)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return dest


def thumbnail_jpeg(src: Source, size: int = 320) -> bytes:
    """Kleine JPEG-preview (browsers tonen HEIC niet zelf)."""
    return convert_to_bytes(src, Options(fmt="jpg", quality=75, keep_exif=False, max_size=size))
