// Azione al tocco degli elementi della mappa ha-floorplan: validazione e righe YAML.
import type { TapAction, TapActionKind } from '../model/types';

export const TAP_LABELS: Record<TapActionKind, string> = {
  'more-info': 'Mostra info e storico',
  toggle: 'Accendi / spegni',
  'call-service': 'Esegui servizio o script',
  navigate: 'Apri pagina della dashboard',
  url: 'Apri un link',
  none: 'Niente',
};

/** dominio.nome: vale sia per le entità sia per i servizi (come in entities.ts) */
const ID_RE = /^[a-z0-9_]+\.[a-z0-9_]+$/;

/** problema dell'azione (campo mancante o scritto male), oppure undefined se va bene */
export function tapIssue(t: TapAction | undefined): string | undefined {
  if (!t) return undefined;
  if (t.entity && !ID_RE.test(t.entity)) return `«${t.entity}» non è un entity_id valido`;
  if (t.action === 'call-service' && !ID_RE.test(t.service ?? '')) return t.service ? `«${t.service}» non è un servizio valido (es. script.buonanotte)` : 'manca il servizio da eseguire';
  if (t.action === 'navigate' && !(t.path ?? '').trim()) return 'manca la pagina da aprire';
  if (t.action === 'url' && !/^https?:\/\/\S+$/.test(t.url ?? '')) return t.url ? `«${t.url}» non è un link valido (deve iniziare con https://)` : 'manca il link da aprire';
  return undefined;
}

/** azione da usare davvero: quella scelta se è completa, altrimenti il default */
export function resolveTap(t: TapAction | undefined, def: TapActionKind): TapAction {
  return t && !tapIssue(t) ? t : { action: def };
}

/** stringa YAML tra apici singoli (l'apice si raddoppia) */
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** righe `tap_action` (o `hold_action`) di una regola, indentate per stare sotto `- entity:` */
export function tapYaml(t: TapAction, own: string | undefined, key: 'tap_action' | 'hold_action' = 'tap_action'): string[] {
  const other = t.entity && t.entity !== own ? t.entity : undefined;
  const target = other ?? own;
  const head = `        ${key}:`;
  switch (t.action) {
    case 'none':
      return key === 'tap_action' ? ['        tap_action: false', '        hover_action: false'] : [`        ${key}: false`];
    case 'more-info':
      return [head, '          action: more-info', ...(other ? [`          entity: ${other}`] : [])];
    case 'toggle':
      // un'altra entità: il toggle di ha-floorplan agisce solo sulla propria, quindi passa dal servizio generico
      return other
        ? [head, '          action: call-service', '          service: homeassistant.toggle', '          service_data:', `            entity_id: ${other}`]
        : [head, '          action: toggle'];
    case 'call-service':
      return [head, '          action: call-service', `          service: ${t.service}`, ...(target ? ['          service_data:', `            entity_id: ${target}`] : [])];
    case 'navigate':
      return [head, '          action: navigate', `          navigation_path: ${q(t.path!)}`];
    case 'url':
      return [head, '          action: url', `          url_path: ${q(t.url!)}`];
  }
}
