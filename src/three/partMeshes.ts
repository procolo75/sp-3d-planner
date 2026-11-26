// Geometrie e materiali delle parti dei mobili, condivisi tra la scena 3D e le miniature del catalogo.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Part } from '../catalog/catalog';
import { S } from './wallGeometry';

// le geometrie sono condivise (stesse misure = stessa geometria) e non vengono mai liberate:
// sono poche centinaia e piccole
const geoCache = new Map<string, THREE.BufferGeometry>();
const r1 = (v: number) => Math.round(v * 10) / 10;

/** geometria della parte (in metri, centrata): scatole con spigoli leggermente arrotondati */
export function partGeometry(pt: Part): THREE.BufferGeometry {
  const key = pt.t === 'box' ? `b${r1(pt.s[0])},${r1(pt.s[1])},${r1(pt.s[2])}` : pt.t === 'cyl' ? `c${r1(pt.r)},${r1(pt.h)}` : `s${r1(pt.r)}`;
  let g = geoCache.get(key);
  if (g) return g;
  if (pt.t === 'box') {
    const [w, h, d] = pt.s;
    const m = Math.min(w, h, d);
    // spigoli smussati: niente su lamine e vetri sottili, al massimo 2,5 cm (cuscini, materassi)
    const rad = m >= 3 ? Math.min(2.5, m * 0.18) : 0;
    g = rad > 0 ? new RoundedBoxGeometry(w * S, h * S, d * S, 2, rad * S) : new THREE.BoxGeometry(w * S, h * S, d * S);
  } else if (pt.t === 'cyl') g = new THREE.CylinderGeometry(pt.r * S, pt.r * S, pt.h * S, 28);
  else g = new THREE.SphereGeometry(pt.r * S, 20, 14);
  geoCache.set(key, g);
  return g;
}

/** aspetto della parte: vetro (parte semitrasparente), metallo (grigi chiari freddi) o materiale opaco */
export function partLook(pt: Part): { roughness: number; metalness: number } {
  if (pt.o !== undefined) return { roughness: 0.08, metalness: 0 };
  const n = parseInt(pt.c.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const steel = Math.abs(r - g) < 10 && Math.abs(g - b) < 12 && b >= r && r > 150 && r < 215;
  return steel ? { roughness: 0.35, metalness: 0.55 } : { roughness: 0.72, metalness: 0 };
}
