// Disegno dei muri a catena con misure = spazio utile (mai contando lo spessore dei muri).
import { add, dist, mul, norm, sub, v, type V } from '../model/geom';
import type { SnapPoint } from '../model/store';
import type { Project } from '../model/types';
import { faceOffset, onGeometry } from './snapping';

/** punto del disegno muri; `pend` = direzione del muro appena digitato che finisce libero qui */
export type DrawPt = SnapPoint & { pend?: V };
/** primo punto della catena: se era libero e il primo muro è stato digitato, chiudendo lì si allunga */
export type ChainStart = { at: V; free: boolean; dir?: V } | null;

export const turning = (a: V, b: V) => Math.abs(a.x * b.y - a.y * b.x) > 0.02;

/**
 * Partenza effettiva del prossimo muro. Dopo un muro digitato che finisce libero, se il nuovo muro gira
 * l'angolo il muro precedente si allunga di mezzo spessore: così il muro nuovo lo copre e la misura
 * scritta resta lo spazio utile. Se si continua dritti non si aggiunge nulla.
 */
export function effStart(s: DrawPt, dir: V, T: number): { pt: V; off: number | null; moved: boolean } {
  if (s.pend && turning(s.pend, dir)) return { pt: add(s, mul(s.pend, T / 2)), off: T / 2, moved: true };
  return { pt: v(s.x, s.y), off: null, moved: false };
}

export function startChain(p: Project, sp: SnapPoint): ChainStart {
  return { at: v(sp.x, sp.y), free: !sp.nodeId && !sp.wallId && !onGeometry(p, sp) };
}

/** punto finale di un muro digitato lungo L (spazio utile) in direzione dir */
export function typedEnd(p: Project, s: DrawPt, dir: V, L: number, T: number): V {
  const es = effStart(s, dir, T);
  const off = es.off ?? faceOffset(p, null, es.pt, dir);
  return add(es.pt, mul(dir, off + L));
}

/** cosa fare per aggiungere il tratto s→e: muro da creare, nodi da spostare, prossimo punto e catena */
export function planSegment(p: Project, s: DrawPt, e: SnapPoint, T: number, chain: ChainStart, typedSeg: boolean) {
  const dir = norm(sub(e, s));
  const es = effStart(s, dir, T);
  const moves: { from: V; to: V }[] = [];
  if (es.moved) moves.push({ from: v(s.x, s.y), to: es.pt });
  let end: SnapPoint = e;
  let nextChain: ChainStart = chain;
  if (chain && chain.dir === undefined) {
    // primo tratto: se partiva da un punto libero ed è stato digitato, ricordalo per la chiusura
    nextChain = typedSeg && chain.free ? { ...chain, dir: mul(dir, -1) } : null;
  } else if (chain?.dir && dist(e, chain.at) < 1 && turning(chain.dir, dir)) {
    const to = add(chain.at, mul(chain.dir, T / 2));
    moves.push({ from: chain.at, to });
    end = { x: to.x, y: to.y, nodeId: e.nodeId };
    nextChain = null;
  }
  const from: SnapPoint = es.moved ? { x: es.pt.x, y: es.pt.y } : s;
  const endFree = typedSeg && !e.nodeId && !e.wallId && !onGeometry(p, e);
  const next: DrawPt = { x: end.x, y: end.y, pend: endFree ? norm(sub(end, from)) : undefined };
  return { from, to: end, moves, next, chain: nextChain };
}

/** punto da cui agganciare la linea dritta: la partenza effettiva verso il cursore */
export function snapFrom(s: DrawPt | null, cursor: V, T: number): V | null {
  if (!s) return null;
  if (dist(s, cursor) < 0.5) return v(s.x, s.y);
  return effStart(s, norm(sub(cursor, s)), T).pt;
}

/** lunghezza netta mostrata mentre si disegna: da faccia a faccia, o fino alla punta se l'estremo è libero */
export function clearLength(p: Project, s: DrawPt, e: SnapPoint, T: number) {
  if (dist(s, e) < 0.5) return 0;
  const dir = norm(sub(e, s));
  const es = effStart(s, dir, T);
  const a = es.off ?? faceOffset(p, null, es.pt, dir);
  const b = faceOffset(p, null, e, mul(dir, -1));
  return Math.max(0, dist(es.pt, e) - a - b);
}
