"""Commandline: python -m heic2jpg.cli foto.heic -f jpg -q 85 -o C:\\pad\\naam.jpg"""

from __future__ import annotations

import argparse
import glob
import sys
from pathlib import Path

from .converter import ConversionError, Options, convert_file

HEIC_EXT = {".heic", ".heif"}


def _collect(inputs: list[str]) -> list[Path]:
    files: list[Path] = []
    for item in inputs:
        p = Path(item)
        if p.is_dir():
            files += sorted(f for f in p.iterdir() if f.suffix.lower() in HEIC_EXT)
        elif any(c in item for c in "*?["):
            files += sorted(Path(f) for f in glob.glob(item))
        else:
            files.append(p)
    return files


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="heic2jpg", description="Converteer HEIC naar JPG/JPEG/PNG.")
    ap.add_argument("inputs", nargs="+", help="HEIC-bestand(en), map of wildcard")
    ap.add_argument("-f", "--format", default="jpg", choices=["jpg", "jpeg", "png"])
    ap.add_argument("-q", "--quality", type=int, default=90, help="1-100 (standaard 90)")
    ap.add_argument("-o", "--output", help="doelbestand (1 invoer) of doelmap")
    ap.add_argument("--max-size", type=int, help="langste zijde in pixels")
    ap.add_argument("--no-exif", action="store_true", help="metadata niet overnemen")
    ap.add_argument("--overwrite", action="store_true", help="bestaande bestanden overschrijven")
    args = ap.parse_args(argv)

    files = _collect(args.inputs)
    if not files:
        print("Geen HEIC-bestanden gevonden.", file=sys.stderr)
        return 1

    out = Path(args.output) if args.output else None
    if out and len(files) > 1:
        out.mkdir(parents=True, exist_ok=True)

    opts = Options(fmt=args.format, quality=args.quality,
                   keep_exif=not args.no_exif, max_size=args.max_size)
    errors = 0
    for f in files:
        try:
            dest = convert_file(f, out, opts, overwrite=args.overwrite)
            print(f"OK   {f} -> {dest}")
        except ConversionError as exc:
            errors += 1
            print(f"FOUT {f}: {exc}", file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
