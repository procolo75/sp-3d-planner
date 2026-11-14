import { describe, expect, it } from 'vitest';
import { computeRooms, computeWallCorners } from './geom';
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
