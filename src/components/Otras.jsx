import { useEffect, useRef } from "react";
import Engine from "../lib/engine.js";
import { imageOf } from "../lib/coleccion.js";
import { codeOf, lugarPrincipal, pct } from "../lib/util.js";

function Miniatura({ r, orden }) {
  const ref = useRef(null);
  useEffect(() => {
    let muerto = false;
    (async () => {
      await new Promise((res) => setTimeout(res, orden * 40));
      try {
        const img = await imageOf(r.it);
        if (muerto) return;
        const L = Engine.buildLayers(img, r.it.w, r.it.h, r.feat, r.c.drVar, r.c, 260, r.c);
        Engine.paint(ref.current, L, "reveal", 1);
      } catch (e) { /* miniatura omitida */ }
    })();
    return () => { muerto = true; };
  }, [r, orden]);
  return <canvas ref={ref} width={260} height={260} />;
}

export default function Otras({ lista, aprox, modo, actual, onElegir }) {
  const apr = modo === "aproximadas";
  const list = apr ? aprox : lista;
  return (
    <section className="otras" aria-labelledby="otras-cab">
      <h2 className="seccion-cab" id="otras-cab">{apr ? "Aproximadas" : "Las más parecidas"}</h2>
      <p className="pista">{apr ? "No superan el umbral: los cables se acercan a tu forma, pero no la dibujan con claridad." : ""}</p>
      <div className="otras-lista">
        {list.map((r, i) => (
          <button key={r.it.id} type="button" className="otra" aria-current={r === actual} onClick={() => onElegir(r)}>
            <Miniatura r={r} orden={i} />
            <span>
              {!r.pasaFinal && <span className="marca-chip">Aproximada</span>}
              <b>{pct(r.c.Q)}%</b>
              {" · " + (r.it.kind === "demo" ? codeOf(r.it) : lugarPrincipal(r.it))}
              {r.it.kind === "coleccion" && ` · Foto: ${r.it.autor || "autor desconocido"}, ${r.it.licencia || "licencia sin indicar"}`}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
