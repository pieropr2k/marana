/* EXIF: GPS y fecha dentro de un JPG */
export function readExif(buf) {
  try {
    const v = new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
    let off = 2;
    while (off + 4 <= v.byteLength) {
      const marker = v.getUint16(off);
      if ((marker & 0xff00) !== 0xff00) return null;
      if (marker === 0xffda || marker === 0xffd9) return null;
      const len = v.getUint16(off + 2);
      if (marker === 0xffe1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966 && v.getUint16(off + 8) === 0) return parseTiff(v, off + 10);
      off += 2 + len;
    }
  } catch (e) { /* un EXIF dañado no impide subir la foto */ }
  return null;
}
function parseTiff(v, start) {
  const le = v.getUint16(start) === 0x4949;
  const u16 = (o) => v.getUint16(start + o, le), u32 = (o) => v.getUint32(start + o, le);
  if (u16(2) !== 42) return null;
  const ascii = (type, count, valOff) => {
    const at = count > 4 ? u32(valOff) : valOff;
    let s = "";
    for (let i = 0; i < count; i++) { const c = v.getUint8(start + at + i); if (!c) break; s += String.fromCharCode(c); }
    return s;
  };
  const rationals = (at, n) => { const o = []; for (let i = 0; i < n; i++) { const a = u32(at + 8 * i), b = u32(at + 8 * i + 4); o.push(b ? a / b : 0); } return o; };
  const readIFD = (o, cb) => { const n = u16(o); for (let i = 0; i < n; i++) { const e = o + 2 + i * 12; cb(u16(e), u16(e + 2), u32(e + 4), e + 8); } };
  const res = {};
  let exifPtr = 0, gpsPtr = 0;
  readIFD(u32(4), (tag, type, count, valOff) => {
    if (tag === 0x8769) exifPtr = u32(valOff);
    else if (tag === 0x8825) gpsPtr = u32(valOff);
    else if (tag === 0x0132) res.dateTime = ascii(type, count, valOff);
  });
  if (exifPtr) readIFD(exifPtr, (tag, type, count, valOff) => { if (tag === 0x9003) res.dateOriginal = ascii(type, count, valOff); });
  if (gpsPtr) {
    let latRef = "N", lonRef = "E", lat = null, lon = null;
    readIFD(gpsPtr, (tag, type, count, valOff) => {
      if (tag === 1) latRef = String.fromCharCode(v.getUint8(start + valOff));
      else if (tag === 2 && type === 5) lat = rationals(u32(valOff), 3);
      else if (tag === 3) lonRef = String.fromCharCode(v.getUint8(start + valOff));
      else if (tag === 4 && type === 5) lon = rationals(u32(valOff), 3);
    });
    if (lat && lon) {
      let la = lat[0] + lat[1] / 60 + lat[2] / 3600, lo = lon[0] + lon[1] / 60 + lon[2] / 3600;
      if (latRef === "S") la = -la;
      if (lonRef === "W") lo = -lo;
      if (isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 && !(la === 0 && lo === 0)) { res.lat = la; res.lon = lo; }
    }
  }
  const d = res.dateOriginal || res.dateTime;
  const m = d && /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(d);
  if (m && m[1] !== "0000") res.fecha = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  return res;
}
