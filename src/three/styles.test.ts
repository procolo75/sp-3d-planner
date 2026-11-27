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
