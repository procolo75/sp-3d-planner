import * as THREE from 'three';
import { add, dist, mul, norm, perp, sub, type V, type WallCorners } from '../model/geom';
import type { Opening, Project, Wall } from '../model/types';

/** cm → m, e piano (x, y) → spazio 3D (x, z) */
export const S = 0.01;

/**
 * Costruisce la geometria di un muro: due facce (con i fori delle aperture), tappo superiore,
 * spallette/architravi/davanzali delle aperture e testate libere.
 */
export function buildWallGeometry(p: Project, w: Wall, c: WallCorners, openings: Opening[], freeA: boolean, freeB: boolean): THREE.BufferGeometry {
  const A = p.nodes[w.a];
  const B = p.nodes[w.b];
  const L = dist(A, B);
  const dir = norm(sub(B, A));
  const n = perp(dir);
  const H = w.height;
  const h = w.thickness / 2;

  const positions: number[] = [];
  const pushTri = (a: THREE.Vector3, b: THREE.Vector3, c2: THREE.Vector3) => positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c2.x, c2.y, c2.z);
  const pushQuad = (a: THREE.Vector3, b: THREE.Vector3, c2: THREE.Vector3, d: THREE.Vector3) => {
    pushTri(a, b, c2);
    pushTri(a, c2, d);
  };
  /** punto 3D da coordinata lungo il muro u, offset laterale s, quota y */
  const P = (u: number, s: number, y: number) => {
    const q = add(add(A, mul(dir, u)), mul(n, s));
    return new THREE.Vector3(q.x * S, y * S, q.y * S);
  };
  const uOf = (q: V) => (q.x - A.x) * dir.x + (q.y - A.y) * dir.y;

  const ops = openings
    .map((o) => ({ o, u0: Math.max(0, o.offset - o.width / 2), u1: Math.min(L, o.offset + o.width / 2), y0: o.sill, y1: Math.min(H - 1, o.sill + o.height) }))
    .filter((x) => x.u1 - x.u0 > 1 && x.y1 > x.y0)
    .sort((a, b) => a.u0 - b.u0);

  // facce laterali
  for (const side of [1, -1] as const) {
    const u0 = uOf(side === 1 ? c.aL : c.aR);
    const u1 = uOf(side === 1 ? c.bL : c.bR);
    const fo = ops
      .map((x) => ({ ...x, u0: Math.max(x.u0, Math.min(u0, u1) + 0.5), u1: Math.min(x.u1, Math.max(u0, u1) - 0.5) }))
      .filter((x) => x.u1 - x.u0 > 1);
    const holes = fo
      .filter((x) => x.y0 > 0.01)
      .map((x) => new THREE.Path([new THREE.Vector2(x.u0, x.y0), new THREE.Vector2(x.u0, x.y1), new THREE.Vector2(x.u1, x.y1), new THREE.Vector2(x.u1, x.y0)]));
    // le aperture che arrivano a terra (porte) diventano tacche del contorno
    const pts: THREE.Vector2[] = [new THREE.Vector2(u0, 0)];
    for (const d of fo.filter((x) => x.y0 <= 0.01))
      pts.push(new THREE.Vector2(d.u0, 0), new THREE.Vector2(d.u0, d.y1), new THREE.Vector2(d.u1, d.y1), new THREE.Vector2(d.u1, 0));
    pts.push(new THREE.Vector2(u1, 0), new THREE.Vector2(u1, H), new THREE.Vector2(u0, H));
    const shape = new THREE.Shape(pts);
    shape.holes = holes;
    const geo = new THREE.ShapeGeometry(shape);
    const pos = geo.getAttribute('position');
    const idx = geo.getIndex();
    const tri = (i: number) => P(pos.getX(i), side * h, pos.getY(i));
    if (idx) {
      for (let i = 0; i < idx.count; i += 3) {
        const a = tri(idx.getX(i));
        const b = tri(idx.getX(i + 1));
        const d = tri(idx.getX(i + 2));
        if (side === 1) pushTri(a, b, d);
        else pushTri(a, d, b);
      }
    }
    geo.dispose();
  }

  // tappo superiore (impronta con giunzioni)
  const foot = [A, c.aL, c.bL, B, c.bR, c.aR];
  const topShape = new THREE.Shape(foot.map((q) => new THREE.Vector2(q.x, q.y)));
  const tg = new THREE.ShapeGeometry(topShape);
  const tpos = tg.getAttribute('position');
  const tidx = tg.getIndex();
  if (tidx)
    for (let i = 0; i < tidx.count; i += 3) {
      const v3 = (k: number) => new THREE.Vector3(tpos.getX(k) * S, H * S, tpos.getY(k) * S);
      pushTri(v3(tidx.getX(i)), v3(tidx.getX(i + 2)), v3(tidx.getX(i + 1)));
    }
  tg.dispose();

  // aperture: spallette, architrave, davanzale
  for (const x of ops) {
    pushQuad(P(x.u0, h, x.y0), P(x.u0, -h, x.y0), P(x.u0, -h, x.y1), P(x.u0, h, x.y1));
    pushQuad(P(x.u1, -h, x.y0), P(x.u1, h, x.y0), P(x.u1, h, x.y1), P(x.u1, -h, x.y1));
    pushQuad(P(x.u0, h, x.y1), P(x.u0, -h, x.y1), P(x.u1, -h, x.y1), P(x.u1, h, x.y1));
    if (x.y0 > 0.01) pushQuad(P(x.u0, -h, x.y0), P(x.u0, h, x.y0), P(x.u1, h, x.y0), P(x.u1, -h, x.y0));
  }

  // testate libere
  if (freeA) pushQuad(P(0, -h, 0), P(0, h, 0), P(0, h, H), P(0, -h, H));
  if (freeB) pushQuad(P(L, h, 0), P(L, -h, 0), P(L, -h, H), P(L, h, H));

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

/** Geometria del pavimento di una stanza (poligono in cm) a quota y (m). */
export function buildFloorGeometry(poly: V[], y = 0, holes: V[][] = []): THREE.BufferGeometry {
  const shape = new THREE.Shape(poly.map((q) => new THREE.Vector2(q.x * S, q.y * S)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map((q) => new THREE.Vector2(q.x * S, q.y * S))));
  const g = new THREE.ShapeGeometry(shape);
  // da (x, y) del piano a (x, y, z) 3D
  g.rotateX(Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}
