// Riconoscimento (euristico) dei muri da una pianta raster: funziona bene con piante
// "pulite" (catastali, CAD stampati) dove i muri sono linee nere orizzontali/verticali,
// piene o a doppia linea. Le linee colorate (quote rosse, testi blu) vengono ignorate.

export interface Img {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export interface DetectedWall {
  /** coordinate in cm */
  ax: number;
  ay: number;
  bx: number;
  by: number;
  thickness: number;
}
export interface DetectedDoor {
  x: number;
  y: number;
  width: number;
  type?: 'door' | 'arch' | 'window';
  /** finestre: davanzale/altezza (portafinestra = davanzale 0) */
  sill?: number;
  height?: number;
}

export interface DetectOptions {
  /** cm per pixel dell'immagine passata */
  cmPerPx: number;
  /** origine (cm) del pixel (0,0) */
  originX: number;
  originY: number;
  /** lunghezza minima di una linea di muro (cm) */
  minLen?: number;
  /** spessore min/max di un muro (cm) */
  minT?: number;
  maxT?: number;
  /** soglia di scuro 0..255 */
  dark?: number;
  /** limita il riconoscimento a un rettangolo (px) */
  roi?: { x0: number; y0: number; x1: number; y1: number };
}

interface Stroke {
  /** coordinata trasversale (px, centro) */
  c: number;
  /** estensione longitudinale (px) */
  s0: number;
  s1: number;
  /** spessore (px) */
  t: number;
}

/** Trova i tratti (linee) orizzontali scuri. Per le verticali si chiama con l'immagine trasposta. */
function strokes(mask: Uint8Array, w: number, h: number, minRun: number, gapPx: number): Stroke[] {
  type Active = { y0: number; y1: number; s0: number; s1: number; runs: number };
  let active: Active[] = [];
  const done: Active[] = [];
  for (let y = 0; y < h; y++) {
    const runs: [number, number][] = [];
    let x = 0;
    const row = y * w;
    while (x < w) {
      if (!mask[row + x]) {
        x++;
        continue;
      }
      const s = x;
      // tollera piccole interruzioni (es. quote colorate che attraversano la linea)
      let last = x;
      while (x < w && x - last <= gapPx) {
        if (mask[row + x]) last = x;
        x++;
      }
      x = last + 1;
      if (x - s >= minRun) runs.push([s, x]);
    }
    const next: Active[] = [];
    const used = new Set<Active>();
    for (const [s, e] of runs) {
      let match: Active | undefined;
      for (const a of active) {
        if (used.has(a)) continue;
        const ov = Math.min(a.s1, e) - Math.max(a.s0, s);
        if (ov > 0.8 * Math.min(a.s1 - a.s0, e - s)) {
          match = a;
          break;
        }
      }
      if (match) {
        used.add(match);
        match.y1 = y;
        match.s0 = Math.min(match.s0, s);
        match.s1 = Math.max(match.s1, e);
        match.runs++;
        next.push(match);
      } else next.push({ y0: y, y1: y, s0: s, s1: e, runs: 1 });
    }
    for (const a of active) if (!used.has(a)) done.push(a);
    active = next;
  }
  done.push(...active);
  return done.map((a) => ({ c: (a.y0 + a.y1) / 2, s0: a.s0, s1: a.s1, t: a.y1 - a.y0 + 1 }));
}

interface AxisWall {
  /** 'h' = orizzontale (asse y costante) */
  o: 'h' | 'v';
  c: number;
  s0: number;
  s1: number;
  t: number;
}

function pairStrokes(ss: Stroke[], minT: number, maxT: number, o: 'h' | 'v'): AxisWall[] {
  const out: AxisWall[] = [];
  const used = new Set<Stroke>();
  // muri pieni
  for (const s of ss) if (s.t >= minT && s.t <= maxT * 1.2) {
    out.push({ o, c: s.c, s0: s.s0, s1: s.s1, t: s.t });
    used.add(s);
  }
  // muri a doppia linea: accoppia tratti sottili paralleli e vicini
  const thin = ss.filter((s) => !used.has(s)).sort((a, b) => a.c - b.c);
  const cand: { a: Stroke; b: Stroke; gap: number; ov: number }[] = [];
  for (let i = 0; i < thin.length; i++)
    for (let j = i + 1; j < thin.length; j++) {
      const a = thin[i];
      const b = thin[j];
      const gap = b.c - a.c;
      if (gap > maxT) break;
      if (gap < minT * 0.6) continue;
      const ov = Math.min(a.s1, b.s1) - Math.max(a.s0, b.s0);
      if (ov <= 0) continue;
      cand.push({ a, b, gap, ov });
    }
  cand.sort((x, y) => y.ov - x.ov || x.gap - y.gap);
  // un tratto può fare da faccia a più muri (segmenti diversi), ma gli intervalli non si sovrappongono
  const taken = new Map<Stroke, [number, number][]>();
  const free = (s: Stroke, s0: number, s1: number) => (taken.get(s) ?? []).every(([a, b]) => Math.min(b, s1) - Math.max(a, s0) <= 2);
  for (const { a, b, gap } of cand) {
    const s0 = Math.max(a.s0, b.s0);
    const s1 = Math.min(a.s1, b.s1);
    if (!free(a, s0, s1) || !free(b, s0, s1)) continue;
    // nessun altro tratto in mezzo che copra la stessa estensione
    const between = thin.some((x) => x !== a && x !== b && x.c > a.c + 0.5 && x.c < b.c - 0.5 && Math.min(x.s1, s1) - Math.max(x.s0, s0) > 0.5 * (s1 - s0));
    if (between) continue;
    taken.set(a, [...(taken.get(a) ?? []), [s0, s1]]);
    taken.set(b, [...(taken.get(b) ?? []), [s0, s1]]);
    out.push({ o, c: (a.c + b.c) / 2, s0, s1, t: gap + (a.t + b.t) / 2 });
  }
  return out;
}

export function detectWalls(img: Img, opt: DetectOptions): { walls: DetectedWall[]; doors: DetectedDoor[] } {
  const { width: W, height: H, data } = img;
  const k = opt.cmPerPx;
  const minLen = (opt.minLen ?? 50) / k;
  const minT = Math.max(2, (opt.minT ?? 5) / k);
  const maxT = (opt.maxT ?? 50) / k;
  const dark = opt.dark ?? 140;
  const roi = opt.roi ?? { x0: 0, y0: 0, x1: W, y1: H };

  // maschera dei pixel scuri e "neutri" (non colorati)
  const mask = new Uint8Array(W * H);
  for (let y = Math.max(0, roi.y0); y < Math.min(H, roi.y1); y++)
    for (let x = Math.max(0, roi.x0); x < Math.min(W, roi.x1); x++) {
      const i = (y * W + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      if (mx < dark && mx - mn < 40) mask[y * W + x] = 1;
    }
  // trasposta per le verticali
  const maskT = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) maskT[x * H + y] = mask[y * W + x];

  const gapPx = Math.max(1, Math.round(4 / k));
  const hs = strokes(mask, W, H, minLen, gapPx);
  const vs = strokes(maskT, H, W, minLen, gapPx);
  let walls: AxisWall[] = [...pairStrokes(hs, minT, maxT, 'h'), ...pairStrokes(vs, minT, maxT, 'v')];

  // unisci duplicati collineari sovrapposti
  walls = mergeCollinear(walls, 3 / k, 0);

  // porte: buchi tra muri collineari dello stesso spessore
  const doors: { o: 'h' | 'v'; c: number; s0: number; s1: number }[] = [];
  const byLine = [...walls].sort((a, b) => (a.o === b.o ? a.c - b.c || a.s0 - b.s0 : a.o < b.o ? -1 : 1));
  for (let i = 0; i < byLine.length; i++)
    for (let j = 0; j < byLine.length; j++) {
      const a = byLine[i];
      const b = byLine[j];
      if (a === b || a.o !== b.o || Math.abs(a.c - b.c) > 4 / k || Math.abs(a.t - b.t) > 6 / k) continue;
      const gap = b.s0 - a.s1;
      if (gap * k >= 55 && gap * k <= 135) doors.push({ o: a.o, c: (a.c + b.c) / 2, s0: a.s1, s1: b.s0 });
    }
  // le porte diventano tratti di muro (con l'apertura) per collegare le stanze
  for (const d of doors) {
    const a = walls.find((w) => w.o === d.o && Math.abs(w.c - d.c) < 4 / k && Math.abs(w.s1 - d.s0) < 1);
    walls.push({ o: d.o, c: d.c, s0: d.s0, s1: d.s1, t: a?.t ?? 10 / k });
  }
  walls = mergeCollinear(walls, 4 / k, 1);

  // muri paralleli sovrapposti (es. muro esterno spesso letto come due muri) → uno solo
  walls = mergeParallel(walls, 4 / k);

  // chiudi angoli e giunzioni a T: prima con tolleranza stretta, poi più larga per le estremità rimaste libere
  closeEnds(walls, 25 / k);
  closeEnds(walls, 70 / k, true);

  // estremità ancora libere: prolunga fino al muro successivo; il tratto aggiunto diventa un varco
  const bridges = bridgeFree(walls, k);
  walls = mergeCollinear(walls, 4 / k, 1);

  const toCm = (x: number, y: number) => ({ x: opt.originX + x * k, y: opt.originY + y * k });
  const out: DetectedWall[] = walls
    .filter((w) => (w.s1 - w.s0) * k >= 20)
    .map((w) => {
      const a = w.o === 'h' ? toCm(w.s0, w.c) : toCm(w.c, w.s0);
      const b = w.o === 'h' ? toCm(w.s1, w.c) : toCm(w.c, w.s1);
      const t = Math.round(w.t * k);
      return { ax: round(a.x), ay: round(a.y), bx: round(b.x), by: round(b.y), thickness: Math.max(5, Math.min(60, t)) };
    });
  void doors;
  void bridges;
  // porte e finestre: si leggono percorrendo ogni muro e guardando com'è disegnato il suo spessore
  const openings = walls.flatMap((w) => classifyOpenings(mask, W, H, w, k));
  const outDoors: DetectedDoor[] = openings.map((d) => {
    const m = (d.s0 + d.s1) / 2;
    const p = d.o === 'h' ? toCm(m, d.c) : toCm(d.c, m);
    return { x: p.x, y: p.y, width: Math.round((d.s1 - d.s0) * k), type: d.type, sill: d.sill, height: d.height };
  });
  return { walls: out, doors: outDoors };
}

function round(x: number) {
  return Math.round(x * 2) / 2;
}

function mergeCollinear(ws: AxisWall[], tolC: number, gapTol: number): AxisWall[] {
  const sorted = [...ws].sort((a, b) => (a.o === b.o ? a.c - b.c || a.s0 - b.s0 : a.o < b.o ? -1 : 1));
  const out: AxisWall[] = [];
  for (const w of sorted) {
    const m = out.find((x) => x.o === w.o && Math.abs(x.c - w.c) <= tolC && w.s0 <= x.s1 + gapTol && w.s1 >= x.s0 - gapTol);
    if (m) {
      const L1 = m.s1 - m.s0;
      const L2 = w.s1 - w.s0;
      m.c = (m.c * L1 + w.c * L2) / (L1 + L2);
      m.t = Math.max(m.t, w.t);
      m.s0 = Math.min(m.s0, w.s0);
      m.s1 = Math.max(m.s1, w.s1);
    } else out.push({ ...w });
  }
  return out;
}

function isConnected(w: AxisWall, end: 's0' | 's1', walls: AxisWall[], tol: number) {
  const pos = w[end];
  return walls.some((p) => p !== w && (p.o !== w.o ? Math.abs(p.c - pos) <= tol && w.c >= p.s0 - tol && w.c <= p.s1 + tol : Math.abs(p.c - w.c) <= tol && (Math.abs(p.s0 - pos) <= tol || Math.abs(p.s1 - pos) <= tol)));
}

/** Allunga le estremità dei muri fino all'asse del muro perpendicolare vicino (e allunga anche quello se serve). */
function closeEnds(walls: AxisWall[], ext: number, onlyFree = false) {
  for (const w of walls) {
    for (const end of ['s0', 's1'] as const) {
      if (onlyFree && isConnected(w, end, walls, 1)) continue;
      const pos = w[end];
      let best: AxisWall | null = null;
      let bd = Infinity;
      for (const p of walls) {
        if (p.o === w.o) continue;
        if (w.c < p.s0 - p.t / 2 - ext || w.c > p.s1 + p.t / 2 + ext) continue;
        const d = Math.abs(p.c - pos);
        // non attraversare il muro: l'estensione deve andare "verso l'esterno" del tratto
        const outward = end === 's0' ? p.c <= pos + p.t / 2 : p.c >= pos - p.t / 2;
        if (d <= p.t / 2 + ext && outward && d < bd) {
          bd = d;
          best = p;
        }
      }
      if (best) {
        w[end] = best.c;
        if (w.c < best.s0) best.s0 = w.c;
        if (w.c > best.s1) best.s1 = w.c;
      }
    }
  }
}

function mergeParallel(ws: AxisWall[], tol: number): AxisWall[] {
  const out: AxisWall[] = [];
  const sorted = [...ws].sort((a, b) => b.s1 - b.s0 - (a.s1 - a.s0));
  for (const w of sorted) {
    const m = out.find((x) => {
      if (x.o !== w.o) return false;
      const ov = Math.min(x.s1, w.s1) - Math.max(x.s0, w.s0);
      if (ov < 0.6 * Math.min(x.s1 - x.s0, w.s1 - w.s0)) return false;
      // le due fasce si toccano o si sovrappongono
      return Math.abs(x.c - w.c) <= (x.t + w.t) / 2 + tol;
    });
    if (m) {
      const lo = Math.min(m.c - m.t / 2, w.c - w.t / 2);
      const hi = Math.max(m.c + m.t / 2, w.c + w.t / 2);
      m.c = (lo + hi) / 2;
      m.t = hi - lo;
      m.s0 = Math.min(m.s0, w.s0);
      m.s1 = Math.max(m.s1, w.s1);
    } else out.push({ ...w });
  }
  return out;
}

/** Prolunga le estremità libere lungo l'asse fino al primo muro (max ~2 m). Ritorna i varchi creati. */
function bridgeFree(walls: AxisWall[], k: number) {
  const out: { o: 'h' | 'v'; c: number; s0: number; s1: number; type: 'door' | 'arch' }[] = [];
  const maxCol = 200 / k;
  const maxPerp = 160 / k;
  for (const w of walls) {
    for (const end of ['s0', 's1'] as const) {
      if (isConnected(w, end, walls, 1)) continue;
      const dir = end === 's1' ? 1 : -1;
      const pos = w[end];
      let best: { gap: number; to: number; open0: number; open1: number } | null = null;
      for (const q of walls) {
        if (q === w) continue;
        if (q.o === w.o) {
          if (Math.abs(q.c - w.c) > Math.max(w.t, q.t) / 2) continue;
          const near = dir > 0 ? q.s0 : q.s1;
          const gap = (near - pos) * dir;
          if (gap > 0.5 && gap <= maxCol && (!best || gap < best.gap)) best = { gap, to: near, open0: Math.min(pos, near), open1: Math.max(pos, near) };
        } else {
          if (w.c < q.s0 - q.t / 2 || w.c > q.s1 + q.t / 2) continue;
          const gap = (q.c - pos) * dir;
          const face = q.c - (dir * q.t) / 2;
          if (gap > 0.5 && gap <= maxPerp && (!best || gap < best.gap)) best = { gap, to: q.c, open0: Math.min(pos, face), open1: Math.max(pos, face) };
        }
      }
      if (!best) continue;
      w[end] = best.to;
      const width = (best.open1 - best.open0) * k;
      if (width >= 55) out.push({ o: w.o, c: w.c, s0: best.open0, s1: best.open1, type: width <= 110 ? 'door' : 'arch' });
    }
  }
  return out;
}


type OpenKind = 'door' | 'arch' | 'window';

/**
 * Percorre il muro e classifica ogni posizione guardando la sezione trasversale:
 *  - muro: le due facce presenti e l'interno vuoto (o pieno, nelle piante a muri campiti)
 *  - finestra: facce presenti e linee sottili DENTRO lo spessore
 *  - apertura: una o entrambe le facce interrotte → porta (55–130 cm) o varco (più largo)
 */
export function classifyOpenings(mask: Uint8Array, W: number, H: number, w: { o: 'h' | 'v'; c: number; s0: number; s1: number; t: number }, k: number) {
  const out: { o: 'h' | 'v'; c: number; s0: number; s1: number; type: OpenKind; sill?: number; height?: number }[] = [];
  const half = w.t / 2;
  if (w.t < 3) return out; // troppo sottile per leggerne l'interno
  const at = (s: number, d: number) => {
    const x = Math.round(w.o === 'h' ? s : d);
    const y = Math.round(w.o === 'h' ? d : s);
    return x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1;
  };
  const any = (s: number, d0: number, d1: number) => {
    for (let d = Math.floor(d0); d <= Math.ceil(d1); d++) if (at(s, d)) return true;
    return false;
  };
  const s0 = Math.ceil(w.s0);
  const s1 = Math.floor(w.s1);
  const n = s1 - s0 + 1;
  if (n < 10) return out;
  const cls: string[] = new Array(n);
  let jam = 0;
  for (let i = 0; i < n; i++) {
    const s = s0 + i;
    const fA = any(s, w.c - half - 1, w.c - half + 2);
    const fB = any(s, w.c + half - 2, w.c + half + 1);
    let dk = 0;
    let tot = 0;
    const m = w.t >= 7 ? 3 : 1.5; // margine dalle facce (i tramezzi sottili hanno pochi pixel)
    let d0 = Math.ceil(w.c - half + m);
    let d1 = Math.floor(w.c + half - m);
    if (d1 < d0) d0 = d1 = Math.round(w.c);
    for (let d = d0; d <= d1; d++) {
      tot++;
      if (at(s, d)) dk++;
    }
    const fr = tot ? dk / tot : 0;
    let c: string;
    if (fr >= 0.7) c = 'J';
    else if (!fA || !fB) c = 'G';
    else if (fr > 0.08) c = 'L';
    else c = 'W';
    if (c === 'J') jam++;
    cls[i] = c;
  }
  const filled = jam > n * 0.5;
  // piante con muri campiti (pieni): il "muro" è J, il vuoto è apertura, l'interno a righe è finestra
  if (filled) for (let i = 0; i < n; i++) cls[i] = cls[i] === 'J' ? 'W' : cls[i] === 'W' ? 'G' : cls[i];

  // 1) stipiti: linee trasversali sottili che attraversano tutto lo spessore
  const jambs: number[] = [];
  if (!filled) {
    let i = 0;
    while (i < n) {
      if (cls[i] !== 'J') {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < n && cls[j + 1] === 'J') j++;
      if ((j - i + 1) * k <= 6) jambs.push((i + j) / 2);
      i = j + 1;
    }
  }
  const thick = w.t * k >= 20; // muro esterno
  type Seg = { a: number; b: number; kind: OpenKind; sill?: number; height?: number };
  const segs: Seg[] = [];
  const share = (a: number, b: number, c: string) => {
    let m = 0;
    for (let i = Math.ceil(a); i <= Math.floor(b); i++) if (cls[i] === c) m++;
    return m / Math.max(1, Math.floor(b) - Math.ceil(a) + 1);
  };

  // 2) porte: una riga trasversale che attraversa il muro e SPORGE fuori (riga singola, non un altro muro)
  const maxOut = Math.round(60 / k);
  const minOut = Math.max(3, 8 / k);
  const iso = Math.max(3, Math.round(4 / k));
  const protrude = (s: number, dir: 1 | -1) => {
    const face = dir > 0 ? w.c + half : w.c - half;
    let L = 0;
    for (let d = 2; d <= maxOut; d++) {
      const dd = face + dir * d;
      if (at(s, dd) || at(s - 1, dd) || at(s + 1, dd)) L = d;
      else if (d - L > 2) break;
    }
    if (L < minOut) return 0;
    // riga isolata: ai lati (a qualche px) niente linee parallele per gran parte della sporgenza
    let side = 0;
    for (let d = 2; d <= L; d++) {
      const dd = face + dir * d;
      if (at(s - iso, dd) || at(s + iso, dd)) side++;
    }
    return side / L < 0.3 ? L : 0;
  };
  const tickCols: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = s0 + i;
    const crosses = cls[i] === 'J' || (i > 0 && cls[i - 1] === 'J') || (i + 1 < n && cls[i + 1] === 'J');
    if (!crosses) continue;
    if (protrude(s, 1) || protrude(s, -1)) tickCols.push(i);
  }
  const ticks: number[] = [];
  for (const t of tickCols) {
    const last = ticks[ticks.length - 1];
    if (last !== undefined && t - last <= 3) ticks[ticks.length - 1] = (last + t) / 2;
    else ticks.push(t);
  }
  const dflt = 80 / k;
  for (const t of ticks) {
    // larghezza dagli stipiti più vicini attorno alla riga, se plausibili
    const left = [...jambs].reverse().find((j) => j < t - 2 && (t - j) * k <= 160);
    const right = jambs.find((j) => j > t + 2 && (j - t) * k <= 160);
    let a = t - dflt / 2;
    let b = t + dflt / 2;
    if (left !== undefined && right !== undefined && (right - left) * k >= 50 && (right - left) * k <= 320) {
      a = left;
      b = right;
    }
    // una riga che cade a fine muro è un angolo/una giunzione, non una porta
    if (a < 0 || b > n - 1) continue;
    if (thick) segs.push({ a, b, kind: 'window', sill: 0, height: 220 }); // portafinestra
    else segs.push({ a, b, kind: 'door' });
  }

  // 3) finestre: righe parallele dentro lo spessore, tra due stipiti
  for (let q = 0; q + 1 < jambs.length; q++) {
    const a = jambs[q];
    const b = jambs[q + 1];
    const len = (b - a) * k;
    if (len < 40 || len > 320) continue;
    if (segs.some((sg) => Math.min(sg.b, b) - Math.max(sg.a, a) > 2)) continue;
    if (share(a, b, 'L') > 0.4) segs.push({ a, b, kind: 'window' });
  }
  for (const sg of segs) out.push({ o: w.o, c: w.c, s0: s0 + sg.a, s1: s0 + sg.b, type: sg.kind, sill: sg.sill, height: sg.height });

  // 4) aperture senza stipiti: tratti dove le facce del muro sono interrotte, o con righe interne
  const runs: { c: string; a: number; b: number }[] = [];
  for (let i = 0; i < n; i++) {
    const c = cls[i] === 'J' ? '?' : cls[i];
    const last = runs[runs.length - 1];
    if (last && last.c === c) last.b = i;
    else runs.push({ c, a: i, b: i });
  }
  const noise = Math.max(2, 4 / k);
  for (let i = 1; i < runs.length - 1; i++) {
    const r = runs[i];
    if ((r.c === '?' || r.b - r.a + 1 < noise) && runs[i - 1].c === runs[i + 1].c) {
      runs[i - 1].b = runs[i + 1].b;
      runs.splice(i, 2);
      i--;
    }
  }
  const taken = (a: number, b: number) => out.some((o) => Math.min(o.s1, s0 + b) - Math.max(o.s0, s0 + a) > 0);
  for (const r of runs) {
    const len = (r.b - r.a + 1) * k;
    if (taken(r.a, r.b + 1)) continue;
    if (r.c === 'L' && len >= 40 && len <= 400) out.push({ o: w.o, c: w.c, s0: s0 + r.a, s1: s0 + r.b + 1, type: 'window' });
    else if (r.c === 'G' && len >= 55 && len <= 250) out.push({ o: w.o, c: w.c, s0: s0 + r.a, s1: s0 + r.b + 1, type: len <= 130 ? 'door' : 'arch' });
  }
  return out;
}
