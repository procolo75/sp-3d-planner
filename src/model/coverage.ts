// Copertura delle telecamere: cosa vede ogni telecamera in pianta (poligono di visibilità 2D).
// Bloccano la vista: muri (con le loro facce), finestre e ante non trasparenti, mobili alti.
// Porte (considerate aperte), varchi e ante scorrevoli in vetro trasparente lasciano passare la vista.
import { add, cross, dist, mul, norm, perp, pointInPolygon, projectOnSegment, sub, type Room, type V, type WallCorners } from './geom';
import { useMemo } from 'react';
import { itemCorners } from '../editor2d/snapping';
import type { Camera, ID, Opening, Project } from './types';
import { pocketOpenings } from './pocketDoors';

export interface Seg {
  a: V;
  b: V;
}

/** i mobili alti almeno così (cm, da terra alla sommità) bloccano la vista */
export const BLOCKING_ITEM_TOP = 170;

export const CAMERA_COLORS = ['#e63946', '#2a9d8f', '#7b2cbf', '#f4a261', '#1d7cf2', '#e76f9b', '#6a994e', '#bc6c25'];

export const CAMERA_DEFAULTS: Pick<Camera, 'fov' | 'range' | 'z'> = { fov: 90, range: 800, z: 230 };

const passable = (o: Opening) => (o.type === 'door' && (o.open ?? 1) >= 0.1) || o.type === 'arch' || (o.type === 'sliding' && (o.finish ?? 'glass') === 'glass');

/** segmenti che bloccano la vista */
export function visionSegments(p: Project, corners: Map<ID, WallCorners>): Seg[] {
  const segs: Seg[] = [];
  const byWall = new Map<ID, Opening[]>();
  for (const o of [...Object.values(p.openings), ...pocketOpenings(p, true)]) if (passable(o)) (byWall.get(o.wallId) ?? byWall.set(o.wallId, []).get(o.wallId)!).push(o);
  const deg = new Map<ID, number>();
  for (const w of Object.values(p.walls)) for (const n of [w.a, w.b]) deg.set(n, (deg.get(n) ?? 0) + 1);

  for (const w of Object.values(p.walls)) {
    const c = corners.get(w.id);
    const A = p.nodes[w.a];
    const B = p.nodes[w.b];
    if (!c || !A || !B) continue;
    const L = dist(A, B);
    if (L < 0.5) continue;
    const dir = norm(sub(B, A));
    const n = perp(dir);
    const h = w.thickness / 2;
    // tratti aperti lungo il muro (in cm dal nodo a)
    const holes = (byWall.get(w.id) ?? []).map((o) => [o.offset - o.width / 2, o.offset + o.width / 2] as [number, number]).sort((x, y) => x[0] - y[0]);
    for (const [fa, fb] of [
      [c.aL, c.bL],
      [c.aR, c.bR],
    ]) {
      const sa = dot2(sub(fa, A), dir);
      const sb = sa + dot2(sub(fb, fa), dir);
      const at = (s: number) => add(fa, mul(sub(fb, fa), (s - sa) / (sb - sa || 1)));
      let cur = sa;
      for (const [h0, h1] of holes) {
        if (h0 > cur) segs.push({ a: at(cur), b: at(Math.min(h0, sb)) });
        cur = Math.max(cur, h1);
      }
      if (cur < sb) segs.push({ a: at(cur), b: at(sb) });
    }
    // spallette delle aperture
    for (const [h0, h1] of holes)
      for (const s of [h0, h1]) {
        const m = add(A, mul(dir, s));
        segs.push({ a: add(m, mul(n, h)), b: add(m, mul(n, -h)) });
      }
    // testate dei muri liberi
    if (deg.get(w.a) === 1) segs.push({ a: c.aL, b: c.aR });
    if (deg.get(w.b) === 1) segs.push({ a: c.bL, b: c.bR });
  }

  for (const it of Object.values(p.items)) {
    if (it.z + it.h < BLOCKING_ITEM_TOP || it.z > 120) continue;
    const q = itemCorners(it);
    for (let i = 0; i < 4; i++) segs.push({ a: q[i], b: q[(i + 1) % 4] });
  }
  return segs;
}

const dot2 = (a: V, b: V) => a.x * b.x + a.y * b.y;

function distToSeg(o: V, s: Seg) {
  return projectOnSegment(o, s.a, s.b).dist;
}

const TAU = Math.PI * 2;
const wrap = (a: number) => ((a % TAU) + TAU) % TAU;

/** poligono della zona vista dalla telecamera (cm, coordinate di pianta) */
export function cameraCoverage(cam: Pick<Camera, 'x' | 'y' | 'rotation' | 'fov' | 'range'>, segs: Seg[]): V[] {
  const o = { x: cam.x, y: cam.y };
  const R = Math.max(10, cam.range);
  const fov = (Math.max(1, Math.min(360, cam.fov)) * Math.PI) / 180;
  const full = fov >= TAU - 1e-6;
  const a0 = full ? 0 : cam.rotation - fov / 2;
  const near = segs.filter((s) => distToSeg(o, s) < R);

  // angoli dei raggi: campionamento regolare + verso ogni estremo (bordi netti dietro gli spigoli)
  const step = (0.75 * Math.PI) / 180;
  const nBase = Math.max(2, Math.ceil(fov / step));
  const rels: number[] = [];
  for (let i = 0; i <= nBase; i++) rels.push((fov * i) / nBase);
  const EPS = 1e-4;
  for (const s of near)
    for (const q of [s.a, s.b]) {
      if (dist(o, q) > R) continue;
      const r = wrap(Math.atan2(q.y - o.y, q.x - o.x) - a0);
      for (const k of [r - EPS, r, r + EPS]) if (k >= 0 && k <= fov) rels.push(k);
    }
  rels.sort((x, y) => x - y);

  const pts: V[] = [];
  let last = -1;
  for (const rel of rels) {
    if (rel - last < 1e-6) continue;
    last = rel;
    const ang = a0 + rel;
    const d = { x: Math.cos(ang), y: Math.sin(ang) };
    let t = R;
    for (const s of near) {
      const e = sub(s.b, s.a);
      const den = cross(d, e);
      if (Math.abs(den) < 1e-9) continue;
      const ao = sub(s.a, o);
      const tt = cross(ao, e) / den;
      if (tt <= 0.5 || tt >= t) continue;
      const u = cross(ao, d) / den;
      if (u < -1e-6 || u > 1 + 1e-6) continue;
      t = tt;
    }
    pts.push({ x: o.x + d.x * t, y: o.y + d.y * t });
  }
  return full ? pts : [o, ...pts];
}

export interface Coverage {
  segs: Seg[];
  /** zona vista da ciascuna telecamera */
  polys: Map<ID, V[]>;
}

export function allCoverage(p: Project, corners: Map<ID, WallCorners>): Coverage {
  const segs = visionSegments(p, corners);
  const polys = new Map<ID, V[]>();
  for (const c of Object.values(p.cameras ?? {})) polys.set(c.id, cameraCoverage(c, segs));
  return { segs, polys };
}

/** copertura memorizzata: si ricalcola solo quando cambia qualcosa che la influenza */
export function useCoverage(p: Project, corners: Map<ID, WallCorners>): Coverage {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => allCoverage(p, corners), [p.walls, p.nodes, p.openings, p.items, p.cameras, corners]);
}

export interface CoverageStats {
  /** frazione (0–1) della superficie delle stanze vista da almeno una telecamera */
  total: number;
  perRoom: Map<string, number>;
  /** m² visti da ciascuna telecamera (dentro le stanze) */
  perCamera: Map<ID, number>;
}

/** stima a griglia (passo 20 cm) di quanto delle stanze è coperto */
export function coverageStats(rooms: Room[], cov: Map<ID, V[]>, step = 20): CoverageStats {
  const polys = [...cov.entries()].filter(([, poly]) => poly.length >= 3);
  const bbox = polys.map(([, poly]) => {
    const xs = poly.map((q) => q.x);
    const ys = poly.map((q) => q.y);
    return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  });
  const perRoom = new Map<string, number>();
  const perCamera = new Map<ID, number>(polys.map(([id]) => [id, 0]));
  let all = 0;
  let seen = 0;
  const cell = (step * step) / 10000;
  for (const r of rooms) {
    const poly = r.inner.length >= 3 ? r.inner : r.poly;
    const xs = poly.map((q) => q.x);
    const ys = poly.map((q) => q.y);
    let n = 0;
    let k = 0;
    for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step)
      for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) {
        const q = { x, y };
        if (!pointInPolygon(q, poly)) continue;
        n++;
        let hit = false;
        polys.forEach(([id, cp], i) => {
          const b = bbox[i];
          if (x < b[0] || x > b[1] || y < b[2] || y > b[3] || !pointInPolygon(q, cp)) return;
          hit = true;
          perCamera.set(id, perCamera.get(id)! + cell);
        });
        if (hit) k++;
      }
    perRoom.set(r.key, n ? k / n : 0);
    all += n;
    seen += k;
  }
  return { total: all ? seen / all : 0, perRoom, perCamera };
}
