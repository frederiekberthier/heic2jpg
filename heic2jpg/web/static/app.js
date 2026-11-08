"use strict";

const $ = (s) => document.querySelector(s);
const drop = $("#drop"), picker = $("#picker"), list = $("#list"), listWrap = $("#list-wrap");
const fmtSel = $("#format"), quality = $("#quality"), qval = $("#qval");
const qlabel = $("#qlabel"), qhint = $("#qhint"), maxsize = $("#maxsize"), exif = $("#exif");

const canPickFile = "showSaveFilePicker" in window;
const canPickDir = "showDirectoryPicker" in window;
const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };
const items = []; // { file, row, nameInput, nameEdited }

$("#support").textContent = canPickFile
  ? "Je kiest de map en bestandsnaam in het Windows-venster 'Opslaan als'."
  : "Deze browser ondersteunt geen 'Opslaan als'-venster: bestanden gaan naar je Downloads-map met de opgegeven naam. Gebruik Edge of Chrome om zelf de map te kiezen.";

const fmtSize = (b) => b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(2)} MB`;
const ext = () => "." + fmtSel.value;
const stem = (name) => name.replace(/\.[^.]+$/, "");

function updateQualityUi() {
  qval.textContent = quality.value;
  if (fmtSel.value === "png") {
    qlabel.textContent = "Snelheid / compressie";
    qhint.textContent = "PNG is verliesvrij: lager = kleiner bestand maar trager.";
  } else {
    qlabel.textContent = "Kwaliteit";
    qhint.textContent = "Hoger = betere kwaliteit, groter bestand.";
  }
}

function fixExtension(name) {
  const base = stem(name.trim()) || "afbeelding";
  return base + ext();
}

quality.addEventListener("input", updateQualityUi);
fmtSel.addEventListener("change", () => {
  updateQualityUi();
  for (const it of items) it.nameInput.value = fixExtension(it.nameInput.value);
});

// --- bestanden toevoegen ---
picker.addEventListener("change", () => { addFiles(picker.files); picker.value = ""; });
drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); picker.click(); } });
for (const ev of ["dragenter", "dragover"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); });
for (const ev of ["dragleave", "drop"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); });
drop.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));

function addFiles(files) {
  for (const file of files) {
    if (!/\.(heic|heif)$/i.test(file.name)) {
      alert(`${file.name} is geen HEIC/HEIF-bestand en wordt overgeslagen.`);
      continue;
    }
    const row = $("#row-tpl").content.firstElementChild.cloneNode(true);
    const it = { file, row, nameInput: row.querySelector(".name") };
    row.querySelector(".orig").textContent = `${file.name} · ${fmtSize(file.size)}`;
    it.nameInput.value = stem(file.name) + ext();
    it.nameInput.addEventListener("change", () => { it.nameInput.value = fixExtension(it.nameInput.value); });
    row.querySelector(".save").addEventListener("click", () => saveOne(it));
    row.querySelector(".remove").addEventListener("click", () => removeItem(it));
    list.append(row);
    items.push(it);
    loadPreview(it);
  }
  listWrap.hidden = items.length === 0;
}

function removeItem(it) {
  it.row.remove();
  items.splice(items.indexOf(it), 1);
  listWrap.hidden = items.length === 0;
}

$("#clear").addEventListener("click", () => { while (items.length) removeItem(items[0]); });

async function loadPreview(it) {
  const box = it.row.querySelector(".thumb");
  try {
    const fd = new FormData();
    fd.append("file", it.file);
    const res = await fetch("/api/preview", { method: "POST", body: fd });
    if (!res.ok) throw new Error((await res.json()).error);
    const img = new Image();
    img.alt = "";
    img.src = URL.createObjectURL(await res.blob());
    box.replaceChildren(img);
  } catch (err) {
    box.textContent = "?";
    setStatus(it, "Preview mislukt: " + err.message, "err");
  }
}

// --- converteren ---
function setStatus(it, text, cls = "") {
  const s = it.row.querySelector(".status");
  s.textContent = text;
  s.className = "status " + cls;
}

async function convert(it) {
  const fd = new FormData();
  fd.append("file", it.file);
  fd.append("format", fmtSel.value);
  fd.append("quality", quality.value);
  fd.append("keep_exif", exif.checked ? "1" : "0");
  fd.append("max_size", maxsize.value);
  setStatus(it, "Bezig met converteren…");
  const res = await fetch("/api/convert", { method: "POST", body: fd });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error; } catch { /* geen json */ }
    throw new Error(msg);
  }
  return res.blob();
}

async function writeHandle(handle, blob) {
  const w = await handle.createWritable();
  await w.write(blob);
  await w.close();
}

function download(name, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function pickerTypes() {
  const e = ext();
  return [{ description: e.slice(1).toUpperCase() + "-afbeelding", accept: { [MIME[fmtSel.value]]: [e] } }];
}

async function saveOne(it) {
  const name = fixExtension(it.nameInput.value);
  it.nameInput.value = name;
  const btn = it.row.querySelector(".save");
  btn.disabled = true;
  try {
    let handle = null;
    if (canPickFile) {
      // Venster eerst openen (vereist directe klik van de gebruiker), daarna converteren.
      try {
        handle = await window.showSaveFilePicker({ suggestedName: name, types: pickerTypes(), id: "heic2jpg" });
      } catch (err) {
        if (err.name === "AbortError") { setStatus(it, "Opslaan geannuleerd."); return; }
        throw err;
      }
    }
    const blob = await convert(it);
    if (handle) await writeHandle(handle, blob); else download(name, blob);
    setStatus(it, `Opgeslagen als ${handle ? handle.name : name} (${fmtSize(blob.size)})`, "ok");
  } catch (err) {
    setStatus(it, "Fout: " + err.message, "err");
  } finally {
    btn.disabled = false;
  }
}

$("#all").addEventListener("click", async () => {
  if (!items.length) return;
  const allBtn = $("#all");
  let dir = null;
  if (canPickDir) {
    try {
      dir = await window.showDirectoryPicker({ mode: "readwrite", id: "heic2jpg" });
    } catch (err) {
      if (err.name === "AbortError") return;
      alert("Kan map niet openen: " + err.message);
      return;
    }
  }
  allBtn.disabled = true;
  for (const it of [...items]) {
    const name = fixExtension(it.nameInput.value);
    it.nameInput.value = name;
    try {
      const blob = await convert(it);
      if (dir) await writeHandle(await dir.getFileHandle(name, { create: true }), blob);
      else download(name, blob);
      setStatus(it, `Opgeslagen als ${dir ? dir.name + "\\" : ""}${name} (${fmtSize(blob.size)})`, "ok");
    } catch (err) {
      setStatus(it, "Fout: " + err.message, "err");
    }
  }
  allBtn.disabled = false;
});

updateQualityUi();
