export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
export const reduceMotion = () => typeof window !== "undefined" && window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
export const pad2 = (n) => String(n).padStart(2, "0");
export const pad3 = (n) => String(n).padStart(3, "0");
export const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const httpsUrl = (u) => (typeof u === "string" && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : "");
export const txt = (s, n) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");
export const num = (v, lim) => (typeof v === "number" && isFinite(v) && Math.abs(v) <= lim ? v : null);
export const pct = (q) => Math.round(100 * clamp(q, 0, 1));
export const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
export const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } };

export const NOMBRE_CIUDAD = {
  lima: "Lima", callao: "Callao", arequipa: "Arequipa", cusco: "Cusco", trujillo: "Trujillo",
  piura: "Piura", chiclayo: "Chiclayo", iquitos: "Iquitos", huancayo: "Huancayo",
};
export const FUENTES = { commons: "Wikimedia Commons", mapillary: "Mapillary", grupo: "el grupo" };

function dms(v, pos, neg) {
  const s = v < 0 ? neg : pos;
  const a = Math.abs(v);
  let d = Math.floor(a), m = Math.floor((a - d) * 60), sec = Math.round(((a - d) * 60 - m) * 60);
  if (sec === 60) { sec = 0; m += 1; }
  if (m === 60) { m = 0; d += 1; }
  return `${d}°${pad2(m)}'${pad2(sec)}" ${s}`;
}
export const fmtCoords = (lat, lon) => `${dms(lat, "N", "S")} · ${dms(lon, "E", "O")}`;
export function fmtFecha(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return "";
  try { return new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long", year: "numeric" }).format(new Date(+m[1], +m[2] - 1, +m[3])); }
  catch (e) { return `${m[3]}/${m[2]}/${m[1]}`; }
}
export const mapsUrl = (lat, lon) => `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}`;
export const hasGeo = (it) => typeof it.lat === "number" && typeof it.lon === "number" && isFinite(it.lat) && isFinite(it.lon);
export const esReal = (it) => it && it.kind !== "demo";
export function codeOf(it) {
  if (it.kind === "demo") return `Prueba ${pad2(it.code)}`;
  return `Maraña Nº ${pad3(it.code)}`;
}
export function lugarPrincipal(it) {
  if (it.kind === "demo") return "Imagen de prueba";
  if (it.lugarTexto) return it.lugarTexto;
  const l = it.lugar || {};
  return l.calle || l.zona || (l.distrito ? "Distrito de " + l.distrito : "") || (it.ciudad ? "Cerca de " + (NOMBRE_CIUDAD[it.ciudad] || it.ciudad) : "Lugar sin escribir");
}
export function zonaDe(it) {
  const l = it.lugar || {};
  const partes = [];
  if (l.calle && l.zona && l.zona !== l.calle) partes.push(l.zona);
  if (l.distrito) partes.push(l.distrito);
  const ciudad = l.ciudad || NOMBRE_CIUDAD[it.ciudad] || "";
  if (ciudad && !partes.includes(ciudad)) partes.push(ciudad);
  if (l.region && !partes.includes(l.region)) partes.push(l.region);
  return partes.join(" · ");
}
export function errText(e) {
  return (e && e.message) || "error desconocido.";
}
