// Configurazione della card ha-floorplan (YAML da incollare in una card manuale della dashboard).
import type { TapAction } from '../model/types';
import type { Layout } from './layout';
import { tapYaml } from './tap';

/** icone dei sensori (anche nel testo scritto da text_set, che sostituisce tutto il contenuto) */
export const SENSOR_ICON: Record<string, string> = { temperature: '🌡', humidity: '💧', co2: '🫧', door: '🚪', window: '🪟', generic: '◉' };

/** stringa YAML tra apici singoli (l'apice si raddoppia) */
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

const NONE: TapAction = { action: 'none' };

function classRule(entity: string, element: string, cls: string, tap: TapAction) {
  const out = [`      - entity: ${entity}`, `        element: ${q(element)}`, ...tapYaml(tap, entity)];
  out.push(
    '        state_action:',
    '          action: call-service',
    '          service: floorplan.class_set',
    '          service_data:',
    `            class: ${q(cls + '-${entity.state}')}`,
  );
  return out.join('\n');
}

export interface CardOpts {
  /** percorsi di SVG e CSS in Home Assistant (/local/…) */
  image: string;
  stylesheet: string;
  withDay: boolean;
  /** mappa della casa con le pagine delle stanze: id dell'area → pagina da aprire */
  roomPaths?: Map<string, string>;
}

/** card ha-floorplan (YAML senza indentazione iniziale) */
export function buildCard(L: Layout, o: CardOpts) {
  const r: string[] = [];
  if (o.withDay) r.push('      # giorno/notte: l\'immagine di giorno sparisce al tramonto', classRule('sun.sun', 'sun.sun', 'sun', NONE));
  if (L.lights.length) r.push('      # luci: la stanza si illumina quando la luce è accesa');
  for (const l of L.lights) {
    r.push(classRule(l.entityId, l.entityId, 'light', NONE));
    r.push(classRule(l.entityId, `${l.entityId}.marker`, 'light', l.tap));
  }
  if (o.roomPaths) {
    // mappa della casa con una pagina per stanza: tocco = apre la stanza, tieni premuto = la sua luce
    const areas = L.areas.filter((a) => o.roomPaths!.has(a.id));
    if (areas.length) r.push('      # stanze: toccandole si apre la loro mappa, tenendole premute si accende/spegne la luce');
    for (const a of areas) {
      const go: TapAction = { action: 'navigate', path: o.roomPaths.get(a.id)! };
      if (a.entity) {
        const rule = classRule(a.entity, a.id, 'area', go).split('\n');
        // hold_action subito dopo tap_action, prima di state_action
        rule.splice(rule.indexOf('        state_action:'), 0, ...tapYaml(a.tap ?? { action: 'toggle' }, a.entity, 'hold_action'));
        r.push(rule.join('\n'));
      } else r.push([`      - element: ${q(a.id)}`, ...tapYaml(go, undefined)].join('\n'));
    }
  } else {
    const areas = L.areas.filter((a) => a.entity);
    if (areas.length) r.push('      # stanze: toccandole fai la stessa cosa della loro luce');
    for (const a of areas) r.push(classRule(a.entity!, a.id, 'area', a.tap ?? { action: 'toggle' }));
  }
  if (L.sensors.length) r.push('      # sensori: mostrano il loro valore');
  for (const s of L.sensors) {
    const binary = s.kind === 'door' || s.kind === 'window';
    const text = binary
      ? `${SENSOR_ICON[s.kind]} \${entity.state === 'on' ? 'Aperta' : entity.state === 'off' ? 'Chiusa' : '?'}`
      : `${SENSOR_ICON[s.kind]} \${entity.state}\${entity.attributes.unit_of_measurement ? ' ' + entity.attributes.unit_of_measurement : ''}`;
    r.push(
      [
        `      - entity: ${s.entityId}`,
        ...tapYaml(s.tap, s.entityId),
        '        state_action:',
        '          action: call-service',
        '          service: floorplan.text_set',
        '          service_data:',
        `            text: ${q(text)}`,
      ].join('\n'),
    );
    // sfondo colorato: aperto/chiuso, oppure qualità dell'aria
    if (binary) r.push(classRule(s.entityId, `${s.entityId}.bg`, 'sensor', s.tap));
    if (s.kind === 'co2')
      r.push(
        [
          `      - entity: ${s.entityId}`,
          `        element: ${q(s.entityId + '.bg')}`,
          ...tapYaml(s.tap, s.entityId),
          '        state_action:',
          '          action: call-service',
          '          service: floorplan.class_set',
          '          service_data:',
          `            class: ${q("co2-${Number(entity.state) < 800 ? 'good' : Number(entity.state) < 1200 ? 'fair' : Number(entity.state) >= 1200 ? 'bad' : 'unknown'}")}`,
        ].join('\n'),
      );
  }
  if (L.contacts.length) r.push('      # porte e finestre: rosse quando sono aperte');
  for (const c of L.contacts) r.push(classRule(c.entityId, c.entityId, 'contact', c.tap));
  if (L.cameras.length) r.push('      # telecamere: toccandole vedi le immagini');
  for (const c of L.cameras) r.push([`      - entity: ${c.entityId}`, ...tapYaml(c.tap, c.entityId)].join('\n'));

  return `type: custom:floorplan-card
# la mappa occupa tutta l'altezza disponibile, senza scroll
full_height: true
config:
  image: ${o.image}
  stylesheet: ${o.stylesheet}
  # togli il # qui sotto per vedere gli errori (es. un'entità scritta male)
  # log_level: info
  defaults:
    hover_action: hover-info
    tap_action: more-info
  rules:
${r.length ? r.join('\n') : '      []'}
`;
}

/** card singola, da incollare in una card Manuale */
export function buildYaml(L: Layout, o: { slug: string; base: string; withDay: boolean; title: string }) {
  return `# Card ha-floorplan generata da SP 3D Planner — «${o.title}»
# Dashboard → Modifica → Aggiungi card → Manuale, e incolla tutto questo testo.
${buildCard(L, { image: `${o.base}${o.slug}.svg`, stylesheet: `${o.base}${o.slug}.css`, withDay: o.withDay })}`;
}

const indent = (text: string, n: number) =>
  text
    .trimEnd()
    .split('\n')
    .map((l, i) => (i === 0 ? l : l ? ' '.repeat(n) + l : l))
    .join('\n');

/** percorso della dashboard normalizzato: «dashboard-casa» → «/dashboard-casa», senza / finale */
export const dashboardPath = (s: string) => '/' + s.trim().replace(/^\/+|\/+$/g, '');

/** dashboard intera: pagina «Casa» con la mappa completa + una sottopagina per ogni stanza */
export function buildDashboard(o: { title: string; dashboard: string; house: string; rooms: { name: string; slug: string; card: string }[] }) {
  const d = dashboardPath(o.dashboard);
  const view = (title: string, path: string, card: string, sub: boolean) =>
    [
      `  - title: ${q(title)}`,
      `    path: ${path}`,
      ...(sub ? ['    subview: true', `    back_path: ${d}/casa`] : []),
      '    panel: true',
      '    cards:',
      `      - ${indent(card, 8)}`,
    ].join('\n');
  return `# Dashboard generata da SP 3D Planner — «${o.title}»
# Impostazioni → Dashboard → apri la dashboard (indirizzo ${d}) → ✏️ Modifica
# → ⋮ → «Editor di configurazione raw», sostituisci tutto con questo testo e salva.
title: ${q(o.title)}
views:
${[view(o.title, 'casa', o.house, false), ...o.rooms.map((r) => view(r.name, r.slug, r.card, true))].join('\n')}
`;
}