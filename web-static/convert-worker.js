/* Web Worker: decodeert HEIC met libheif (WebAssembly) en codeert naar JPEG/PNG.
 * Draait los van de pagina zodat de interface vlot blijft bij grote foto's. */
"use strict";

importScripts("vendor/libheif/libheif.js", "heif-meta.js");

// Emscripten vult het meegegeven object zelf aan tot de module; dat object gebruiken we
// (onRuntimeInitialized kan al afgaan voordat libheif() terugkeert).
const ready = new Promise((resolve, reject) => {
  const mod = {
    locateFile: (f) => "vendor/libheif/" + f,
    onRuntimeInitialized: () => resolve(mod),
    onAbort: (e) => reject(new Error("Decoder kon niet laden: " + e)),
  };
  libheif(mod);
});

const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };

async function decode(buffer) {
  const lib = await ready;
  const decoder = new lib.HeifDecoder();
  const images = decoder.decode(new Uint8Array(buffer));
  try {
    if (!images.length) throw new Error("Kan afbeelding niet lezen (geen geldig HEIC-bestand?)");
    const img = images.find((i) => i.is_primary()) || images[0];
    const w = img.get_width(), h = img.get_height();
    const imageData = new ImageData(w, h);
    await new Promise((resolve, reject) => {
      img.display(imageData, (out) => out ? resolve() : reject(new Error("Fout bij het decoderen van de HEIC-afbeelding")));
    });
    return imageData;
  } finally {
    for (const i of images) i.free();
    if (decoder.decoder) lib.heif_context_free(decoder.decoder);
  }
}

function render(imageData, fmt, maxSize) {
  let src = new OffscreenCanvas(imageData.width, imageData.height);
  src.getContext("2d").putImageData(imageData, 0, 0);
  let w = src.width, h = src.height;
  const scale = maxSize && Math.max(w, h) > maxSize ? maxSize / Math.max(w, h) : 1;
  const tw = Math.max(1, Math.round(w * scale)), th = Math.max(1, Math.round(h * scale));

  // Stapsgewijs halveren geeft een scherpere verkleining dan één grote stap.
  while (w / 2 >= tw && h / 2 >= th) {
    const half = new OffscreenCanvas(Math.round(w / 2), Math.round(h / 2));
    const c = half.getContext("2d");
    c.imageSmoothingQuality = "high";
    c.drawImage(src, 0, 0, half.width, half.height);
    src = half; w = half.width; h = half.height;
  }
  const out = new OffscreenCanvas(tw, th);
  const ctx = out.getContext("2d");
  if (MIME[fmt] === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, tw, th); } // geen zwarte transparantie
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, tw, th);
  return out;
}

async function convert(buffer, { fmt = "jpg", quality = 90, keepExif = true, maxSize = 0, withMeta = true }) {
  fmt = String(fmt).toLowerCase();
  if (!MIME[fmt]) throw new Error(`Onbekend uitvoerformaat: ${fmt}`);
  const meta = withMeta ? HeifMeta.extract(buffer) : { exif: null, icc: null };
  const canvas = render(await decode(buffer), fmt, maxSize);
  const q = Math.min(100, Math.max(1, Number(quality))) / 100;
  const blob = await canvas.convertToBlob({ type: MIME[fmt], quality: q });
  const info = {
    exif: keepExif && meta.exif ? HeifMeta.resetOrientation(meta.exif) : null,
    icc: meta.icc, // altijd behouden voor correcte kleuren (bv. Display P3 van iPhones)
  };
  if (!info.exif && !info.icc) return blob;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const withInfo = MIME[fmt] === "image/png"
    ? await HeifMeta.insertIntoPng(bytes, info)
    : HeifMeta.insertIntoJpeg(bytes, info);
  return new Blob([withInfo], { type: MIME[fmt] });
}

// Taken één voor één afhandelen om het geheugengebruik te beperken.
let queue = Promise.resolve();
self.onmessage = (e) => {
  const { id, buffer, opts } = e.data;
  queue = queue.then(async () => {
    try {
      const blob = await convert(buffer, opts);
      self.postMessage({ id, blob });
    } catch (err) {
      self.postMessage({ id, error: err && err.message ? err.message : String(err) });
    }
  });
};
