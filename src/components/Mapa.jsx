import { useMemo } from "react";
import { GEO } from "../lib/geo.js";
import { reduceMotion } from "../lib/util.js";

const LIMA_BOX = [-77.2, -12.27, -76.83, -11.82];
const inLima = (p) => p.lon > -77.35 && p.lon < -76.5 && p.lat > -12.65 && p.lat < -11.45;
const W = 240, H = 240;

function projector(ext) {
  const [x0, y0, x1, y1] = ext;
  const k = Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
  const s = Math.min(W / ((x1 - x0) * k), H / (y1 - y0));
  const ox = (W - (x1 - x0) * k * s) / 2, oy = (H - (y1 - y0) * s) / 2;
  return (lon, lat) => [ox + (lon - x0) * k * s, oy + (y1 - lat) * s];
}
function ringPath(r, P) {
  let d = "";
  for (let i = 0; i < r.length; i += 2) { const [x, y] = P(r[i], r[i + 1]); d += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1); }
  return d + "Z";
}

// mapa esquemático: Lima y Callao si todos los puntos caen ahí; si no, todo el Perú
export function mapaVista(pts) {
  if (!pts.length || pts.every(inLima)) {
    let [x0, y0, x1, y1] = LIMA_BOX;
    for (const p of pts) { x0 = Math.min(x0, p.lon - 0.03); x1 = Math.max(x1, p.lon + 0.03); y0 = Math.min(y0, p.lat - 0.03); y1 = Math.max(y1, p.lat + 0.03); }
    return { ext: [x0, y0, x1, y1], polys: GEO.lima, outline: GEO.limaOutline, caption: "Lima y Callao" };
  }
  return { ext: [-81.6, -18.6, -68.4, 0.3], polys: GEO.deps, outline: null, caption: "Perú" };
}

export default function Mapa({ pts, label }) {
  const { tierra, contorno, puntos } = useMemo(() => {
    const { ext, polys, outline } = mapaVista(pts);
    const P = projector(ext);
    const tierra = [], contorno = [];
    polys.forEach((p, i) => p.r.forEach((r, j) => tierra.push({ k: `${i}-${j}`, d: ringPath(r, P) })));
    if (outline) outline.forEach((r, i) => contorno.push({ k: String(i), d: ringPath(r, P) }));
    const puntos = pts.map((p, i) => { const [x, y] = P(p.lon, p.lat); return { k: i, x: x.toFixed(1), y: y.toFixed(1), hi: !!p.hi }; });
    return { tierra, contorno, puntos };
  }, [pts]);
  const many = pts.length > 1;
  const anim = !reduceMotion();
  return (
    <svg className="mapa" viewBox="0 0 240 240" role="img" aria-label={label}>
      <rect className="m-mar" width={W} height={H} />
      {tierra.map((t) => <path key={t.k} className="m-tierra" d={t.d} />)}
      {contorno.map((t) => <path key={"c" + t.k} className="m-contorno" d={t.d} />)}
      <text className="m-texto" x="10" y={H - 12}>Océano Pacífico</text>
      {puntos.map((p) => (
        <g key={p.k}>
          {p.hi && anim && <circle className="m-onda" cx={p.x} cy={p.y} r="7" />}
          <circle className={many ? "m-punto-chico" : "m-punto"} cx={p.x} cy={p.y} r={many ? 3.5 : 6} />
        </g>
      ))}
    </svg>
  );
}
