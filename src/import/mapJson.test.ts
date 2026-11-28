import { describe, expect, it } from 'vitest';
import { computeRooms } from '../model/geom';
import { MapError, parseMapText } from './mapJson';

const room = {
  nome: 'Prova',
  muri: [
    { da: [0, 0], a: [600, 0], spessore: 20 },
    { da: [600, 0], a: [600, 400], spessore: 20 },
    { da: [600, 400], a: [0, 400], spessore: 20 },
    { da: [0, 400], a: [0, 0], spessore: 20 },
    { da: [300, 0], a: [300, 400], spessore: 10 }, // tramezzo a T
  ],
  porte: [{ pos: [300, 200], larghezza: 80 }],
  finestre: [{ pos: [150, 0], larghezza: 120 }],
  stanze: [
    { nome: 'Sinistra', pos: [150, 200] },
    { nome: 'Destra', pos: [450, 200] },
  ],
};

describe('mappa JSON', () => {
  it('costruisce muri, stanze, porte e finestre', () => {
    const { project, stats } = parseMapText(JSON.stringify(room));
    const rooms = computeRooms(project);
    expect(rooms).toHaveLength(2);
    // misure sulle linee (lo spessore non conta)
    for (const r of rooms) expect(r.area).toBeGreaterThan(0);
    expect(stats.openings).toBe(2);
    expect(stats.skippedOpenings).toBe(0);
    const door = Object.values(project.openings).find((o) => o.type === 'door')!;
    const w = project.walls[door.wallId];
    expect(project.nodes[w.a].x).toBe(300);
    expect(project.nodes[w.b].x).toBe(300);
    expect(Object.values(project.labels).map((l) => l.name).sort()).toEqual(['Destra', 'Sinistra']);
  });

  it('legge la mappa anche dentro un testo con blocco ```json', () => {
    const txt = 'Ecco la mappa:\n```json\n' + JSON.stringify(room, null, 2) + '\n```\nFammi sapere!';
    expect(parseMapText(txt).stats.walls).toBeGreaterThan(4);
  });

  it('dà errori comprensibili', () => {
    expect(() => parseMapText('ciao')).toThrow(MapError);
    expect(() => parseMapText('{"muri": []}')).toThrow(/non ci sono muri/);
    expect(() => parseMapText('{"muri": [{"da": [0,0]}]}')).toThrow(/muro n. 1/);
  });
});
