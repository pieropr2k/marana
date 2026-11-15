/* Reconocedor de figuras (formas.onnx, entrenado con entrenamiento/formas_kaggle.ipynb).
   Solo SUGIERE: si no carga o no está seguro, la app sigue igual. El modelo y el runtime se bajan
   la primera vez que el usuario dibuja. */

import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import mjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url";

const BASE = import.meta.env.BASE_URL;

// mismo orden que LABELS en el notebook
export const ETIQUETAS = ["circulo", "corazon", "estrella", "triangulo", "cuadrado", "espiral", "rayo", "ola", "otro"];
export const NOMBRES = { circulo: "círculo", corazon: "corazón", estrella: "estrella", triangulo: "triángulo", cuadrado: "cuadrado", espiral: "espiral", rayo: "rayo", ola: "cable colgando" };

// confianza mínima para sugerir (el notebook imprime el umbral recomendado en la sección 3)
export const UMBRAL = 0.9;

// contrato de preprocesado con el entrenamiento
const SIZE = 64, FIT = 0.8, GROSOR = 2.5;

let cargando = null;
function cargar() {
  if (!cargando) {
    cargando = (async () => {
      const ort = await import("onnxruntime-web/wasm");
      ort.env.wasm.wasmPaths = { mjs: mjsUrl, wasm: wasmUrl };   // Vite sirve ambos como assets (también en dev)
      ort.env.wasm.numThreads = 1;      // sin hilos: no exige cabeceras COOP/COEP
      const sesion = await ort.InferenceSession.create(BASE + "datos/formas.onnx", { executionProviders: ["wasm"] });
      return { ort, sesion };
    })();
    cargando.catch(() => { cargando = null; });   // permite reintentar si falló la red
  }
  return cargando;
}
export const precargarFormas = () => { cargar().catch(() => {}); };

// trazos normalizados (0..1) -> Float32Array [64*64] en 0..1
export function rasterizar(strokes) {
  const pts = strokes.flat();
  if (pts.length < 5) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  const span = Math.max(x1 - x0, y1 - y0);
  if (span < 0.06) return null;          // un punto o una raya diminuta: no hay figura que reconocer
  const s = (FIT * SIZE) / span, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const cv = document.createElement("canvas");
  cv.width = cv.height = SIZE;
  const x = cv.getContext("2d", { willReadFrequently: true });
  x.fillStyle = "#000"; x.fillRect(0, 0, SIZE, SIZE);
  x.strokeStyle = "#fff"; x.lineWidth = GROSOR; x.lineCap = "round"; x.lineJoin = "round";
  for (const st of strokes) {
    if (!st.length) continue;
    x.beginPath();
    st.forEach((p, i) => { const px = (p.x - cx) * s + SIZE / 2, py = (p.y - cy) * s + SIZE / 2; if (i) x.lineTo(px, py); else x.moveTo(px, py); });
    if (st.length === 1) x.lineTo((st[0].x - cx) * s + SIZE / 2 + 0.01, (st[0].y - cy) * s + SIZE / 2);
    x.stroke();
  }
  const d = x.getImageData(0, 0, SIZE, SIZE).data;
  const out = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255;
  return out;
}

/* Devuelve { id, nombre, confianza } si reconoce una figura con confianza suficiente; si no, null. */
export async function reconocerForma(strokes) {
  try {
    const img = rasterizar(strokes);
    if (!img) return null;
    const { ort, sesion } = await cargar();
    const out = await sesion.run({ input: new ort.Tensor("float32", img, [1, 1, SIZE, SIZE]) });
    const p = out.probs.data;
    let k = 0;
    for (let i = 1; i < p.length; i++) if (p[i] > p[k]) k = i;
    const id = ETIQUETAS[k];
    if (id === "otro" || p[k] < UMBRAL || !NOMBRES[id]) return null;
    return { id, nombre: NOMBRES[id], confianza: p[k] };
  } catch (e) {
    return null;
  }
}
