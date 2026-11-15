import { useEffect, useRef, useState } from "react";
import { hasGeo } from "../lib/util.js";

export default function Editor({ it, onCerrar, onGuardar }) {
  const [lugar, setLugar] = useState(it.lugarTexto || "");
  const [autor, setAutor] = useState(it.autor || "");
  const [coords, setCoords] = useState(hasGeo(it) ? `${it.lat.toFixed(6)}, ${it.lon.toFixed(6)}` : "");
  const [err, setErr] = useState("");
  const lugarRef = useRef(null);

  useEffect(() => {
    lugarRef.current && lugarRef.current.focus();
    const onKey = (e) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  const enviar = (e) => {
    e.preventDefault();
    const raw = coords.trim();
    let lat = null, lon = null;
    if (raw) {
      const m = /^\s*(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/.exec(raw);
      if (!m) { setErr("Escribe las coordenadas así: -12.04640, -77.02830"); return; }
      lat = parseFloat(m[1].replace(",", ".")); lon = parseFloat(m[2].replace(",", "."));
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) { setErr("Esas coordenadas no existen. Revisa el orden: primero latitud, luego longitud."); return; }
    }
    onGuardar({ lugarTexto: lugar.trim().slice(0, 140), autor: autor.trim().slice(0, 60), lat, lon });
  };

  return (
    <div className="capa" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <form className="editor" onSubmit={enviar} aria-labelledby="ed-titulo" noValidate>
        <h3 id="ed-titulo">Editar foto</h3>
        <img src={it.thumb || it.src} alt="" />
        <label>Lugar
          <input ref={lugarRef} type="text" value={lugar} onChange={(e) => setLugar(e.target.value)} maxLength={140} placeholder="Ej.: Jr. Ucayali con Jr. Carabaya, Cercado de Lima" />
        </label>
        <label>Foto de
          <input type="text" value={autor} onChange={(e) => setAutor(e.target.value)} maxLength={60} />
        </label>
        <label>Coordenadas (latitud, longitud)
          <input type="text" value={coords} onChange={(e) => setCoords(e.target.value)} placeholder="-12.04640, -77.02830" inputMode="decimal" />
        </label>
        <p className="pista">Si la foto no trajo GPS: en Google Maps haz clic derecho sobre el lugar y copia las coordenadas que aparecen arriba del menú.</p>
        <p className="err" aria-live="assertive">{err}</p>
        <div className="fila">
          <button className="btn btn-primario" type="submit">Guardar</button>
          <button className="btn" type="button" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}
