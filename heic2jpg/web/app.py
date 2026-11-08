"""Lokale Flask-webapp. Start: python -m heic2jpg.web.app"""

from __future__ import annotations

import threading
import webbrowser

from flask import Flask, Response, jsonify, render_template, request

from ..converter import ConversionError, Options, convert_to_bytes, mimetype_for, thumbnail_jpeg

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024  # 100 MB


def _uploaded() -> bytes:
    f = request.files.get("file")
    if not f:
        raise ConversionError("Geen bestand ontvangen.")
    return f.read()


@app.errorhandler(ConversionError)
def _conversion_error(exc):
    return jsonify(error=str(exc)), 400


@app.errorhandler(413)
def _too_large(_exc):
    return jsonify(error="Bestand is te groot (max 100 MB)."), 413


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/api/preview")
def preview():
    return Response(thumbnail_jpeg(_uploaded()), mimetype="image/jpeg")


@app.post("/api/convert")
def convert():
    form = request.form
    max_size = form.get("max_size", "").strip()
    opts = Options(
        fmt=form.get("format", "jpg"),
        quality=int(form.get("quality", 90)),
        keep_exif=form.get("keep_exif", "1") == "1",
        max_size=int(max_size) if max_size.isdigit() and int(max_size) > 0 else None,
    )
    data = convert_to_bytes(_uploaded(), opts)
    return Response(data, mimetype=mimetype_for(opts.fmt))


def main(host: str = "127.0.0.1", port: int = 5000, open_browser: bool = True) -> None:
    if open_browser:
        threading.Timer(1.0, lambda: webbrowser.open(f"http://{host}:{port}")).start()
    app.run(host=host, port=port)


if __name__ == "__main__":
    main()
