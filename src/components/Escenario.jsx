import { useEffect, useRef } from "react";
import Engine from "../lib/engine.js";
import { reduceMotion } from "../lib/util.js";
import { dibujarCredito, paintFullInto } from "../lib/dibujo.js";

const VISTAS = [
  ["reveal", "Cables iluminados"],
  ["photo", "Foto"],
  ["full", "Foto completa"],
  ["machine", "Cómo lo ve la máquina"],
];

// parpadeo de un cable de alta tensión al prenderse
const PARPADEO = [[0, 0], [0.1, 0.75], [0.16, 0.08], [0.26, 0.9], [0.34, 0.28], [0.46, 1], [1, 1]];
function parpadeo(t) {
  for (let i = 1; i < PARPADEO.length; i++) {
    const [t1, v1] = PARPADEO[i], [t0, v0] = PARPADEO[i - 1];
    if (t <= t1) return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return 1;
}

export default function Escenario({ canvasRef, shown, vacioTexto, msg, view, setView, showStroke, setShowStroke }) {
  const anim = useRef(0);
  const prev = useRef({ shown: null, view: null });

  useEffect(() => {
    const cv = canvasRef.current;
    cancelAnimationFrame(anim.current);
    if (!shown) {
      const x = cv.getContext("2d");
      x.fillStyle = "#0e0f10";
      x.fillRect(0, 0, cv.width, cv.height);
      prev.current = { shown: null, view };
      return;
    }
    const pintar = (t = 1) => {
      if (view === "full") paintFullInto(cv.getContext("2d"), cv.width, shown.img, shown.r.it, shown.layers.crop);
      else Engine.paint(cv, shown.layers, view, t, showStroke && view !== "machine");
      dibujarCredito(cv, shown.r.it, view !== "full");
    };
    // solo se repite la animación si cambió la foto o la vista (no al marcar “mostrar mi trazo”)
    const cambio = prev.current.shown !== shown || prev.current.view !== view;
    prev.current = { shown, view };
    if (view !== "reveal" || reduceMotion() || !cambio) { pintar(1); return; }
    pintar(0);
    const t0 = performance.now() + 420, D = 1300;
    const step = (now) => {
      const t = (now - t0) / D;
      pintar(t < 0 ? 0 : parpadeo(Math.min(1, t)));
      if (t < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(anim.current);
  }, [shown, view, showStroke, canvasRef]);

  const sello = shown && (shown.r.it.kind === "demo" || !shown.r.pasaFinal)
    ? { texto: shown.r.it.kind === "demo" ? "Imagen de prueba" : "Aproximada", aprox: shown.r.it.kind !== "demo" }
    : null;

  return (
    <div className="panel">
      <h2 className="panel-cab"><span className="n">2</span> {shown && shown.r.it.kind !== "demo" && !shown.r.pasaFinal ? "Lo más parecido en los cables" : "Encontrado en los cables"}</h2>
      <div className="cuadro">
        <canvas ref={canvasRef} className="escenario" aria-label="Foto donde los cables forman tu dibujo" />
        {vacioTexto && (
          <div className="vacio">
            <div>
              <strong>No encontré una foto donde los cables formen esa forma</strong>
              <span>{vacioTexto}</span>
            </div>
          </div>
        )}
        {sello && <p className={"sello" + (sello.aprox ? " aprox" : "")}>{sello.texto}</p>}
        <p className="escenario-msg" aria-live="polite">{msg}</p>
      </div>
      <div className="fila" role="group" aria-label="Vista del resultado">
        {VISTAS.map(([id, nombre]) => (
          <button key={id} className="chip" type="button" aria-pressed={view === id} onClick={() => setView(id)}>{nombre}</button>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" checked={showStroke} onChange={(e) => setShowStroke(e.target.checked)} /> Mostrar mi trazo encima
      </label>
    </div>
  );
}
