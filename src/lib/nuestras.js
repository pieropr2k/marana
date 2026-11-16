import Engine from "./engine.js";
import { readExif } from "./exif.js";
import { decodeFile, prepararItem, toJpeg } from "./coleccion.js";
import { frame, num, txt } from "./util.js";

const BASE = import.meta.env.BASE_URL;
const archivoSeguro = (s) => typeof s === "string" && /^[a-z0-9][a-z0-9_.-]{0,100}\.jpe?g$/i.test(s);

/* Fotos tomadas por el equipo (public/fotos_final). No traen rasgos precalculados ni licencia:
   se analizan aquí, en el navegador, igual que una foto propia, y entran a la búsqueda del trazo. */
export async function cargarNuestras(onProgress = () => {}) {
  let data = null;
  try {
    const r = await fetch(BASE + "datos/nuestras.json", { cache: "no-cache" });
    if (r.ok) data = await r.json();
  } catch (e) { /* sin fotos nuestras */ }
  if (!data || !Array.isArray(data.fotos)) return [];
  const lista = data.fotos.filter((f) => f && archivoSeguro(f.archivo));
  const out = [];
  let t = performance.now();
  onProgress(0, lista.length);
  for (let i = 0; i < lista.length; i++) {
    const f = lista[i];
    try {
      const resp = await fetch(BASE + "fotos_final/" + encodeURIComponent(f.archivo));
      if (!resp.ok) throw new Error("no se encontró " + f.archivo);
      const blobOrig = await resp.blob();
      const ex = readExif(await blobOrig.arrayBuffer()) || {};
      const { im, url } = await decodeFile(blobOrig);
      const { blob, w, h, canvas } = await toJpeg(im);
      URL.revokeObjectURL(url);
      const det = Engine.detect(canvas, w, h);
      const enc = Engine.encodeDet(det);
      const lat = num(f.lat, 90) ?? ex.lat ?? null, lon = num(f.lon, 180) ?? ex.lon ?? null;
      const blobUrl = URL.createObjectURL(blob);
      const it = {
        id: "nuestra-" + f.archivo.replace(/\.jpe?g$/i, "").replace(/[^a-z0-9_-]/gi, "-"),
        kind: "nuestra", src: blobUrl, thumb: blobUrl, w, h, det, enc, archivo: f.archivo,
        lat: lat !== null && lon !== null ? lat : null, lon: lat !== null && lon !== null ? lon : null,
        fecha: txt(f.fecha, 25) || ex.fecha || null, lugarTexto: txt(f.lugarTexto, 140), autor: txt(f.autor, 60), lugar: {},
      };
      prepararItem(it);
      it.det = null;
      out.push(it);
    } catch (e) { /* una foto que falla no detiene a las demás */ }
    onProgress(i + 1, lista.length);
    if (performance.now() - t > 40) { await frame(); t = performance.now(); }
  }
  out.forEach((it, i) => (it.code = i + 1));
  return out;
}
