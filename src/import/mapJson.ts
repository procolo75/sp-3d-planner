// Formato "mappa" scritto da Claude (o a mano) e conversione in progetto.
// Misure in cm, origine in alto a sinistra, x verso destra, y verso il basso.
import { projectOnSegment } from '../model/geom';
import * as ops from '../model/ops';
import { emptyProject, uid, type OpeningType, type Project } from '../model/types';

type Pt = [number, number];

export interface MapData {
  nome?: string;
  altezza_muri?: number;
  /** altezza facoltativa per singolo muro (es. parapetti 100 cm) */
  muri: { da: Pt; a: Pt; spessore?: number; altezza?: number }[];
  porte?: { pos: Pt; larghezza?: number; tipo?: 'porta' | 'portafinestra' | 'varco' | 'scorrevole' }[];
  finestre?: { pos: Pt; larghezza?: number; davanzale?: number; altezza?: number }[];
  stanze?: { nome: string; pos: Pt }[];
}

export class MapError extends Error {}

/** Estrae il JSON anche se è dentro un testo o un blocco ``` ``` */
export function extractJson(text: string): unknown {
  const t = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  const body = fence ? fence[1] : t;
  const a = body.indexOf('{');
  const b = body.lastIndexOf('}');
  if (a < 0 || b <= a) throw new MapError('Non trovo la mappa nel testo incollato: deve contenere un blocco che inizia con { e finisce con }.');
  try {
    return JSON.parse(body.slice(a, b + 1));
  } catch (e) {
    throw new MapError('Il testo incollato non è una mappa valida (JSON non leggibile): ' + (e as Error).message + '. Copia tutta la risposta di Claude, dalla prima { all\'ultima }.');
  }
}

const isPt = (p: unknown): p is Pt => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && isFinite(n));

export function validateMap(raw: unknown): MapData {
  const m = raw as MapData;
  if (!m || typeof m !== 'object') throw new MapError('La mappa è vuota.');
  if (!Array.isArray(m.muri) || !m.muri.length) throw new MapError('Nella mappa non ci sono muri (manca l\'elenco "muri").');
  m.muri.forEach((w, i) => {
    if (!isPt(w.da) || !isPt(w.a)) throw new MapError(`Il muro n. ${i + 1} non ha le coordinate "da" e "a" scritte come [x, y].`);
  });
  for (const [key, list] of [
    ['porte', m.porte],
    ['finestre', m.finestre],
    ['stanze', m.stanze],
  ] as const) {
    if (list !== undefined && !Array.isArray(list)) throw new MapError(`"${key}" deve essere un elenco.`);
    (list ?? []).forEach((o, i) => {
      if (!isPt((o as { pos: unknown }).pos)) throw new MapError(`L'elemento n. ${i + 1} di "${key}" non ha la posizione "pos" scritta come [x, y].`);
    });
  }
  return m;
}

export interface MapStats {
  walls: number;
  openings: number;
  skippedOpenings: number;
}

/** Converte la mappa in un nuovo progetto. */
export function mapToProject(m: MapData): { project: Project; stats: MapStats } {
  const p = ops.draft(emptyProject());
  p.name = m.nome?.trim() || 'La mia casa';
  const H = m.altezza_muri && m.altezza_muri > 100 ? m.altezza_muri : 280;
  for (const w of m.muri) {
    const a = ops.addNode(p, { x: w.da[0], y: w.da[1] });
    const b = ops.addNode(p, { x: w.a[0], y: w.a[1] });
    ops.addWall(p, a, b, Math.max(3, Math.min(80, w.spessore ?? 12)), w.altezza && w.altezza > 20 ? w.altezza : H);
  }
  ops.normalize(p);

  let skipped = 0;
  const place = (pos: Pt, type: OpeningType, width: number, height: number, sill: number) => {
    let best: string | null = null;
    let bd = Infinity;
    let off = 0;
    for (const w of Object.values(p.walls)) {
      const A = p.nodes[w.a];
      const B = p.nodes[w.b];
      const pr = projectOnSegment({ x: pos[0], y: pos[1] }, A, B);
      const d = pr.dist - w.thickness / 2;
      if (d < bd) {
        bd = d;
        best = w.id;
        off = pr.t * Math.hypot(B.x - A.x, B.y - A.y);
      }
    }
    if (!best || bd > 40) {
      skipped++;
      return;
    }
    const w = p.walls[best];
    const L = Math.hypot(p.nodes[w.b].x - p.nodes[w.a].x, p.nodes[w.b].y - p.nodes[w.a].y);
    const wd = Math.min(width, L);
    const id = uid();
    p.openings[id] = { id, wallId: best, type, offset: Math.max(wd / 2, Math.min(L - wd / 2, off)), width: wd, height, sill };
  };
  for (const d of m.porte ?? []) {
    const t = d.tipo ?? 'porta';
    if (t === 'portafinestra') place(d.pos, 'window', d.larghezza ?? 120, 220, 0);
    else if (t === 'varco') place(d.pos, 'arch', d.larghezza ?? 100, 220, 0);
    else if (t === 'scorrevole') place(d.pos, 'sliding', d.larghezza ?? 152, 205, 0);
    else place(d.pos, 'door', d.larghezza ?? 80, 210, 0);
  }
  for (const f of m.finestre ?? []) place(f.pos, 'window', f.larghezza ?? 120, f.altezza ?? 140, f.davanzale ?? 95);

  for (const s of m.stanze ?? []) {
    const id = uid();
    p.labels[id] = { id, x: s.pos[0], y: s.pos[1], name: String(s.nome ?? '') };
  }
  return { project: p, stats: { walls: Object.keys(p.walls).length, openings: Object.keys(p.openings).length, skippedOpenings: skipped } };
}

export function parseMapText(text: string) {
  return mapToProject(validateMap(extractJson(text)));
}
