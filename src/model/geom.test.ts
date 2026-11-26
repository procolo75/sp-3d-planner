import { describe, expect, it } from 'vitest';
import { computeOutlines, computeRooms, computeWallCorners, polygonArea } from './geom';
import { addNode, addWall, deleteWall, draft, normalize } from './ops';
import { emptyProject, type Project } from './types';

function rect(p: Project, x0: number, y0: number, x1: number, y1: number, t = 20) {
  const a = addNode(p, { x: x0, y: y0 });
  const b = addNode(p, { x: x1, y: y0 });
  const c = addNode(p, { x: x1, y: y1 });
  const d = addNode(p, { x: x0, y: y1 });
  addWall(p, a, b, t, 280);
  addWall(p, b, c, t, 280);
  addWall(p, c, d, t, 280);
  addWall(p, d, a, t, 280);
}

describe('stanze', () => {
  it('rileva un quadrato con area netta', () => {
    const p = draft(emptyProject());
    rect(p, 0, 0, 400, 300);
    const rooms = computeRooms(p);
    expect(rooms).toHaveLength(1);
    // interno: (400-20) x (300-20)
    expect(rooms[0].area).toBeCloseTo(380 * 280, 0);
  });

  it('un muro divisorio crea due stanze, abbatterlo le unisce', () => {
    const p = draft(emptyProject());
    rect(p, 0, 0, 600, 300);
    const m1 = addNode(p, { x: 300, y: 0 });
    const m2 = addNode(p, { x: 300, y: 300 });
    const wid = addWall(p, m1, m2, 10, 280)!;
    normalize(p);
    expect(Object.keys(p.walls)).toHaveLength(7);
    expect(computeRooms(p)).toHaveLength(2);
    deleteWall(p, wid);
    expect(computeRooms(p)).toHaveLength(1);
    // i muri spezzati a T vengono ricuciti
    expect(Object.keys(p.walls)).toHaveLength(4);
  });

  it('muri che si incrociano vengono spezzati', () => {
    const p = draft(emptyProject());
    rect(p, 0, 0, 400, 400);
    const a = addNode(p, { x: -50, y: 200 });
    const b = addNode(p, { x: 450, y: 200 });
    addWall(p, a, b, 10, 280);
    normalize(p);
    expect(computeRooms(p)).toHaveLength(2);
  });
});

describe('contorni degli edifici', () => {
  it('casa e garage staccati: due contorni, niente in mezzo', () => {
    const p = draft(emptyProject());
    rect(p, 0, 0, 800, 600);
    rect(p, 1200, 0, 1500, 600);
    const o = computeOutlines(p);
    expect(o).toHaveLength(2);
    const areas = o.map((q) => Math.abs(polygonArea(q))).sort((a, b) => a - b);
    expect(areas[0]).toBeCloseTo(300 * 600, 0);
    expect(areas[1]).toBeCloseTo(800 * 600, 0);
    // lo spazio tra i due edifici non è dentro nessun contorno
    expect(o.every((q) => polygonArea(q) > 0)).toBe(true);
  });

  it('un muro divisorio non aggiunge contorni', () => {
    const p = draft(emptyProject());
    rect(p, 0, 0, 600, 300);
    const m1 = addNode(p, { x: 300, y: 0 });
    const m2 = addNode(p, { x: 300, y: 300 });
    addWall(p, m1, m2, 10, 280);
    normalize(p);
    expect(computeOutlines(p)).toHaveLength(1);
  });
});

describe('giunzioni', () => {
  it('angolo a L: lo spigolo esterno è in (-t/2,-t/2)', () => {
    const p = draft(emptyProject());
    rect(p, 0, 0, 400, 300, 20);
    const c = computeWallCorners(p);
    const pts = [...c.values()].flatMap((k) => [k.aL, k.aR, k.bL, k.bR]);
    expect(pts.some((q) => Math.abs(q.x + 10) < 1e-6 && Math.abs(q.y + 10) < 1e-6)).toBe(true);
    expect(pts.some((q) => Math.abs(q.x - 10) < 1e-6 && Math.abs(q.y - 10) < 1e-6)).toBe(true);
  });
});

import { magnetToWall } from '../editor2d/snapping';
import type { Item } from './types';

describe('mobili contro il muro', () => {
  it('un armadio cliccato vicino a un angolo si appoggia al muro senza entrare nell\'altro', () => {
    const p = draft(emptyProject());
    rect(p, 0, 0, 400, 400, 20);
    // armadio 150×58 cliccato a 60 cm dal muro sinistro e vicino all'angolo in alto
    const it: Item = { id: 'x', catalogId: 'ikea-pax150', x: 70, y: 40, z: 0, rotation: 0, w: 150, d: 58, h: 236 };
    const m = magnetToWall(p, it)!;
    expect(m).not.toBeNull();
    // contro il muro sinistro (filo interno x=10): centro a 10 + 58/2
    expect(m.x).toBeCloseTo(39, 0);
    // non entra nel muro in alto (filo interno y=10): centro almeno a 10 + 75
    expect(m.y).toBeGreaterThanOrEqual(84.9);
  });
});

import { openingDistances } from '../editor2d/snapping';

describe('distanze delle aperture', () => {
  it('porta sul muro in alto: distanze dal filo dei muri laterali, solo dentro la stanza', () => {
    const p = draft(emptyProject());
    rect(p, 0, 0, 400, 300, 20);
    const top = Object.values(p.walls).find((w) => p.nodes[w.a].y === 0 && p.nodes[w.b].y === 0)!;
    const startX = p.nodes[top.a].x;
    // porta larga 80 centrata a x=200
    const offset = Math.abs(200 - startX);
    const d = openingDistances(p, computeWallCorners(p), { wallId: top.id, offset, width: 80 });
    const inside = d.map((x) => Math.round(x.dist)).sort((a, b) => a - b);
    // filo interno muri laterali a x=10 e x=390 → 160-10 = 150 e 390-240 = 150 (all'esterno nessuna misura)
    expect(inside).toEqual([150, 150]);
  });
});

import { roomSides } from './geom';

describe('lati delle stanze', () => {
  it('un muro spezzato da un tramezzo sull\'altra faccia resta un unico lato', () => {
    const p = draft(emptyProject());
    rect(p, 0, 0, 600, 300, 20);
    // tramezzo che parte dal muro in alto verso l'esterno (altra stanza): spezza il muro in due tratti
    const a = addNode(p, { x: 300, y: 0 });
    const b = addNode(p, { x: 300, y: -200 });
    addWall(p, a, b, 10, 280);
    normalize(p);
    const room = computeRooms(p).find((r) => r.area > 100000)!;
    const sides = roomSides(room).map((s) => Math.round(s.len)).sort((x, y) => x - y);
    expect(sides).toEqual([280, 280, 580, 580]);
  });
});

import { pocketOpenings } from './pocketDoors';

describe('porte scorrevoli doppie a scomparsa', () => {
  it('si agganciano dentro al muro e ci aprono il passaggio della luce', () => {
    const p = draft(emptyProject());
    rect(p, 0, 0, 600, 400, 20);
    // porta 120 (ingombro 250) cliccata a 25 cm dal muro in alto, ruotata a caso
    const it: Item = { id: 'pd', catalogId: 'pocket2-120', x: 300, y: 25, z: 0, rotation: 0.4, w: 250, d: 12, h: 217 };
    const m = magnetToWall(p, it)!;
    expect(m.y).toBeCloseTo(0, 1); // sull'asse del muro
    expect(m.d).toBe(20); // spessa quanto il muro
    expect(Math.abs(Math.sin(m.rotation))).toBeLessThan(1e-9); // parallela al muro
    p.items.pd = { ...it, ...m };
    const ops = pocketOpenings(p);
    expect(ops).toHaveLength(1);
    expect(ops[0].width).toBe(120);
    expect(ops[0].height).toBe(210);
  });
});

import { CATALOG_BY_ID, itemParts, pocketItemSize } from '../catalog/catalog';

describe('porte a scomparsa: misure su misura e apertura', () => {
  const cat = CATALOG_BY_ID['pocket2-120'];
  const leaves = (open: number, luce = 150) => itemParts(cat, { ...pocketItemSize(luce, 230), d: 30, open }).filter((p) => p.t === 'box' && p.s[2] === 4 && p.s[1] > 200);
  it('chiusa: le ante si toccano al centro; aperta: sono tutte fuori dal passaggio', () => {
    const closed = leaves(0).map((p) => (p.t === 'box' ? Math.abs(p.p[0]) - p.s[0] / 2 : 0));
    expect(closed.every((x) => Math.abs(x) < 1e-9)).toBe(true);
    const open = leaves(1).map((p) => (p.t === 'box' ? Math.abs(p.p[0]) - p.s[0] / 2 : 0));
    expect(open.every((x) => x >= 75 - 1e-9)).toBe(true); // bordo d'attacco a filo della luce (150/2)
  });
  it('luce 150 × 230: il muro si apre di 150 × 230', () => {
    const p = draft(emptyProject());
    rect(p, 0, 0, 600, 400, 20);
    p.items.d = { id: 'd', catalogId: 'pocket2-120', x: 300, y: 0, z: 0, rotation: 0, d: 20, ...pocketItemSize(150, 230) };
    const [o] = pocketOpenings(p);
    expect([o.width, o.height]).toEqual([150, 230]);
  });
});
