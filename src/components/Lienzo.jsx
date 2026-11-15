import { useCallback, useEffect, useRef, useState } from "react";
import { clamp, css } from "../lib/util.js";
import { drawStrokesOn } from "../lib/dibujo.js";
import { precargarFormas, reconocerForma } from "../lib/formas.js";

const FORMAS = [
  ["circulo", "círculo"],
  ["ola", "cable colgando"],
  ["rayo", "rayo"],
  ["corazon", "corazón"],
];

const ARTICULO = { circulo: "un", corazon: "un", estrella: "una", triangulo: "un", cuadrado: "un", espiral: "una", rayo: "un", ola: "un" };

export default function Lienzo({ strokes, setStrokes, padFlags, leyenda, buscando, onEditStart, onBuscar, onForma }) {
  const cvRef = useRef(null);
  const live = useRef(null);
  const geo = useRef({ ctx: null, size: 0 });
  const latest = useRef({});
  latest.current = { strokes, padFlags };
  const [sugerencia, setSugerencia] = useState(null);   // { id, nombre } de la figura que parece haber dibujado
  const pedido = useRef(0);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const descartar = useCallback(() => { pedido.current++; clearTimeout(timer.current); setSugerencia(null); }, []);

  const redraw = useCallback(() => {
    const { ctx, size } = geo.current;
    if (!ctx) return;
    const { strokes, padFlags: pf } = latest.current;
    const todos = live.current ? [...strokes, live.current] : strokes;
    ctx.clearRect(0, 0, size, size);
    const lw = Math.max(3, size * 0.014);
    if (pf) {
      // el dibujo con marcas: negro = está en los cables, rojo punteado = no se encontró
      drawStrokesOn(ctx, todos, size, "rgba(19,20,21,0.18)", lw);
      const dr = pf.dr, starts = (dr.starts || [0]).concat([dr.n]);
      const P = (i) => [((dr.pts[2 * i] * dr.size + dr.center.x) / 600) * size, ((dr.pts[2 * i + 1] * dr.size + dr.center.y) / 600) * size];
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (let q = 0; q + 1 < starts.length; q++)
        for (let i = starts[q] + 1; i < starts[q + 1]; i++) {
          const ok = pf.flags[i] && pf.flags[i - 1];
          const [x0, y0] = P(i - 1), [x1, y1] = P(i);
          ctx.strokeStyle = ok ? (css("--tinta") || "#131415") : "#c2412b";
          ctx.lineWidth = ok ? lw : Math.max(2, lw * 0.6);
          ctx.setLineDash(ok ? [] : [lw * 1.6, lw * 1.4]);
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        }
      ctx.setLineDash([]);
    } else drawStrokesOn(ctx, todos, size, css("--tinta") || "#131415", lw);
  }, []);

  const medir = useCallback(() => {
    const cv = cvRef.current;
    const r = cv.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    geo.current = { ctx, size: r.width };
    redraw();
  }, [redraw]);

  useEffect(() => {
    medir();
    const ro = new ResizeObserver(() => medir());
    ro.observe(cvRef.current);
    return () => ro.disconnect();
  }, [medir]);

  useEffect(() => { redraw(); }, [strokes, padFlags, redraw]);

  // Ctrl/Cmd+Z deshace el último trazo
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !/input|textarea|select/i.test(e.target.tagName)) {
        e.preventDefault();
        setStrokes((s) => s.slice(0, -1));
        descartar();
        onEditStart();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setStrokes, onEditStart, descartar]);

  const ptOf = (e) => {
    const r = cvRef.current.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) };
  };
  const onDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    try { cvRef.current.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
    live.current = [ptOf(e)];
    descartar();
    precargarFormas();
    onEditStart();
    redraw();
  };
  const onMove = (e) => {
    if (!live.current) return;
    const co = e.nativeEvent.getCoalescedEvents ? e.nativeEvent.getCoalescedEvents() : [];
    for (const ev of co.length ? co : [e]) live.current.push(ptOf(ev));
    redraw();
  };
  const onEnd = () => {
    const st = live.current;
    if (!st) return;
    live.current = null;
    const todos = [...latest.current.strokes, st];
    setStrokes(todos);
    // si lo dibujado parece una figura conocida, se sugiere (el usuario decide)
    const n = ++pedido.current;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await reconocerForma(todos);
      if (n === pedido.current) setSugerencia(r ? { id: r.id, nombre: r.nombre } : null);
    }, 350);
  };

  const vacio = strokes.length === 0;
  return (
    <div className="panel">
      <h2 className="panel-cab"><span className="n">1</span> Tu trazo</h2>
      <div className="cuadro">
        <canvas
          ref={cvRef} className="lienzo" aria-label="Lienzo para dibujar una forma"
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onEnd} onPointerCancel={onEnd} onLostPointerCapture={onEnd}
        />
        {vacio && <p className="lienzo-pista">Dibuja aquí con el dedo o el mouse: uno o varios trazos</p>}
      </div>
      <p className="lienzo-leyenda" aria-live="polite" hidden={!leyenda}>
        {leyenda && leyenda.map((p, i) => (typeof p === "string" ? p : <strong key={i}>{p.b}</strong>))}
      </p>
      {sugerencia && (
        <p className="lienzo-leyenda sugerencia" role="status">
          ¿Quisiste dibujar {ARTICULO[sugerencia.id]} <strong>{sugerencia.nombre}</strong>?{" "}
          <button className="chip" type="button" onClick={() => { descartar(); onForma(sugerencia.id); }}>Usar {sugerencia.nombre}</button>
          <button className="chip" type="button" onClick={descartar}>No</button>
        </p>
      )}
      <div className="fila">
        <button className="btn btn-primario" type="button" disabled={buscando} onClick={onBuscar}>
          {buscando ? "Buscando…" : "Buscar en los cables"}
        </button>
        <button className="btn" type="button" disabled={vacio} onClick={() => { setStrokes((s) => s.slice(0, -1)); descartar(); onEditStart(); }}>Deshacer</button>
        <button className="btn" type="button" disabled={vacio} onClick={() => { setStrokes([]); descartar(); onEditStart(); }}>Borrar</button>
      </div>
      <div className="fila" role="group" aria-label="Formas de ejemplo">
        <span className="etiqueta">o prueba con:</span>
        {FORMAS.map(([id, nombre]) => (
          <button key={id} className="chip" type="button" onClick={() => onForma(id)}>{nombre}</button>
        ))}
      </div>
    </div>
  );
}
