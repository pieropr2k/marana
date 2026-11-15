import { useEffect, useMemo, useState } from "react";
import Engine from "../lib/engine.js";
import Mapa, { mapaVista } from "./Mapa.jsx";
import { FUENTES, codeOf, fmtCoords, fmtFecha, hasGeo, lugarPrincipal, mapsUrl, pct, zonaDe } from "../lib/util.js";

const NADA = [];

function Enlace({ href, children }) {
  return <a href={href} target="_blank" rel="noopener">{children}</a>;
}

function Credito({ it }) {
  if (it.kind === "coleccion") {
    const autor = it.autor || "autor desconocido";
    return (
      <>
        Foto: {it.autorUrl ? <Enlace href={it.autorUrl}>{autor}</Enlace> : autor}
        {" · "}
        {it.licenciaUrl ? <Enlace href={it.licenciaUrl}>{it.licencia || "licencia"}</Enlace> : it.licencia || "licencia sin indicar"}
        {it.fuenteUrl && <> · <Enlace href={it.fuenteUrl}>{"Ver en " + (FUENTES[it.fuente] || "la fuente")}</Enlace></>}
        {it.recorte && ". Foto recortada: se quitó la parte de abajo (personas, vehículos o el auto desde el que se tomó)"}
        {/sa/i.test(it.licencia || "") && ". La imagen con cables iluminados y la postal son obras derivadas (recorte y cables resaltados) y se comparten con la misma licencia"}
        {it.lugarOSM && ". Lugar: © colaboradores de OpenStreetMap (ODbL)"}
      </>
    );
  }
  if (it.autor) return <>Foto de {it.autor} (del grupo)</>;
  return null;
}

// estado: "buscando" | "vacio" | "resultado"
export default function Cartela({ estado, r, metaVacio, onPostal }) {
  const [aviso, setAviso] = useState("");
  useEffect(() => { setAviso(""); }, [r, estado]);

  const it = r && r.it;
  const geo = !!it && it.kind !== "demo" && hasGeo(it);
  const pts = useMemo(() => (geo ? [{ lat: it.lat, lon: it.lon, hi: true }] : NADA), [geo, it && it.lat, it && it.lon]);

  const copiar = async () => {
    const text = [lugarPrincipal(it), zonaDe(it), `${it.lat.toFixed(5)}, ${it.lon.toFixed(5)}`, mapsUrl(it.lat, it.lon)].filter(Boolean).join(" — ");
    try { await navigator.clipboard.writeText(text); setAviso("Ubicación copiada."); }
    catch (e) { setAviso(text); }
  };
  const postal = async () => {
    setAviso("Preparando la postal…");
    try { await onPostal(); setAviso("Postal guardada."); }
    catch (e) { setAviso("No se pudo guardar la postal."); }
  };

  let cod = "—", lugar = "Buscando…", zona = "", coords = "", meta = "", badge = null, detalle = "", p = 0, capMapa = "";
  if (estado === "vacio") {
    cod = "Sin resultado";
    lugar = "No encontré una foto donde los cables formen esa forma";
    meta = metaVacio;
  } else if (estado === "resultado" && r) {
    const c = r.c;
    cod = codeOf(it);
    if (it.kind === "demo") badge = [r.pasaFinal ? "Prueba · supera el umbral" : "Prueba · aproximada", r.pasaFinal ? "ok" : "aprox"];
    else if (r.pasaFinal) badge = ["Encontrada", "ok"];
    else badge = ["Aproximada · no supera el umbral", "aprox"];
    p = pct(c.Q);
    const parte = c.variante === "completo" ? "" : ` · se buscó ${c.variante}`;
    detalle = `Coincide el ${pct(c.covTotal)}% de tu dibujo${parte} · ${c.D >= Engine.UMBRAL.D ? "la forma destaca de su entorno" : "en esa zona casi cualquier forma coincide"} · mínimo para “encontrada”: ${pct(Engine.UMBRAL.Q)}% de parecido y ${pct(Engine.UMBRAL.total)}% del dibujo`;
    if (it.kind === "demo") {
      lugar = "Imagen de prueba";
      coords = "Sin ubicación: la generó la computadora";
      meta = "La colección todavía no tiene fotos reales.";
      capMapa = "Lima y Callao";
    } else {
      lugar = lugarPrincipal(it);
      zona = zonaDe(it);
      coords = geo ? fmtCoords(it.lat, it.lon) : "Sin coordenadas GPS";
      meta = it.fecha ? "Tomada el " + fmtFecha(it.fecha) : "";
      capMapa = geo ? mapaVista(pts).caption : "Esta foto no tiene coordenadas";
    }
  }
  const res = estado === "resultado" && r;

  return (
    <section className="cartela" aria-live="polite" aria-label="Datos de la foto">
      <div>
        <div className="cartela-top">
          <p className="cartela-cod">{cod}</p>
          {badge && <span className={"estado " + badge[1]}>{badge[0]}</span>}
        </div>
        <h2 className="cartela-lugar">{lugar}</h2>
        <p className="cartela-zona">{zona}</p>
        <p className="cartela-coords mono">{coords}</p>
        <p className="cartela-meta">{meta}</p>
        <p className="cartela-credito">{res && <Credito it={it} />}</p>
        {res && (
          <div className="parecido">
            <span>Parecido con tu trazo</span>
            <div className="barra" aria-hidden="true"><i style={{ width: p + "%" }} /></div>
            <strong>{p}%</strong>
          </div>
        )}
        <p className="cartela-detalle mono">{detalle}</p>
        <div className="fila">
          {geo && <a className="btn" href={mapsUrl(it.lat, it.lon)} target="_blank" rel="noopener">Ver en Google Maps</a>}
          {geo && <button className="btn" type="button" onClick={copiar}>Copiar ubicación</button>}
          {res && <button className="btn" type="button" onClick={postal}>Descargar postal</button>}
        </div>
        <p className="aviso" aria-live="polite">{aviso}</p>
      </div>
      <figure className="cartela-mapa">
        <Mapa pts={res ? pts : NADA} label="Mapa del lugar de la foto" />
        <figcaption>{capMapa}</figcaption>
      </figure>
    </section>
  );
}
