import Engine from "./engine.js";
import { FUENTES, esReal, hasGeo, fmtCoords, fmtFecha, lugarPrincipal, zonaDe, pct } from "./util.js";

export function drawStrokesOn(x, strokes, s, color, lw) {
  x.lineCap = "round"; x.lineJoin = "round"; x.strokeStyle = color; x.lineWidth = lw;
  for (const st of strokes) {
    x.beginPath();
    st.forEach((p, i) => (i ? x.lineTo(p.x * s, p.y * s) : x.moveTo(p.x * s, p.y * s)));
    if (st.length === 1) x.lineTo(st[0].x * s + 0.01, st[0].y * s);
    x.stroke();
  }
}

export const presetNormalized = (name) => Engine.presetStrokes(name, 600).map((s) => s.map((p) => ({ x: p.x / 600, y: p.y / 600 })));

/* crédito que exige CC BY-SA, dentro de la imagen: viaja con ella si alguien la guarda o la captura */
export function enlaceCorto(it) {
  if (it.fuente === "commons" && /^c-wc\d+$/.test(it.id)) return "commons.wikimedia.org/w/index.php?curid=" + it.id.slice(4);
  if (it.fuente === "mapillary" && /^c-my\d+$/.test(it.id)) return "mapillary.com/app/?pKey=" + it.id.slice(4);
  return (it.fuenteUrl || "").replace(/^https:\/\//, "");
}
function lineasCredito(it, modificada) {
  if (!it || it.kind !== "coleccion") return null;
  const out = [`Foto: ${it.autor || "autor desconocido"} · ${FUENTES[it.fuente] || "fuente"} · ${it.licencia || "licencia sin indicar"}`];
  const enl = enlaceCorto(it);
  if (enl) out.push(enl);
  if (modificada) out.push(`Modificada: ${it.recorte ? "recortada y " : ""}con cables resaltados · ${/sa/i.test(it.licencia || "") ? "misma licencia" : "ver licencia"}`);
  else if (it.recorte) out.push("Modificada: recortada");
  return out;
}
export function dibujarCredito(cv, it, modificada) {
  const ls = lineasCredito(it, modificada);
  if (!ls) return;
  const x = cv.getContext("2d"), W = cv.width, H = cv.height;
  const fs = Math.max(9, Math.round(W / 62)), lh = Math.round(fs * 1.3), pad = Math.round(fs * 0.55);
  const h = ls.length * lh + pad * 2;
  x.save();
  x.fillStyle = "rgba(14,15,16,0.74)";
  x.fillRect(0, H - h, W, h);
  x.fillStyle = "#eceeea";
  x.font = `400 ${fs}px "DM Mono", ui-monospace, monospace`;
  x.textBaseline = "top";
  ls.forEach((t, i) => {
    let s = t;
    while (x.measureText(s).width > W - 2 * pad && s.length > 12) s = s.slice(0, -2);
    if (s !== t) s = s.slice(0, -1) + "…";
    x.fillText(s, pad, H - h + pad + i * lh);
  });
  x.restore();
}
export function paintFullInto(x, O, img, it, crop) {
  x.fillStyle = "#0e0f10";
  x.fillRect(0, 0, O, O);
  const s = Math.min(O / it.w, O / it.h), dw = it.w * s, dh = it.h * s, ox = (O - dw) / 2, oy = (O - dh) / 2;
  x.drawImage(img, ox, oy, dw, dh);
  x.strokeStyle = "#ffcf1f";
  x.lineWidth = Math.max(2, O / 220);
  x.strokeRect(ox + crop.x * s, oy + crop.y * s, crop.side * s, crop.side * s);
}

/* =================== postal para descargar =================== */
export async function postal({ r, img, strokes }) {
  try {
    await Promise.all([document.fonts.load('800 120px "Big Shoulders Stencil Display"'), document.fonts.load('800 40px "Public Sans"'), document.fonts.load('400 26px "DM Mono"')]);
  } catch (e) { /* fuentes del sistema */ }
  const W = 1800, H = r.it.kind === "coleccion" ? 1330 : 1180, S = 760;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  x.fillStyle = "#d3d5d2"; x.fillRect(0, 0, W, H);
  x.fillStyle = "#131415"; x.font = '800 120px "Big Shoulders Stencil Display", sans-serif'; x.fillText("MARAÑA", 80, 170);
  const L0 = 80, T0 = 230, R0 = W - 80 - S;
  const real = r.it.kind === "coleccion";
  x.fillStyle = "#e3e4e1"; x.fillRect(L0, T0, S, S);
  x.save(); x.translate(L0, T0); drawStrokesOn(x, strokes, S, "#131415", S * 0.014); x.restore();
  const L = Engine.buildLayers(img, r.it.w, r.it.h, r.feat, r.c.drVar, r.c, 1000, r.c);
  const tmp = document.createElement("canvas");
  tmp.width = tmp.height = 1000;
  Engine.paint(tmp, L, "reveal", 1, false);
  x.drawImage(tmp, R0, T0, S, S);
  x.font = '600 24px "Public Sans", sans-serif'; x.fillStyle = "#4f5356";
  x.fillText("Tu trazo", L0, T0 - 16);
  x.fillText(r.pasaFinal ? "Encontrado en los cables" : "Aproximado: no supera el umbral", R0, T0 - 16);
  const it = r.it;
  x.fillStyle = "#131415"; x.font = '800 40px "Public Sans", sans-serif';
  const titulo = it.kind === "demo" ? "Imagen de prueba (generada por computadora)" : [lugarPrincipal(it), zonaDe(it)].filter(Boolean).join(", ");
  x.fillText(titulo.length > 70 ? titulo.slice(0, 68) + "…" : titulo, L0, T0 + S + 62);
  x.font = '400 24px "DM Mono", monospace'; x.fillStyle = "#4f5356";
  const linea = [];
  if (esReal(it) && hasGeo(it)) linea.push(fmtCoords(it.lat, it.lon));
  if (it.fecha) linea.push(fmtFecha(it.fecha));
  linea.push("Parecido " + pct(r.c.Q) + "%");
  x.fillText(linea.join("  ·  "), L0, T0 + S + 102);
  if (real) {
    // crédito que exige la licencia: autor, licencia, enlace a la foto y aviso de que es una obra derivada
    const sa = /sa/i.test(it.licencia || "");
    const parrafos = [
      `Foto: ${it.autor || "autor desconocido"} · ${FUENTES[it.fuente] || "fuente"} · ${it.licencia || "licencia sin indicar"}${it.licenciaUrl ? " (" + it.licenciaUrl.replace(/^https:\/\//, "") + ")" : ""}`,
      `Original: ${enlaceCorto(it) || it.fuenteUrl}`,
      `Obra derivada: ${it.recorte ? "foto recortada, " : "foto con "}cables resaltados y junto al trazo.${sa ? " Se comparte con la misma licencia (" + (it.licencia || "CC BY-SA 4.0") + ")." : ""}`,
    ];
    if (it.lugarOSM) parrafos.push("Lugar: © colaboradores de OpenStreetMap (ODbL).");
    x.font = '400 20px "DM Mono", monospace';
    // sin cortar el crédito: si una línea no entra, sigue en la de abajo
    const lineas = [];
    for (const t of parrafos) {
      let actual = "";
      for (const w of t.split(" ")) {
        const prueba = actual ? actual + " " + w : w;
        if (x.measureText(prueba).width > W - 2 * L0 && actual) { lineas.push(actual); actual = w; }
        else actual = prueba;
      }
      if (actual) lineas.push(actual);
    }
    lineas.forEach((t, i) => x.fillText(t, L0, T0 + S + 140 + i * 30));
  } else if (it.autor) { x.font = '400 20px "DM Mono", monospace'; x.fillText("Foto: " + it.autor, L0, T0 + S + 138); }
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("png"))), "image/png"));
}

export function nombreArchivo(it) {
  const base = (it.kind === "demo" ? "prueba" : lugarPrincipal(it)).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "foto";
  return `marana-${base}.png`;
}
