import { describe, expect, it } from 'vitest';
import { computeWallCorners } from '../model/geom';
import { addNode, addWall, draft } from '../model/ops';
import { emptyProject } from '../model/types';
import { openingClear, openingDistances, wallClearLength } from './snapping';

describe('lo spessore dei muri non conta', () => {
  it('un muro misura quanto la sua linea, anche agganciato a T', () => {
    const p = draft(emptyProject());
    const l = addNode(p, { x: 0, y: 0 });
    const m = addNode(p, { x: 200, y: 0 });
    const r = addNode(p, { x: 400, y: 0 });
    const e = addNode(p, { x: 200, y: 110 });
    addWall(p, l, m, 12, 280);
    addWall(p, m, r, 12, 280);
    const id = addWall(p, m, e, 30, 280)!;
    expect(wallClearLength(p, computeWallCorners(p), id).net).toBeCloseTo(110, 5);
  });

  it('finestra: distanza + larghezza + distanza = lunghezza del muro', () => {
    const p = draft(emptyProject());
    const a = addNode(p, { x: 0, y: 0 });
    const b = addNode(p, { x: 400, y: 0 });
    const c = addNode(p, { x: 400, y: 300 });
    const id = addWall(p, a, b, 12, 280)!;
    addWall(p, b, c, 12, 280);
    const o = { wallId: id, offset: 160, width: 120 };
    const cl = openingClear(p, computeWallCorners(p), o);
    expect(cl.toA).toBe(100);
    expect(cl.toB).toBe(180);
    const d = openingDistances(p, computeWallCorners(p), o);
    expect(d[0].dist + o.width + d[1].dist).toBe(400);
  });
});
