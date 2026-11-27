// Disposizione degli elementi della mappa (in coordinate dell'immagine): condivisa da SVG e YAML,
// così gli id degli elementi SVG coincidono sempre con quelli usati nelle regole.
import { add, mul, norm, perp, pointInPolygon, sub, type V } from '../model/geom';
import type { Derived } from '../model/derived';
import type { Project, TapAction } from '../model/types';
import { resolveTap } from './tap';
import { entityFile, slugify, type HaEntities } from './entities';

export type ToPixel = (x: number, y: number, z?: number) => V;

export interface LayoutLight {
  entityId: string;
  label: string;
  /** file del render (solo viste 3D) */
  file: string;
  /** posizione del simbolo */
  at: V;
  color: string;
  /** vista 2D: alone dentro la stanza */
  glow?: { r: number; clip?: V[] };
  /** azione al tocco (già validata) */
  tap: TapAction;
}

export interface LayoutArea {
  id: string;
  name: string;
  points: V[];
  /** luce che si accende/spegne toccando la stanza */
  entity?: string;
  /** azione al tocco: la stessa della sua luce */
  tap?: TapAction;
}

export interface Layout {
  width: number;
  height: number;
  /** origine del viewBox (vista 2D in cm; 0,0 nelle viste 3D) */
  x0: number;
  y0: number;
  /** unità di misura dei simboli (≈1% del lato lungo) */
  u: number;
  lights: LayoutLight[];
  areas: LayoutArea[];
  sensors: { entityId: string; label: string; kind: string; at: V; tap: TapAction }[];
  contacts: { entityId: string; points: V[]; tap: TapAction }[];
  cameras: { entityId: string; label: string; at: V; tap: TapAction }[];
}

/** quadrilatero dell'apertura: impronta in pianta (vista dall'alto / 2D) o faccia verticale (viste inclinate) */
function openingQuad(p: Project, openingId: string, vertical: boolean, toPx: ToPixel): V[] {
  const o = p.openings[openingId];
  const w = p.walls[o.wallId];
  if (!w) return [];
  const A = p.nodes[w.a];
  const B = p.nodes[w.b];
  const dir = norm(sub(B, A));
  const n = perp(dir);
  const s0 = add(A, mul(dir, o.offset - o.width / 2));
  const s1 = add(A, mul(dir, o.offset + o.width / 2));
  if (vertical) {
    const z0 = o.sill;
    const z1 = o.sill + o.height;
    return [toPx(s0.x, s0.y, z0), toPx(s1.x, s1.y, z0), toPx(s1.x, s1.y, z1), toPx(s0.x, s0.y, z1)];
  }
  const h = w.thickness / 2 + 2;
  return [add(s0, mul(n, h)), add(s1, mul(n, h)), add(s1, mul(n, -h)), add(s0, mul(n, -h))].map((q) => toPx(q.x, q.y, w.height));
}

export function buildLayout(p: Project, der: Derived, ents: HaEntities, frame: { width: number; height: number; x0?: number; y0?: number; toPixel: ToPixel; vertical: boolean; planar?: boolean }): Layout {
  const { toPixel: toPx, vertical } = frame;
  const u = Math.max(frame.width, frame.height) / 100;
  const roomOf = (q: V) => der.rooms.find((r) => pointInPolygon(q, r.poly));

  const lights: LayoutLight[] = ents.lights.map((l) => {
    const r = roomOf(l);
    return {
      entityId: l.entityId,
      label: l.label || l.entityId,
      file: `lights/${entityFile(l.entityId)}.png`,
      at: toPx(l.x, l.y, vertical ? l.z : 0),
      color: l.color,
      tap: resolveTap(l.tap, 'toggle'),
      ...(frame.planar ? { glow: { r: 120 + 380 * l.intensity, clip: r ? (r.inner.length >= 3 ? r.inner : r.poly) : undefined } } : {}),
    };
  });

  const used = new Set<string>();
  // gli spazi esterni restano aree solo se hanno una luce (es. luce del giardino)
  const rooms = der.rooms.filter((r) => !der.roomLabel.get(r.key)?.outdoor || ents.lights.some((l) => pointInPolygon(l, r.poly)));
  const areas: LayoutArea[] = rooms.map((r, i) => {
    const name = der.roomLabel.get(r.key)?.name || `Stanza ${i + 1}`;
    let id = `area.${slugify(name)}`;
    for (let k = 2; used.has(id); k++) id = `area.${slugify(name)}_${k}`;
    used.add(id);
    const light = ents.lights.find((l) => pointInPolygon(l, r.poly));
    return { id, name, points: (r.inner.length >= 3 ? r.inner : r.poly).map((q) => toPx(q.x, q.y, 0)), entity: light?.entityId, tap: light ? resolveTap(light.tap, 'toggle') : undefined };
  });

  return {
    width: frame.width,
    height: frame.height,
    x0: frame.x0 ?? 0,
    y0: frame.y0 ?? 0,
    u,
    lights,
    areas,
    sensors: ents.sensors.map((s) => ({ entityId: s.entityId, label: s.label || '', kind: s.kind, at: toPx(s.x, s.y, 0), tap: resolveTap(s.tap, 'more-info') })),
    contacts: ents.contacts.map((o) => ({ entityId: o.haEntity!, points: openingQuad(p, o.id, vertical, toPx), tap: resolveTap(o.tap, 'more-info') })).filter((c) => c.points.length),
    cameras: ents.cameras.map((c) => ({ entityId: c.haEntity!, label: c.label || '', at: toPx(c.x, c.y, vertical ? c.z : 0), tap: resolveTap(c.tap, 'more-info') })),
  };
}
