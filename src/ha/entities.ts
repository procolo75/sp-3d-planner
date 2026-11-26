// Entità di Home Assistant collegate al progetto: validazione e raccolta per l'export.
import { pointInPolygon } from '../model/geom';
import type { Derived } from '../model/derived';
import type { Camera, Light, Opening, Project, Sensor } from '../model/types';

const ENTITY_RE = /^[a-z0-9_]+\.[a-z0-9_]+$/;

/** true se il testo ha la forma di un entity_id di Home Assistant (dominio.oggetto) */
export function validEntityId(s: string | undefined): s is string {
  return !!s && ENTITY_RE.test(s);
}

/** "Camera da letto" → "camera_da_letto" (come fa Home Assistant con i nomi) */
export function slugify(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'casa'
  );
}

/** entity_id suggerito: dominio + nome (es. light + "Cucina" → light.cucina) */
export function suggestEntity(domain: string, name: string | undefined) {
  return `${domain}.${slugify(name || domain)}`;
}

/** nome di file sicuro per un'entità: light.cucina → light_cucina */
export const entityFile = (id: string) => id.replace(/\./g, '_');

export interface HaEntities {
  lights: Light[];
  sensors: Sensor[];
  contacts: Opening[];
  cameras: Camera[];
  /** avvisi da mostrare prima dell'export (entità mancanti, doppie…) */
  warnings: string[];
}

/** Raccoglie le entità valide del progetto. Quelle senza entity_id valido o doppie vengono scartate con un avviso. */
export function collectEntities(p: Project, der?: Derived): HaEntities {
  const warnings: string[] = [];
  const used = new Set<string>();
  const take = <T>(list: T[], id: (x: T) => string | undefined, what: (x: T) => string, optional = false): T[] =>
    list.filter((x) => {
      const e = id(x);
      if (!e) {
        if (!optional) warnings.push(`${what(x)}: manca l'entità di Home Assistant, non verrà esportata`);
        return false;
      }
      if (!validEntityId(e)) {
        warnings.push(`${what(x)}: «${e}» non è un entity_id valido (es. light.cucina)`);
        return false;
      }
      if (used.has(e)) {
        warnings.push(`${what(x)}: «${e}» è usata due volte, tengo solo la prima`);
        return false;
      }
      used.add(e);
      return true;
    });
  const lights = take(Object.values(p.lights ?? {}), (l) => l.entityId, (l) => `Luce «${l.label || 'senza nome'}»`);
  const sensors = take(Object.values(p.sensors ?? {}), (s) => s.entityId, (s) => `Sensore «${s.label || 'senza nome'}»`);
  const contacts = take(Object.values(p.openings), (o) => o.haEntity, () => 'Apertura', true);
  const cameras = take(Object.values(p.cameras ?? {}), (c) => c.haEntity, (c) => `Telecamera «${c.label || 'senza nome'}»`, true);
  if (der) for (const l of lights) if (!der.rooms.some((r) => pointInPolygon(l, r.poly))) warnings.push(`Luce «${l.label || l.entityId}» è fuori da ogni stanza`);
  return { lights, sensors, contacts, cameras, warnings };
}
