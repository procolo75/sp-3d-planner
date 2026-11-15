import { describe, expect, it } from 'vitest';
import { computeWallCorners } from '../model/geom';
import { addNode, addWall, draft } from '../model/ops';
import { emptyProject } from '../model/types';
import { faceOffset, wallClearLength } from './snapping';

describe('misura dalla faccia del muro', () => {
  const p = draft(emptyProject());
  const a = addNode(p, { x: 0, y: 0 });
  const b = addNode(p, { x: 400, y: 0 });
  const c = addNode(p, { x: 400, y: 300 });
  addWall(p, a, b, 12, 280);
  addWall(p, b, c, 20, 280);
  const corners = computeWallCorners(p);

  it('dall\'asse di un muro: mezzo spessore', () => {
    expect(faceOffset(p, corners, { x: 200, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(6, 1);
  });
  it('da un angolo: esce dallo spessore del muro attraversato', () => {
    expect(faceOffset(p, corners, { x: 400, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(10, 1);
    expect(faceOffset(p, corners, { x: 400, y: 0 }, { x: 0, y: -1 })).toBeCloseTo(6, 1);
  });
  it('dall\'estremo libero in prolungamento: zero', () => {
    expect(faceOffset(p, corners, { x: 0, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(0, 1);
  });
});

describe('muro agganciato a T', () => {
  it('la lunghezza netta parte dalla faccia del muro diviso', () => {
    const p = draft(emptyProject());
    const l = addNode(p, { x: 0, y: 0 });
    const m = addNode(p, { x: 200, y: 0 });
    const r = addNode(p, { x: 400, y: 0 });
    const e = addNode(p, { x: 200, y: 106 });
    addWall(p, l, m, 12, 280);
    addWall(p, m, r, 12, 280);
    const id = addWall(p, m, e, 12, 280)!;
    expect(wallClearLength(p, computeWallCorners(p), id).net).toBeCloseTo(100, 1);
  });
});
