// Mette insieme i file della mappa di Home Assistant e crea lo ZIP.
import { strToU8, zipSync, type Zippable } from 'fflate';
import { derive } from '../model/derived';
import type { Project } from '../model/types';
import { collectEntities } from './entities';
import { buildLayout, type Layout } from './layout';
import { buildCss } from './css';
import { buildSvg2D, buildSvg3D } from './svg';
import { buildYaml } from './yaml';
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
}

/** cartella in Home Assistant: /config/www/floorplan/<slug>/ = /local/floorplan/<slug>/ */
export const haBase = (slug: string) => `/local/floorplan/${slug}/`;

/** margine attorno alla pianta 2D (cm) */
const PAD_2D = 60;

export function buildBundle(p: Project, view: HaView, slug: string, r?: Rendered): BundleFiles {
  const der = derive(p);
  const ents = collectEntities(p, der);
  const base = haBase(slug);
  const files: Record<string, string | Uint8Array> = {};
  let layout: Layout;
  let svg: string;
  const withDay = !!r?.day;
  if (view === '2d') {
    const ns = Object.values(p.nodes);
    const xs = ns.map((n) => n.x);
    const ys = ns.map((n) => n.y);
    const x0 = Math.min(...xs) - PAD_2D;
    const y0 = Math.min(...ys) - PAD_2D;
    const width = Math.max(...xs) + PAD_2D - x0;
    const height = Math.max(...ys) + PAD_2D - y0;
    layout = buildLayout(p, der, ents, { width, height, x0, y0, toPixel: (x, y) => ({ x, y }), vertical: false, planar: true });
    svg = buildSvg2D(p, der, layout);
  } else {
    if (!r) throw new Error('Mancano i render 3D');
    layout = buildLayout(p, der, ents, { width: r.width, height: r.height, toPixel: r.toPixel, vertical: view !== 'top' });
    svg = buildSvg3D(layout, { href: base, withDay });
    files['base.png'] = r.base;
    if (r.day) files['day.png'] = r.day;
    for (const l of layout.lights) {
      const png = r.lights.get(l.entityId);
      if (png) files[l.file] = png;
    }
  }
  const yaml = buildYaml(layout, { slug, base, withDay: view !== '2d' && withDay, title: p.name || slug });
  files[`${slug}.svg`] = svg;
  files[`${slug}.css`] = buildCss(view);
  files[`${slug}.yaml`] = yaml;
  files['LEGGIMI.txt'] = readme(p, view, slug, ents.warnings);
  return { files, layout, yaml };
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

function readme(p: Project, view: HaView, slug: string, warnings: string[]) {
  return `Mappa di Home Assistant per «${p.name || slug}» — ${VIEW_NAMES[view]}
Creata con SP 3D Planner il ${new Date().toLocaleString('it-IT')}.

INSTALLAZIONE
1. In Home Assistant installa la card «ha-floorplan» da HACS (Frontend → cerca «floorplan»)
   e, se richiesto, aggiungi la risorsa /hacsfiles/ha-floorplan/floorplan.js.
2. Copia la cartella «floorplan» di questo ZIP dentro /config/www/
   (deve risultare /config/www/floorplan/${slug}/${slug}.svg).
   Se la cartella /config/www non esisteva, riavvia Home Assistant.
3. Apri la dashboard → ✏️ Modifica → Aggiungi card → Manuale,
   e incolla il contenuto di ${slug}.yaml.
4. Se dopo un aggiornamento non vedi le modifiche, svuota la cache del browser
   (o dell'app) e ricarica.

COSA FA
- Luci: la stanza si illumina quando la luce è accesa; toccando la stanza o il pallino giallo la accendi/spegni.
- Sensori: mostrano il valore aggiornato (tocca per lo storico).
- Porte/finestre: diventano rosse quando il sensore è aperto.
- Telecamere: toccale per vedere le immagini.
${view !== '2d' ? "- Giorno/notte: se hai incluso l'immagine di giorno, segue l'entità sun.sun.\n" : ''}
Gli id nello SVG sono gli entity_id: se un'entità ha un nome diverso in Home Assistant,
correggila nel planner e riesporta (oppure modifica a mano .svg e .yaml).
${warnings.length ? '\nAVVISI\n' + warnings.map((w) => '- ' + w).join('\n') + '\n' : ''}`;
}
