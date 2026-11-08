/* Metadata uit HEIF/HEIC halen (Exif + ICC-kleurprofiel) en invoegen in JPEG/PNG.
 * libheif-js geeft enkel pixels terug, dus de ISOBMFF-boxen lezen we hier zelf. */
"use strict";

const HeifMeta = (() => {
  const latin1 = new TextDecoder("latin1");
  const fourcc = (u, p) => latin1.decode(u.subarray(p, p + 4));

  function readUint(dv, p, n) {
    if (n === 0) return 0;
    if (n === 2) return dv.getUint16(p);
    if (n === 4) return dv.getUint32(p);
    if (n === 8) return Number(dv.getBigUint64(p));
    throw new Error("Ongeldige veldgrootte " + n);
  }

  function boxes(u, dv, start, end) {
    const out = [];
    let p = start;
    while (p + 8 <= end) {
      let size = dv.getUint32(p);
      const type = fourcc(u, p + 4);
      let hdr = 8;
      if (size === 1) { size = Number(dv.getBigUint64(p + 8)); hdr = 16; }
      else if (size === 0) size = end - p;
      if (size < hdr || p + size > end) break;
      out.push({ type, start: p + hdr, end: p + size });
      p += size;
    }
    return out;
  }

  const find = (list, type) => list.find((b) => b.type === type);

  /** Geeft { exif: Uint8Array|null (TIFF-blok), icc: Uint8Array|null } terug. */
  function extract(buffer) {
    const u = new Uint8Array(buffer);
    const dv = new DataView(buffer);
    const result = { exif: null, icc: null };
    const meta = find(boxes(u, dv, 0, u.length), "meta");
    if (!meta) return result;
    const mb = boxes(u, dv, meta.start + 4, meta.end); // meta is een FullBox

    // --- ICC-profiel uit iprp/ipco/colr ---
    const iprp = find(mb, "iprp");
    const ipco = iprp && find(boxes(u, dv, iprp.start, iprp.end), "ipco");
    if (ipco) {
      for (const b of boxes(u, dv, ipco.start, ipco.end)) {
        if (b.type !== "colr") continue;
        const kind = fourcc(u, b.start);
        if (kind === "prof" || kind === "rICC") { result.icc = u.slice(b.start + 4, b.end); break; }
      }
    }

    // --- Exif-item zoeken in iinf ---
    const iinf = find(mb, "iinf");
    const iloc = find(mb, "iloc");
    if (!iinf || !iloc) return result;
    const exifIds = new Set();
    const iinfVer = u[iinf.start];
    const entriesStart = iinf.start + 4 + (iinfVer === 0 ? 2 : 4);
    for (const e of boxes(u, dv, entriesStart, iinf.end)) {
      if (e.type !== "infe") continue;
      const v = u[e.start];
      if (v < 2) continue;
      let p = e.start + 4;
      const id = v === 2 ? dv.getUint16(p) : dv.getUint32(p);
      p += (v === 2 ? 2 : 4) + 2; // + item_protection_index
      if (fourcc(u, p) === "Exif") exifIds.add(id);
    }
    if (!exifIds.size) return result;

    // --- locatie van het item uit iloc ---
    const idat = find(mb, "idat");
    const v = u[iloc.start];
    let p = iloc.start + 4;
    const offSize = u[p] >> 4, lenSize = u[p] & 15;
    const baseSize = u[p + 1] >> 4, idxSize = (v === 1 || v === 2) ? (u[p + 1] & 15) : 0;
    p += 2;
    const count = v < 2 ? dv.getUint16(p) : dv.getUint32(p);
    p += v < 2 ? 2 : 4;
    for (let i = 0; i < count; i++) {
      const id = v < 2 ? dv.getUint16(p) : dv.getUint32(p);
      p += v < 2 ? 2 : 4;
      let method = 0;
      if (v === 1 || v === 2) { method = dv.getUint16(p) & 15; p += 2; }
      p += 2; // data_reference_index
      const base = readUint(dv, p, baseSize); p += baseSize;
      const extents = dv.getUint16(p); p += 2;
      const parts = [];
      for (let x = 0; x < extents; x++) {
        p += idxSize;
        const off = readUint(dv, p, offSize); p += offSize;
        const len = readUint(dv, p, lenSize); p += lenSize;
        parts.push([off, len]);
      }
      if (!exifIds.has(id) || method > 1 || (method === 1 && !idat)) continue;
      const origin = method === 1 ? idat.start : 0;
      const chunks = parts.map(([off, len]) => {
        const s = origin + base + off;
        return u.subarray(s, len ? s + len : u.length);
      });
      const data = concat(chunks);
      if (data.length < 4) continue;
      const tiffStart = 4 + new DataView(data.buffer, data.byteOffset).getUint32(0);
      const tiff = data.slice(tiffStart);
      if (isTiff(tiff)) { result.exif = tiff; break; }
    }
    return result;
  }

  function isTiff(t) {
    return t.length > 8 && ((t[0] === 0x49 && t[1] === 0x49 && t[2] === 0x2a && t[3] === 0) ||
                            (t[0] === 0x4d && t[1] === 0x4d && t[2] === 0 && t[3] === 0x2a));
  }

  function concat(parts) {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  /** Oriëntatie-tag op 1 zetten: libheif heeft de rotatie al op de pixels toegepast. */
  function resetOrientation(tiff) {
    const t = tiff.slice();
    const dv = new DataView(t.buffer);
    const le = t[0] === 0x49;
    const ifd = dv.getUint32(4, le);
    if (ifd + 2 > t.length) return t;
    const n = dv.getUint16(ifd, le);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > t.length) break;
      if (dv.getUint16(e, le) === 0x0112) dv.setUint16(e + 8, 1, le);
    }
    return t;
  }

  const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));

  // ---------- JPEG ----------
  function jpegSegment(marker, payload) {
    const seg = new Uint8Array(4 + payload.length);
    seg[0] = 0xff; seg[1] = marker;
    new DataView(seg.buffer).setUint16(2, payload.length + 2);
    seg.set(payload, 4);
    return seg;
  }

  function insertIntoJpeg(jpeg, { exif, icc }) {
    const segs = [];
    if (exif) {
      const payload = concat([ascii("Exif\0\0"), exif]);
      if (payload.length + 2 <= 0xffff) segs.push(jpegSegment(0xe1, payload));
    }
    if (icc) {
      const max = 0xffff - 2 - 14;
      const total = Math.ceil(icc.length / max);
      if (total <= 255) {
        for (let i = 0; i < total; i++) {
          const head = concat([ascii("ICC_PROFILE\0"), Uint8Array.of(i + 1, total)]);
          segs.push(jpegSegment(0xe2, concat([head, icc.subarray(i * max, (i + 1) * max)])));
        }
      }
    }
    if (!segs.length) return jpeg;
    // Header-segmenten overlopen tot SOS: bestaande Exif/ICC van de browser weglaten
    // (anders staan er twee profielen in) en de onze na SOI/JFIF invoegen.
    const startsWith = (p, s) => latin1.decode(jpeg.subarray(p, p + s.length)) === s;
    const keep = [jpeg.subarray(0, 2)];
    let p = 2, inserted = false;
    while (p + 4 <= jpeg.length && jpeg[p] === 0xff) {
      const marker = jpeg[p + 1];
      if (marker === 0xda) break; // SOS: vanaf hier beelddata
      const end = p + 2 + ((jpeg[p + 2] << 8) | jpeg[p + 3]);
      const replaced = (exif && marker === 0xe1 && startsWith(p + 4, "Exif\0")) ||
                       (icc && marker === 0xe2 && startsWith(p + 4, "ICC_PROFILE\0"));
      if (marker !== 0xe0 && !inserted) { keep.push(...segs); inserted = true; }
      if (!replaced) keep.push(jpeg.subarray(p, end));
      p = end;
    }
    if (!inserted) keep.push(...segs);
    keep.push(jpeg.subarray(p));
    return concat(keep);
  }

  // ---------- PNG ----------
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function pngChunk(type, data) {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    out.set(ascii(type), 4);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  }

  async function zlib(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function insertIntoPng(png, { exif, icc }) {
    const extra = [];
    if (icc && typeof CompressionStream !== "undefined") {
      extra.push(pngChunk("iCCP", concat([ascii("ICC Profile\0"), Uint8Array.of(0), await zlib(icc)])));
    }
    if (exif) extra.push(pngChunk("eXIf", exif));
    if (!extra.length) return png;
    // Bestaande kleur-chunks verwijderen als we een ICC-profiel toevoegen.
    const drop = icc ? new Set(["sRGB", "gAMA", "cHRM", "iCCP"]) : new Set();
    const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const parts = [png.subarray(0, 8)];
    let p = 8;
    while (p + 12 <= png.length) {
      const len = dv.getUint32(p);
      const type = fourcc(png, p + 4);
      const chunk = png.subarray(p, p + 12 + len);
      if (!drop.has(type)) parts.push(chunk);
      if (type === "IHDR") parts.push(...extra);
      p += 12 + len;
    }
    return concat(parts);
  }

  return { extract, resetOrientation, insertIntoJpeg, insertIntoPng };
})();

if (typeof module === "object") module.exports = HeifMeta;
