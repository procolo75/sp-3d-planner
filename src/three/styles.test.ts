import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyStyle } from './styles';

function scene() {
  const s = new THREE.Scene();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#d9c2a0' }));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshPhysicalMaterial({ color: '#cfe8f0', transparent: true, opacity: 0.2 }));
  s.add(wall, glass);
  return { s, wall, glass };
}
const edges = (m: THREE.Object3D) => m.children.filter((c) => c.userData.styleEdge).length;

describe('stili della scena 3D', () => {
  it('disegno: materiali «cartoon» con lo stesso colore e contorni', () => {
    const { s, wall } = scene();
    const orig = wall.material;
    applyStyle(s, 'disegno');
    expect(wall.material).toBeInstanceOf(THREE.MeshToonMaterial);
    expect((wall.material as unknown as THREE.MeshToonMaterial).color.getHexString()).toBe('d9c2a0');
    expect(edges(wall)).toBe(1);
    // di nuovo: non aggiunge altri contorni
    applyStyle(s, 'disegno');
    expect(edges(wall)).toBe(1);
    // tornando a normale torna tutto com'era
    applyStyle(s, 'normale');
    expect(wall.material).toBe(orig);
    expect(edges(wall)).toBe(0);
  });

  it('plastico: tutto chiaro, i vetri restano trasparenti, niente contorni', () => {
    const { s, wall, glass } = scene();
    applyStyle(s, 'plastico');
    expect((wall.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('f2efe9');
    expect((glass.material as THREE.Material).transparent).toBe(true);
    expect(edges(wall)).toBe(0);
  });

  it('blueprint: materiali piatti con contorni chiari; per le lampade materiali che reagiscono alla luce', () => {
    const { s, wall } = scene();
    applyStyle(s, 'blueprint');
    expect(wall.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(edges(wall)).toBe(1);
    applyStyle(s, 'blueprint', { lit: true });
    expect(wall.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(edges(wall)).toBe(0);
  });

  it('un materiale rimesso da React diventa il nuovo originale', () => {
    const { s, wall } = scene();
    applyStyle(s, 'disegno');
    const nuovo = new THREE.MeshStandardMaterial({ color: '#ff0000' });
    wall.material = nuovo;
    applyStyle(s, 'disegno');
    expect((wall.material as unknown as THREE.MeshToonMaterial).color.getHexString()).toBe('ff0000');
    applyStyle(s, 'normale');
    expect(wall.material).toBe(nuovo);
  });

  it('realistico usa i materiali normali (ci pensa il path tracer)', () => {
    const { s, wall } = scene();
    const orig = wall.material;
    applyStyle(s, 'realistico');
    expect(wall.material).toBe(orig);
  });
});

describe('texture del Realistico', () => {
  it('UV in metri proiettate sulla faccia dominante', async () => {
    const { boxUV } = await import('./textures');
    const g = new THREE.BoxGeometry(2, 1, 4);
    boxUV(g);
    const uv = g.getAttribute('uv');
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    for (let i = 0; i < pos.count; i++)
      if (Math.abs(nor.getY(i)) > 0.9) {
        expect(uv.getX(i)).toBeCloseTo(pos.getX(i));
        expect(uv.getY(i)).toBeCloseTo(pos.getZ(i));
      }
  });

  it('pavimenti e mobili: il materiale giusto dal nome della stanza e dal colore', async () => {
    const { floorSurface, partSurface } = await import('./textures');
    expect(floorSurface('Bagno')).toBe('tiles');
    expect(floorSurface('Cucina')).toBe('tiles');
    expect(floorSurface('Balcone')).toBe('stone');
    expect(floorSurface('garage')).toBe('concrete');
    expect(floorSurface('Camera 1')).toBe('parquet');
    expect(partSurface('#8b5a2b', false, false)).toBe('wood');
    expect(partSurface('#7a8a9a', false, false)).toBe('fabric');
    expect(partSurface('#b8bcc0', true, false)).toBeNull();
  });
});
