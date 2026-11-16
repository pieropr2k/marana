import { useMemo } from "react";
import Mapa from "./Mapa.jsx";
import { Ficha } from "./Coleccion.jsx";
import { hasGeo } from "../lib/util.js";

const NADA = () => {};

export default function Nuestras({ fotos, progreso }) {
  const pts = useMemo(() => fotos.filter(hasGeo).map((it) => ({ lat: it.lat, lon: it.lon })), [fotos]);
  const cargando = progreso.listos < progreso.total;
  let datos = fotos.length ? `${fotos.length} fotos tomadas por el equipo · ${pts.length} con ubicación` : cargando ? "Cargando las fotos…" : "Todavía no hay fotos del equipo.";
  if (cargando && fotos.length) datos += ` · analizando ${progreso.listos}/${progreso.total}`;

  return (
    <section className="coleccion" aria-labelledby="nuestras-cab">
      <div className="col-top">
        <div>
          <h2 className="seccion-cab" id="nuestras-cab">Fotos nuestras</h2>
          <p className="col-datos">{datos}</p>
          <p className="banda">Estas fotos las tomó el equipo de Maraña. También participan en la búsqueda: cuando dibujas un trazo, compiten con las demás fotos por coincidir con él.</p>
        </div>
        {pts.length > 0 && (
          <figure className="atlas">
            <Mapa pts={pts} label="Mapa de las fotos nuestras" />
            <figcaption>{`Dónde se tomaron · ${pts.length} ${pts.length === 1 ? "punto" : "puntos"}`}</figcaption>
          </figure>
        )}
      </div>
      <div className="rejilla">
        {fotos.map((it) => <Ficha key={it.id} it={it} onEditar={NADA} onEliminar={NADA} />)}
      </div>
    </section>
  );
}
