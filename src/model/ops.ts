// Operazioni sul grafo dei muri. Lavorano su una "bozza": copia superficiale delle tabelle,
// gli oggetti modificati vengono sempre sostituiti (mai mutati), così lo storico undo resta valido.
import { dist, projectOnSegment, segmentIntersect, sub, norm, cross, type V } from './geom';
import { uid, type ID, type Project, type Wall } from './types';

export function draft(p: Project): Project {
  return {
    ...p,
    nodes: { ...p.nodes },
    walls: { ...p.walls },
    openings: { ...p.openings },
    items: { ...p.items },
    labels: { ...p.labels },
    cameras: { ...(p.cameras ?? {}) },
    lights: { ...(p.lights ?? {}) },
    sensors: { ...(p.sensors ?? {}) },
  };
}

const MERGE_EPS = 1; // cm

export function addNode(p: Project, at: V): ID {
  for (const n of Object.values(p.nodes)) if (dist(n, at) < MERGE_EPS) return n.id;
  const id = uid();
  p.nodes[id] = { id, x: at.x, y: at.y };
  return id;
}

/** Divide un muro nel punto (nodo esistente o nuovo). Ritorna l'id del nodo. Le aperture vengono redistribuite. */
export function splitWall(p: Project, wallId: ID, at: V | ID): ID {
  const w = p.walls[wallId];
  const A = p.nodes[w.a];
  const B = p.nodes[w.b];
  const nid = typeof at === 'string' ? at : addNode(p, projectOnSegment(at, A, B).point);
  if (nid === w.a || nid === w.b) return nid;
  const N = p.nodes[nid];
  const l1 = dist(A, N);
  const w1: Wall = { ...w, id: uid(), b: nid };
  const w2: Wall = { ...w, id: uid(), a: nid };
  delete p.walls[wallId];
  p.walls[w1.id] = w1;
  p.walls[w2.id] = w2;
  for (const o of Object.values(p.openings)) {
    if (o.wallId !== wallId) continue;
    p.openings[o.id] = o.offset <= l1 ? { ...o, wallId: w1.id } : { ...o, wallId: w2.id, offset: o.offset - l1 };
  }
  return nid;
}

export function addWall(p: Project, a: ID, b: ID, thickness: number, height: number): ID | null {
  if (a === b) return null;
  for (const w of Object.values(p.walls)) if ((w.a === a && w.b === b) || (w.a === b && w.b === a)) return w.id;
  const id = uid();
  p.walls[id] = { id, a, b, thickness, height };
  return id;
}

/** Rende il grafo "pulito": unisce nodi coincidenti, spezza i muri su nodi a T e negli incroci. */
export function normalize(p: Project) {
  // 1. unione di nodi coincidenti
  const ids = Object.keys(p.nodes);
  for (let i = 0; i < ids.length; i++) {
    const a = p.nodes[ids[i]];
    if (!a) continue;
    for (let j = i + 1; j < ids.length; j++) {
      const b = p.nodes[ids[j]];
      if (!b || dist(a, b) >= MERGE_EPS) continue;
      for (const w of Object.values(p.walls)) {
        if (w.a === b.id) p.walls[w.id] = { ...p.walls[w.id], a: a.id };
        if (w.b === b.id) p.walls[w.id] = { ...p.walls[w.id], b: a.id };
      }
      delete p.nodes[b.id];
    }
  }
  // muri degeneri / duplicati
  const seen = new Set<string>();
  for (const w of Object.values(p.walls)) {
    const k = w.a < w.b ? w.a + '|' + w.b : w.b + '|' + w.a;
    if (w.a === w.b || seen.has(k)) removeWallRaw(p, w.id);
    else seen.add(k);
  }

  // 2. nodi che cadono sopra un muro (giunzioni a T)
  let guard = 0;
  let changed = true;
  while (changed && guard++ < 50) {
    changed = false;
    for (const n of Object.values(p.nodes)) {
      for (const w of Object.values(p.walls)) {
        if (w.a === n.id || w.b === n.id) continue;
        const A = p.nodes[w.a];
        const B = p.nodes[w.b];
        const pr = projectOnSegment(n, A, B);
        if (pr.dist < MERGE_EPS && pr.t > 0.0001 && pr.t < 0.9999) {
          splitWall(p, w.id, n.id);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
    // 3. incroci tra muri
    if (!changed) {
      const ws = Object.values(p.walls);
      outer: for (let i = 0; i < ws.length; i++)
        for (let j = i + 1; j < ws.length; j++) {
          const w1 = ws[i];
          const w2 = ws[j];
          if (w1.a === w2.a || w1.a === w2.b || w1.b === w2.a || w1.b === w2.b) continue;
          const x = segmentIntersect(p.nodes[w1.a], p.nodes[w1.b], p.nodes[w2.a], p.nodes[w2.b]);
          if (!x || x.t < 0.001 || x.t > 0.999 || x.u < 0.001 || x.u > 0.999) continue;
          const nid = splitWall(p, w1.id, x.p);
          splitWall(p, w2.id, nid);
          changed = true;
          break outer;
        }
    }
  }
}

function removeWallRaw(p: Project, id: ID) {
  delete p.walls[id];
  for (const o of Object.values(p.openings)) if (o.wallId === id) delete p.openings[o.id];
}

export function degree(p: Project, nid: ID) {
  let d = 0;
  for (const w of Object.values(p.walls)) if (w.a === nid || w.b === nid) d++;
  return d;
}

export function removeOrphanNodes(p: Project) {
  const used = new Set<ID>();
  for (const w of Object.values(p.walls)) {
    used.add(w.a);
    used.add(w.b);
  }
  for (const id of Object.keys(p.nodes)) if (!used.has(id)) delete p.nodes[id];
}

/** Se un nodo ha esattamente due muri allineati e uguali, li fonde in uno solo. */
export function mergeCollinearAt(p: Project, nid: ID) {
  const ws = Object.values(p.walls).filter((w) => w.a === nid || w.b === nid);
  if (ws.length !== 2) return;
  const [w1, w2] = ws;
  if (Math.abs(w1.thickness - w2.thickness) > 0.01 || Math.abs(w1.height - w2.height) > 0.01 || w1.color !== w2.color) return;
  const o1 = w1.a === nid ? w1.b : w1.a;
  const o2 = w2.a === nid ? w2.b : w2.a;
  const N = p.nodes[nid];
  const d1 = norm(sub(p.nodes[o1], N));
  const d2 = norm(sub(p.nodes[o2], N));
  if (Math.abs(cross(d1, d2)) > 0.002 || d1.x * d2.x + d1.y * d2.y > 0) return;
  // nuovo muro o1 -> o2
  const nw: Wall = { ...w1, id: uid(), a: o1, b: o2 };
  const l1 = dist(p.nodes[o1], N);
  for (const o of Object.values(p.openings)) {
    if (o.wallId === w1.id) {
      // distanza da o1
      const fromO1 = w1.a === o1 ? o.offset : dist(p.nodes[w1.a], p.nodes[w1.b]) - o.offset;
      p.openings[o.id] = { ...o, wallId: nw.id, offset: fromO1 };
    } else if (o.wallId === w2.id) {
      const fromN = w2.a === nid ? o.offset : dist(p.nodes[w2.a], p.nodes[w2.b]) - o.offset;
      p.openings[o.id] = { ...o, wallId: nw.id, offset: l1 + fromN };
    }
  }
  delete p.walls[w1.id];
  delete p.walls[w2.id];
  delete p.nodes[nid];
  p.walls[nw.id] = nw;
}

/** "Abbatti muro": elimina il muro, i nodi rimasti soli, e ricuce i muri allineati. */
export function deleteWall(p: Project, id: ID) {
  const w = p.walls[id];
  if (!w) return;
  removeWallRaw(p, id);
  removeOrphanNodes(p);
  if (p.nodes[w.a]) mergeCollinearAt(p, w.a);
  if (p.nodes[w.b]) mergeCollinearAt(p, w.b);
}

/** Imposta la lunghezza spostando il nodo b lungo la direzione del muro. */
export function setWallLength(p: Project, id: ID, L: number) {
  const w = p.walls[id];
  const A = p.nodes[w.a];
  const B = p.nodes[w.b];
  const d = norm(sub(B, A));
  p.nodes[w.b] = { ...B, x: A.x + d.x * L, y: A.y + d.y * L };
}

/** Elimina i gruppi di muri staccati e piccoli (scritte, barre di scala, parti comuni) rispetto al più grande. */
export function dropSmallComponents(p: Project, minRatio: number) {
  const adj = new Map<ID, ID[]>();
  for (const w of Object.values(p.walls)) {
    if (!adj.has(w.a)) adj.set(w.a, []);
    if (!adj.has(w.b)) adj.set(w.b, []);
    adj.get(w.a)!.push(w.id);
    adj.get(w.b)!.push(w.id);
  }
  const seen = new Set<ID>();
  const comps: { walls: ID[]; len: number }[] = [];
  for (const w0 of Object.values(p.walls)) {
    if (seen.has(w0.id)) continue;
    const comp = { walls: [] as ID[], len: 0 };
    const stack = [w0.id];
    seen.add(w0.id);
    while (stack.length) {
      const id = stack.pop()!;
      const w = p.walls[id];
      comp.walls.push(id);
      comp.len += dist(p.nodes[w.a], p.nodes[w.b]);
      for (const n of [w.a, w.b]) for (const o of adj.get(n) ?? []) if (!seen.has(o)) (seen.add(o), stack.push(o));
    }
    comps.push(comp);
  }
  const max = Math.max(0, ...comps.map((c) => c.len));
  for (const c of comps) if (c.len < max * minRatio) for (const id of c.walls) removeWallRaw(p, id);
  removeOrphanNodes(p);
}
