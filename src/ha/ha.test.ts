import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import * as ops from '../model/ops';
import { emptyProject, type Project } from '../model/types';
import { collectEntities, slugify, validEntityId } from './entities';
import { buildBundle, zipBundle } from './bundle';
import { captureCamera } from './views';
import { derive } from '../model/derived';
import { mapRooms } from './layout';
import type { Rendered } from './bundle';

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
  it('dall\'alto ruotata di 90°: la casa diventa verticale e ogni punto resta dentro', () => {
    const cam = captureCamera(house(), 'top', { res: 1000, azimuth: 90, elevation: 45, cutaway: false })!;
    expect(cam.height).toBe(1000);
    expect(cam.width).toBeCloseTo(500, -1);
    const a = cam.toPixel(0, 0);
    const b = cam.toPixel(800, 400);
    // il lato sinistro della pianta (x = 0) finisce in alto
    expect(a.y).toBeLessThan(b.y);
    for (const q of [a, b]) {
      expect(q.x).toBeGreaterThan(0);
      expect(q.x).toBeLessThan(cam.width);
      expect(q.y).toBeGreaterThan(0);
      expect(q.y).toBeLessThan(cam.height);
    }
  });
  it('formato fisso (tablet 1920×1200): misura esatta, casa centrata e tutta dentro', () => {
    for (const view of ['top', 'iso', 'persp'] as const) {
      const cam = captureCamera(house(), view, { res: 1000, azimuth: 30, elevation: 40, cutaway: false, size: { width: 1200, height: 1920 } })!;
      expect([cam.width, cam.height]).toEqual([1200, 1920]);
      for (const [x, y] of [[0, 0], [800, 0], [0, 400], [800, 400]]) {
        const q = cam.toPixel(x, y);
        expect(q.x).toBeGreaterThan(0);
        expect(q.x).toBeLessThan(1200);
        expect(q.y).toBeGreaterThan(0);
        expect(q.y).toBeLessThan(1920);
      }
    }
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

describe('azione al tocco', () => {
  /** righe della regola che inizia con `- entity: <id>` e (se dato) `element: '<el>'` */
  const rule = (y: string, entity: string, element?: string) =>
    y.split('      - entity: ').find((r) => r.startsWith(entity + '\n') && (!element || r.includes(`element: '${element}'`))) ?? '';

  it('predefinita: luci e stanze accendono/spengono, sensori e telecamere mostrano le info', () => {
    const y = buildBundle(house(), '2d', 'casa').yaml;
    expect(rule(y, 'light.cucina', 'light.cucina.marker')).toContain('action: toggle');
    expect(rule(y, 'light.cucina', 'area.cucina')).toContain('action: toggle');
    expect(rule(y, 'sensor.temp_cucina')).toContain('action: more-info');
    expect(rule(y, 'camera.salotto')).toContain('action: more-info');
    expect(rule(y, 'binary_sensor.porta')).toContain('action: more-info');
  });
  it('scelta per ogni elemento: pagina, link, servizio, niente, info di un\'altra entità', () => {
    const p = house();
    p.sensors!.s1.tap = { action: 'navigate', path: '/lovelace/clima' };
    p.sensors!.s2.tap = { action: 'more-info', entity: 'climate.salotto' };
    p.sensors!.s3.tap = { action: 'none' };
    p.lights!.l2.tap = { action: 'call-service', service: 'script.buonanotte' };
    p.cameras!.c1.tap = { action: 'url', url: 'https://example.com/cam' };
    p.openings.d.tap = { action: 'toggle', entity: 'cover.porta' };
    const y = buildBundle(p, '2d', 'casa').yaml;
    expect(rule(y, 'sensor.temp_cucina')).toContain("action: navigate\n          navigation_path: '/lovelace/clima'");
    // anche lo sfondo colorato dell'eCO2 usa la stessa azione
    expect(rule(y, 'sensor.salotto_eco2', 'sensor.salotto_eco2.bg')).toContain('action: more-info\n          entity: climate.salotto');
    expect(rule(y, 'binary_sensor.finestra_cucina', 'binary_sensor.finestra_cucina.bg')).toContain('tap_action: false');
    for (const el of ['light.salotto.marker', 'area.salotto'])
      expect(rule(y, 'light.salotto', el)).toContain('service: script.buonanotte\n          service_data:\n            entity_id: light.salotto');
    expect(rule(y, 'camera.salotto')).toContain("action: url\n          url_path: 'https://example.com/cam'");
    expect(rule(y, 'binary_sensor.porta')).toContain('service: homeassistant.toggle\n          service_data:\n            entity_id: cover.porta');
  });
  it('azione incompleta: avviso e torna alla predefinita', () => {
    const p = house();
    p.sensors!.s1.tap = { action: 'navigate' };
    p.lights!.l1.tap = { action: 'call-service', service: 'non valido' };
    expect(collectEntities(p).warnings.filter((w) => w.includes('azione al tocco'))).toHaveLength(2);
    const y = buildBundle(p, '2d', 'casa').yaml;
    expect(rule(y, 'sensor.temp_cucina')).toContain('action: more-info');
    expect(rule(y, 'light.cucina', 'light.cucina.marker')).toContain('action: toggle');
  });
});


describe('una pagina per ogni stanza', () => {
  const roomRenders = (p: Project, view: 'top' | 'iso') => {
    const der = derive(p);
    const out = new Map<string, Rendered>();
    for (const a of mapRooms(der, collectEntities(p, der))) {
      const cam = captureCamera(p, view, { res: 800, azimuth: 25, elevation: 45, cutaway: false }, a.room.poly)!;
      out.set(a.slug, { ...cam, base: new Uint8Array([7]), lights: new Map([['light.cucina', new Uint8Array([8])], ['light.salotto', new Uint8Array([9])]]) });
    }
    return out;
  };

  it('inquadratura della stanza: la stanza è dentro, il resto della casa fuori', () => {
    const p = house();
    const cucina = derive(p).rooms.find((r) => r.poly.some((q) => q.x === 0))!;
    const cam = captureCamera(p, 'top', { res: 1000, azimuth: 0, elevation: 45, cutaway: false }, cucina.poly)!;
    for (const q of cucina.poly.map((v) => cam.toPixel(v.x, v.y))) {
      expect(q.x).toBeGreaterThan(0);
      expect(q.x).toBeLessThan(cam.width);
    }
    expect(cam.toPixel(800, 200).x).toBeGreaterThan(cam.width);
  });

  it('3D: file per stanza, solo le sue entità, dashboard con le sottopagine', () => {
    const p = house();
    const b = buildBundle(p, 'iso', 'casa', fakeRender(p, 'iso'), { perRoom: true, rooms: roomRenders(p, 'iso') });
    expect(b.rooms.map((r) => r.slug).sort()).toEqual(['cucina', 'salotto']);
    expect(b.files['rooms/cucina/cucina.svg']).toBeDefined();
    expect(b.files['rooms/cucina/base.png']).toBeInstanceOf(Uint8Array);
    // ogni stanza ha solo la sua luce
    expect(b.files['rooms/cucina/lights/light_cucina.png']).toBeDefined();
    expect(b.files['rooms/cucina/lights/light_salotto.png']).toBeUndefined();
    const cucina = b.files['rooms/cucina/cucina.svg'] as string;
    expect(cucina).toContain('href="/local/floorplan/casa/rooms/cucina/base.png"');
    expect(cucina).toContain('id="sensor.temp_cucina"');
    expect(cucina).not.toContain('id="sensor.salotto_eco2"');
    // la porta tra le due stanze compare in entrambe
    expect(cucina).toContain('id="binary_sensor.porta"');
    expect(b.files['rooms/salotto/salotto.svg'] as string).toContain('id="binary_sensor.porta"');

    const y = b.yaml;
    expect(y).toContain('views:');
    expect(y).toContain('    path: casa');
    expect(y).toContain('    path: cucina\n    subview: true\n    panel: true');
    expect(y).not.toContain('back_path');
    expect(y).toContain('image: /local/floorplan/casa/rooms/cucina/cucina.svg');
    expect(y).toContain('stylesheet: /local/floorplan/casa/casa.css');
    // mappa della casa: tocco = apre la stanza, tieni premuto = la luce
    expect(y).toMatch(/- element: 'area\.cucina'\n\s+tap_action:\n\s+action: navigate\n\s+navigation_path: 'cucina'\n\s+hold_action:\n\s+action: call-service\n\s+service: homeassistant\.toggle\n\s+service_data:\n\s+entity_id: light\.cucina/);
    // nella mappa della casa l'area non ha «entity» (solo nelle pagine delle stanze)
    expect(y.split('\n  - title:')[1]).not.toContain("element: 'area.cucina'\n                tap_action:\n                  action: toggle");
  });

  it('YAML della dashboard indentato correttamente', () => {
    const p = house();
    const y = buildBundle(p, '2d', 'casa', undefined, { perRoom: true }).yaml;
    expect(y).toContain('      - type: custom:floorplan-card\n');
    expect(y).toContain('\n        full_height: true\n');
    expect(y).toContain('\n        config:\n          image: /local/floorplan/casa/casa.svg');
    expect(y).toContain('\n          rules:\n');
    expect(y).toContain('\n              - entity: light.cucina\n                element:');
    // 2D: la stanza è la stessa pianta ritagliata, senza PNG
    expect(Object.keys(buildBundle(p, '2d', 'casa', undefined, { perRoom: true }).files).some((f) => f.endsWith('.png'))).toBe(false);
  });

  it('stanza senza luce: si apre lo stesso, con una regola solo «element»', () => {
    const p = house();
    delete p.lights!.l2;
    const y = buildBundle(p, '2d', 'casa', undefined, { perRoom: true }).yaml;
    expect(y).toContain("              - element: 'area.salotto'\n                tap_action:\n                  action: navigate");
  });

  it('senza pagine per stanza lo YAML resta la card singola', () => {
    const y = buildBundle(house(), '2d', 'casa').yaml;
    expect(y).not.toContain('views:');
    expect(y).not.toContain('navigate');
    expect(y.split('\n').find((l) => l.startsWith('type:'))).toBe('type: custom:floorplan-card');
  });
});
