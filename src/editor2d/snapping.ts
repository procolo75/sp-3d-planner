import { add, computeRooms, dist, lineIntersect, mul, norm, perp, pointInPolygon, projectOnSegment, sub, type V, type WallCorners } from '../model/geom';
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
  if (CATALOG_BY_ID[it.catalogId]?.structure) return magnetPillar(p, it);
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
    const faceDist = pj.dist; // il muro è una linea: lo spessore non conta
    // ingombro del mobile lungo la normale con la rotazione attuale
    const ext = Math.abs(nn.x * uw.x + nn.y * uw.y) * (it.w / 2) + Math.abs(nn.x * ud.x + nn.y * ud.y) * (it.d / 2);
    const crossing = faceDist < ext;
    const gap = faceDist - it.d / 2;
    if (!crossing && Math.abs(gap) > MAGNET) continue;
    if (pj.dist < 1) continue; // centro sull'asse del muro: lato indefinito
    // il fronte (z+ locale = +y in pianta) deve puntare verso nn: rotazione tale che (−sin r, cos r) = nn
    const rotation = Math.atan2(-nn.x, nn.y);
    const pos = add(pj.point, mul(nn, it.d / 2));
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
      const half = it.w / 2;
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
/**
 * Pilastro: si appoggia ai muri come un mobile, con la faccia sulla linea del muro (lo spessore
 * non conta). Vicino a un angolo entra nell'angolo, dal lato in cui si trova il puntatore;
 * vicino a una parete le si appoggia dal lato del puntatore. Lontano dai muri resta libero (null).
 */
export function magnetPillar(p: Project, it: Pick<Item, 'x' | 'y' | 'rotation' | 'w' | 'd'>): { x: number; y: number; rotation: number } | null {
  const c = { x: it.x, y: it.y };
  const half = Math.max(it.w, it.d) / 2;
  const dirOf = (w: { a: string; b: string }) => norm(sub(p.nodes[w.b], p.nodes[w.a]));
  const sgn = (v: number) => (v < 0 ? -1 : 1);

  // angolo: un nodo con almeno un muro, vicino al puntatore
  let node: { id: string; x: number; y: number } | null = null;
  let nd = half + 25;
  for (const n of Object.values(p.nodes)) {
    const d = dist(n, c);
    if (d < nd && Object.values(p.walls).some((w) => w.a === n.id || w.b === n.id)) {
      nd = d;
      node = n;
    }
  }
  if (node) {
    const w = Object.values(p.walls).find((q) => q.a === node!.id || q.b === node!.id)!;
    const u = dirOf(w);
    const n = perp(u); // asse y locale del pilastro (rotazione = angolo del muro)
    const rel = sub(c, node);
    const su = sgn(rel.x * u.x + rel.y * u.y);
    const sn = sgn(rel.x * n.x + rel.y * n.y);
    const pos = add(node, add(mul(u, (su * it.w) / 2), mul(n, (sn * it.d) / 2)));
    return { x: Math.round(pos.x * 2) / 2, y: Math.round(pos.y * 2) / 2, rotation: Math.atan2(u.y, u.x) };
  }

  // parete: faccia del pilastro sulla linea del muro, dal lato del puntatore
  let best: { x: number; y: number; rotation: number } | null = null;
  let bd = half + 20;
  for (const w of Object.values(p.walls)) {
    const A = p.nodes[w.a];
    const B = p.nodes[w.b];
    const pj = projectOnSegment(c, A, B);
    if (pj.dist >= bd || pj.t <= 0 || pj.t >= 1) continue;
    const u = dirOf(w);
    const n = perp(u);
    const sn = sgn((c.x - pj.point.x) * n.x + (c.y - pj.point.y) * n.y);
    // non oltre gli estremi del muro
    const L = dist(A, B);
    const along = Math.max(it.w / 2, Math.min(L - it.w / 2, pj.t * L));
    const pos = add(add(A, mul(u, along)), mul(n, (sn * it.d) / 2));
    bd = pj.dist;
    best = { x: Math.round(pos.x * 2) / 2, y: Math.round(pos.y * 2) / 2, rotation: Math.atan2(u.y, u.x) };
  }
  return best;
}

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
  void corners;
  // i muri sono linee: lo spessore non conta
  const edges: [V, V][] = Object.values(p.walls).map((w) => [p.nodes[w.a], p.nodes[w.b]]);
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
 * Distanze di un'apertura lungo la linea del muro, per ciascun lato del muro (+1/−1 rispetto alla
 * normale): dal bordo dell'apertura al primo muro che si incontra da quel lato, o alla punta libera.
 * Un muro attaccato solo da un lato non spezza la misura dell'altro lato. Lo spessore non conta.
 */
function sideDistances(p: Project, o: Pick<Opening, 'wallId' | 'offset' | 'width'>) {
  const w = p.walls[o.wallId];
  const A = p.nodes[w.a];
  const B = p.nodes[w.b];
  const dir = norm(sub(B, A));
  const n = perp(dir);
  const sd = (q: V) => (q.x - A.x) * n.x + (q.y - A.y) * n.y;
  const along = (q: V) => (q.x - A.x) * dir.x + (q.y - A.y) * dir.y;
  const walls = Object.values(p.walls);
  // punta della linea proseguendo dritti sui muri allineati
  const tipAlong = (towardsB: boolean) => {
    let nid = towardsB ? w.b : w.a;
    let cur = w.id;
    for (let k = 0; k < 50; k++) {
      const next = walls.find((q) => q.id !== cur && (q.a === nid || q.b === nid) && Math.abs(sd(p.nodes[q.a === nid ? q.b : q.a])) < 0.5);
      if (!next) break;
      cur = next.id;
      nid = next.a === nid ? next.b : next.a;
    }
    return along(p.nodes[nid]);
  };
  const tips = { a: tipAlong(false), b: tipAlong(true) };
  const ea = o.offset - o.width / 2;
  const eb = o.offset + o.width / 2;
  const calc = (side: number) => {
    let toA = ea - tips.a;
    let toB = tips.b - eb;
    for (const q of walls) {
      if (q.id === w.id) continue;
      const QA = p.nodes[q.a];
      const QB = p.nodes[q.b];
      const sa = sd(QA);
      const sb = sd(QB);
      if (Math.abs(sa) < 0.5 && Math.abs(sb) < 0.5) continue; // allineato: è la linea stessa
      if (Math.max(sa * side, sb * side) <= 0.5) continue; // sta solo dall'altro lato
      if (Math.min(sa, sb) > 0.5 || Math.max(sa, sb) < -0.5) continue; // non tocca la linea
      const t = Math.abs(sa - sb) < 1e-9 ? 0 : sa / (sa - sb);
      const u = along({ x: QA.x + (QB.x - QA.x) * t, y: QA.y + (QB.y - QA.y) * t });
      if (u <= ea + 0.5 && ea - u < toA) toA = Math.max(0, ea - u);
      if (u >= eb - 0.5 && u - eb < toB) toB = Math.max(0, u - eb);
    }
    return { toA: Math.max(0, toA), toB: Math.max(0, toB) };
  };
  return { A, dir, n, ea, eb, s: { 1: calc(1), [-1]: calc(-1) } as Record<number, { toA: number; toB: number }> };
}

/** Linee delle distanze da disegnare in pianta (una per parte se i due lati del muro coincidono) */
export function openingDistances(p: Project, _corners: Map<string, WallCorners>, o: Pick<Opening, 'wallId' | 'offset' | 'width'>, max = 1500) {
  if (!p.walls[o.wallId]) return [];
  const { A, dir, n, ea, eb, s } = sideDistances(p, o);
  const out: { from: V; to: V; dist: number; side?: V; towardsB?: boolean }[] = [];
  for (const side of [1, -1]) {
    for (const towardsB of [false, true]) {
      const d = towardsB ? s[side].toB : s[side].toA;
      if (d > max) continue;
      if (side === -1 && Math.abs(d - (towardsB ? s[1].toB : s[1].toA)) < 0.5) continue; // uguale all'altro lato
      const from = add(add(A, mul(dir, towardsB ? eb : ea)), mul(n, side * 8));
      out.push({ from, to: add(from, mul(dir, towardsB ? d : -d)), dist: d, side: mul(n, side), towardsB });
    }
  }
  return out;
}

/** Distanze di un'apertura dai muri ai due lati (verso il nodo a e verso il nodo b), dal lato della stanza */
export function openingClear(p: Project, _corners: Map<string, WallCorners>, o: Pick<Opening, 'wallId' | 'offset' | 'width'>) {
  if (!p.walls[o.wallId]) return { toA: null, toB: null };
  const { A, dir, n, s } = sideDistances(p, o);
  const mid = add(A, mul(dir, o.offset));
  const rooms = computeRooms(p);
  const inRoom = (side: number) => rooms.some((r) => pointInPolygon(add(mid, mul(n, side * 5)), r.poly));
  const roomSides = [1, -1].filter(inRoom);
  // un solo lato dà su una stanza: le sue misure; altrimenti la più corta
  if (roomSides.length === 1) return s[roomSides[0]];
  return { toA: Math.min(s[1].toA, s[-1].toA), toB: Math.min(s[1].toB, s[-1].toB) };
}

/** Lunghezza di un muro: da estremo a estremo della linea (lo spessore non conta) */
export function wallClearLength(p: Project, _corners: Map<string, WallCorners>, wallId: string) {
  const w = p.walls[wallId];
  const L = dist(p.nodes[w.a], p.nodes[w.b]);
  return { L, net: L, offA: 0, offB: 0 };
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
    const faceDist = pj.dist;
    if (faceDist > CAM_MAGNET) continue;
    const dir = norm(sub(B, A));
    const n = perp(dir);
    const nn = mul(n, (at.x - pj.point.x) * n.x + (at.y - pj.point.y) * n.y > 0 ? 1 : -1);
    lines.push({ pt: add(pj.point, mul(nn, CAM_GAP)), dir, nn, d: Math.abs(faceDist) });
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
