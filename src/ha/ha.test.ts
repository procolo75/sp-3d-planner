import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import * as ops from '../model/ops';
import { emptyProject, type Project } from '../model/types';
import { collectEntities, slugify, validEntityId } from './entities';
import { buildBundle, zipBundle } from './bundle';
import { captureCamera } from './views';

/** due stanze 400x400 affiancate con una porta, cucina e salotto */
function house(): Project {
  const p = emptyProject();
  const n = (x: number, y: number) => ops.addNode(p, { x, y });
  const pts = [n(0, 0), n(400, 0), n(800, 0), n(800, 400), n(400, 400), n(0, 400)];
  pts.forEach((a, k) => ops.addWall(p, a, pts[(k + 1) % pts.length], 10, 270));
  const mid = ops.addWall(p, pts[1], pts[4], 10, 270)!;
  p.openings.d = { id: 'd', wallId: mid, type: 'door', offset: 200, width: 90, height: 210, sill: 0, haEntity: 'binary_sensor.porta' };
  p.labels.a = { id: 'a', x: 200, y: 200, name: 'Cucina' };
  p.labels.b = { id: 'b', x: 600, y: 200, name: 'Salotto' };
  p.lights = {
    l1: { id: 'l1', x: 200, y: 200, z: 240, entityId: 'light.cucina', label: 'Cucina', color: '#ffc78a', intensity: 0.6 },
    l2: { id: 'l2', x: 600, y: 200, z: 240, entityId: 'light.salotto', label: 'Salotto', color: '#ffc78a', intensity: 0.6 },
    l3: { id: 'l3', x: 650, y: 250, z: 240, entityId: '', color: '#ffc78a', intensity: 0.6 },
  };
  p.sensors = {
    s1: { id: 's1', x: 300, y: 300, entityId: 'sensor.temp_cucina', kind: 'temperature', label: 'Cucina' },
    s2: { id: 's2', x: 600, y: 300, entityId: 'sensor.salotto_eco2', kind: 'co2', label: 'Aria' },
    s3: { id: 's3', x: 100, y: 300, entityId: 'binary_sensor.finestra_cucina', kind: 'window' },
  };
  p.cameras = { c1: { id: 'c1', x: 790, y: 10, z: 230, rotation: 2.3, fov: 90, range: 800, color: '#f00', label: 'Salotto', haEntity: 'camera.salotto' } };
  return p;
}

const fakeRender = (p: Project, view: 'top' | 'iso') => {
  const cam = captureCamera(p, view, { res: 1000, azimuth: 25, elevation: 45, cutaway: false })!;
  return { ...cam, base: new Uint8Array([1, 2, 3]), day: new Uint8Array([4]), lights: new Map([['light.cucina', new Uint8Array([5])], ['light.salotto', new Uint8Array([6])]]) };
};

describe('entità di Home Assistant', () => {
  it('valida gli entity_id e propone nomi', () => {
    expect(validEntityId('light.cucina')).toBe(true);
    expect(validEntityId('Light.Cucina')).toBe(false);
    expect(validEntityId('cucina')).toBe(false);
    expect(slugify('Camera da letto è')).toBe('camera_da_letto_e');
  });
  it('scarta le luci senza entità con un avviso', () => {
    const e = collectEntities(house());
    expect(e.lights.map((l) => l.entityId)).toEqual(['light.cucina', 'light.salotto']);
    expect(e.contacts).toHaveLength(1);
    expect(e.cameras).toHaveLength(1);
    expect(e.warnings.some((w) => w.includes('manca'))).toBe(true);
  });
});

describe('camera di export', () => {
  it('dall\'alto: la pianta finisce dritta nell\'immagine (x a destra, y in basso)', () => {
    const cam = captureCamera(house(), 'top', { res: 1000, azimuth: 0, elevation: 45, cutaway: false })!;
    expect(cam.width).toBe(1000);
    expect(cam.height).toBeCloseTo(500, -1);
    const a = cam.toPixel(0, 0);
    const b = cam.toPixel(800, 400);
    const c = cam.toPixel(400, 200);
    expect(a.x).toBeLessThan(b.x);
    expect(a.y).toBeLessThan(b.y);
    expect(c.x).toBeCloseTo(500, 0);
    expect(c.y).toBeCloseTo(cam.height / 2, 0);
    // margine: la casa sta dentro all'immagine
    expect(a.x).toBeGreaterThan(0);
    expect(b.x).toBeLessThan(1000);
  });
  it('viste inclinate: tutta la casa dentro all\'immagine', () => {
    for (const view of ['iso', 'persp'] as const) {
      const cam = captureCamera(house(), view, { res: 1200, azimuth: 30, elevation: 40, cutaway: false })!;
      for (const [x, y] of [[0, 0], [800, 0], [800, 400], [0, 400]])
        for (const z of [0, 270]) {
          const q = cam.toPixel(x, y, z);
          expect(q.x).toBeGreaterThanOrEqual(0);
          expect(q.x).toBeLessThanOrEqual(cam.width);
          expect(q.y).toBeGreaterThanOrEqual(0);
          expect(q.y).toBeLessThanOrEqual(cam.height);
        }
    }
  });
});

describe('file per ha-floorplan', () => {
  it('3D: SVG con id = entità, YAML con le regole e i file dei render', () => {
    const p = house();
    const b = buildBundle(p, 'top', 'casa', fakeRender(p, 'top'));
    const svg = b.files['casa.svg'] as string;
    for (const id of ['light.cucina', 'light.salotto', 'light.cucina.marker', 'sensor.temp_cucina', 'binary_sensor.porta', 'camera.salotto', 'area.cucina', 'area.salotto', 'sun.sun'])
      expect(svg).toContain(`id="${id}"`);
    const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(svg).toContain('href="/local/floorplan/casa/lights/light_cucina.png"');
    expect(b.files['lights/light_salotto.png']).toBeInstanceOf(Uint8Array);
    expect(b.files['day.png']).toBeDefined();
    const y = b.yaml;
    expect(y).toContain('type: custom:floorplan-card');
    expect(y).toContain('image: /local/floorplan/casa/casa.svg');
    expect(y).toContain("element: 'area.cucina'");
    expect(y).toContain("class: 'light-${entity.state}'");
    expect(y).toContain('service: floorplan.text_set');
    expect(y).toContain("class: 'contact-${entity.state}'");
    expect(y).toContain('entity: camera.salotto');
    // eCO2: colore in base ai ppm; finestra: Aperta/Chiusa e sfondo rosso
    expect(svg).toContain('id="sensor.salotto_eco2.bg"');
    expect(y).toContain("element: 'sensor.salotto_eco2.bg'");
    expect(y).toContain("co2-${Number(entity.state) < 800 ? ''good''");
    expect(y).toContain("element: 'binary_sensor.finestra_cucina.bg'");
    expect(y).toContain("class: 'sensor-${entity.state}'");
    expect(y).toContain("''Aperta''");
  });
  it('2D: pianta vettoriale senza PNG, con aloni delle luci', () => {
    const b = buildBundle(house(), '2d', 'casa');
    const svg = b.files['casa.svg'] as string;
    expect(Object.keys(b.files).some((f) => f.endsWith('.png'))).toBe(false);
    expect(svg).toContain('<g id="plan">');
    expect(svg).toContain('<circle id="light.cucina" class="light-overlay"');
    expect(svg).toContain('clip-path="url(#clip0)"');
    expect(b.yaml).not.toContain('sun.sun');
  });
  it('ZIP con la cartella floorplan/<nome>/', () => {
    const p = house();
    const b = buildBundle(p, 'iso', 'casa', fakeRender(p, 'iso'));
    const z = unzipSync(zipBundle('casa', b.files));
    expect(Object.keys(z).sort()).toEqual(
      ['LEGGIMI.txt', 'base.png', 'casa.css', 'casa.svg', 'casa.yaml', 'day.png', 'lights/light_cucina.png', 'lights/light_salotto.png'].map((f) => 'floorplan/casa/' + f).sort(),
    );
    expect(strFromU8(z['floorplan/casa/casa.css'])).toContain('mix-blend-mode: plus-lighter');
  });
});
