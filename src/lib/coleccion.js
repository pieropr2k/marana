import Engine from "./engine.js";
import { frame, httpsUrl, txt, num, FUENTES } from "./util.js";

const BASE = import.meta.env.BASE_URL;

/* Cada foto guarda rasgos compactos (enc). Para ordenar cientos de fotos se usa una versión liviana
   (low); la versión completa se arma solo para las mejores y se guarda en una caché pequeña. */
const fullCache = new Map();
const imgCache = new Map();

export function fullFeat(it) {
  if (fullCache.has(it.id)) { const f = fullCache.get(it.id); fullCache.delete(it.id); fullCache.set(it.id, f); return f; }
  const det = it.det || Engine.decodeDet(it.enc);
  const f = Engine.buildDTs(det);
  fullCache.set(it.id, f);
  while (fullCache.size > 48) fullCache.delete(fullCache.keys().next().value);
  return f;
}
export function prepararItem(it) {
  const det = it.det || Engine.decodeDet(it.enc);
  it.low = Engine.buildLow(det);
}
export function olvidar(it) {
  imgCache.delete(it.id);
  fullCache.delete(it.id);
}

export async function buildDemos() {
  const demos = [];
  for (let v = 0; v < 6; v++) {
    const portrait = v % 2 === 1;
    const c = Engine.makeDemo(v, portrait ? 900 : 1200, portrait ? 1200 : 900);
    const det = Engine.detect(c, c.width, c.height);
    const th = document.createElement("canvas");
    const k = 360 / Math.max(c.width, c.height);
    th.width = Math.round(c.width * k); th.height = Math.round(c.height * k);
    th.getContext("2d").drawImage(c, 0, 0, th.width, th.height);
    const it = { id: "demo-" + v, kind: "demo", canvas: c, w: c.width, h: c.height, det, code: v + 1, thumb: th.toDataURL("image/jpeg", 0.8) };
    prepararItem(it);
    demos.push(it);
    await frame();
  }
  return demos;
}

// colección publicada junto con la página (fotos reales recolectadas fuera de la página)
const idSeguro = (s) => typeof s === "string" && /^[a-z0-9][a-z0-9_-]{0,80}$/i.test(s);
export async function cargarColeccion() {
  let data = null;
  try {
    const r = await fetch(BASE + "datos/coleccion.json", { cache: "no-cache" });
    if (r.ok) data = await r.json();
  } catch (e) { /* sin colección publicada */ }
  if (!data || !Array.isArray(data.fotos)) return [];
  const out = [];
  for (const f of data.fotos) {
    if (!f || !idSeguro(f.id) || !idSeguro(String(f.archivo || "").replace(/\.jpg$/i, "")) || !f.rasgos) continue;
    const lat = num(f.lat, 90), lon = num(f.lon, 180);
    out.push({
      id: "c-" + f.id, kind: "coleccion", src: BASE + "fotos/" + f.archivo, thumb: BASE + "miniaturas/" + f.archivo,
      w: num(f.w, 20000) || 0, h: num(f.h, 20000) || 0, enc: f.rasgos,
      fuente: FUENTES[f.fuente] ? f.fuente : "commons", titulo: txt(f.titulo, 160), autor: txt(f.autor, 120), autorUrl: httpsUrl(f.autorUrl),
      licencia: txt(f.licencia, 60), licenciaUrl: httpsUrl(f.licenciaUrl), fuenteUrl: httpsUrl(f.fuenteUrl),
      lat: lat !== null && lon !== null ? lat : null, lon: lat !== null && lon !== null ? lon : null,
      fecha: txt(f.fecha, 25) || null, ciudad: txt(f.ciudad, 30),
      lugar: f.lugar && typeof f.lugar === "object" ? {
        calle: txt(f.lugar.calle, 120), zona: txt(f.lugar.zona, 120), distrito: txt(f.lugar.distrito, 80),
        ciudad: txt(f.lugar.ciudad, 80), region: txt(f.lugar.region, 80),
      } : {},
      lugarOSM: f.lugarFuente === "osm",
      // fracción del alto original que se conserva (se quitó la parte de abajo por privacidad)
      recorte: num(f.recorte, 1) && num(f.recorte, 1) >= 0.3 && num(f.recorte, 1) < 0.999 ? num(f.recorte, 1) : null,
    });
  }
  out.forEach((it, i) => (it.code = i + 1));
  return out;
}

export async function prepararTodo(items, onProgress) {
  const pend = items.filter((it) => !it.low && (it.enc || it.det));
  let listos = 0;
  onProgress(0, pend.length);
  let t = performance.now();
  for (const it of pend) {
    try { prepararItem(it); } catch (e) { it.error = true; }
    listos++;
    if (performance.now() - t > 40) {
      onProgress(listos, pend.length);
      await frame();
      t = performance.now();
    }
  }
  onProgress(listos, pend.length);
}

/* =================== carga de imágenes =================== */
export function imageOf(it) {
  if (it.kind === "demo") return Promise.resolve(it.canvas);
  if (imgCache.has(it.id)) return imgCache.get(it.id);
  const p = new Promise((res, rej) => {
    const im = new Image();
    im.decoding = "async";
    if (!/^blob:/.test(it.src)) im.crossOrigin = "anonymous";
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("No se pudo abrir la foto."));
    im.src = it.src;
  });
  imgCache.set(it.id, p);
  p.catch(() => imgCache.delete(it.id));
  while (imgCache.size > 10) imgCache.delete(imgCache.keys().next().value);
  return p;
}

/* =================== fotos propias =================== */
export function decodeFile(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => res({ im, url });
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error("no se pudo abrir la imagen. Si es HEIC (iPhone), expórtala como JPG.")); };
    im.src = url;
  });
}
export function toJpeg(im, max = 2000, q = 0.86) {
  const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
  const w = Math.max(1, Math.round(im.naturalWidth * k)), h = Math.max(1, Math.round(im.naturalHeight * k));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d");
  x.imageSmoothingQuality = "high";
  x.drawImage(im, 0, 0, w, h);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res({ blob: b, w, h, canvas: c }) : rej(new Error("no se pudo convertir la imagen."))), "image/jpeg", q));
}
