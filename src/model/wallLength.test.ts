import { describe, expect, it } from 'vitest';
import { computeRooms, roomSides } from './geom';
import { addNode, addWall, draft, normalize, setWallLength } from './ops';
import { emptyProject, type Project } from './types';

const straight = (p: Project) =>
  Object.values(p.walls).every((w) => {
    const A = p.nodes[w.a];
    const B = p.nodes[w.b];
    return Math.abs(A.x - B.x) < 0.01 || Math.abs(A.y - B.y) < 0.01;
  });

function room(p: Project, pts: number[][], t = 12) {
  const n = pts.map(([x, y]) => addNode(p, { x, y }));
  return n.map((id, i) => addWall(p, id, n[(i + 1) % n.length], t, 280)!);
}

describe('stanze misurate sulle linee', () => {
  it('stanza 4,00 × 3,00 disegnata: quote 4,00 e 3,00, superficie 12,00 m², qualunque spessore', () => {
    const p = draft(emptyProject());
    room(p, [[0, 0], [400, 0], [400, 300], [0, 300]], 30);
    const r = computeRooms(p)[0];
    expect(r.area).toBeCloseTo(120000, 5);
    expect(roomSides(r).map((s) => Math.round(s.len)).sort()).toEqual([300, 300, 400, 400]);
  });
});

describe('cambiare la misura di un muro', () => {
  it('non storce la stanza: il muro accanto si sposta parallelo', () => {
    const p = draft(emptyProject());
    const [top] = room(p, [[0, 0], [400, 0], [400, 300], [0, 300]]);
    setWallLength(p, top, 500);
    normalize(p);
    expect(straight(p)).toBe(true);
    expect(computeRooms(p)[0].area).toBeCloseTo(500 * 300, 0);
  });

  it('funziona anche con due stanze affiancate', () => {
    const p = draft(emptyProject());
    const n = [[0, 0], [400, 0], [700, 0], [700, 300], [400, 300], [0, 300]].map(([x, y]) => addNode(p, { x, y }));
    const w1 = addWall(p, n[0], n[1], 12, 280)!;
    for (const [i, j] of [[1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 4]]) addWall(p, n[i], n[j], 12, 280);
    setWallLength(p, w1, 450);
    normalize(p);
    expect(straight(p)).toBe(true);
  });
});
