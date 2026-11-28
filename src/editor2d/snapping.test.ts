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

import { magnetPillar } from './snapping';
import { addNode as addN, addWall as addW, draft as dr } from '../model/ops';
import { emptyProject as ep } from '../model/types';

describe('pilastri', () => {
  it("si appoggiano alla linea del muro, entrano negli angoli, lontano restano liberi", () => {
    const p = dr(ep());
    const a = addN(p, { x: 0, y: 0 });
    const b = addN(p, { x: 400, y: 0 });
    const c = addN(p, { x: 400, y: 300 });
    addW(p, a, b, 20, 280);
    addW(p, b, c, 20, 280);
    const it = { rotation: 0, w: 30, d: 30 };
    // parete: faccia sulla linea y=0, dal lato del puntatore
    expect(magnetPillar(p, { ...it, x: 200, y: 12 })).toMatchObject({ x: 200, y: 15 });
    expect(magnetPillar(p, { ...it, x: 200, y: -12 })).toMatchObject({ x: 200, y: -15 });
    // angolo interno (x<400, y>0): il pilastro tocca le due linee
    const m = magnetPillar(p, { ...it, x: 390, y: 20 })!;
    expect([Math.round(m.x), Math.round(m.y)]).toEqual([385, 15]);
    // lontano dai muri
    expect(magnetPillar(p, { ...it, x: 200, y: 120 })).toBeNull();
  });
});
