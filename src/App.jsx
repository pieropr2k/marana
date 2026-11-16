import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Engine from "./lib/engine.js";
import { readExif } from "./lib/exif.js";
import { buildDemos, cargarColeccion, decodeFile, imageOf, olvidar, prepararItem, prepararTodo, toJpeg } from "./lib/coleccion.js";
import { buscar, clasificar, consejoComplejo } from "./lib/search.js";
import { nombreArchivo, postal, presetNormalized } from "./lib/dibujo.js";
import { clamp, pct } from "./lib/util.js";
import Lienzo from "./components/Lienzo.jsx";
import Escenario from "./components/Escenario.jsx";
import Cartela from "./components/Cartela.jsx";
import Otras from "./components/Otras.jsx";
import Coleccion from "./components/Coleccion.jsx";
import Nuestras from "./components/Nuestras.jsx";
import { cargarNuestras } from "./lib/nuestras.js";
import Editor from "./components/Editor.jsx";
import { Cabecera, Como, Fuentes } from "./components/Info.jsx";
import Navbar from "./components/Navbar.jsx";

const paginaActual = () => {
  const h = window.location.hash.replace(/^#\/?/, "");
  return h === "coleccion" || h === "nuestras" || h === "info" ? h : "buscar";
};


export default function App() {
  const [strokes, setStrokes] = useState([]);
  const [coleccion, setColeccion] = useState([]);
  const [locales, setLocales] = useState([]);
  const [nuestras, setNuestras] = useState([]);
  const [progNuestras, setProgNuestras] = useState({ total: 0, listos: 0 });
  const [demos, setDemos] = useState([]);
  const [cargada, setCargada] = useState(false);
  const [preparando, setPreparando] = useState({ total: 0, listos: 0 });
  const [, setTick] = useState(0);
  const redibujar = () => setTick((n) => n + 1);

  const [msg, setMsg] = useState("Cargando la colección…");
  const [buscando, setBuscando] = useState(false);
  const [fase, setFase] = useState("inicio"); // inicio | buscando | vacio | resultado
  const [variantes, setVariantes] = useState(null);
  const [lista, setLista] = useState([]);
  const [aprox, setAprox] = useState([]);
  const [modo, setModo] = useState("encontradas");
  const [shown, setShown] = useState(null); // { r, img, layers }
  const [padFlags, setPadFlags] = useState(null);
  const [sinResultado, setSinResultado] = useState(false);
  const [view, setView] = useState("reveal");
  const [showStroke, setShowStroke] = useState(false);
  const [editando, setEditando] = useState(null);

  const [page, setPage] = useState(paginaActual);
  useEffect(() => {
    const onHash = () => { setPage(paginaActual()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const [paso, setPaso] = useState("dibujar"); // móvil: dibujar | resultado
  const listoRef = useRef(false);
  const canvasRef = useRef(null);
  const tokenRef = useRef(0);
  const drawingRef = useRef(null);
  const resultsRef = useRef([]);
  const arranque = useRef(false);

  // las funciones asíncronas leen siempre lo último
  const S = useRef({});
  S.current = { strokes, coleccion, locales, nuestras, demos, shown, page, listo: listoRef.current };

  const stageSize = () => {
    const r = canvasRef.current.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    return clamp(Math.round((r.width || 480) * dpr), 320, 1100);
  };

  const showResult = useCallback(async (r, token = tokenRef.current, dr = drawingRef.current) => {
    if (!r) return;
    let img;
    try { img = await imageOf(r.it); } catch (e) { setMsg("No se pudo abrir esta foto."); return; }
    if (token !== tokenRef.current) return;
    const cv = canvasRef.current;
    const O = stageSize();
    cv.width = cv.height = O;
    const layers = Engine.buildLayers(img, r.it.w, r.it.h, r.feat, r.c.drVar, r.c, O, r.c);
    setShown({ r, img, layers });
    setFase("resultado");
    setPadFlags({ dr, flags: r.c.flags });
    setSinResultado(false);
  }, []);

  const runSearch = useCallback(async (strokesAB, src = S.current) => {
    const token = ++tokenRef.current;
    const isStale = () => token !== tokenRef.current;
    const V = Engine.variantes(strokesAB.map((s) => s.map((p) => ({ x: p.x * 600, y: p.y * 600 }))));
    if (!V) {
      setMsg(strokesAB.length ? "Dibuja la forma un poco más grande." : "Primero dibuja una forma en el lienzo.");
      return;
    }
    setPadFlags(null);
    const real = src.coleccion.concat(src.nuestras || [], src.locales);
    const demo = !real.length;
    const items = demo ? src.demos.filter((d) => d.low) : real.filter((it) => it.low && !it.error);
    if (!items.length) { setMsg(real.length ? "Todavía estoy preparando las fotos…" : "No hay fotos en la colección."); return; }
    setBuscando(true);
    setMsg(`Buscando tu forma en ${items.length} ${items.length === 1 ? "foto" : "fotos"}…`);
    let out;
    try {
      out = await buscar(V, items, isStale);
    } finally {
      if (!isStale()) setBuscando(false);
    }
    if (out === null || isStale()) return;
    resultsRef.current = out;
    drawingRef.current = V.full;
    setVariantes(V);
    const { enc, apr } = clasificar(out);
    setLista(enc.slice(0, 5));
    setAprox(apr);
    setModo(enc.length ? "encontradas" : "aproximadas");
    setMsg("");
    if (enc.length) await showResult(enc[0], token, V.full);
    else if (apr.length) await showResult(apr[0], token, V.full);   // la mejor, marcada como "Aproximada" (sello y cartela)
    else {
      setShown(null);
      setPadFlags(null);
      setFase("vacio");
      setSinResultado(true);
    }
    // en móvil, al terminar la búsqueda se pasa a la pantalla de resultados
    if (!isStale() && S.current.listo && S.current.page === "buscar") { setPaso("resultado"); window.scrollTo(0, 0); }
  }, [showResult]);

  const dibujarOtraVez = () => {
    setStrokes([]);
    setPadFlags(null);
    setSinResultado(false);
    setPaso("dibujar");
    window.scrollTo(0, 0);
  };

  /* =================== arranque =================== */
  useEffect(() => {
    if (arranque.current) return;
    arranque.current = true;
    (async () => {
      try {
        const strokes0 = S.current.strokes;
        const col = await cargarColeccion();
        let ds = [];
        if (col.length) {
          setColeccion(col);
          await prepararTodo(col, (listos, total) => {
            setPreparando({ listos, total });
            if (listos < total) setMsg(`Preparando las fotos… ${listos}/${total}`);
          });
        } else ds = await buildDemos();
        // fotos del equipo (fotos_final): se analizan en el navegador y entran a la búsqueda como las demás
        let nu = [];
        try {
          nu = await cargarNuestras((listos, total) => {
            setProgNuestras({ listos, total });
            if (listos < total) setMsg(`Preparando las fotos nuestras… ${listos}/${total}`);
          });
        } catch (e) { /* sin fotos nuestras */ }
        setNuestras(nu);
        setDemos(ds);
        setCargada(true);
        if (strokes0.length) await runSearch(strokes0, { coleccion: col, nuestras: nu, locales: [], demos: ds });
        else setMsg("");
        listoRef.current = true;
      } catch (e) {
        setMsg("Algo falló al iniciar: " + (e && e.message));
      }
    })();
  }, [runSearch]);

  // al cambiar el tamaño de la ventana, el resultado se vuelve a armar a la nueva resolución
  useEffect(() => {
    let t = 0;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const sh = S.current.shown;
        if (sh && S.current.page === "buscar" && canvasRef.current && Math.abs(stageSize() - canvasRef.current.width) > 40) showResult(sh.r);
      }, 200);
    };
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); clearTimeout(t); };
  }, [showResult]);

  /* =================== dibujo =================== */
  const alEditar = useCallback(() => { setPadFlags(null); setSinResultado(false); }, []);
  const onForma = (nombre) => {
    const s = presetNormalized(nombre);
    setStrokes(s);
    alEditar();
    runSearch(s);
  };

  const leyenda = useMemo(() => {
    if (padFlags && shown) {
      const r = shown.r;
      const p = pct(r.c.covTotal);
      const partes = [{ b: `Coincide el ${p}% de tu dibujo.` }, " En negro, lo que está en los cables"];
      if (p < 100) partes.push("; en rojo punteado, lo que no se encontró");
      partes.push(".");
      if (variantes && variantes.complejidad.complejo && !r.pasaFinal) partes.push(" " + consejoComplejo(variantes));
      return partes;
    }
    if (sinResultado && variantes && variantes.complejidad.complejo) return [{ b: "Sin resultado." }, " " + consejoComplejo(variantes)];
    return null;
  }, [padFlags, shown, sinResultado, variantes]);

  const complejo = !!(variantes && variantes.complejidad.complejo);
  const vacioTexto = fase === "vacio"
    ? (complejo ? consejoComplejo(variantes) : "Abajo están las 3 más cercanas, marcadas como aproximadas. Prueba con un trazo más simple o más grande.")
    : "";
  const metaVacio = fase === "vacio"
    ? (aprox.length ? "Abajo están las 3 más cercanas, marcadas como aproximadas. Ninguna supera el umbral mínimo de parecido." : "Ninguna foto se acerca a esa forma.") + (complejo ? " " + consejoComplejo(variantes) : "")
    : "";

  /* =================== postal =================== */
  const guardarPostal = async () => {
    const sh = S.current.shown;
    if (!sh) return;
    const blob = await postal({ r: sh.r, img: sh.img, strokes: S.current.strokes });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivo(sh.r.it);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  /* =================== fotos propias =================== */
  const numerar = (arr, base) => { arr.forEach((p, i) => (p.code = base + i + 1)); return arr; };

  const agregarArchivo = async (file, autor, poner) => {
    const ex = readExif(await file.arrayBuffer()) || {};
    const { im, url } = await decodeFile(file);
    const { blob, w, h, canvas } = await toJpeg(im);
    URL.revokeObjectURL(url);
    const det = Engine.detect(canvas, w, h);
    const enc = Engine.encodeDet(det);
    const meta = { lat: ex.lat ?? null, lon: ex.lon ?? null, fecha: ex.fecha ?? null };
    const gpsTxt = meta.lat !== null ? "con GPS" : "sin GPS: escribe el lugar con Editar";
    const it = {
      id: "local-" + Math.random().toString(36).slice(2), kind: "local", src: URL.createObjectURL(blob), w, h, det, enc,
      lat: meta.lat, lon: meta.lon, fecha: meta.fecha, lugarTexto: "", autor, lugar: {},
    };
    prepararItem(it);
    it.det = null;
    const cur = S.current;
    const next = numerar([...cur.locales, it], cur.coleccion.length);
    setLocales(next);
    poner(`lista (solo en este navegador), ${gpsTxt}`);
    if (cur.strokes.length) runSearch(cur.strokes, { coleccion: cur.coleccion, nuestras: cur.nuestras, locales: next, demos: cur.demos });
  };

  const eliminar = async (it) => {
    const cur = S.current;
    const next = numerar(cur.locales.filter((p) => p !== it), cur.coleccion.length);
    URL.revokeObjectURL(it.src);
    olvidar(it);
    setLocales(next);
    if (resultsRef.current.some((r) => r.it === it)) runSearch(cur.strokes, { coleccion: cur.coleccion, nuestras: cur.nuestras, locales: next, demos: cur.demos });
  };

  const guardarEdicion = (datos) => {
    Object.assign(editando, datos);
    setEditando(null);
    redibujar();
  };

  const real = useMemo(() => coleccion.concat(locales), [coleccion, locales]);
  const todas = useMemo(() => coleccion.concat(nuestras, locales), [coleccion, nuestras, locales]);

  return (
    <>
      <Navbar page={page} />
      <div hidden={page !== "buscar"} className={"paso-" + paso}>
      <Cabecera />
      <main className="wrap">
        <p className="aviso-movil" aria-live="polite">{msg}</p>
        <div className="otra-vez">
          <button className="btn btn-primario" type="button" onClick={dibujarOtraVez}>Dibujar otra vez</button>
        </div>
        <section className="diptico" aria-label="Dibujo y resultado">
          <Lienzo
            strokes={strokes} setStrokes={setStrokes} padFlags={padFlags} leyenda={leyenda} buscando={buscando}
            onEditStart={alEditar} onBuscar={() => runSearch(strokes)} onForma={onForma}
          />
          <Escenario
            canvasRef={canvasRef} shown={shown} vacioTexto={vacioTexto} msg={msg}
            view={view} setView={setView} showStroke={showStroke} setShowStroke={setShowStroke}
          />
        </section>

        <Cartela estado={fase} r={shown && shown.r} metaVacio={metaVacio} onPostal={guardarPostal} />

        <Otras lista={lista} aprox={aprox} modo={modo} actual={shown && shown.r} onElegir={(r) => showResult(r)} />

        <div className="otra-vez">
          <button className="btn btn-primario" type="button" onClick={dibujarOtraVez}>Dibujar otra vez</button>
        </div>

        <p className="pie">Maraña · proyecto de arte y tecnología · Perú, 2026</p>
      </main>
      </div>

      {page === "coleccion" && (
        <main className="wrap pagina">
          <Coleccion
            real={real} demos={demos} cargada={cargada} preparando={preparando}
            onArchivo={agregarArchivo} onEditar={setEditando} onEliminar={eliminar}
          />
          <p className="pie">Maraña · proyecto de arte y tecnología · Perú, 2026</p>
        </main>
      )}

      {page === "nuestras" && (
        <main className="wrap pagina">
          <Nuestras fotos={nuestras} progreso={progNuestras} />
          <p className="pie">Maraña · proyecto de arte y tecnología · Perú, 2026</p>
        </main>
      )}

      {page === "info" && (
        <main className="wrap pagina">
          <Como />
          <Fuentes real={todas} />
          <p className="pie">Maraña · proyecto de arte y tecnología · Perú, 2026</p>
        </main>
      )}

      {editando && <Editor it={editando} onCerrar={() => setEditando(null)} onGuardar={guardarEdicion} />}
    </>
  );
}

