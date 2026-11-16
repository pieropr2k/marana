import { useMemo, useState } from "react";
import Mapa from "./Mapa.jsx";
import { FUENTES, codeOf, errText, hasGeo, lsGet, lsSet, lugarPrincipal } from "../lib/util.js";

const PAGINA = 48;

function Credito({ it }) {
  const autor = it.autor || "autor desconocido";
  return (
    <p className="ficha-cred">
      Foto: {it.autorUrl ? <a href={it.autorUrl} target="_blank" rel="noopener">{autor}</a> : autor}
      {" · "}
      {it.licenciaUrl ? <a href={it.licenciaUrl} target="_blank" rel="noopener">{it.licencia || "licencia"}</a> : it.licencia || ""}
      {it.fuenteUrl && <> · <a href={it.fuenteUrl} target="_blank" rel="noopener">{FUENTES[it.fuente] || "fuente"}</a></>}
      {it.recorte && " · recortada"}
    </p>
  );
}

export function Ficha({ it, onEditar, onEliminar, onAbrir }) {
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState("");
  const [ocupada, setOcupada] = useState(false);
  const demo = it.kind === "demo";

  const eliminar = async () => {
    setOcupada(true);
    try { await onEliminar(it); } catch (e) { setError(" No se pudo eliminar: " + errText(e)); setOcupada(false); }
  };

  return (
    <article className="ficha">
      {(() => {
        const img = <img loading="lazy" src={it.thumb || it.src} alt={demo ? "Imagen de prueba generada por computadora" : "Cables en " + lugarPrincipal(it)} />;
        return onAbrir
          ? <button type="button" className="foto foto-zoom" onClick={() => onAbrir(it)} aria-label={"Ampliar " + codeOf(it)}>{img}<span className="foto-pista" aria-hidden="true">Presiona para hacer zoom</span></button>
          : <div className="foto">{img}</div>;
      })()}
      <p className="ficha-cod">{codeOf(it)}</p>
      <p className="ficha-lugar">{demo ? "Generada por computadora" : lugarPrincipal(it)}</p>
      <p className="ficha-estado">
        {demo ? <span className="marca-chip">Prueba</span> : (
          <>
            <span className="marca-chip">{it.kind === "coleccion" ? FUENTES[it.fuente] : it.kind === "nuestra" ? "Foto nuestra" : "Del grupo"}</span>
            {it.kind !== "coleccion" && <span className="marca-chip">{hasGeo(it) ? "GPS" : "Sin GPS"}</span>}
            {it.kind === "local" && !it.lugarTexto && <span className="marca-chip falta">Falta el lugar</span>}
            {it.error ? <span className="marca-chip falta">No se pudo analizar</span> : !it.low && <span className="marca-chip">Analizando…</span>}
          </>
        )}
      </p>
      {it.kind === "coleccion" && <Credito it={it} />}
      {it.kind === "local" && (
        <div className="ficha-acc">
          {confirmando ? (
            <div className="confirmar">
              ¿Eliminar esta foto?
              <button type="button" className="chip" disabled={ocupada} onClick={eliminar} autoFocus>Sí, eliminar</button>
              <button type="button" className="chip" disabled={ocupada} onClick={() => { setConfirmando(false); setError(""); }}>No</button>
              {error}
            </div>
          ) : (
            <>
              <button type="button" className="chip" onClick={() => onEditar(it)}>Editar</button>
              <button type="button" className="chip" onClick={() => setConfirmando(true)}>Eliminar</button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

function Subir({ onArchivo }) {
  const [autor, setAutor] = useState(() => lsGet("marana-autor", ""));
  const [lista, setLista] = useState([]);

  const cambiar = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    for (const file of files) {
      const id = Math.random().toString(36).slice(2);
      const nombre = file.name.length > 40 ? file.name.slice(0, 37) + "…" : file.name;
      const poner = (texto, err = false) => setLista((l) => l.map((x) => (x.id === id ? { ...x, texto: `${nombre} — ${texto}`, err } : x)));
      setLista((l) => [{ id, texto: `${nombre} — leyendo…`, err: false }, ...l]);
      try {
        await onArchivo(file, autor.trim().slice(0, 60), poner);
      } catch (err) {
        poner("no se pudo agregar: " + errText(err), true);
      }
    }
  };

  return (
    <div className="herr">
      <label className="campo">¿Quién tomó estas fotos?
        <input
          type="text" value={autor} maxLength={60} placeholder="Nombre de quien tomó la foto" autoComplete="name"
          onChange={(e) => setAutor(e.target.value)} onBlur={() => lsSet("marana-autor", autor.trim())}
        />
      </label>
      <div className="fila">
        <span className="btn btn-primario subir">Agregar fotos
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="Agregar fotos" onChange={cambiar} />
        </span>
      </div>
      <p className="pista">Usa las fotos originales en JPG, tomadas con la ubicación del celular activada: el programa lee las coordenadas guardadas dentro de la foto. Si una foto no las trae, escribe el lugar a mano con “Editar”.</p>
      <ul className="subidas" aria-live="polite">
        {lista.map((x) => <li key={x.id} className={x.err ? "err" : ""}>{x.texto}</li>)}
      </ul>
    </div>
  );
}

export default function Coleccion({ real, demos, cargada, preparando, onArchivo, onEditar, onEliminar }) {
  const [mostrar, setMostrar] = useState(PAGINA);
  const hay = real.length > 0;
  const list = hay ? real : demos;
  const conGeo = real.filter(hasGeo).length;

  let datos;
  if (hay) {
    const porFuente = { commons: 0, mapillary: 0, grupo: 0 };
    for (const it of real) porFuente[it.kind === "coleccion" ? it.fuente : "grupo"]++;
    const partes = Object.entries(porFuente).filter(([, n]) => n).map(([k, n]) => `${FUENTES[k]} ${n}`);
    datos = `${real.length} fotos reales (${partes.join(" · ")}) · ${conGeo} con ubicación`;
    if (preparando.listos < preparando.total) datos += ` · preparando ${preparando.listos}/${preparando.total}`;
  } else datos = cargada ? "Aún no hay fotos reales · 6 imágenes de prueba" : "Cargando la colección…";

  const banda = "Modo local: las fotos que agregues se analizan en este navegador y se pierden al cerrar la página.";

  const pts = useMemo(() => real.filter(hasGeo).map((it) => ({ lat: it.lat, lon: it.lon })), [real]);
  const capAtlas = pts.length ? `Dónde se tomaron las fotos · ${pts.length} ${pts.length === 1 ? "punto" : "puntos"}` : "Aquí aparecerán los puntos de las fotos con ubicación";
  const faltan = list.length - Math.min(mostrar, list.length);

  return (
    <section className="coleccion" aria-labelledby="col-cab">
      <div className="col-top">
        <div>
          <h2 className="seccion-cab" id="col-cab">La colección</h2>
          <p className="col-datos">{datos}</p>
          <p className="banda">{banda}</p>
          <Subir onArchivo={onArchivo} />
        </div>
        <figure className="atlas">
          <Mapa pts={pts} label="Mapa de las fotos de la colección" />
          <figcaption>{capAtlas}</figcaption>
        </figure>
      </div>
      <div className="rejilla">
        {list.slice(0, mostrar).map((it) => <Ficha key={it.id} it={it} onEditar={onEditar} onEliminar={onEliminar} />)}
      </div>
      {faltan > 0 && <button className="btn mas" type="button" onClick={() => setMostrar((m) => m + PAGINA)}>Mostrar más fotos ({faltan} más)</button>}
    </section>
  );
}
