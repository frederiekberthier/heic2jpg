/* Kleine wrapper rond de Web Worker: convert(file, opties) -> Promise<Blob>. */
"use strict";

const HeicConverter = (() => {
  // Basis-URL nu vastleggen: document.currentScript is later null.
  const base = document.currentScript ? document.currentScript.src : location.href;
  let worker = null;
  let nextId = 1;
  const pending = new Map();

  function getWorker() {
    if (worker) return worker;
    worker = new Worker(new URL("convert-worker.js", base));
    worker.onmessage = (e) => {
      const { id, blob, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      error ? p.reject(new Error(error)) : p.resolve(blob);
    };
    worker.onerror = (e) => {
      const err = new Error("De converter kon niet starten: " + (e.message || "onbekende fout"));
      for (const p of pending.values()) p.reject(err);
      pending.clear();
    };
    return worker;
  }

  async function run(file, opts) {
    const buffer = await file.arrayBuffer();
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      getWorker().postMessage({ id, buffer, opts }, [buffer]);
    });
  }

  function supported() {
    return typeof Worker !== "undefined" && typeof WebAssembly === "object" &&
           typeof OffscreenCanvas !== "undefined";
  }

  return {
    supported,
    convert: (file, { fmt = "jpg", quality = 90, keepExif = true, maxSize = 0 } = {}) =>
      run(file, { fmt, quality, keepExif, maxSize, withMeta: true }),
    preview: (file, size = 320) =>
      run(file, { fmt: "jpg", quality: 75, keepExif: false, maxSize: size, withMeta: false }),
  };
})();
