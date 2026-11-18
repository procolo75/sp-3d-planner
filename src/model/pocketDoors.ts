// Porte a scomparsa (mobili del catalogo con `pocket`): stanno dentro al muro e ci aprono un
// passaggio. Qui si ricavano le aperture "virtuali" che 3D e copertura telecamere trattano come varchi.
import { CATALOG_BY_ID, POCKET_OPEN_DEFAULT, pocketSize } from '../catalog/catalog';
import { dist, norm, projectOnSegment, sub } from './geom';
import type { Item, Opening, Project, Wall } from './types';

/** muro su cui è montata la porta a scomparsa (centro sull'asse e parallela), con la posizione lungo il muro */
export function pocketWall(p: Project, it: Item): { wall: Wall; offset: number } | null {
  const ux = Math.cos(it.rotation);
  const uy = Math.sin(it.rotation);
  let best: { wall: Wall; offset: number; d: number } | null = null;
  for (const w of Object.values(p.walls)) {
    const A = p.nodes[w.a];
    const B = p.nodes[w.b];
    if (!A || !B) continue;
    const L = dist(A, B);
    if (L < 1) continue;
    const dir = norm(sub(B, A));
    if (Math.abs(dir.x * ux + dir.y * uy) < 0.98) continue;
    const pj = projectOnSegment(it, A, B);
    if (pj.dist > w.thickness / 2 + 2) continue;
    if (!best || pj.dist < best.d) best = { wall: w, offset: pj.t * L, d: pj.dist };
  }
  return best && { wall: best.wall, offset: best.offset };
}

/**
 * aperture (varchi) create nei muri dalle porte a scomparsa. Con `vision` (copertura telecamere)
 * restano fuori le porte piene chiuse, che bloccano la vista come il muro.
 */
export function pocketOpenings(p: Project, vision = false): Opening[] {
  const out: Opening[] = [];
  for (const it of Object.values(p.items)) {
    const cat = CATALOG_BY_ID[it.catalogId];
    if (!cat?.pocket) continue;
    if (vision && !cat.pocket.glass && (it.open ?? POCKET_OPEN_DEFAULT) < 0.1) continue;
    const on = pocketWall(p, it);
    if (!on) continue;
    out.push({
      id: 'pocket-' + it.id,
      wallId: on.wall.id,
      type: 'arch',
      offset: on.offset,
      width: pocketSize(it).luce,
      height: pocketSize(it).h,
      sill: 0,
    });
  }
  return out;
}
