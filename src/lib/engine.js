const Engine = (() => {
  const K = 12;             // número de direcciones (0°–180° en pasos de 15°)
  const PI = Math.PI;
  const WORK = 640;         // lado mayor de la imagen de trabajo
  const BH_R = 5;           // radio del filtro black-hat en la imagen de trabajo

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  function binOf(a, k = K) {
    let t = a % PI;
    if (t < 0) t += PI;
    return Math.round((t / PI) * k) % k;
  }
  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  function ctx2d(c) {
    return c.getContext("2d", { willReadFrequently: true });
  }

  /* ---------- morfología: máximo / mínimo móvil (van Herk–Gil-Werman) ---------- */
  function morph1D(src, dst, n, stride, offset, r, isMax, g, hb) {
    const k = 2 * r + 1, m = n + 2 * r;
    const pad = isMax ? -1e9 : 1e9;
    for (let i = 0; i < m; i++) {
      const j = i - r;
      const a = j < 0 || j >= n ? pad : src[offset + j * stride];
      if (i % k === 0) g[i] = a;
      else {
        const p = g[i - 1];
        g[i] = isMax ? (a > p ? a : p) : a < p ? a : p;
      }
    }
    for (let i = m - 1; i >= 0; i--) {
      const j = i - r;
      const a = j < 0 || j >= n ? pad : src[offset + j * stride];
      if (i === m - 1 || i % k === k - 1) hb[i] = a;
      else {
        const p = hb[i + 1];
        hb[i] = isMax ? (a > p ? a : p) : a < p ? a : p;
      }
    }
    for (let x = 0; x < n; x++) {
      const a = hb[x], b = g[x + k - 1];
      dst[offset + x * stride] = isMax ? (a > b ? a : b) : a < b ? a : b;
    }
  }
  function morph2D(src, w, h, r, isMax, tmp, out) {
    const m = Math.max(w, h) + 2 * r + 2;
    const g = new Float32Array(m), hb = new Float32Array(m);
    for (let y = 0; y < h; y++) morph1D(src, tmp, w, 1, y * w, r, isMax, g, hb);
    for (let x = 0; x < w; x++) morph1D(tmp, out, h, w, x, r, isMax, g, hb);
  }
  // black-hat = cierre(imagen) − imagen: resalta lo delgado y oscuro (cables)
  function blackHat(gray, w, h, r, keepClosing) {
    const n = w * h;
    const t1 = new Float32Array(n), t2 = new Float32Array(n), t3 = new Float32Array(n);
    morph2D(gray, w, h, r, true, t1, t2);
    morph2D(t2, w, h, r, false, t1, t3);
    const cl = keepClosing ? t3.slice() : null;
    for (let i = 0; i < n; i++) t3[i] -= gray[i];
    if (keepClosing) t3.closing = cl;
    return t3;
  }

  function pixelsFrom(source, w, h) {
    const c = makeCanvas(w, h);
    const x = ctx2d(c);
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = "high";
    x.drawImage(source, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h), skyc = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) {
      const r = d[j], gg = d[j + 1], b = d[j + 2];
      g[i] = 0.299 * r + 0.587 * gg + 0.114 * b;
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      skyc[i] = (mx - mn) / (mx + 1) < 0.24 || (b > r + 8 && b >= gg - 4) ? 1 : 0;
    }
    return { g, skyc };
  }
  // Cielo: región clara, lisa y de color gris/blanco/azul conectada con el borde superior. Se busca sobre
  // el “cierre” de la imagen (donde los cables ya se borraron), así los cables no la cortan.
  function skyMask(cl, skyc, w, h) {
    const n = w * h, ok = new Uint8Array(n);
    // variación local del cierre (ventana 7×7): el cielo es liso, las fachadas no
    const m1 = Float32Array.from(cl), m2 = new Float32Array(n);
    for (let i = 0; i < n; i++) m2[i] = cl[i] * cl[i];
    boxBlur(m1, w, h, 3);
    boxBlur(m2, w, h, 3);
    const A = 49;
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (cl[i] < 105 || !skyc[i]) continue;
        const mu = m1[i] / A, va = m2[i] / A - mu * mu;
        if (va > 30) continue;
        const gx = (cl[i + 1 - w] + 2 * cl[i + 1] + cl[i + 1 + w]) - (cl[i - 1 - w] + 2 * cl[i - 1] + cl[i - 1 + w]);
        const gy = (cl[i + w - 1] + 2 * cl[i + w] + cl[i + w + 1]) - (cl[i - w - 1] + 2 * cl[i - w] + cl[i - w + 1]);
        if (Math.abs(gx) + Math.abs(gy) < 36) ok[i] = 1;
      }
    // el cielo es lo que se ve desde el borde superior de cada columna hacia abajo, sin interrupciones
    // (se toleran huecos cortos: un atado grueso de cables o un letrero delgado no corta el cielo)
    const sky = new Uint8Array(n), G = 8;
    for (let x = 1; x < w - 1; x++) {
      let y = 1;
      while (y < h - 1) {
        if (ok[y * w + x]) { sky[y * w + x] = 1; y++; continue; }
        let k = 1;
        while (k <= G && y + k < h - 1 && !ok[(y + k) * w + x]) k++;
        if (k > G || y + k >= h - 1) break;
        y += k;
      }
    }
    // un cielo de verdad está arriba: cubre parte de la franja superior y casi nada de la inferior
    // (así un papel, una placa o una pared blanca que llenan la foto no pasan por cielo)
    let top = 0, topN = 0, bot = 0, botN = 0;
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        if (y < h * 0.12) { topN++; top += sky[y * w + x]; }
        else if (y > h * 0.75) { botN++; bot += sky[y * w + x]; }
      }
    if (top / Math.max(1, topN) < 0.2 || bot / Math.max(1, botN) > 0.35) sky.fill(0);
    return sky;
  }
  function grayFrom(source, sx, sy, sw, sh, w, h) {
    const c = makeCanvas(w, h);
    const x = ctx2d(c);
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = "high";
    x.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
    return g;
  }

  function thresholdOf(v) {
    const hist = new Uint32Array(256);
    let nz = 0;
    for (let i = 0; i < v.length; i++) {
      const b = v[i] | 0;
      hist[b > 255 ? 255 : b < 0 ? 0 : b]++;
      if (b > 0) nz++;
    }
    const target = v.length - Math.max(1, nz) * 0.005 - (v.length - nz) * 0;
    let acc = 0, p = 255;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= target) { p = i; break; }
    }
    return clamp(p * 0.38, 26, 70);
  }

  function hysteresis(v, w, h, th, tl) {
    const n = w * h, mask = new Uint8Array(n), stack = new Int32Array(n);
    let sp = 0;
    for (let i = 0; i < n; i++) if (v[i] >= th) { mask[i] = 1; stack[sp++] = i; }
    while (sp > 0) {
      const i = stack[--sp], x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (!mask[j] && v[j] >= tl) { mask[j] = 1; stack[sp++] = j; }
        }
      }
    }
    return mask;
  }

  function boxBlur(a, w, h, r) {
    const tmp = new Float32Array(a.length);
    for (let y = 0; y < h; y++) {
      let s = 0;
      const o = y * w;
      for (let x = -r; x <= r; x++) s += a[o + clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[o + x] = s;
        s += a[o + clamp(x + r + 1, 0, w - 1)] - a[o + clamp(x - r, 0, w - 1)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = s;
        s += tmp[clamp(y + r + 1, 0, h - 1) * w + x] - tmp[clamp(y - r, 0, h - 1) * w + x];
      }
    }
  }

  // dirección de cada cable (tensor de estructura sobre la respuesta black-hat)
  function orientations(v, w, h) {
    const n = w * h;
    const jxx = new Float32Array(n), jyy = new Float32Array(n), jxy = new Float32Array(n);
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const gx = v[i + 1] - v[i - 1], gy = v[i + w] - v[i - w];
        jxx[i] = gx * gx; jyy[i] = gy * gy; jxy[i] = gx * gy;
      }
    boxBlur(jxx, w, h, 2); boxBlur(jyy, w, h, 2); boxBlur(jxy, w, h, 2);
    const bins = new Uint8Array(n), coh = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      bins[i] = binOf(0.5 * Math.atan2(2 * jxy[i], jxx[i] - jyy[i]) + PI / 2);
      const tr = jxx[i] + jyy[i];
      coh[i] = tr > 1e-6 ? Math.sqrt((jxx[i] - jyy[i]) ** 2 + 4 * jxy[i] * jxy[i]) / tr : 0;
    }
    bins.coh = coh;
    return bins;
  }

  // distancia (chaflán 3-4, en tercios de píxel) a la semilla más cercana
  function chamfer16(seed, w, h, buf) {
    const n = w * h, INF = 60000;
    for (let i = 0; i < n; i++) buf[i] = seed[i] ? 0 : INF;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let d = buf[i];
        if (d === 0) continue;
        if (x > 0) { const t = buf[i - 1] + 3; if (t < d) d = t; }
        if (y > 0) {
          let t = buf[i - w] + 3; if (t < d) d = t;
          if (x > 0) { t = buf[i - w - 1] + 4; if (t < d) d = t; }
          if (x < w - 1) { t = buf[i - w + 1] + 4; if (t < d) d = t; }
        }
        buf[i] = d;
      }
    for (let y = h - 1; y >= 0; y--)
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        let d = buf[i];
        if (d === 0) continue;
        if (x < w - 1) { const t = buf[i + 1] + 3; if (t < d) d = t; }
        if (y < h - 1) {
          let t = buf[i + w] + 3; if (t < d) d = t;
          if (x < w - 1) { t = buf[i + w + 1] + 4; if (t < d) d = t; }
          if (x > 0) { t = buf[i + w - 1] + 4; if (t < d) d = t; }
        }
        buf[i] = d;
      }
    return buf;
  }

  /* ---------- rasgos de una foto ---------- */
  // detect(): lo caro (decodificar la foto y encontrar cables). Se calcula una vez y se guarda.
  // opciones de depuración (la página no las toca)
  const OPC = { gruesos: true };
  // ancho de la estructura oscura que pasa por (x0, y0) medido en perpendicular a su dirección
  const ANCHO_MAX = 6;
  function anchoOscuro(bh, ww, wh, x0, y0, nx, ny) {
    // el píxel más fuerte del bloque 2×2
    let cx = x0, cy = y0, v = -1;
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        const x = x0 + dx, y = y0 + dy;
        if (x < ww && y < wh && bh[y * ww + x] > v) { v = bh[y * ww + x]; cx = x; cy = y; }
      }
    if (v <= 0) return { n: 0, v: 0, cx, cy };
    const lim = 0.5 * v;
    let n = 1;
    for (const sgn of [1, -1])
      for (let k = 1; k <= 12; k++) {
        const x = Math.round(cx + sgn * k * nx), y = Math.round(cy + sgn * k * ny);
        if (x < 0 || y < 0 || x >= ww || y >= wh || bh[y * ww + x] < lim) break;
        n++;
      }
    return { n, v, cx, cy };
  }
  // tamaño de la grilla de rasgos (mitad de la resolución de trabajo)
  function gridSize(sw, sh) {
    const sc = WORK / Math.max(sw, sh);
    const ww = Math.max(4, Math.round(sw * sc)), wh = Math.max(4, Math.round(sh * sc));
    return { w: ww >> 1, h: wh >> 1 };
  }
  // cieloExt (opcional): máscara de cielo ya calculada en la grilla de rasgos (w × h), por ejemplo con un
  // modelo entrenado al armar la colección. Si no viene, se usa la heurística de brillo y textura.
  function detect(source, sw, sh, cieloExt) {
    const sc = WORK / Math.max(sw, sh);
    const ww = Math.max(4, Math.round(sw * sc)), wh = Math.max(4, Math.round(sh * sc));
    const { g: gray, skyc } = pixelsFrom(source, ww, wh);
    const bh = blackHat(gray, ww, wh, OPC.bhR || BH_R, true);
    const cl = bh.closing;
    const w = ww >> 1, h = wh >> 1;
    const ext = cieloExt && cieloExt.length === w * h ? cieloExt : null;
    const sky = ext ? null : skyMask(cl, skyc, ww, wh);
    const pb = new Float32Array(w * h), pc = new Float32Array(w * h), ps = new Uint8Array(w * h);
    let skyN = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = 2 * y * ww + 2 * x;
        let m = bh[i];
        if (bh[i + 1] > m) m = bh[i + 1];
        if (bh[i + ww] > m) m = bh[i + ww];
        if (bh[i + ww + 1] > m) m = bh[i + ww + 1];
        pb[y * w + x] = m;
        pc[y * w + x] = (cl[i] + cl[i + 1] + cl[i + ww] + cl[i + ww + 1]) / 4;
        const sk = ext ? (ext[y * w + x] ? 1 : 0) : sky[i] | sky[i + 1] | sky[i + ww] | sky[i + ww + 1];
        ps[y * w + x] = sk;
        skyN += sk;
      }
    // solo cuentan las líneas con cielo a ambos lados: cables, no bordes de edificios, molduras ni rejas
    const bins = orientations(pb, w, h);
    const inSky = (x, y) => { const xi = Math.round(x), yi = Math.round(y); return xi >= 0 && yi >= 0 && xi < w && yi < h && ps[yi * w + xi] === 1; };
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (pb[i] <= 0) continue;
        const a = (bins[i] / K) * PI, nx = -Math.sin(a), ny = Math.cos(a);
        // cielo a cada lado, a menos de 7 px (deja pasar atados y rollos apretados)
        let A = false, B = false;
        for (let k = 2; k <= 7 && !(A && B); k++) {
          if (!A && inSky(x + k * nx, y + k * ny)) A = true;
          if (!B && inSky(x - k * nx, y - k * ny)) B = true;
        }
        if (!(A && B)) { pb[i] = 0; continue; }
        // grosor en la foto de trabajo: un cable mide pocos píxeles de ancho; un poste, un farol o una
        // viga, bastante más (y también tienen cielo a los lados)
        const an = anchoOscuro(bh, ww, wh, 2 * x, 2 * y, nx, ny);
        // y si es algo ancha tiene que ser oscura: un farol o un poste gris contra el cielo claro no es un cable
        if (an.n > ANCHO_MAX || (an.n >= 3 && an.v < 0.45 * cl[an.cy * ww + an.cx])) pb[i] = 0;
      }
    const th = thresholdOf(pb), tl = th * 0.5;
    const mask = hysteresis(pb, w, h, th, tl);
    // fuera las manchas: un cable es una línea fina; donde la máscara tiene 3 px o más de grosor hay un
    // objeto (antena, transformador, copa de árbol, letrero) y cualquier dibujo "calzaría" ahí
    if (OPC.gruesos) quitarGruesos(mask, w, h);
    // fuera los trazos verticales largos: postes, faroles, antenas y astas (los cables cuelgan, no suben)
    if (OPC.gruesos) quitarVerticales(mask, bins, w, h);
    // fuera los pedacitos: un cable cruza una buena parte de la foto
    quitarCortos(mask, w, h, 0.08 * Math.hypot(w, h));
    const det = { w, h, sw, sh, mask, bins, th, tl, cielo: skyN / (w * h), sky: ps };
    Object.assign(det, lineStats(mask, bins.coh, pc, w, h));
    return det;
  }

  function quitarGruesos(mask, w, h, minCore = 6, R = 2) {
    const n = w * h, core = new Uint8Array(n);
    let hay = false;
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (mask[i] && mask[i - 1] && mask[i + 1] && mask[i - w] && mask[i + w] && mask[i - w - 1] && mask[i - w + 1] && mask[i + w - 1] && mask[i + w + 1]) {
          core[i] = 1;
          hay = true;
        }
      }
    if (!hay) return 0;
    // solo cuentan los núcleos grandes: el cruce de dos cables deja un núcleo de 1 o 2 px y no se toca
    const lab = new Int32Array(n).fill(-1), stack = new Int32Array(n), grande = new Uint8Array(n);
    for (let s = 0; s < n; s++) {
      if (!core[s] || lab[s] >= 0) continue;
      let sp = 0, cnt = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
      const pix = [];
      stack[sp++] = s; lab[s] = s;
      while (sp) {
        const i = stack[--sp];
        pix.push(i); cnt++;
        const x = i % w, y = (i / w) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const j = yy * w + xx;
            if (core[j] && lab[j] < 0) { lab[j] = s; stack[sp++] = j; }
          }
      }
      // mancha = núcleo grueso en las dos direcciones y que llena buena parte de su caja (antena, copa de
      // árbol, letrero). Un atado de cables o un rollo deja un núcleo largo y fino (o un anillo) y se queda.
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (cnt >= minCore && Math.min(bw, bh) >= 4 && cnt / (bw * bh) >= 0.3) for (const i of pix) grande[i] = 1;
    }
    let quit = 0;
    for (let i = 0; i < n; i++) {
      if (!grande[i]) continue;
      const x = i % w, y = (i / w) | 0;
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (mask[j]) { mask[j] = 0; quit++; }
        }
    }
    return quit;
  }

  function quitarVerticales(mask, bins, w, h) {
    const n = w * h, vert = new Uint8Array(n), lab = new Int32Array(n).fill(-1), stack = new Int32Array(n);
    const b0 = K / 2 - 1, b1 = K / 2 + 1;
    for (let i = 0; i < n; i++) if (mask[i] && bins[i] >= b0 && bins[i] <= b1) vert[i] = 1;
    let quit = 0;
    for (let s = 0; s < n; s++) {
      if (!vert[s] || lab[s] >= 0) continue;
      let sp = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
      const pix = [];
      stack[sp++] = s; lab[s] = s;
      while (sp) {
        const i = stack[--sp];
        pix.push(i);
        const x = i % w, y = (i / w) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const j = yy * w + xx;
            if (vert[j] && lab[j] < 0) { lab[j] = s; stack[sp++] = j; }
          }
      }
      const bh = y1 - y0 + 1, bw = x1 - x0 + 1;
      if (bh >= 0.12 * h && bh >= 2.5 * bw) for (const i of pix) { mask[i] = 0; quit++; }
    }
    return quit;
  }

  function quitarCortos(mask, w, h, minDiag) {
    const n = w * h, lab = new Int32Array(n).fill(-1), stack = new Int32Array(n), pix = [];
    let comp = 0;
    for (let i0 = 0; i0 < n; i0++) {
      if (!mask[i0] || lab[i0] >= 0) continue;
      let sp = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
      pix.length = 0;
      stack[sp++] = i0; lab[i0] = comp;
      while (sp) {
        const i = stack[--sp], x = i % w, y = (i / w) | 0;
        pix.push(i);
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (mask[j] && lab[j] < 0) { lab[j] = comp; stack[sp++] = j; }
        }
      }
      const diag = Math.hypot(x1 - x0, y1 - y0);
      // un trazo suelto en el aire, corto y que no llega a ningún borde, suele ser el brazo de un farol,
      // un pájaro o una antena: los cables vienen de afuera de la foto o se juntan con otros
      const borde = x0 <= 2 || y0 <= 2 || x1 >= w - 3 || y1 >= h - 3;
      if (diag < minDiag || (OPC.gruesos && !borde && diag < 1.9 * minDiag)) for (const i of pix) mask[i] = 0;
      comp++;
    }
  }

  // ¿hay cables de verdad? fracción de la imagen cubierta por estructuras largas, delgadas y con
  // dirección clara; y cuánta de esa parte está contra un fondo claro (cielo)
  function lineStats(mask, coh, closing, w, h) {
    const n = w * h, lab = new Int32Array(n).fill(-1), stack = new Int32Array(n);
    const diagMin = 0.15 * Math.max(w, h);
    let dens = 0, lineCnt = 0, skyCnt = 0;
    for (let i = 0; i < n; i++) dens += mask[i];
    let comp = 0;
    for (let i0 = 0; i0 < n; i0++) {
      if (!mask[i0] || lab[i0] >= 0) continue;
      let sp = 0, cnt = 0, cohCnt = 0, skyC = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
      stack[sp++] = i0; lab[i0] = comp;
      while (sp) {
        const i = stack[--sp], x = i % w, y = (i / w) | 0;
        cnt++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        const c = coh ? coh[i] > 0.5 : true;
        if (c) { cohCnt++; if (closing && closing[i] >= 135) skyC++; }
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            const j = yy * w + xx;
            if (mask[j] && lab[j] < 0) { lab[j] = comp; stack[sp++] = j; }
          }
        }
      }
      if (Math.hypot(x1 - x0, y1 - y0) >= diagMin) { lineCnt += cohCnt; skyCnt += skyC; }
      comp++;
    }
    return { density: dens / n, lineFrac: lineCnt / n, skyFrac: lineCnt ? skyCnt / lineCnt : 0 };
  }

  // mapas de distancia por dirección (barato: se recalcula al cargar)
  function buildDTs(det) {
    const { w, h, mask, bins } = det;
    const seed = new Uint8Array(w * h), buf = new Uint16Array(w * h);
    const dts = [];
    for (let k = 0; k < K; k++) {
      const k1 = (k + 1) % K, k2 = (k + K - 1) % K;
      for (let i = 0; i < w * h; i++) {
        const b = bins[i];
        seed[i] = mask[i] && (b === k || b === k1 || b === k2) ? 1 : 0;
      }
      chamfer16(seed, w, h, buf);
      const out = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) out[i] = buf[i] > 255 ? 255 : buf[i];
      dts.push(out);
    }
    return Object.assign({}, det, { dts });
  }
  function computeFeatures(source, sw, sh) {
    return buildDTs(detect(source, sw, sh));
  }

  // codificación compacta: máscara en bits + dirección (4 bits) solo de los píxeles de cable
  function toB64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function fromB64(str) {
    const s = atob(str), out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function encodeDet(det) {
    const n = det.w * det.h, mb = new Uint8Array((n + 7) >> 3);
    let cnt = 0;
    for (let i = 0; i < n; i++) if (det.mask[i]) { mb[i >> 3] |= 1 << (i & 7); cnt++; }
    const bb = new Uint8Array((cnt + 1) >> 1);
    let k = 0;
    for (let i = 0; i < n; i++)
      if (det.mask[i]) {
        const b = det.bins[i] & 15;
        if (k & 1) bb[k >> 1] |= b << 4; else bb[k >> 1] = b;
        k++;
      }
    return {
      v: 1, w: det.w, h: det.h, sw: det.sw, sh: det.sh, th: Math.round(det.th * 10) / 10,
      d: +det.density.toFixed(4), l: +det.lineFrac.toFixed(4), s: +det.skyFrac.toFixed(3), c: +(det.cielo || 0).toFixed(3),
      m: toB64(mb), b: toB64(bb),
    };
  }
  function decodeDet(e) {
    if (!e || e.v !== 1 || !(e.w > 0) || !(e.h > 0) || e.w * e.h > 400000) throw new Error("rasgos inválidos");
    const n = e.w * e.h, mb = fromB64(e.m), bb = fromB64(e.b);
    const mask = new Uint8Array(n), bins = new Uint8Array(n);
    let k = 0;
    for (let i = 0; i < n; i++)
      if (mb[i >> 3] & (1 << (i & 7))) {
        mask[i] = 1;
        const byte = bb[k >> 1] || 0;
        bins[i] = (k & 1 ? byte >> 4 : byte) & 15;
        k++;
      }
    return {
      w: e.w, h: e.h, sw: e.sw, sh: e.sh, mask, bins, th: e.th, tl: e.th * 0.5,
      density: e.d, lineFrac: e.l, skyFrac: e.s, cielo: e.c || 0,
    };
  }

  /* ---------- el dibujo ---------- */
  function strokeLen(s) {
    let L = 0;
    for (let i = 1; i < s.length; i++) L += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
    return L;
  }
  function smooth(s) {
    if (s.length < 3) return s.slice();
    const o = [s[0]];
    for (let i = 1; i < s.length - 1; i++)
      o.push({ x: (s[i - 1].x + 2 * s[i].x + s[i + 1].x) / 4, y: (s[i - 1].y + 2 * s[i].y + s[i + 1].y) / 4 });
    o.push(s[s.length - 1]);
    return o;
  }
  function resample(s, step) {
    const out = [{ x: s[0].x, y: s[0].y }];
    let carry = 0;
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1], b = s[i];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (seg === 0) continue;
      let t = step - carry;
      while (t <= seg) {
        out.push({ x: a.x + ((b.x - a.x) * t) / seg, y: a.y + ((b.y - a.y) * t) / seg });
        t += step;
      }
      carry = seg - (t - step);
    }
    const last = s[s.length - 1], prev = out[out.length - 1];
    if (Math.hypot(last.x - prev.x, last.y - prev.y) > step * 0.35) out.push({ x: last.x, y: last.y });
    return out;
  }
  function prepareDrawing(strokes, N = 140) {
    const S = strokes
      .map((s) => s.filter((p, i) => i === 0 || p.x !== s[i - 1].x || p.y !== s[i - 1].y))
      .filter((s) => s.length >= 2 && strokeLen(s) > 3)
      .map(smooth);
    if (!S.length) return null;
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const s of S) for (const p of s) {
      if (p.x < minx) minx = p.x; if (p.y < miny) miny = p.y;
      if (p.x > maxx) maxx = p.x; if (p.y > maxy) maxy = p.y;
    }
    const size = Math.max(maxx - minx, maxy - miny);
    if (size < 12) return null;
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
    const total = S.reduce((a, s) => a + strokeLen(s), 0);
    const step = total / size / N;
    const pts = [], ang = [], norm = [], starts = [];
    for (const s of S) {
      const ns = s.map((p) => ({ x: (p.x - cx) / size, y: (p.y - cy) / size }));
      norm.push(ns);
      starts.push(ang.length);
      const rs = resample(ns, step);
      for (let i = 0; i < rs.length; i++) {
        const a = rs[Math.max(0, i - 1)], b = rs[Math.min(rs.length - 1, i + 1)];
        pts.push(rs[i].x, rs[i].y);
        ang.push(Math.atan2(b.y - a.y, b.x - a.x));
      }
    }
    return {
      pts: Float32Array.from(pts), ang: Float32Array.from(ang), n: ang.length, starts,
      strokes: norm, bw: (maxx - minx) / size, bh: (maxy - miny) / size, len: total / size,
      center: { x: cx, y: cy }, size, nStrokes: S.length,
    };
  }

  /* ---------- búsqueda ---------- */
  const SCALES = [0.16, 0.2, 0.25, 0.31, 0.39, 0.49, 0.62, 0.78, 0.95];
  const ROTS = [-0.27, 0, 0.27];

  function transform(dr, cx, cy, S, rot, idx, kb = K) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const m = idx.length, ox = new Int32Array(m), oy = new Int32Array(m), ob = new Uint8Array(m);
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (let j = 0; j < m; j++) {
      const i = idx[j], px = dr.pts[2 * i], py = dr.pts[2 * i + 1];
      const x = Math.round(S * (px * c - py * s)), y = Math.round(S * (px * s + py * c));
      ox[j] = x; oy[j] = y; ob[j] = binOf(dr.ang[i] + rot, kb);
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
    return { ox, oy, ob, m, minx, miny, maxx, maxy };
  }

  function recallAt(feat, T, cx, cy, tau3) {
    const { w, h, dts } = feat;
    let cost = 0;
    for (let j = 0; j < T.m; j++) {
      const x = cx + T.ox[j], y = cy + T.oy[j];
      let d = tau3;
      if (x >= 0 && y >= 0 && x < w && y < h) {
        d = dts[T.ob[j]][y * w + x];
        if (d > tau3) d = tau3;
      }
      cost += d;
    }
    return 1 - cost / (T.m * tau3);
  }

  function tauFor(S) { return clamp(0.075 * S, 2, 11); }

  // segmentos del dibujo transformados a coordenadas de la foto (espacio de búsqueda)
  function transformedStrokes(dr, cand, fx = 1, fy = 1) {
    const c = Math.cos(cand.rot), s = Math.sin(cand.rot);
    return dr.strokes.map((st) =>
      st.map((p) => ({
        x: (cand.cx + cand.S * (p.x * c - p.y * s)) * fx,
        y: (cand.cy + cand.S * (p.x * s + p.y * c)) * fy,
      }))
    );
  }

  // precisión: ¿cuántos de los cables cercanos siguen el dibujo (y no son ruido)?
  function precisionAt(feat, dr, cand) {
    const { w, h, mask } = feat;
    const strokes = transformedStrokes(dr, cand);
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const st of strokes) for (const p of st) {
      if (p.x < minx) minx = p.x; if (p.y < miny) miny = p.y;
      if (p.x > maxx) maxx = p.x; if (p.y > maxy) maxy = p.y;
    }
    const pad = Math.ceil(cand.tau) + 2;
    const bx0 = clamp(Math.floor(minx) - pad, 0, w - 1), by0 = clamp(Math.floor(miny) - pad, 0, h - 1);
    const bx1 = clamp(Math.ceil(maxx) + pad, 0, w - 1), by1 = clamp(Math.ceil(maxy) + pad, 0, h - 1);
    const lw = bx1 - bx0 + 1, lh = by1 - by0 + 1;
    const seed = new Uint8Array(lw * lh);
    for (const st of strokes)
      for (let i = 1; i < st.length; i++) {
        const a = st[i - 1], b = st[i];
        const steps = Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 2) + 1;
        for (let t = 0; t <= steps; t++) {
          const x = Math.round(a.x + ((b.x - a.x) * t) / steps) - bx0;
          const y = Math.round(a.y + ((b.y - a.y) * t) / steps) - by0;
          if (x >= 0 && y >= 0 && x < lw && y < lh) seed[y * lw + x] = 1;
        }
      }
    const dt = chamfer16(seed, lw, lh, new Uint16Array(lw * lh));
    const tau3 = cand.tau * 3;
    let acc = 0, cnt = 0;
    for (let y = by0; y <= by1; y++)
      for (let x = bx0; x <= bx1; x++)
        if (mask[y * w + x]) {
          const d = dt[(y - by0) * lw + (x - bx0)];
          acc += d < tau3 ? d : tau3;
          cnt++;
        }
    return cnt ? 1 - acc / (cnt * tau3) : 0;
  }

  // Versión liviana (mitad de resolución, 8 direcciones) para ordenar cientos de fotos sin llenar
  // la memoria. Solo las mejores pasan a la búsqueda completa.
  const K2 = 8;
  function buildLow(det) {
    const W = det.w, w = W >> 1, h = det.h >> 1, n = w * h;
    const mask = new Uint8Array(n), bins = new Uint8Array(n);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i0 = 2 * y * W + 2 * x;
        for (const j of [i0, i0 + 1, i0 + W, i0 + W + 1])
          if (det.mask[j]) { mask[y * w + x] = 1; bins[y * w + x] = Math.round((det.bins[j] * K2) / K) % K2; break; }
      }
    const seed = new Uint8Array(n), buf = new Uint16Array(n), dts = [];
    for (let k = 0; k < K2; k++) {
      const k1 = (k + 1) % K2, k2 = (k + K2 - 1) % K2;
      for (let i = 0; i < n; i++) { const b = bins[i]; seed[i] = mask[i] && (b === k || b === k1 || b === k2) ? 1 : 0; }
      chamfer16(seed, w, h, buf);
      const o = new Uint8Array(n);
      for (let i = 0; i < n; i++) o[i] = buf[i] > 255 ? 255 : buf[i];
      dts.push(o);
    }
    return { w, h, dts };
  }
  function coarseRank(low, dr) {
    const { w, h, dts } = low, short = Math.min(w, h);
    let best = 0;
    for (const fs of SCALES) {
      const S = fs * short;
      if (S < 10) continue;
      const tau3 = clamp(0.075 * S, 1.5, 6) * 3;
      const want = clamp(Math.round(S * 0.9), 16, 48), stride = Math.max(1, Math.floor(dr.n / want));
      const idx = [];
      for (let i = 0; i < dr.n; i += stride) idx.push(i);
      for (const rot of ROTS) {
        const T = transform(dr, 0, 0, S, rot, idx, K2);
        const x0 = -T.minx, x1 = w - 1 - T.maxx, y0 = -T.miny, y1 = h - 1 - T.maxy;
        if (x1 < x0 || y1 < y0) continue;
        const step = Math.max(1, Math.round(S / 10)), q = Math.max(1, Math.floor(T.m / 10));
        for (let cy = y0; cy <= y1; cy += step)
          for (let cx = x0; cx <= x1; cx += step) {
            let qc = 0, qn = 0;
            for (let j = 0; j < T.m; j += q) { const d = dts[T.ob[j]][(cy + T.oy[j]) * w + cx + T.ox[j]]; qc += d < tau3 ? d : tau3; qn++; }
            if (1 - qc / (qn * tau3) < best - 0.15) continue;
            let c = 0;
            for (let j = 0; j < T.m; j++) { const d = dts[T.ob[j]][(cy + T.oy[j]) * w + cx + T.ox[j]]; c += d < tau3 ? d : tau3; }
            const R = 1 - c / (T.m * tau3);
            if (R > best) best = R;
          }
      }
    }
    return best;
  }

  // métricas estrictas: qué fracción del trazo pasa de verdad sobre un cable con la misma dirección,
  // y el tramo más largo del trazo que no tiene cable debajo
  function strictAt(feat, dr, cand) {
    if (!dr.allIdx) dr.allIdx = Array.from({ length: dr.n }, (_, i) => i);
    const T = transform(dr, 0, 0, cand.S, cand.rot, dr.allIdx);
    const tol3 = Math.max(1.5, 0.6 * cand.tau) * 3;
    const { w, h, dts } = feat;
    const starts = dr.starts || [0];
    let covered = 0, maxRun = 0, run = 0, si = 1;
    for (let j = 0; j < T.m; j++) {
      if (si < starts.length && j === starts[si]) { run = 0; si++; }
      const x = cand.cx + T.ox[j], y = cand.cy + T.oy[j];
      const ok = x >= 0 && y >= 0 && x < w && y < h && dts[T.ob[j]][y * w + x] <= tol3;
      if (ok) { covered++; run = 0; } else { run++; if (run > maxRun) maxRun = run; }
    }
    return { cov: covered / T.m, gap: maxRun / T.m };
  }

  // ¿la forma es especial en ese lugar, o en esa zona “todo coincide” (una maraña muy densa)?
  // Se mueve el mismo trazo un 35% de su tamaño en 8 direcciones y se mide la cobertura allí.
  function distinctAt(feat, dr, cand) {
    let sum = 0, n = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k * PI) / 4;
      const c2 = Object.assign({}, cand, { cx: Math.round(cand.cx + 0.35 * cand.S * Math.cos(a)), cy: Math.round(cand.cy + 0.35 * cand.S * Math.sin(a)) });
      sum += strictAt(feat, dr, c2).cov;
      n++;
    }
    const around = sum / n;
    return { around, D: cand.cov - around };
  }

  // cobertura punto por punto (para mostrar qué parte del dibujo se encontró)
  function strictFlags(feat, dr, cand) {
    if (!dr.allIdx) dr.allIdx = Array.from({ length: dr.n }, (_, i) => i);
    const T = transform(dr, 0, 0, cand.S, cand.rot, dr.allIdx);
    const tol3 = Math.max(1.5, 0.6 * cand.tau) * 3;
    const { w, h, dts } = feat;
    const flags = new Uint8Array(T.m);
    const starts = dr.starts || [0];
    let covered = 0, maxRun = 0, run = 0, si = 1;
    for (let j = 0; j < T.m; j++) {
      if (si < starts.length && j === starts[si]) { run = 0; si++; }
      const x = cand.cx + T.ox[j], y = cand.cy + T.oy[j];
      if (x >= 0 && y >= 0 && x < w && y < h && dts[T.ob[j]][y * w + x] <= tol3) { flags[j] = 1; covered++; run = 0; }
      else { run++; if (run > maxRun) maxRun = run; }
    }
    return { flags, cov: covered / T.m, gap: maxRun / T.m };
  }

  /* ---------- dibujos libres: variantes del dibujo ---------- */
  // Para dibujos de varios trazos se busca también el trazo más largo y el contorno principal
  // (los trazos que tocan el borde del dibujo); luego se mide cuánto del dibujo COMPLETO quedó cubierto.
  function bboxOf(strokes) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of strokes) for (const p of s) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
    return { x0, y0, x1, y1 };
  }
  function simplify(pts, tol) {
    if (pts.length < 3) return pts.slice();
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const A = pts[a], B = pts[b], L = Math.hypot(B.x - A.x, B.y - A.y) || 1e-9;
      let md = -1, mi = -1;
      for (let i = a + 1; i < b; i++) {
        const d = Math.abs((B.x - A.x) * (A.y - pts[i].y) - (A.x - pts[i].x) * (B.y - A.y)) / L;
        if (d > md) { md = d; mi = i; }
      }
      if (md > tol) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  }
  function complejidad(dr) {
    let giro = 0;
    const starts = (dr.starts || [0]).concat([dr.n]);
    for (let k = 0; k + 1 < starts.length; k++)
      for (let i = starts[k] + 1; i < starts[k + 1]; i++) {
        let d = dr.ang[i] - dr.ang[i - 1];
        while (d > PI) d -= 2 * PI;
        while (d < -PI) d += 2 * PI;
        giro += Math.abs(d);
      }
    const vueltas = giro / (2 * PI);
    return { trazos: dr.nStrokes || 1, vueltas, largo: dr.len, complejo: (dr.nStrokes || 1) > 3 || vueltas > 3.2 || dr.len > 8 };
  }
  function variantes(strokesAbs) {
    const full = prepareDrawing(strokesAbs);
    if (!full) return null;
    const out = [{ tipo: "completo", dr: full }];
    const S = strokesAbs.filter((s) => s.length >= 2 && strokeLen(s) > 3);
    const lens = S.map(strokeLen), total = lens.reduce((a, b) => a + b, 0);
    const add = (tipo, strokes) => { const dr = prepareDrawing(strokes); if (dr) out.push({ tipo, dr }); };
    if (S.length > 1) {
      let iMax = 0;
      lens.forEach((l, i) => { if (l > lens[iMax]) iMax = i; });
      if (lens[iMax] / total > 0.25) add("el trazo más largo", [S[iMax]]);
      const bb = bboxOf(S), m = 0.08 * Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0);
      const toca = S.filter((s) => s.some((p) => p.x - bb.x0 < m || bb.x1 - p.x < m || p.y - bb.y0 < m || bb.y1 - p.y < m));
      if (toca.length > 1 && toca.length < S.length) add("el contorno principal", toca);
    }
    const cx = complejidad(full);
    if (cx.vueltas > 2.2 || full.len > 6) {
      const tol = 0.06 * full.size;
      add("una versión simplificada", S.map((s) => simplify(s, tol)).filter((s) => s.length >= 2));
    }
    return { full, lista: out, complejidad: cx };
  }
  // el dibujo completo expresado en el marco de una variante
  function enMarco(full, dv) {
    if (full === dv) return full;
    const k = full.size / dv.size, dx = (full.center.x - dv.center.x) / dv.size, dy = (full.center.y - dv.center.y) / dv.size;
    const pts = new Float32Array(full.pts.length);
    for (let i = 0; i < full.n; i++) { pts[2 * i] = full.pts[2 * i] * k + dx; pts[2 * i + 1] = full.pts[2 * i + 1] * k + dy; }
    return { pts, ang: full.ang, n: full.n, starts: full.starts, strokes: full.strokes.map((s) => s.map((p) => ({ x: p.x * k + dx, y: p.y * k + dy }))) };
  }
  // busca todas las variantes en una foto y se queda con la que mejor cubre el dibujo completo
  function searchDrawing(feat, V) {
    let best = null;
    for (const v of V.lista) {
      const c = searchOne(feat, v.dr);
      if (!c) continue;
      const ev = v.ev || (v.ev = enMarco(V.full, v.dr));
      const f = strictFlags(feat, ev, c);
      const Q = f.cov * clamp(c.D / 0.85, 0, 1) * (0.8 + 0.2 * c.P);
      const r = Object.assign({}, c, {
        variante: v.tipo, drVar: v.dr, ev, flags: f.flags, covTotal: f.cov, gapTotal: f.gap, Qparte: c.Q, Q,
        pasa: c.cov >= UMBRAL.cov && c.gap <= UMBRAL.gap && c.D >= UMBRAL.D && f.cov >= UMBRAL.total && Q >= UMBRAL.Q,
      });
      r.score = Q * (0.9 + 0.1 * clamp(c.fs / 0.5, 0, 1)) + (v.tipo === "completo" ? 0.01 : 0);
      if (!best || r.score > best.score) best = r;
    }
    return best;
  }

  // umbral mínimo para decir “encontré tu forma” (provisional: se recalibra con fotos reales)
  //  cov: fracción del trazo que pasa sobre cables con la misma dirección
  //  gap: tramo más largo del trazo sin cable debajo
  //  D:   cuánto más coincide aquí que a su alrededor (evita “todo coincide” en una maraña densa)
  //  Q:   el “parecido” que se muestra
  //  total: fracción del dibujo COMPLETO cubierta (cuando se encontró solo una parte)
  const UMBRAL = { cov: 0.8, gap: 0.1, D: 0.6, Q: 0.65, total: 0.75 };
  const pasa = (c) => !!c && c.cov >= UMBRAL.cov && c.gap <= UMBRAL.gap && c.D >= UMBRAL.D && c.Q >= UMBRAL.Q;
  const calidad = (c) => c.cov * clamp(c.D / 0.85, 0, 1) * (0.8 + 0.2 * c.P);

  function searchOne(feat, dr) {
    const { w, h } = feat;
    const short = Math.min(w, h);
    const all = [];
    for (let i = 0; i < dr.n; i++) all.push(i);
    let top = [];
    const keep = 40;
    for (const fs of SCALES) {
      const S = fs * short, tau = tauFor(S), tau3 = tau * 3;
      // a escala pequeña el dibujo está sobremuestreado: basta con menos puntos
      const want = clamp(Math.round(S * 0.9), 24, 70);
      const stride = Math.max(1, Math.floor(dr.n / want));
      const coarse = [];
      for (let i = 0; i < dr.n; i += stride) coarse.push(i);
      for (const rot of ROTS) {
        const T = transform(dr, 0, 0, S, rot, coarse);
        const x0 = -T.minx, x1 = w - 1 - T.maxx, y0 = -T.miny, y1 = h - 1 - T.maxy;
        if (x1 < x0 || y1 < y0) continue;
        const step = Math.max(2, Math.round(S / 12));
        const xs = x0 + (((x1 - x0) % step) >> 1), ys = y0 + (((y1 - y0) % step) >> 1);
        const q = Math.max(1, Math.floor(T.m / 12));
        const { dts } = feat;
        for (let cy = ys; cy <= y1; cy += step)
          for (let cx = xs; cx <= x1; cx += step) {
            // prueba rápida con ~12 puntos antes de evaluar todo el dibujo
            if (top.length >= keep) {
              let qc = 0, qn = 0;
              for (let j = 0; j < T.m; j += q) {
                const d = dts[T.ob[j]][(cy + T.oy[j]) * w + cx + T.ox[j]];
                qc += d < tau3 ? d : tau3;
                qn++;
              }
              if (1 - qc / (qn * tau3) < top[top.length - 1].R - 0.15) continue;
            }
            const R = recallAt(feat, T, cx, cy, tau3);
            if (top.length < keep || R > top[top.length - 1].R) {
              top.push({ R, cx, cy, S, rot, tau, step, fs });
              top.sort((a, b) => b.R - a.R);
              if (top.length > keep) top.pop();
            }
          }
      }
    }
    // candidatos diversos
    const picked = [];
    for (const c of top) {
      if (picked.length >= 6) break;
      if (picked.every((p) => Math.hypot(p.cx - c.cx, p.cy - c.cy) > 0.3 * Math.min(p.S, c.S) || Math.abs(p.S - c.S) > 0.2 * p.S)) picked.push(c);
    }
    let best = null;
    for (const c0 of picked) {
      let bc = null;
      const d = Math.max(1, Math.round(c0.step / 3));
      for (const ds of [0.9, 1, 1.1]) {
        const S = c0.S * ds, tau = tauFor(S), tau3 = tau * 3;
        for (const dr0 of [-0.12, 0, 0.12]) {
          const rot = c0.rot + dr0;
          const T = transform(dr, 0, 0, S, rot, all);
          for (let oy = -2; oy <= 2; oy++)
            for (let ox = -2; ox <= 2; ox++) {
              const cx = c0.cx + ox * d, cy = c0.cy + oy * d;
              if (cx + T.minx < 0 || cy + T.miny < 0 || cx + T.maxx >= w || cy + T.maxy >= h) continue;
              const R = recallAt(feat, T, cx, cy, tau3);
              if (!bc || R > bc.R) bc = { R, cx, cy, S, rot, tau, fs: S / short };
            }
        }
      }
      if (!bc) continue;
      bc.P = precisionAt(feat, dr, bc);
      const F = bc.P + bc.R > 0 ? (3.25 * bc.P * bc.R) / (2.25 * bc.P + bc.R) : 0;
      bc.F = F;
      const st = strictAt(feat, dr, bc);
      bc.cov = st.cov;
      bc.gap = st.gap;
      const ds = distinctAt(feat, dr, bc);
      bc.around = ds.around;
      bc.D = ds.D;
      // parecido: cuánto del trazo está hecho de cables reales, si la forma destaca de su entorno
      // y cuánto enredo sobra alrededor
      bc.Q = calidad(bc);
      bc.pasa = pasa(bc);
      bc.score = bc.Q * (0.9 + 0.1 * clamp(bc.fs / 0.5, 0, 1)) + 0.02 * F;
      if (!best || bc.score > best.score) best = bc;
    }
    return best;
  }

  /* ---------- firma de una forma (para revisiones: “esta forma” = forma parecida) ---------- */
  function shapeSig(dr, m = 48) {
    const out = [];
    for (let i = 0; i < m; i++) {
      const j = Math.min(dr.n - 1, Math.round((i * (dr.n - 1)) / (m - 1)));
      out.push(Math.round(dr.pts[2 * j] * 1000) / 1000, Math.round(dr.pts[2 * j + 1] * 1000) / 1000);
    }
    return out;
  }
  function shapeDist(a, b) {
    const one = (p, q) => {
      let s = 0;
      for (let i = 0; i < p.length; i += 2) {
        let best = Infinity;
        for (let j = 0; j < q.length; j += 2) {
          const d = (p[i] - q[j]) ** 2 + (p[i + 1] - q[j + 1]) ** 2;
          if (d < best) best = d;
        }
        s += Math.sqrt(best);
      }
      return s / (p.length / 2);
    };
    return (one(a, b) + one(b, a)) / 2;
  }

  /* ---------- dibujar el resultado ---------- */
  function cropFor(feat, imgW, imgH, dr, cand, margin = 0.3) {
    const fx = imgW / feat.w, fy = imgH / feat.h;
    const st = transformedStrokes(dr, cand, fx, fy);
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const s of st) for (const p of s) {
      if (p.x < minx) minx = p.x; if (p.y < miny) miny = p.y;
      if (p.x > maxx) maxx = p.x; if (p.y > maxy) maxy = p.y;
    }
    const Simg = cand.S * fx;
    let side = Math.max(maxx - minx, maxy - miny) + 2 * margin * Simg;
    // nunca un recorte demasiado pequeño: se vería borroso
    side = Math.max(side, 0.34 * Math.min(imgW, imgH));
    side = Math.min(side, imgW, imgH);
    let x = (minx + maxx) / 2 - side / 2, y = (miny + maxy) / 2 - side / 2;
    x = clamp(x, 0, imgW - side);
    y = clamp(y, 0, imgH - side);
    return { x, y, side, fx, fy, strokes: st };
  }

  function smoothstep(a, b, v) {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  // prepara las capas del resultado: foto recortada, cables detectados y cables que coinciden
  function buildLayers(img, imgW, imgH, feat, dr, cand, OUT, overlay) {
    const crop = cropFor(feat, imgW, imgH, dr, cand);
    const base = makeCanvas(OUT, OUT);
    const bx = ctx2d(base);
    bx.imageSmoothingQuality = "high";
    bx.drawImage(img, crop.x, crop.y, crop.side, crop.side, 0, 0, OUT, OUT);
    const d = bx.getImageData(0, 0, OUT, OUT).data;
    const gray = new Float32Array(OUT * OUT);
    for (let i = 0, j = 0; i < gray.length; i++, j += 4) gray[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
    const scaleOut = OUT / crop.side;
    const workScale = WORK / Math.max(imgW, imgH);
    const r = clamp(Math.round((BH_R * scaleOut) / workScale), 2, 18);
    const bh = blackHat(gray, OUT, OUT, r);
    const th = Math.max(feat.th, 26), tl = th * 0.5;
    const cmask = hysteresis(bh, OUT, OUT, th, tl);
    // solo se encienden los trazos que el detector reconoció como cables (máscara de rasgos, con 2 celdas
    // de tolerancia): ni letras de letreros ni bordes de edificios que pasen cerca del dibujo
    if (feat.mask && feat.w && feat.h) {
      const fw = feat.w, fh = feat.h, R = 2, dil = new Uint8Array(fw * fh);
      for (let y = 0; y < fh; y++)
        for (let x = 0; x < fw; x++) {
          if (!feat.mask[y * fw + x]) continue;
          for (let dy = -R; dy <= R; dy++)
            for (let dx = -R; dx <= R; dx++) {
              const xx = x + dx, yy = y + dy;
              if (xx >= 0 && yy >= 0 && xx < fw && yy < fh) dil[yy * fw + xx] = 1;
            }
        }
      const kx = fw / imgW, ky = fh / imgH;
      for (let oy = 0; oy < OUT; oy++) {
        const gy = Math.min(fh - 1, Math.max(0, Math.floor((crop.y + oy / scaleOut) * ky)));
        for (let ox = 0; ox < OUT; ox++) {
          const i = oy * OUT + ox;
          if (!cmask[i]) continue;
          const gxx = Math.min(fw - 1, Math.max(0, Math.floor((crop.x + ox / scaleOut) * kx)));
          if (!dil[gy * fw + gxx]) cmask[i] = 0;
        }
      }
    }
    // zona cercana al dibujo
    const near = makeCanvas(OUT, OUT);
    const nx = ctx2d(near);
    const tauOut = cand.tau * crop.fx * scaleOut;
    nx.lineCap = "round";
    nx.lineJoin = "round";
    nx.strokeStyle = "#fff";
    nx.lineWidth = Math.max(4, 2.2 * tauOut);
    const toOut = (p) => [(p.x - crop.x) * scaleOut, (p.y - crop.y) * scaleOut];
    const outStrokes = crop.strokes.map((s) => s.map(toOut));
    for (const s of outStrokes) {
      nx.beginPath();
      s.forEach(([x, y], i) => (i ? nx.lineTo(x, y) : nx.moveTo(x, y)));
      if (s.length === 1) nx.lineTo(s[0][0] + 0.1, s[0][1]);
      nx.stroke();
    }
    const nd = nx.getImageData(0, 0, OUT, OUT).data;
    const glow = makeCanvas(OUT, OUT);
    const gx = ctx2d(glow);
    const gimg = gx.createImageData(OUT, OUT);
    const machine = gx.createImageData(OUT, OUT);
    const gd = gimg.data, md = machine.data;
    let lit = 0;
    for (let i = 0, j = 0; i < OUT * OUT; i++, j += 4) {
      md[j + 3] = 255;
      if (cmask[i]) {
        const s = smoothstep(tl, th * 1.4, bh[i]);
        const nearA = nd[j + 3] / 255;
        if (nearA > 0.05) {
          const a = s * nearA;
          gd[j] = 255; gd[j + 1] = 206; gd[j + 2] = 26; gd[j + 3] = Math.round(255 * Math.min(1, a * 1.25));
          md[j] = 255; md[j + 1] = 206; md[j + 2] = 26;
          lit++;
        } else {
          const v = 70 + 110 * s;
          md[j] = v; md[j + 1] = v; md[j + 2] = v;
        }
      } else {
        md[j] = 14; md[j + 1] = 15; md[j + 2] = 16;
      }
    }
    gx.putImageData(gimg, 0, 0);
    const mach = makeCanvas(OUT, OUT);
    ctx2d(mach).putImageData(machine, 0, 0);
    // halo suave: reducir y volver a ampliar
    const hs = Math.max(8, Math.round(OUT / 10));
    const halo = makeCanvas(hs, hs);
    const hx = halo.getContext("2d");
    hx.imageSmoothingQuality = "high";
    hx.drawImage(glow, 0, 0, hs, hs);
    // dibujo completo (con marcas de qué parte se encontró) en coordenadas del recorte
    let overlayPts = null;
    if (overlay && overlay.ev && overlay.flags) {
      const ev = overlay.ev, c0 = Math.cos(cand.rot), s0 = Math.sin(cand.rot);
      overlayPts = [];
      const starts = (ev.starts || [0]).concat([ev.n]);
      for (let k = 0; k + 1 < starts.length; k++) {
        const seg = [];
        for (let i = starts[k]; i < starts[k + 1]; i++) {
          const px = ev.pts[2 * i], py = ev.pts[2 * i + 1];
          const x = (cand.cx + cand.S * (px * c0 - py * s0)) * crop.fx, y = (cand.cy + cand.S * (px * s0 + py * c0)) * crop.fy;
          seg.push([(x - crop.x) * scaleOut, (y - crop.y) * scaleOut, overlay.flags[i]]);
        }
        overlayPts.push(seg);
      }
    }
    return { base, glow, halo, mach, crop, outStrokes, overlayPts, scaleOut, OUT, lit };
  }

  function paint(canvas, L, mode, t = 1, showStroke = false) {
    const x = canvas.getContext("2d");
    const O = canvas.width;
    x.save();
    x.clearRect(0, 0, O, O);
    if (mode === "machine") {
      x.drawImage(L.mach, 0, 0, O, O);
      drawStrokes(x, L, O, "rgba(120,220,255,0.95)", Math.max(2, O / 260), [O / 70, O / 90]);
    } else {
      x.drawImage(L.base, 0, 0, O, O);
      if (mode === "reveal" && t > 0) {
        x.fillStyle = `rgba(12,13,15,${0.42 * t})`;
        x.fillRect(0, 0, O, O);
        x.globalCompositeOperation = "lighter";
        x.globalAlpha = 0.85 * t;
        x.imageSmoothingEnabled = true;
        x.drawImage(L.halo, 0, 0, O, O);
        x.globalAlpha = t;
        x.drawImage(L.glow, 0, 0, O, O);
        x.drawImage(L.glow, 0, 0, O, O);
        x.globalCompositeOperation = "source-over";
        x.globalAlpha = 1;
      }
      if (showStroke) {
        if (L.overlayPts) drawOverlay(x, L, O);
        else drawStrokes(x, L, O, "rgba(255,255,255,0.9)", Math.max(2, O / 300), [O / 60, O / 80]);
      }
    }
    x.restore();
  }
  // blanco continuo: parte encontrada · rojo punteado: parte no encontrada
  function drawOverlay(x, L, O) {
    const k = O / L.OUT;
    x.save();
    x.lineCap = "round";
    x.lineJoin = "round";
    for (const seg of L.overlayPts)
      for (let i = 1; i < seg.length; i++) {
        const ok = seg[i][2] && seg[i - 1][2];
        x.strokeStyle = ok ? "rgba(255,255,255,0.95)" : "rgba(255,90,70,0.95)";
        x.lineWidth = ok ? Math.max(2.5, O / 260) : Math.max(2, O / 320);
        x.setLineDash(ok ? [] : [O / 90, O / 110]);
        x.beginPath();
        x.moveTo(seg[i - 1][0] * k, seg[i - 1][1] * k);
        x.lineTo(seg[i][0] * k, seg[i][1] * k);
        x.stroke();
      }
    x.restore();
  }
  function drawStrokes(x, L, O, color, lw, dash) {
    const k = O / L.OUT;
    x.save();
    x.strokeStyle = color;
    x.lineWidth = lw;
    x.lineCap = "round";
    x.lineJoin = "round";
    x.setLineDash(dash);
    for (const s of L.outStrokes) {
      x.beginPath();
      s.forEach(([px, py], i) => (i ? x.lineTo(px * k, py * k) : x.moveTo(px * k, py * k)));
      x.stroke();
    }
    x.restore();
  }

  /* ---------- imágenes de prueba (generadas, no son fotos) ---------- */
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeDemo(variant, W = 1200, H = 900) {
    const c = makeCanvas(W, H), x = c.getContext("2d");
    const R = rng(911 + variant * 7919);
    const rr = (a, b) => a + (b - a) * R();
    // cielo gris de Lima
    const sky = x.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#d9dbd9");
    sky.addColorStop(1, "#c4c7c5");
    x.fillStyle = sky;
    x.fillRect(0, 0, W, H);
    for (let i = 0; i < 12; i++) {
      const cx = rr(0, W), cy = rr(0, H * 0.8), r = rr(140, 380);
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, "rgba(255,255,255,0.13)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = g;
      x.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    }
    const ink = () => {
      const v = Math.round(rr(14, 40));
      return `rgb(${v},${v},${v + 2})`;
    };
    const cable = (pts, lw) => {
      x.strokeStyle = ink();
      x.lineWidth = lw;
      x.lineCap = "round";
      x.lineJoin = "round";
      x.beginPath();
      x.moveTo(pts[0], pts[1]);
      if (pts.length === 6) x.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]);
      else for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]);
      x.stroke();
    };
    const catenary = (x1, y1, x2, y2, sag, lw) => cable([x1, y1, (x1 + x2) / 2, (y1 + y2) / 2 + 2 * sag, x2, y2], lw);
    const bundle = (x1, y1, x2, y2, sag, n) => {
      for (let i = 0; i < n; i++) {
        const o = rr(-9, 9);
        catenary(x1, y1 + o, x2, y2 + o * rr(0.5, 1.5), sag * rr(0.85, 1.15), rr(1.6, 4.2));
      }
    };
    const coil = (cx, cy, r, turns) => {
      for (let t = 0; t < turns; t++) {
        const rx = r * rr(0.9, 1.1), ry = r * rr(0.82, 1.02), ox = rr(-0.07, 0.07) * r, oy = rr(-0.06, 0.06) * r;
        x.strokeStyle = ink();
        x.lineWidth = rr(2, 3.6);
        x.beginPath();
        const steps = 64;
        for (let s = 0; s <= steps; s++) {
          const a = (s / steps) * 2 * PI;
          const j = 1 + 0.025 * Math.sin(a * 3 + t);
          const px = cx + ox + rx * j * Math.cos(a), py = cy + oy + ry * j * Math.sin(a);
          s ? x.lineTo(px, py) : x.moveTo(px, py);
        }
        x.stroke();
      }
      // amarre arriba
      x.fillStyle = "#1b1b1c";
      x.fillRect(cx - 7, cy - r * 0.98 - 6, 14, 12);
    };
    const tangle = (cx, cy, rx, ry, n) => {
      for (let k = 0; k < n; k++) {
        const pts = [];
        const m = Math.round(rr(6, 11));
        for (let i = 0; i < m; i++) pts.push([cx + rr(-rx, rx), cy + rr(-ry, ry)]);
        x.strokeStyle = ink();
        x.lineWidth = rr(1.4, 3.2);
        x.beginPath();
        x.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < m - 1; i++) {
          const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
          x.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
        }
        x.stroke();
      }
    };
    const pole = (px, top, wid, arm) => {
      const g = x.createLinearGradient(px - wid / 2, 0, px + wid / 2, 0);
      g.addColorStop(0, "#8f908b");
      g.addColorStop(0.35, "#b9bab4");
      g.addColorStop(1, "#7f807b");
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(px - wid * 0.42, top);
      x.lineTo(px + wid * 0.42, top);
      x.lineTo(px + wid / 2, H);
      x.lineTo(px - wid / 2, H);
      x.closePath();
      x.fill();
      if (arm) {
        x.fillStyle = "#9c9d97";
        x.fillRect(px - arm / 2, top + 46, arm, 12);
        x.fillStyle = "#3a3b3d";
        for (let i = 0; i < 4; i++) x.fillRect(px - arm / 2 + 10 + (i * (arm - 30)) / 3, top + 34, 10, 14);
      }
      // código pintado del poste
      x.fillStyle = "rgba(30,30,30,0.55)";
      x.font = "bold 13px monospace";
      x.save();
      x.translate(px - 4, H - 160);
      x.rotate(-PI / 2);
      x.fillText("LDS " + Math.round(rr(10000, 99999)), 0, 0);
      x.restore();
    };
    const buildings = (fromX, toX) => {
      const pal = ["#c9b391", "#b9a07c", "#a3684d", "#d6c6a8", "#9f8f7a", "#c08a6a", "#b4b0a4"];
      let bx = fromX;
      while (bx < toX) {
        const bw = rr(150, 300), bh = rr(120, 280);
        x.fillStyle = pal[Math.floor(R() * pal.length)];
        x.fillRect(bx, H - bh, bw, bh);
        x.fillStyle = "rgba(40,38,36,0.55)";
        for (let wy = H - bh + 26; wy < H - 30; wy += 70)
          for (let wx = bx + 20; wx < bx + bw - 40; wx += 64) x.fillRect(wx, wy, 34, 40);
        // fierros en la azotea (casas sin terminar)
        x.strokeStyle = "#3b3632";
        x.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
          const fx = bx + 14 + (i * (bw - 28)) / 4;
          x.beginPath();
          x.moveTo(fx, H - bh);
          x.lineTo(fx + rr(-3, 3), H - bh - rr(24, 46));
          x.stroke();
        }
        bx += bw + rr(0, 6);
      }
    };

    switch (variant % 6) {
      case 0: {
        buildings(0, W);
        pole(420, -40, 38, 240);
        for (let i = 0; i < 9; i++) catenary(-40, rr(60, 380), W + 40, rr(60, 420), rr(30, 110), rr(1.6, 4));
        bundle(420, 70, W + 40, 200, 70, 4);
        coil(420, 330, 96, 6);
        coil(840, 250, 42, 4);
        break;
      }
      case 1: {
        buildings(W * 0.55, W);
        for (let i = 0; i < 7; i++) catenary(-40, rr(40, 600), W + 40, rr(20, 500), rr(20, 90), rr(1.6, 3.6));
        tangle(W * 0.72, H * 0.28, 230, 150, 26);
        tangle(W * 0.3, H * 0.62, 120, 80, 8);
        break;
      }
      case 2: {
        buildings(0, W * 0.4);
        pole(W - 70, -20, 40, 200);
        bundle(-40, 120, W - 70, 90, 150, 5);
        bundle(-40, 330, W - 70, 260, 120, 4);
        for (let i = 0; i < 5; i++) catenary(-40, rr(60, 500), W - 70, rr(80, 300), rr(60, 200), rr(1.8, 3.6));
        break;
      }
      case 3: {
        buildings(0, W);
        pole(260, -30, 34, 200);
        pole(950, -30, 34, 200);
        for (let i = 0; i < 10; i++) catenary(260, rr(70, 200), 950, rr(70, 200), rr(30, 120), rr(1.6, 3.8));
        for (let i = 0; i < 4; i++) catenary(-40, rr(80, 300), 260, rr(70, 200), rr(10, 60), rr(1.6, 3.2));
        coil(260, 380, 58, 5);
        coil(950, 420, 122, 7);
        break;
      }
      case 4: {
        buildings(0, W * 0.3);
        buildings(W * 0.75, W);
        pole(W * 0.5, -40, 40, 260);
        tangle(W * 0.5, H * 0.33, 260, 170, 34);
        for (let i = 0; i < 6; i++) catenary(-40, rr(80, 320), W + 40, rr(80, 360), rr(30, 120), rr(1.6, 3.6));
        coil(W * 0.5 + 170, H * 0.62, 70, 5);
        break;
      }
      default: {
        buildings(0, W);
        pole(W * 0.62, -40, 36, 220);
        for (let i = 0; i < 6; i++) cable([-40, rr(40, 700), W + 40, rr(-100, 500)], rr(1.6, 3.8));
        for (let i = 0; i < 5; i++) catenary(-40, rr(40, 300), W * 0.62, rr(60, 160), rr(20, 90), rr(1.6, 3.6));
        // un cable que zigzaguea como rayo
        cable([180, 120, 330, 300, 250, 330, 420, 560, 340, 590, 520, 820], 3.2);
        x.fillStyle = "#6f716e";
        x.fillRect(W * 0.62 + 22, 230, 70, 110);
        break;
      }
    }
    // grano de foto
    const im = x.getImageData(0, 0, W, H), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (R() - 0.5) * 12;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    x.putImageData(im, 0, 0);
    x.fillStyle = "rgba(0,0,0,0.42)";
    x.font = "600 18px sans-serif";
    x.textAlign = "right";
    x.fillText("IMAGEN DE PRUEBA · generada por computadora", W - 18, H - 16);
    return c;
  }

  /* ---------- trazos de ejemplo ---------- */
  function densify(v, k = 24) {
    const out = [];
    for (let i = 1; i < v.length; i++)
      for (let t = 0; t < k; t++) out.push({ x: v[i - 1].x + ((v[i].x - v[i - 1].x) * t) / k, y: v[i - 1].y + ((v[i].y - v[i - 1].y) * t) / k });
    out.push(v[v.length - 1]);
    return out;
  }
  function presetStrokes(name, size = 600, seed = 3) {
    const R = rng(seed + name.length * 31);
    const j = (a) => a * (1 + (R() - 0.5) * 0.04);
    const c = size / 2, r = size * 0.32;
    const pts = [];
    if (name === "circulo") {
      const a0 = -PI / 2 + 0.3;
      for (let i = 0; i <= 90; i++) {
        const a = a0 + (i / 90) * (2 * PI + 0.25);
        pts.push({ x: c + j(r) * Math.cos(a), y: c + j(r) * 0.97 * Math.sin(a) });
      }
      return [pts];
    }
    if (name === "corazon") {
      for (let i = 0; i <= 120; i++) {
        const t = (i / 120) * 2 * PI;
        const hx = 16 * Math.pow(Math.sin(t), 3);
        const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        pts.push({ x: c + j(hx) * (r / 16), y: c - j(hy) * (r / 16) - r * 0.08 });
      }
      return [pts];
    }
    if (name === "ola") {
      // una “U”, como un cable que cuelga entre dos postes
      for (let i = 0; i <= 100; i++) {
        const t = i / 100;
        pts.push({ x: c - r * 1.15 + t * 2.3 * r, y: c - r * 0.35 + j(r * 0.9) * Math.sin(t * PI) });
      }
      return [pts];
    }
    if (name === "rayo") {
      const zz = [[-0.35, -1], [0.25, -0.15], [-0.1, -0.05], [0.4, 1]];
      const out = [];
      for (let k = 1; k < zz.length; k++) {
        for (let i = 0; i <= 20; i++) {
          const t = i / 20;
          out.push({ x: c + r * (zz[k - 1][0] + (zz[k][0] - zz[k - 1][0]) * t), y: c + r * (zz[k - 1][1] + (zz[k][1] - zz[k - 1][1]) * t) });
        }
      }
      return [out];
    }
    if (name === "estrella") {
      for (let i = 0; i <= 10; i++) {
        const a = -PI / 2 + (i * 4 * PI) / 5;
        pts.push({ x: c + r * Math.cos(a), y: c + r * Math.sin(a) });
      }
      return [densify(pts)];
    }
    if (name === "espiral") {
      for (let i = 0; i <= 160; i++) {
        const t = (i / 160) * 3 * 2 * PI, rr = r * (0.15 + 0.85 * (i / 160));
        pts.push({ x: c + rr * Math.cos(t), y: c + rr * Math.sin(t) });
      }
      return [pts];
    }
    if (name === "triangulo") {
      const v = [[0, -1], [0.95, 0.75], [-0.95, 0.75], [0, -1]].map(([a, b]) => ({ x: c + a * r, y: c + b * r }));
      return [densify(v)];
    }
    if (name === "cuadrado") {
      const v = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([a, b]) => ({ x: c + a * r * 0.8, y: c + b * r * 0.8 }));
      return [densify(v)];
    }
    if (name === "letraA") {
      return [densify([{ x: c - r * 0.7, y: c + r }, { x: c, y: c - r }, { x: c + r * 0.7, y: c + r }]), densify([{ x: c - r * 0.38, y: c + r * 0.15 }, { x: c + r * 0.38, y: c + r * 0.15 }])];
    }
    if (name === "linea") {
      for (let i = 0; i <= 40; i++) pts.push({ x: c - r * 1.2 + (i / 40) * 2.4 * r, y: c + r * 0.12 * (i / 40) });
      return [pts];
    }
    return [];
  }

  return {
    K, UMBRAL, OPC, pasa, calidad, detect, gridSize, buildLow, coarseRank, variantes, searchDrawing, complejidad, strictFlags, buildDTs, computeFeatures, encodeDet, decodeDet, prepareDrawing, searchOne,
    buildLayers, paint, makeDemo, presetStrokes, cropFor, shapeSig, shapeDist,
  };
})();

export default Engine;
