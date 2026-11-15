import { describe, expect, it } from 'vitest';
import { derive } from './derived';
import * as ops from './ops';
import { cameraCoverage, coverageStats, visionSegments } from './coverage';
import { emptyProject, type Project } from './types';

/** due stanze 400x400 affiancate, separate da un muro (con eventuale porta) */
function twoRooms(door: boolean): Project {
  const p = emptyProject();
  const n = (x: number, y: number) => ops.addNode(p, { x, y });
  const pts = [n(0, 0), n(400, 0), n(800, 0), n(800, 400), n(400, 400), n(0, 400)];
  const ring = [0, 1, 2, 3, 4, 5];
  ring.forEach((i, k) => ops.addWall(p, pts[i], pts[ring[(k + 1) % ring.length]], 10, 270));
  const mid = ops.addWall(p, pts[1], pts[4], 10, 270)!;
  if (door) p.openings.d = { id: 'd', wallId: mid, type: 'door', offset: 200, width: 90, height: 210, sill: 0 };
  return p;
}

describe('copertura telecamere', () => {
  it('una telecamera in angolo a 90° vede tutta la sua stanza e niente di là dal muro', () => {
    const p = twoRooms(false);
    const der = derive(p);
    const cam = { id: 'c', x: 9, y: 9, z: 230, rotation: Math.PI / 4, fov: 90, range: 2000, color: '#f00' };
    const poly = cameraCoverage(cam, visionSegments(p, der.corners));
    const st = coverageStats(der.rooms, new Map([['c', poly]]));
    const vals = [...st.perRoom.values()].sort();
    expect(vals[1]).toBeGreaterThan(0.97);
    expect(vals[0]).toBe(0);
  });

  it('con la porta aperta vede anche un po\' della stanza accanto', () => {
    const p = twoRooms(true);
    const der = derive(p);
    const cam = { id: 'c', x: 9, y: 9, z: 230, rotation: Math.PI / 4, fov: 90, range: 2000, color: '#f00' };
    const poly = cameraCoverage(cam, visionSegments(p, der.corners));
    const vals = [...coverageStats(der.rooms, new Map([['c', poly]])).perRoom.values()].sort();
    expect(vals[0]).toBeGreaterThan(0.01);
    expect(vals[0]).toBeLessThan(0.5);
  });

  it('la portata limita la zona vista', () => {
    const p = twoRooms(false);
    const der = derive(p);
    const cam = { id: 'c', x: 200, y: 200, z: 230, rotation: 0, fov: 360, range: 100, color: '#f00' };
    const st = coverageStats(der.rooms, new Map([['c', cameraCoverage(cam, visionSegments(p, der.corners))]]));
    expect(st.perCamera.get('c')!).toBeGreaterThan(2.8);
    expect(st.perCamera.get('c')!).toBeLessThan(3.4); // π·1² m²
  });
});
