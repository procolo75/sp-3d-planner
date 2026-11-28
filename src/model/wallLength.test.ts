import { describe, expect, it } from 'vitest';
import { computeRooms } from './geom';
import { addNode, addWall, draft, normalize, setWallLength } from './ops';
import { emptyProject } from './types';
import { endOffset, wallClearLength } from '../editor2d/snapping';

const straight = (p: ReturnType<typeof draft>) =>
  Object.values(p.walls).every((w) => {
    const A = p.nodes[w.a];
    const B = p.nodes[w.b];
    return Math.abs(A.x - B.x) < 0.01 || Math.abs(A.y - B.y) < 0.01;
  });

describe('cambiare la misura di un muro', () => {
  it('non storce la stanza: il muro accanto si sposta parallelo', () => {
    const p = draft(emptyProject());
    const a = addNode(p, { x: 0, y: 0 });
    const b = addNode(p, { x: 400, y: 0 });
    const c = addNode(p, { x: 400, y: 300 });
    const d = addNode(p, { x: 0, y: 300 });
    const top = addWall(p, a, b, 12, 280)!;
    addWall(p, b, c, 12, 280);
    addWall(p, c, d, 12, 280);
    addWall(p, d, a, 12, 280);
    setWallLength(p, top, 500);
    normalize(p);
    expect(straight(p)).toBe(true);
    const r = computeRooms(p)[0];
    expect(r.area).toBeCloseTo((500 - 12) * (300 - 12), 0);
  });

  it('funziona anche con due stanze affiancate', () => {
    const p = draft(emptyProject());
    const n = [
      [0, 0], [400, 0], [700, 0], [700, 300], [400, 300], [0, 300],
    ].map(([x, y]) => addNode(p, { x, y }));
    const w1 = addWall(p, n[0], n[1], 12, 280)!;
    addWall(p, n[1], n[2], 12, 280);
    addWall(p, n[2], n[3], 12, 280);
    addWall(p, n[3], n[4], 12, 280);
    addWall(p, n[4], n[5], 12, 280);
    addWall(p, n[5], n[0], 12, 280);
    addWall(p, n[1], n[4], 12, 280);
    setWallLength(p, w1, 450);
    normalize(p);
    expect(straight(p)).toBe(true);
  });
});

describe('misure = spazio utile', () => {
  it('estremo libero conta mezzo spessore, agganciato fino alla faccia', () => {
    const p = draft(emptyProject());
    expect(endOffset(p, { x: 0, y: 0 }, { x: 1, y: 0 }, 12)).toBe(6);
    const a = addNode(p, { x: 0, y: 0 });
    const b = addNode(p, { x: 0, y: 300 });
    addWall(p, a, b, 20, 280);
    expect(endOffset(p, { x: 0, y: 0 }, { x: 1, y: 0 }, 12)).toBeCloseTo(10, 5);
  });

  it('stanza disegnata con misure 4,00 × 3,00 ha interno 4,00 × 3,00', () => {
    const p = draft(emptyProject());
    const T = 12;
    // come fa il disegno digitando la misura: estremo + spazio utile + metà spessore
    const pts = [{ x: 0, y: 0 }];
    const dirs = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
    const lens = [400, 300, 400];
    let prev = addNode(p, pts[0]);
    for (let i = 0; i < 3; i++) {
      const s = p.nodes[prev];
      const off = endOffset(p, s, dirs[i], T);
      const e = { x: s.x + dirs[i].x * (off + lens[i] + T / 2), y: s.y + dirs[i].y * (off + lens[i] + T / 2) };
      const id = addNode(p, e);
      addWall(p, prev, id, T, 280);
      prev = id;
    }
    addWall(p, prev, Object.keys(p.nodes)[0], T, 280);
    normalize(p);
    const r = computeRooms(p)[0];
    expect(r.area).toBeCloseTo(400 * 300, 0);
    for (const w of Object.values(p.walls)) expect([400, 300]).toContain(Math.round(wallClearLength(p, new Map(), w.id).net));
  });
});
