import Engine from "./engine.js";
import { fullFeat } from "./coleccion.js";
import { frame } from "./util.js";

/* Busca el dibujo (variantes V) en todas las fotos activas.
   isStale(): true si ya empezó otra búsqueda (se abandona).
   Devuelve null si se abandonó, o la lista de resultados. */
export async function buscar(V, items, isStale) {
  const out = [];
  const rank = [];
  let t = performance.now();
  // etapa 1: ordenar todas con la versión liviana
  for (const it of items) {
    let best = 0;
    for (const v of V.lista) best = Math.max(best, Engine.coarseRank(it.low, v.dr));
    rank.push({ it, s: best });
    if (performance.now() - t > 30) { await frame(); if (isStale()) return null; t = performance.now(); }
  }
  rank.sort((a, b) => b.s - a.s);
  // la etapa 1 es aproximada: con muchas fotos se revisa a fondo una parte mayor
  const TOP = Math.max(32, Math.ceil(rank.length * 0.45));
  const sel = rank.slice(0, TOP);
  // etapa 2: búsqueda completa en las mejores
  for (const x of sel) {
    const feat = fullFeat(x.it);
    const c = Engine.searchDrawing(feat, V);
    if (c) out.push({ it: x.it, feat, c });
    if (performance.now() - t > 30) { await frame(); if (isStale()) return null; t = performance.now(); }
  }
  if (isStale()) return null;
  return out;
}

// decide qué cuenta como “encontrada” y en qué orden
export function clasificar(results) {
  for (const r of results) {
    r.pasaFinal = !!r.c.pasa;
    r.combinado = r.c.Q;
  }
  const enc = results.filter((r) => r.pasaFinal).sort((a, b) => b.combinado - a.combinado);
  const apr = results.filter((r) => !r.pasaFinal).sort((a, b) => b.combinado - a.combinado).slice(0, 3);
  return { enc, apr };
}

export function consejoComplejo(V) {
  const c = V.complejidad;
  const que = c.trazos > 3 ? `${c.trazos} trazos` : "muchas curvas";
  return `Tu dibujo es complejo (${que}): prueba algo más simple, de preferencia de un solo trazo continuo.`;
}
