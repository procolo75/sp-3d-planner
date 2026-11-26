// SVG per ha-floorplan: ogni elemento interattivo ha come id l'entity_id di Home Assistant.
import { add, mul, norm, perp, sub, type V } from '../model/geom';
import type { Derived } from '../model/derived';
import type { Project } from '../model/types';
import { CATALOG_BY_ID } from '../catalog/catalog';
import { itemCorners } from '../editor2d/snapping';
import type { Layout } from './layout';
import { SENSOR_ICON } from './yaml';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n1 = (x: number) => String(Math.round(x * 10) / 10);
const pts = (ps: V[]) => ps.map((q) => `${n1(q.x)},${n1(q.y)}`).join(' ');
const img = (id: string, cls: string, href: string, L: Layout) =>
  `<image id="${esc(id)}" class="${cls}" href="${esc(href)}" xlink:href="${esc(href)}" x="0" y="0" width="${L.width}" height="${L.height}" preserveAspectRatio="none"/>`;


function open(L: Layout) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${n1(L.x0)} ${n1(L.y0)} ${n1(L.width)} ${n1(L.height)}" width="${Math.round(L.width)}" height="${Math.round(L.height)}">
`;
}

/** zone delle stanze, sensori di apertura e simboli: uguali in tutte le viste */
function overlays(L: Layout) {
  const u = L.u;
  const out: string[] = [];
  out.push('<g id="areas">');
  for (const a of L.areas) out.push(`  <polygon id="${esc(a.id)}" class="room-area" points="${pts(a.points)}"><title>${esc(a.name)}</title></polygon>`);
  out.push('</g>');
  out.push('<g id="contacts">');
  for (const c of L.contacts) out.push(`  <polygon id="${esc(c.entityId)}" class="contact" points="${pts(c.points)}"/>`);
  out.push('</g>');
  out.push('<g id="light-markers">');
  for (const l of L.lights) out.push(`  <circle id="${esc(l.entityId)}.marker" class="light-marker" cx="${n1(l.at.x)}" cy="${n1(l.at.y)}" r="${n1(u * 1.4)}"><title>${esc(l.label)}</title></circle>`);
  out.push('</g>');
  out.push('<g id="sensors">');
  for (const s of L.sensors) {
    const w = u * 11;
    const h = u * (s.label ? 4.6 : 3.2);
    out.push(`  <g class="sensor" data-kind="${s.kind}">`);
    out.push(`    <rect id="${esc(s.entityId)}.bg" class="sensor-bg" x="${n1(s.at.x - w / 2)}" y="${n1(s.at.y - h / 2)}" width="${n1(w)}" height="${n1(h)}" rx="${n1(u)}"/>`);
    out.push(`    <text id="${esc(s.entityId)}" class="sensor-value" x="${n1(s.at.x)}" y="${n1(s.at.y + (s.label ? -u * 0.2 : u * 0.6))}" font-size="${n1(u * 1.9)}" text-anchor="middle">${SENSOR_ICON[s.kind] ?? ''} --</text>`);
    if (s.label) out.push(`    <text class="sensor-label" x="${n1(s.at.x)}" y="${n1(s.at.y + u * 1.6)}" font-size="${n1(u * 1.2)}" text-anchor="middle">${esc(s.label)}</text>`);
    out.push(`  </g>`);
  }
  out.push('</g>');
  out.push('<g id="cameras">');
  for (const c of L.cameras) {
    out.push(`  <circle id="${esc(c.entityId)}" class="camera-marker" cx="${n1(c.at.x)}" cy="${n1(c.at.y)}" r="${n1(u * 1.6)}"><title>${esc(c.label || c.entityId)}</title></circle>`);
    out.push(`  <text class="camera-icon" x="${n1(c.at.x)}" y="${n1(c.at.y + u * 0.6)}" font-size="${n1(u * 1.6)}" text-anchor="middle">📹</text>`);
  }
  out.push('</g>');
  return out.join('\n');
}

/** viste 3D: render di base (+ giorno) + un render per luce, sovrapposti */
export function buildSvg3D(L: Layout, o: { href: string; withDay: boolean }) {
  const out = [open(L)];
  out.push(img('floorplan-base', 'base-image', o.href + 'base.png', L));
  if (o.withDay) out.push(img('sun.sun', 'day-image', o.href + 'day.png', L));
  out.push('<g id="lights">');
  for (const l of L.lights) out.push('  ' + img(l.entityId, 'light-overlay', o.href + l.file, L));
  out.push('</g>');
  out.push(overlays(L));
  out.push('</svg>\n');
  return out.join('\n');
}

/** vista 2D: pianta vettoriale disegnata dal progetto (cm), luci come aloni dentro le stanze */
export function buildSvg2D(p: Project, der: Derived, L: Layout) {
  const out = [open(L)];
  out.push('<defs>');
  L.lights.forEach((l, i) => {
    out.push(`  <radialGradient id="glow${i}"><stop offset="0" stop-color="${l.color}" stop-opacity="0.95"/><stop offset="0.55" stop-color="${l.color}" stop-opacity="0.45"/><stop offset="1" stop-color="${l.color}" stop-opacity="0"/></radialGradient>`);
    if (l.glow?.clip) out.push(`  <clipPath id="clip${i}"><polygon points="${pts(l.glow.clip)}"/></clipPath>`);
  });
  out.push('</defs>');
  out.push('<g id="plan">');
  for (const r of der.rooms) out.push(`  <polygon class="floor" points="${pts(r.poly)}" fill="${der.roomLabel.get(r.key)?.floorColor ?? '#e9dfcf'}"/>`);
  for (const it of Object.values(p.items)) {
    const cat = CATALOG_BY_ID[it.catalogId];
    if (!cat || cat.pocket) continue;
    out.push(`  <polygon class="item" points="${pts(itemCorners(it))}"/>`);
  }
  for (const w of Object.values(p.walls)) {
    const c = der.corners.get(w.id);
    if (!c) continue;
    out.push(`  <polygon class="wall" points="${pts([p.nodes[w.a], c.aL, c.bL, p.nodes[w.b], c.bR, c.aR])}"/>`);
  }
  for (const o of Object.values(p.openings)) {
    const w = p.walls[o.wallId];
    if (!w) continue;
    const A = p.nodes[w.a];
    const dir = norm(sub(p.nodes[w.b], A));
    const n = perp(dir);
    const h = w.thickness / 2 + 0.5;
    const s0 = add(A, mul(dir, o.offset - o.width / 2));
    const s1 = add(A, mul(dir, o.offset + o.width / 2));
    out.push(`  <polygon class="opening ${o.type}" points="${pts([add(s0, mul(n, h)), add(s1, mul(n, h)), add(s1, mul(n, -h)), add(s0, mul(n, -h))])}"/>`);
    if (o.type === 'window') out.push(`  <line class="glass" x1="${n1(s0.x)}" y1="${n1(s0.y)}" x2="${n1(s1.x)}" y2="${n1(s1.y)}"/>`);
  }
  for (const r of der.rooms) {
    const lab = der.roomLabel.get(r.key);
    const pos = der.roomLabelPos.get(r.key);
    if (lab?.name && pos) out.push(`  <text class="room-name" x="${n1(pos.x)}" y="${n1(pos.y)}" font-size="${n1(L.u * 1.6)}" text-anchor="middle">${esc(lab.name)}</text>`);
  }
  out.push('</g>');
  out.push('<g id="lights">');
  L.lights.forEach((l, i) => {
    const clip = l.glow?.clip ? ` clip-path="url(#clip${i})"` : '';
    out.push(`  <circle id="${esc(l.entityId)}" class="light-overlay" cx="${n1(l.at.x)}" cy="${n1(l.at.y)}" r="${n1(l.glow?.r ?? 300)}" fill="url(#glow${i})"${clip}/>`);
  });
  out.push('</g>');
  out.push(overlays(L));
  out.push('</svg>\n');
  return out.join('\n');
}
