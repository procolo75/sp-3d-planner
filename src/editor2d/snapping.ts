import { add, dist, lineIntersect, mul, norm, perp, projectOnSegment, sub, type V, type WallCorners } from '../model/geom';
import type { Derived } from '../model/derived';
import type { Item, Opening, Project } from '../model/types';
import { CATALOG_BY_ID } from '../catalog/catalog';

/** Angoli dell'ingombro in pianta di un mobile */
export function itemCorners(it: Pick<Item, 'x' | 'y' | 'w' | 'd' | 'rotation'>): V[] {
  const c = Math.cos(it.rotation);
  const s = Math.sin(it.rotation);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) => {
    const lx = (sx * it.w) / 2;
    const ly = (sy * it.d) / 2;
    return { x: it.x + lx * c - ly * s, y: it.y + lx * s + ly * c };
  });
}

const MAGNET = 35; // cm

/**
 * Appoggia il mobile al muro vicino (rotazione parallela, fronte verso la stanza) se è a meno di
 * MAGNET dalla parete o se la sta attraversando; poi lo fa scorrere lungo il muro per non
 * entrare nei muri perpendicolari (angoli). Ritorna null se non c'è un muro vicino.
 */
export function magnetToWall(p: Project, it: Item, _der?: Derived): { x: number; y: number; rotation: number; d?: number } | null {
  if (CATALOG_BY_ID[it.catalogId]?.pocket) return magnetIntoWall(p, it);
  const c = { x: it.x, y: it.y };
  const uw = { x: Math.cos(it.rotation), y: Math.sin(it.rotation) };
  const ud = { x: -Math.sin(it.rotation), y: Math.cos(it.rotation) };
  let best: { x: number; y: number; rotation: number; d: number; wall: string; dir: V; nn: V } | null = null;
  for (const w of Object.values(p.walls)) {
    const A = p.nodes[w.a];
    const B = p.nodes[w.b];
    const pj = projectOnSegment(c, A, B);
    if (pj.t <= 0 || pj.t >= 1) continue;
    const dir = norm(sub(B, A));
    const n = perp(dir);
    const side = (c.x - pj.point.x) * n.x + (c.y - pj.point.y) * n.y > 0 ? 1 : -1;
    const nn = mul(n, side); // normale verso il mobile
    const faceDist = pj.dist - w.thickness / 2;
    // ingombro del mobile lungo la normale con la rotazione attuale
    const ext = Math.abs(nn.x * uw.x + nn.y * uw.y) * (it.w / 2) + Math.abs(nn.x * ud.x + nn.y * ud.y) * (it.d / 2);
    const crossing = faceDist < ext;
    const gap = faceDist - it.d / 2;
    if (!crossing && Math.abs(gap) > MAGNET) continue;
    if (pj.dist < 1) continue; // centro sull'asse del muro: lato indefinito
    // il fronte (z+ locale = +y in pianta) deve puntare verso nn: rotazione tale che (−sin r, cos r) = nn
    const rotation = Math.atan2(-nn.x, nn.y);
    const pos = add(pj.point, mul(nn, w.thickness / 2 + it.d / 2));
    const d = crossing ? -1 + faceDist / 1000 : Math.abs(gap);
    if (!best || d < best.d) best = { x: pos.x, y: pos.y, rotation, d, wall: w.id, dir, nn };
  }
  if (!best) return null;

  // evita i muri perpendicolari negli angoli: sposta il mobile lungo il muro
  let pos = { x: best.x, y: best.y };
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (const q of Object.values(p.walls)) {
      if (q.id === best.wall) continue;
      const QA = p.nodes[q.a];
      const QB = p.nodes[q.b];
      const qd = norm(sub(QB, QA));
      if (Math.abs(qd.x * best.dir.x + qd.y * best.dir.y) > 0.3) continue; // non perpendicolare
      // il muro q attraversa la fascia occupata dal mobile (dal muro verso la stanza)?
      const back = sub(pos, mul(best.nn, it.d / 2));
      const front = add(pos, mul(best.nn, it.d / 2));
      const proj = (pt: V) => (pt.x - back.x) * best!.nn.x + (pt.y - back.y) * best!.nn.y;
      const a0 = Math.min(proj(QA), proj(QB));
      const a1 = Math.max(proj(QA), proj(QB));
      if (a1 < 0 || a0 > proj(front)) continue;
      // posizione del muro q lungo il nostro muro
      const uq = (QA.x - pos.x) * best.dir.x + (QA.y - pos.y) * best.dir.y;
      const half = it.w / 2 + q.thickness / 2;
      if (Math.abs(uq) >= half) continue;
      const shift = uq > 0 ? uq - half : uq + half;
      pos = add(pos, mul(best.dir, shift));
      moved = true;
    }
    if (!moved) break;
  }

  // conserva rotazioni equivalenti vicine a quella attuale (evita salti di 2π)
  let r = best.rotation;
  while (r - it.rotation > Math.PI) r -= 2 * Math.PI;
  while (it.rotation - r > Math.PI) r += 2 * Math.PI;
  return { x: Math.round(pos.x * 10) / 10, y: Math.round(pos.y * 10) / 10, rotation: r };
}

/**
 * Porte a scomparsa: il controtelaio va DENTRO al muro, centrato sull'asse, parallelo e spesso
 * quanto il muro (ritorna anche la profondità `d`). Resta tutto dentro al muro se ci sta.
 */
function magnetIntoWall(p: Project, it: Item): { x: number; y: number; rotation: number; d: number } | null {
  let best: { x: number; y: number; rotation: number; d: number; dist: number } | null = null;
  for (const w of Object.values(p.walls)) {
    const A = p.nodes[w.a];
    const B = p.nodes[w.b];
    const pj = projectOnSegment(it, A, B);
    if (pj.t <= 0 || pj.t >= 1 || pj.dist > w.thickness / 2 + MAGNET) continue;
    if (best && pj.dist >= best.dist) continue;
    const L = dist(A, B);
    const dir = norm(sub(B, A));
    let u = pj.t * L;
    if (L > it.w) u = Math.max(it.w / 2, Math.min(L - it.w / 2, u));
    const pos = add(A, mul(dir, u));
    best = { x: pos.x, y: pos.y, rotation: Math.atan2(dir.y, dir.x), d: w.thickness, dist: pj.dist };
  }
  if (!best) return null;
  // la porta è simmetrica: tieni la rotazione equivalente (a meno di π) più vicina all'attuale
  let r = best.rotation;
  while (r - it.rotation > Math.PI / 2) r -= Math.PI;
  while (it.rotation - r > Math.PI / 2) r += Math.PI;
  return { x: Math.round(best.x * 10) / 10, y: Math.round(best.y * 10) / 10, rotation: r, d: best.d };
}

/**
 * Distanze dai bordi del mobile alle pareti, nelle 4 direzioni del mobile.
 * Ritorna per ogni direzione il punto di partenza (metà del bordo), il punto sulla parete e la distanza in cm.
 */
export function wallDistances(p: Project, corners: Map<string, WallCorners>, it: Pick<Item, 'x' | 'y' | 'w' | 'd' | 'rotation'>, max = 600) {
  const uw = { x: Math.cos(it.rotation), y: Math.sin(it.rotation) };
  const ud = { x: -Math.sin(it.rotation), y: Math.cos(it.rotation) };
  const dirs = [
    { dir: uw, half: it.w / 2 },
    { dir: mul(uw, -1), half: it.w / 2 },
    { dir: ud, half: it.d / 2 },
    { dir: mul(ud, -1), half: it.d / 2 },
  ];
  // lati delle impronte dei muri
  const edges: [V, V][] = [];
  for (const w of Object.values(p.walls)) {
    const c = corners.get(w.id);
    if (!c) continue;
    const poly = [p.nodes[w.a], c.aL, c.bL, p.nodes[w.b], c.bR, c.aR];
    for (let i = 0; i < poly.length; i++) edges.push([poly[i], poly[(i + 1) % poly.length]]);
  }
  const out: { from: V; to: V; dist: number }[] = [];
  for (const { dir, half } of dirs) {
    const from = { x: it.x + dir.x * half, y: it.y + dir.y * half };
    let best = Infinity;
    for (const [a, b] of edges) {
      const e = sub(b, a);
      const den = dir.x * e.y - dir.y * e.x;
      if (Math.abs(den) < 1e-9) continue;
      const ax = a.x - from.x;
      const ay = a.y - from.y;
      const t = (ax * e.y - ay * e.x) / den;
      const u = (ax * dir.y - ay * dir.x) / den;
      if (u < 0 || u > 1 || t < -0.5) continue;
      if (t < best) best = t;
    }
    if (best <= max) {
      const dist = Math.max(0, best);
      out.push({ from, to: add(from, mul(dir, dist)), dist });
    }
  }
  return out;
}

/**
 * Distanze di una porta/finestra dai muri, lungo il muro che la ospita: dal bordo dell'apertura
 * fino alla faccia del primo muro che si incontra, su entrambe le facce del muro (le due stanze).
 */
export function openingDistances(p: Project, corners: Map<string, WallCorners>, o: Pick<Opening, 'wallId' | 'offset' | 'width'>, max = 1500) {
  const w = p.walls[o.wallId];
  if (!w) return [];
  const A = p.nodes[w.a];
  const B = p.nodes[w.b];
  const dir = norm(sub(B, A));
  const n = perp(dir);
  const edges: [V, V][] = [];
  for (const q of Object.values(p.walls)) {
    if (q.id === w.id) continue;
    const c = corners.get(q.id);
    if (!c) continue;
    const poly = [p.nodes[q.a], c.aL, c.bL, p.nodes[q.b], c.bR, c.aR];
    for (let i = 0; i < poly.length; i++) edges.push([poly[i], poly[(i + 1) % poly.length]]);
  }
  const ray = (from: V, d: V) => {
    let best = Infinity;
    for (const [a, b] of edges) {
      const e = sub(b, a);
      const den = d.x * e.y - d.y * e.x;
      if (Math.abs(den) < 1e-9) continue;
      const ax = a.x - from.x;
      const ay = a.y - from.y;
      const t = (ax * e.y - ay * e.x) / den;
      const u = (ax * d.y - ay * d.x) / den;
      if (u < 0 || u > 1 || t < -0.5) continue;
      if (t < best) best = t;
    }
    return best;
  };
  const out: { from: V; to: V; dist: number; side?: V }[] = [];
  for (const side of [1, -1]) {
    // poco fuori dalla faccia del muro, nella stanza da quel lato
    const off = mul(n, side * (w.thickness / 2 + 1));
    for (const s of [-1, 1]) {
      const from = add(add(A, mul(dir, o.offset + (s * o.width) / 2)), off);
      const d = mul(dir, s);
      const t = ray(from, d);
      if (t <= max) out.push({ from, to: add(from, mul(d, Math.max(0, t))), dist: Math.max(0, t), side: mul(n, side) });
    }
  }
  return out;
}

/**
 * Quanto bisogna percorrere da `at` lungo `dir` per uscire dallo spessore dei muri in cui `at` si trova
 * (es. un punto agganciato all'asse di un muro o a un suo angolo). Serve a misurare un muro nuovo
 * dalla faccia del muro a cui è agganciato, non dal suo asse.
 * Ogni muro è trattato come rettangolo: asse da A a B, largo quanto lo spessore.
 */
export function faceOffset(p: Project, _corners: Map<string, WallCorners> | null, at: V, dir: V, excludeWall?: string): number {
  const rects: { A: V; u: V; n: V; L: number; h: number }[] = [];
  for (const w of Object.values(p.walls)) {
    if (w.id === excludeWall) continue;
    const A = p.nodes[w.a];
    const B = p.nodes[w.b];
    const L = Math.hypot(B.x - A.x, B.y - A.y);
    if (L < 0.5) continue;
    const u = norm(sub(B, A));
    rects.push({ A, u, n: perp(u), L, h: w.thickness / 2 });
  }
  const EPS = 1e-6;
  // uscita da una fascia lo <= f0 + f1·t <= hi
  const slabExit = (f0: number, f1: number, lo: number, hi: number) => (f1 > 1e-9 ? (hi - f0) / f1 : f1 < -1e-9 ? (lo - f0) / f1 : Infinity);
  let t = 0;
  for (let iter = 0; iter < 8; iter++) {
    const probe = add(at, mul(dir, t + 0.05));
    let next = t;
    for (const r of rects) {
      const rel = sub(probe, r.A);
      const a = rel.x * r.u.x + rel.y * r.u.y;
      const b = rel.x * r.n.x + rel.y * r.n.y;
      if (a < -EPS || a > r.L + EPS || Math.abs(b) >= r.h) continue;
      const rel0 = sub(at, r.A);
      const a0 = rel0.x * r.u.x + rel0.y * r.u.y;
      const b0 = rel0.x * r.n.x + rel0.y * r.n.y;
      const exit = Math.min(slabExit(a0, dir.x * r.u.x + dir.y * r.u.y, 0, r.L), slabExit(b0, dir.x * r.n.x + dir.y * r.n.y, -r.h, r.h));
      if (exit > next) next = exit;
    }
    if (next <= t) break;
    t = next;
  }
  // se si scorre dentro un muro per un lungo tratto non è un aggancio: nessuna correzione
  return t > 100 ? 0 : t;
}

/** il punto tocca un muro o un nodo esistente? */
function onGeometry(p: Project, at: V, excludeWall?: string) {
  for (const w of Object.values(p.walls)) {
    if (w.id === excludeWall) continue;
    const A = p.nodes[w.a];
    const B = p.nodes[w.b];
    const ab = sub(B, A);
    const L2 = ab.x * ab.x + ab.y * ab.y;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((at.x - A.x) * ab.x + (at.y - A.y) * ab.y) / L2)) : 0;
    if (Math.hypot(A.x + ab.x * t - at.x, A.y + ab.y * t - at.y) < 0.5) return true;
  }
  return false;
}

/**
 * Quanto sottrarre all'estremo di un muro per avere lo spazio utile (da faccia a faccia):
 * - agganciato a un muro esistente: fino alla sua faccia;
 * - estremo libero: metà spessore, perché lì arriverà il muro che chiude l'angolo.
 * Così le misure scritte sono sempre quelle interne, senza contare lo spessore dei muri.
 */
export function endOffset(p: Project, at: V, dir: V, thickness: number, excludeWall?: string): number {
  const f = faceOffset(p, null, at, dir, excludeWall);
  if (f > 0.01) return f;
  return onGeometry(p, at, excludeWall) ? 0 : thickness / 2;
}

/** Lunghezza netta di un muro esistente: dalla faccia dei muri a cui è agganciato ai due estremi */
export function wallClearLength(p: Project, corners: Map<string, WallCorners>, wallId: string) {
  const w = p.walls[wallId];
  const A = p.nodes[w.a];
  const B = p.nodes[w.b];
  const L = Math.hypot(B.x - A.x, B.y - A.y);
  if (L < 0.5) return { L, net: L, offA: 0, offB: 0 };
  const dir = norm(sub(B, A));
  const offA = faceOffset(p, corners, A, dir, wallId);
  const offB = faceOffset(p, corners, B, mul(dir, -1), wallId);
  return { L, net: Math.max(0, L - offA - offB), offA, offB };
}

const CAM_MAGNET = 40; // cm
/** distanza della telecamera dalla faccia del muro (è montata sul muro) */
const CAM_GAP = 4;

/**
 * Appoggia la telecamera alla parete vicina (o nell'angolo tra due pareti), rivolta verso la stanza.
 * Ritorna anche la direzione "naturale" (perpendicolare alla parete o bisettrice dell'angolo).
 */
export function magnetCamera(p: Project, at: V): { x: number; y: number; rotation: number } | null {
  const lines: { pt: V; dir: V; nn: V; d: number }[] = [];
  for (const w of Object.values(p.walls)) {
    const A = p.nodes[w.a];
    const B = p.nodes[w.b];
    const pj = projectOnSegment(at, A, B);
    if (pj.t < 0 || pj.t > 1 || pj.dist < 1) continue;
    const faceDist = pj.dist - w.thickness / 2;
    if (faceDist > CAM_MAGNET) continue;
    const dir = norm(sub(B, A));
    const n = perp(dir);
    const nn = mul(n, (at.x - pj.point.x) * n.x + (at.y - pj.point.y) * n.y > 0 ? 1 : -1);
    lines.push({ pt: add(pj.point, mul(nn, w.thickness / 2 + CAM_GAP)), dir, nn, d: Math.abs(faceDist) });
  }
  if (!lines.length) return null;
  lines.sort((a, b) => a.d - b.d);
  const l1 = lines[0];
  // angolo: seconda parete non parallela
  const l2 = lines.find((l) => Math.abs(l.dir.x * l1.dir.y - l.dir.y * l1.dir.x) > 0.5);
  if (l2) {
    const x = lineIntersect(l1.pt, l1.dir, l2.pt, l2.dir);
    if (x && Math.hypot(x.x - at.x, x.y - at.y) < CAM_MAGNET * 1.5) {
      const bis = norm(add(l1.nn, l2.nn));
      return { x: x.x, y: x.y, rotation: Math.atan2(bis.y, bis.x) };
    }
  }
  return { x: l1.pt.x, y: l1.pt.y, rotation: Math.atan2(l1.nn.y, l1.nn.x) };
}
