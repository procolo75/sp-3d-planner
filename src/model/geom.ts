import type { ID, Project, Wall } from './types';

export interface V {
  x: number;
  y: number;
}

export const v = (x: number, y: number): V => ({ x, y });
export const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: V, k: number): V => ({ x: a.x * k, y: a.y * k });
export const dot = (a: V, b: V) => a.x * b.x + a.y * b.y;
export const cross = (a: V, b: V) => a.x * b.y - a.y * b.x;
export const len = (a: V) => Math.hypot(a.x, a.y);
export const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a: V): V => {
  const l = len(a);
  return l < 1e-9 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};
/** ruota di +90° (verso angoli crescenti) */
export const perp = (a: V): V => ({ x: -a.y, y: a.x });

export function lineIntersect(p: V, d: V, q: V, e: V): V | null {
  const den = cross(d, e);
  if (Math.abs(den) < 1e-9) return null;
  const t = cross(sub(q, p), e) / den;
  return add(p, mul(d, t));
}

export function segmentIntersect(a: V, b: V, c: V, d: V): { p: V; t: number; u: number } | null {
  const r = sub(b, a);
  const s = sub(d, c);
  const den = cross(r, s);
  if (Math.abs(den) < 1e-9) return null;
  const t = cross(sub(c, a), s) / den;
  const u = cross(sub(c, a), r) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { p: add(a, mul(r, t)), t, u };
}

/** proiezione di p sul segmento ab: t in [0,1] e distanza */
export function projectOnSegment(p: V, a: V, b: V) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  let t = l2 < 1e-9 ? 0 : dot(sub(p, a), ab) / l2;
  t = Math.max(0, Math.min(1, t));
  const q = add(a, mul(ab, t));
  return { t, point: q, dist: dist(p, q) };
}

export function polygonArea(pts: V[]) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function polygonCentroid(pts: V[]): V {
  const A = polygonArea(pts);
  if (Math.abs(A) < 1e-6) {
    const s = pts.reduce((acc, p) => add(acc, p), v(0, 0));
    return mul(s, 1 / Math.max(1, pts.length));
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const f = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * f;
    cy += (a.y + b.y) * f;
  }
  return v(cx / (6 * A), cy / (6 * A));
}

export function pointInPolygon(p: V, pts: V[]) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Punto interno "visivamente buono" per l'etichetta: centroide se interno, altrimenti un punto interno trovato a scansione. */
export function labelPoint(pts: V[]): V {
  const c = polygonCentroid(pts);
  if (pointInPolygon(c, pts)) return c;
  let best = c;
  let bestScore = -Infinity;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (let i = 1; i < 20; i++)
    for (let j = 1; j < 20; j++) {
      const p = v(x0 + ((x1 - x0) * i) / 20, y0 + ((y1 - y0) * j) / 20);
      if (!pointInPolygon(p, pts)) continue;
      let m = Infinity;
      for (let k = 0; k < pts.length; k++) m = Math.min(m, projectOnSegment(p, pts[k], pts[(k + 1) % pts.length]).dist);
      if (m > bestScore) {
        bestScore = m;
        best = p;
      }
    }
  return best;
}

// ---------------------------------------------------------------------------
// Muri: angoli con giunzioni (miter)

export interface WallCorners {
  /** lato "L" = a + perp(dir)*t/2, lato "R" = a - perp(dir)*t/2 */
  aL: V;
  aR: V;
  bL: V;
  bR: V;
}

export function wallDir(p: Project, w: Wall): V {
  const a = p.nodes[w.a];
  const b = p.nodes[w.b];
  return norm(sub(b, a));
}

export function wallLength(p: Project, w: Wall) {
  return dist(p.nodes[w.a], p.nodes[w.b]);
}

/** muri incidenti a ciascun nodo */
export function nodeWalls(p: Project): Map<ID, ID[]> {
  const m = new Map<ID, ID[]>();
  for (const id in p.nodes) m.set(id, []);
  for (const w of Object.values(p.walls)) {
    m.get(w.a)?.push(w.id);
    m.get(w.b)?.push(w.id);
  }
  return m;
}

export function computeWallCorners(p: Project): Map<ID, WallCorners> {
  const out = new Map<ID, Partial<WallCorners>>();
  const inc = nodeWalls(p);
  for (const w of Object.values(p.walls)) out.set(w.id, {});

  for (const [nid, wids] of inc) {
    const n = p.nodes[nid];
    const edges = wids
      .map((wid) => {
        const w = p.walls[wid];
        const other = p.nodes[w.a === nid ? w.b : w.a];
        const d = norm(sub(other, n));
        return { w, d, h: w.thickness / 2, ang: Math.atan2(d.y, d.x), atA: w.a === nid };
      })
      .filter((e) => len(e.d) > 0)
      .sort((x, y) => x.ang - y.ang);

    const k = edges.length;
    const plus: V[] = [];
    const minus: V[] = [];
    for (let i = 0; i < k; i++) {
      const e = edges[i];
      plus[i] = add(n, mul(perp(e.d), e.h));
      minus[i] = sub(n, mul(perp(e.d), e.h));
    }
    if (k >= 2) {
      for (let i = 0; i < k; i++) {
        const j = (i + 1) % k;
        const ei = edges[i];
        const ej = edges[j];
        const pi = add(n, mul(perp(ei.d), ei.h));
        const pj = sub(n, mul(perp(ej.d), ej.h));
        const x = lineIntersect(pi, ei.d, pj, ej.d);
        const maxLen = Math.max(ei.h, ej.h) * 4;
        if (x && dist(x, n) <= maxLen) {
          plus[i] = x;
          minus[j] = x;
        }
      }
    }
    for (let i = 0; i < k; i++) {
      const e = edges[i];
      const c = out.get(e.w.id)!;
      if (e.atA) {
        c.aL = plus[i];
        c.aR = minus[i];
      } else {
        c.bR = plus[i];
        c.bL = minus[i];
      }
    }
  }
  const res = new Map<ID, WallCorners>();
  for (const [id, c] of out) if (c.aL && c.aR && c.bL && c.bR) res.set(id, c as WallCorners);
  return res;
}

/** impronta del muro (con giunzioni) — usata in 2D e come "tappo" superiore in 3D */
export function wallFootprint(p: Project, w: Wall, c: WallCorners): V[] {
  return [p.nodes[w.a], c.aL, c.bL, p.nodes[w.b], c.bR, c.aR];
}

// ---------------------------------------------------------------------------
// Stanze: facce del grafo planare dei muri

export interface Room {
  key: string;
  nodeIds: ID[];
  /** poligono sulle mezzerie dei muri */
  poly: V[];
  /** poligono interno (filo muro) */
  inner: V[];
  /** area netta in cm² */
  area: number;
}

/** facce del grafo dei muri (senza rami morti): cicli di nodi con la loro area con segno */
function planarFaces(p: Project): { cycle: ID[]; poly: V[]; area: number; wallBetween: Map<string, Wall> }[] {
  // grafo senza "rami morti" (nodi di grado 1)
  const adj = new Map<ID, Set<ID>>();
  const wallBetween = new Map<string, Wall>();
  for (const w of Object.values(p.walls)) {
    if (w.a === w.b || !p.nodes[w.a] || !p.nodes[w.b]) continue;
    if (!adj.has(w.a)) adj.set(w.a, new Set());
    if (!adj.has(w.b)) adj.set(w.b, new Set());
    adj.get(w.a)!.add(w.b);
    adj.get(w.b)!.add(w.a);
    wallBetween.set(edgeKey(w.a, w.b), w);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const [n, s] of adj) {
      if (s.size <= 1) {
        for (const m of s) adj.get(m)?.delete(n);
        adj.delete(n);
        changed = true;
      }
    }
  }

  const sorted = new Map<ID, ID[]>();
  for (const [n, s] of adj) {
    const pn = p.nodes[n];
    sorted.set(
      n,
      [...s].sort((a, b) => {
        const pa = p.nodes[a];
        const pb = p.nodes[b];
        return Math.atan2(pa.y - pn.y, pa.x - pn.x) - Math.atan2(pb.y - pn.y, pb.x - pn.x);
      }),
    );
  }

  const visited = new Set<string>();
  const faces: { cycle: ID[]; poly: V[]; area: number; wallBetween: Map<string, Wall> }[] = [];
  for (const [u, nbrs] of sorted) {
    for (const v0 of nbrs) {
      if (visited.has(u + '>' + v0)) continue;
      const cycle: ID[] = [];
      let a = u;
      let b = v0;
      let guard = 0;
      while (!visited.has(a + '>' + b) && guard++ < 10000) {
        visited.add(a + '>' + b);
        cycle.push(a);
        const list = sorted.get(b)!;
        const idx = list.indexOf(a);
        const next = list[(idx - 1 + list.length) % list.length];
        a = b;
        b = next;
      }
      if (cycle.length < 3) continue;
      const poly = cycle.map((id) => ({ x: p.nodes[id].x, y: p.nodes[id].y }));
      faces.push({ cycle, poly, area: polygonArea(poly), wallBetween });
    }
  }
  return faces;
}

const edgeKey = (a: ID, b: ID) => (a < b ? a + '|' + b : b + '|' + a);

export function computeRooms(p: Project): Room[] {
  const rooms: Room[] = [];
  for (const { cycle, poly, area: A, wallBetween } of planarFaces(p)) {
    // con y verso il basso e questa regola di percorrenza, le facce interne hanno area positiva
    if (A <= 1) continue;
    const thick = cycle.map((id, i) => wallBetween.get(edgeKey(id, cycle[(i + 1) % cycle.length]))?.thickness ?? 10);
    const inner = offsetPolygonInward(poly, thick.map((t) => t / 2));
    const area = Math.abs(polygonArea(inner));
    rooms.push({ key: [...cycle].sort().join(','), nodeIds: cycle, poly, inner, area });
  }
  return rooms;
}

/**
 * Contorni esterni degli edifici (sulle mezzerie dei muri): uno per ogni gruppo di muri chiusi
 * staccato dagli altri (es. casa e garage separati). Sono le facce «esterne» del grafo, ad area negativa.
 */
export function computeOutlines(p: Project): V[][] {
  return planarFaces(p)
    .filter((f) => f.area < -1)
    .map((f) => [...f.poly].reverse());
}

/** Sposta ogni lato verso l'interno (poligono con area positiva) della distanza indicata. */
export function offsetPolygonInward(poly: V[], d: number[]): V[] {
  const n = poly.length;
  const sign = polygonArea(poly) > 0 ? 1 : -1;
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % n];
    const dir = norm(sub(q, p));
    // per area positiva (y in basso), l'interno è a perp(dir)
    const nrm = mul(perp(dir), sign);
    return { p: add(p, mul(nrm, d[i])), dir, nrm };
  });
  return poly.map((p, i) => {
    const prev = lines[(i - 1 + n) % n];
    const cur = lines[i];
    const x = lineIntersect(prev.p, prev.dir, cur.p, cur.dir);
    if (!x || dist(x, p) > Math.max(d[i], 1) * 6) return add(p, mul(cur.nrm, d[i]));
    return x;
  });
}

export function polygonsEqualKey(a: Room, b: Room) {
  return a.key === b.key;
}

export interface RoomSide {
  a: V;
  b: V;
  len: number;
  /** coppie di nodi (lati del poligono) che formano questo lato della stanza */
  edges: [ID, ID][];
}

/**
 * Lati interni della stanza "da angolo ad angolo": i tratti consecutivi allineati
 * (muro spezzato da un incrocio sull'altra faccia) vengono uniti in un unico lato.
 */
export function roomSides(r: Room): RoomSide[] {
  const n = r.inner.length;
  if (n < 3) return [];
  const dirOf = (i: number) => norm(sub(r.inner[(i + 1) % n], r.inner[i]));
  const isCorner = (i: number) => {
    const d0 = dirOf((i - 1 + n) % n);
    const d1 = dirOf(i);
    return Math.abs(cross(d0, d1)) > 0.01 || dot(d0, d1) < 0;
  };
  let start = 0;
  while (start < n && !isCorner(start)) start++;
  if (start === n) start = 0;
  const sides: RoomSide[] = [];
  let cur: RoomSide | null = null;
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    const j = (i + 1) % n;
    const e: [ID, ID] = [r.nodeIds[i], r.nodeIds[j]];
    if (!cur || isCorner(i)) {
      if (cur) sides.push(cur);
      cur = { a: r.inner[i], b: r.inner[j], len: 0, edges: [e] };
    } else {
      cur.b = r.inner[j];
      cur.edges.push(e);
    }
    cur.len = dist(cur.a, cur.b);
  }
  if (cur) sides.push(cur);
  return sides;
}
