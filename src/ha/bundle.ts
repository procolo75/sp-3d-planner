// Mette insieme i file della mappa di Home Assistant e crea lo ZIP.
import { strToU8, zipSync, type Zippable } from 'fflate';
import { derive, type Derived } from '../model/derived';
import type { Room } from '../model/geom';
import type { Project } from '../model/types';
import { collectEntities, type HaEntities } from './entities';
import { buildLayout, mapRooms, type Layout } from './layout';
import { buildCss } from './css';
import { buildSvg2D, buildSvg3D } from './svg';
import { buildCard, buildDashboard, buildYaml } from './yaml';
import { VIEW_NAMES, type HaView } from './views';

export interface Rendered {
  width: number;
  height: number;
  toPixel(x: number, y: number, z?: number): { x: number; y: number };
  base: Uint8Array;
  day?: Uint8Array;
  lights: Map<string, Uint8Array>;
}

export interface BundleFiles {
  /** percorso nello ZIP → contenuto */
  files: Record<string, string | Uint8Array>;
  layout: Layout;
  yaml: string;
  /** mappe delle stanze (se è stata chiesta una pagina per stanza) */
  rooms: RoomMap[];
}

export interface RoomMap {
  /** id dell'area nella mappa della casa (area.cucina) */
  areaId: string;
  slug: string;
  name: string;
  /** cartella nello ZIP, relativa a quella della casa (rooms/cucina/) */
  dir: string;
  svg: string;
  layout: Layout;
}

export interface BundleOpts {
  /** una pagina per stanza: lo YAML diventa la dashboard intera (casa + sottopagine) */
  perRoom?: boolean;
  /** viste 3D: render di ogni stanza, per slug della stanza */
  rooms?: Map<string, Rendered>;
}

/** cartella in Home Assistant: /config/www/floorplan/<slug>/ = /local/floorplan/<slug>/ */
export const haBase = (slug: string) => `/local/floorplan/${slug}/`;

/** margine attorno alla pianta 2D (cm) */
const PAD_2D = 60;

/** una mappa (casa intera o stanza): layout, SVG e immagini, con i percorsi relativi alla sua cartella */
function buildMap(p: Project, der: Derived, ents: HaEntities, view: HaView, href: string, r: Rendered | undefined, room?: Room) {
  const files: Record<string, string | Uint8Array> = {};
  let layout: Layout;
  let svg: string;
  if (view === '2d') {
    const ns = room ? room.poly : Object.values(p.nodes);
    const xs = ns.map((n) => n.x);
    const ys = ns.map((n) => n.y);
    const x0 = Math.min(...xs) - PAD_2D;
    const y0 = Math.min(...ys) - PAD_2D;
    const width = Math.max(...xs) + PAD_2D - x0;
    const height = Math.max(...ys) + PAD_2D - y0;
    layout = buildLayout(p, der, ents, { width, height, x0, y0, toPixel: (x, y) => ({ x, y }), vertical: false, planar: true }, room);
    svg = buildSvg2D(p, der, layout);
  } else {
    if (!r) throw new Error('Mancano i render 3D');
    layout = buildLayout(p, der, ents, { width: r.width, height: r.height, toPixel: r.toPixel, vertical: view !== 'top' }, room);
    svg = buildSvg3D(layout, { href, withDay: !!r.day });
    files['base.png'] = r.base;
    if (r.day) files['day.png'] = r.day;
    for (const l of layout.lights) {
      const png = r.lights.get(l.entityId);
      if (png) files[l.file] = png;
    }
  }
  return { files, layout, svg };
}

export function buildBundle(p: Project, view: HaView, slug: string, r?: Rendered, o: BundleOpts = {}): BundleFiles {
  const der = derive(p);
  const ents = collectEntities(p, der);
  const base = haBase(slug);
  const withDay = view !== '2d' && !!r?.day;
  const house = buildMap(p, der, ents, view, base, r);
  const files = house.files;
  const css = `${base}${slug}.css`;
  const rooms: RoomMap[] = [];
  if (o.perRoom) {
    for (const a of mapRooms(der, ents)) {
      const rr = view === '2d' ? undefined : o.rooms?.get(a.slug);
      if (view !== '2d' && !rr) continue;
      const dir = `rooms/${a.slug}/`;
      const m = buildMap(p, der, ents, view, base + dir, rr, a.room);
      for (const [path, data] of Object.entries(m.files)) files[dir + path] = data;
      files[`${dir}${a.slug}.svg`] = m.svg;
      rooms.push({ areaId: a.id, slug: a.slug, name: a.name, dir, svg: m.svg, layout: m.layout });
    }
  }
  let yaml: string;
  if (o.perRoom) {
    // percorso relativo: ha-floorplan fa history.pushState, quindi da /<dashboard>/casa porta a /<dashboard>/<stanza>
    // qualunque sia il nome dato alla dashboard in Home Assistant
    const roomPaths = new Map(rooms.map((x) => [x.areaId, x.slug]));
    yaml = buildDashboard({
      title: p.name || slug,
      house: buildCard(house.layout, { image: `${base}${slug}.svg`, stylesheet: css, withDay, roomPaths }),
      rooms: rooms.map((x) => ({ name: x.name, slug: x.slug, card: buildCard(x.layout, { image: `${base}${x.dir}${x.slug}.svg`, stylesheet: css, withDay: view !== '2d' && !!o.rooms?.get(x.slug)?.day }) })),
    });
  } else yaml = buildYaml(house.layout, { slug, base, withDay, title: p.name || slug });
  files[`${slug}.svg`] = house.svg;
  files[`${slug}.css`] = buildCss(view);
  files[`${slug}.yaml`] = yaml;
  files['LEGGIMI.txt'] = readme(p, view, slug, ents.warnings, !!o.perRoom, rooms.length);
  return { files, layout: house.layout, yaml, rooms };
}

export function zipBundle(slug: string, files: Record<string, string | Uint8Array>): Uint8Array {
  const z: Zippable = {};
  for (const [path, data] of Object.entries(files)) {
    const bytes = typeof data === 'string' ? strToU8(data) : data;
    // i PNG sono già compressi
    z[`floorplan/${slug}/${path}`] = [bytes, { level: path.endsWith('.png') ? 0 : 6 }];
  }
  return zipSync(z);
}

function readme(p: Project, view: HaView, slug: string, warnings: string[], perRoom = false, nRooms = 0) {
  return `Mappa di Home Assistant per «${p.name || slug}» — ${VIEW_NAMES[view]}
Creata con SP 3D Planner il ${new Date().toLocaleString('it-IT')}.

INSTALLAZIONE
1. In Home Assistant installa la card «ha-floorplan» da HACS (Frontend → cerca «floorplan»)
   e, se richiesto, aggiungi la risorsa /hacsfiles/ha-floorplan/floorplan.js.
2. Copia la cartella «floorplan» di questo ZIP dentro /config/www/
   (deve risultare /config/www/floorplan/${slug}/${slug}.svg).
   Se la cartella /config/www non esisteva, riavvia Home Assistant.
${
    perRoom
      ? `3. Crea la dashboard: Impostazioni → Dashboard → Aggiungi dashboard → «Nuova dashboard da zero»
   (il nome è libero).
   Aprila → ✏️ Modifica → ⋮ → «Editor di configurazione raw», sostituisci tutto
   con il contenuto di ${slug}.yaml e salva.`
      : `3. Apri la dashboard → ✏️ Modifica → Aggiungi card → Manuale,
   e incolla il contenuto di ${slug}.yaml.`
  }
4. Se dopo un aggiornamento non vedi le modifiche, svuota la cache del browser
   (o dell'app) e ricarica.

COSA FA
${
    perRoom
      ? `- Stanze: toccandone una si apre la sua mappa (${nRooms} pagine, con la freccia ← per tornare alla casa);
  tenendola premuta accendi/spegni la sua luce.
- Luci: la stanza si illumina quando la luce è accesa; il pallino giallo la accende/spegne.`
      : '- Luci: la stanza si illumina quando la luce è accesa; toccando la stanza o il pallino giallo la accendi/spegni.'
  }
- Sensori: mostrano il valore aggiornato (tocca per lo storico).
- Porte/finestre: diventano rosse quando il sensore è aperto.
- Telecamere: toccale per vedere le immagini.
${view !== '2d' ? "- Giorno/notte: se hai incluso l'immagine di giorno, segue l'entità sun.sun.\n" : ''}
Gli id nello SVG sono gli entity_id: se un'entità ha un nome diverso in Home Assistant,
correggila nel planner e riesporta (oppure modifica a mano .svg e .yaml).
${warnings.length ? '\nAVVISI\n' + warnings.map((w) => '- ' + w).join('\n') + '\n' : ''}`;
}
