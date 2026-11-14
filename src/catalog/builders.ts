import type { Part } from './catalog';

export const box = (x: number, y: number, z: number, w: number, h: number, d: number, c: string, o?: number): Part => ({
  t: 'box',
  p: [x, y + h / 2, z],
  s: [w, h, d],
  c,
  o,
});
export const cyl = (x: number, y: number, z: number, r: number, h: number, c: string, o?: number): Part => ({
  t: 'cyl',
  p: [x, y + h / 2, z],
  r,
  h,
  c,
  o,
});
export const sph = (x: number, y: number, z: number, r: number, c: string): Part => ({ t: 'sph', p: [x, y, z], r, c });

export const WOOD = '#b98b5e';
export const WOOD_D = '#7a5235';
export const WHITE = '#f2f0eb';
export const GREY = '#8a8f96';
export const DARK = '#3b3f45';
export const FABRIC = '#6f7f99';
export const FABRIC2 = '#c9b79c';
export const STEEL = '#c0c4c8';
export const CERAMIC = '#fbfbfa';
export const GLASS = '#a9d6e5';
export const BLACK = '#202124';

// --- generatori -------------------------------------------------------------

export function sofa(w: number, d: number, seats: number, c: string): Part[] {
  const arm = 16;
  const parts: Part[] = [
    box(0, 8, 0, w, 34, d, c), // base
    box(0, 8, -d / 2 + 10, w, 75, 20, c), // schienale
    box(-w / 2 + arm / 2, 8, 0, arm, 58, d, c),
    box(w / 2 - arm / 2, 8, 0, arm, 58, d, c),
  ];
  const sw = (w - 2 * arm) / seats;
  for (let i = 0; i < seats; i++) parts.push(box(-w / 2 + arm + sw * (i + 0.5), 42, 8, sw - 2, 12, d - 24, shade(c, 0.08)));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box((sx * (w - 10)) / 2, 0, (sz * (d - 10)) / 2, 5, 8, 5, BLACK));
  return parts;
}

export function cornerSofa(w: number, d: number, c: string): Part[] {
  const depth = 95;
  return [
    ...sofa(w, depth, 3, c).map((p) => shiftPart(p, 0, 0, -(d - depth) / 2)),
    box(w / 2 - 45, 8, (depth - d) / 2 + depth / 2 + (d - depth) / 2, 90, 34, d - depth, c),
    box(w / 2 - 45, 42, (depth - d) / 2 + depth / 2 + (d - depth) / 2, 88, 12, d - depth - 4, shade(c, 0.08)),
  ];
}

export function armchair(c: string): Part[] {
  return sofa(85, 85, 1, c);
}

export function bed(w: number, d: number, c: string): Part[] {
  return [
    box(0, 0, 0, w, 30, d, WOOD), // telaio
    box(0, 30, 3, w - 6, 22, d - 8, WHITE), // materasso
    box(0, 0, -d / 2 + 4, w, 105, 8, c), // testiera
    box(0, 52, 30, w - 4, 4, d - 70, c), // coperta
    ...(w > 120
      ? [box(-w / 4, 52, -d / 2 + 30, w / 2 - 20, 12, 40, WHITE), box(w / 4, 52, -d / 2 + 30, w / 2 - 20, 12, 40, WHITE)]
      : [box(0, 52, -d / 2 + 30, w - 30, 12, 40, WHITE)]),
  ];
}

export function table(w: number, d: number, h: number, top: string, leg: string, round = false): Part[] {
  if (round) return [cyl(0, h - 4, 0, w / 2, 4, top), cyl(0, 0, 0, 5, h - 4, leg), cyl(0, 0, 0, 25, 3, leg)];
  const parts: Part[] = [box(0, h - 4, 0, w, 4, d, top)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box((sx * (w - 10)) / 2, 0, (sz * (d - 10)) / 2, 5, h - 4, 5, leg));
  return parts;
}

export function chair(c: string, seat = WOOD): Part[] {
  const parts: Part[] = [box(0, 44, 0, 44, 4, 44, seat), box(0, 48, -20, 44, 42, 4, c)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(sx * 19, 0, sz * 19, 4, 44, 4, c));
  return parts;
}

export function cabinet(w: number, d: number, h: number, c: string, doors: number, handle = DARK): Part[] {
  const parts: Part[] = [box(0, 0, 0, w, h, d, c)];
  const dw = w / doors;
  for (let i = 0; i < doors; i++) {
    const x = -w / 2 + dw * (i + 0.5);
    parts.push(box(x, 2, d / 2 + 0.5, dw - 1, h - 4, 1, shade(c, -0.04)));
    parts.push(box(x + (i % 2 ? -1 : 1) * (dw / 2 - 6), h / 2, d / 2 + 2, 2, Math.min(30, h / 4), 2, handle));
  }
  return parts;
}

export function drawers(w: number, d: number, h: number, c: string, rows: number): Part[] {
  const parts: Part[] = [box(0, 0, 0, w, h, d, c)];
  const rh = (h - 6) / rows;
  for (let i = 0; i < rows; i++) {
    parts.push(box(0, 3 + rh * i + 1, d / 2 + 0.5, w - 4, rh - 2, 1, shade(c, -0.05)));
    parts.push(box(0, 3 + rh * i + rh / 2, d / 2 + 2, Math.min(30, w / 3), 2, 2, DARK));
  }
  return parts;
}

export function shelf(w: number, d: number, h: number, c: string, n: number): Part[] {
  const parts: Part[] = [box(-w / 2 + 1, 0, 0, 2, h, d, c), box(w / 2 - 1, 0, 0, 2, h, d, c), box(0, 0, -d / 2 + 0.5, w, h, 1, c)];
  for (let i = 0; i <= n; i++) parts.push(box(0, (i * (h - 2)) / n, 0, w, 2, d, c));
  // qualche libro
  const cols = ['#a23b3b', '#3b6aa2', '#d9b44a', '#4a8a5c', '#7b4aa2'];
  for (let i = 0; i < n; i++)
    for (let k = 0; k < Math.floor(w / 20); k++)
      if ((i * 7 + k * 3) % 5 < 3) parts.push(box(-w / 2 + 10 + k * 18, (i * (h - 2)) / n + 2, 0, 6, (h / n) * 0.7, d * 0.7, cols[(i + k) % cols.length]));
  return parts;
}

export function kitchenBase(w: number, c: string, kind: 'plain' | 'sink' | 'hob' | 'oven' | 'dw' = 'plain'): Part[] {
  const d = 60;
  const parts: Part[] = [box(0, 0, 0, w, 10, d - 6, BLACK), ...cabinet(w, d, 76, c, w > 50 ? 2 : 1).map((p) => shiftPart(p, 0, 10, 0)), box(0, 86, 0, w, 4, d + 2, '#d8d4cc')];
  if (kind === 'sink') parts.push(box(0, 86.5, 2, w * 0.6, 4, 40, STEEL), cyl(0, 90, -22, 1.5, 25, STEEL));
  if (kind === 'hob') {
    parts.push(box(0, 90, 0, w * 0.85, 1, 50, BLACK));
    for (const [x, z] of [[-15, -12], [15, -12], [-15, 12], [15, 12]]) parts.push(cyl(x, 91, z, 8, 0.5, '#555'));
  }
  if (kind === 'oven') parts.push(box(0, 30, d / 2 + 1.5, w - 6, 50, 1, BLACK), box(0, 70, d / 2 + 3, w - 16, 2, 2, STEEL));
  if (kind === 'dw') parts.push(box(0, 12, d / 2 + 1.5, w - 2, 72, 1, STEEL));
  return parts;
}

export function wallCabinet(w: number, c: string): Part[] {
  return cabinet(w, 35, 70, c, w > 50 ? 2 : 1);
}

export function plant(h: number): Part[] {
  return [cyl(0, 0, 0, 16, 30, '#9c6b4a'), sph(0, 30 + h * 0.35, 0, h * 0.3, '#4f8a3f'), sph(8, 30 + h * 0.55, 4, h * 0.22, '#5d9a48'), sph(-8, 30 + h * 0.5, -4, h * 0.2, '#467c37')];
}

export function lamp(h: number): Part[] {
  return [cyl(0, 0, 0, 15, 3, DARK), cyl(0, 3, 0, 1.5, h - 35, DARK), cyl(0, h - 35, 0, 20, 30, '#f5e6c8', 0.9)];
}

export function shiftPart(p: Part, dx: number, dy: number, dz: number): Part {
  return { ...p, p: [p.p[0] + dx, p.p[1] + dy, p.p[2] + dz] } as Part;
}

export function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (k > 0 ? (255 - c) * k : c * k))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}


/** scaffale a cubi (es. KALLAX): telaio spesso e griglia di vani */
export function cubeShelf(w: number, d: number, h: number, cols: number, rows: number, c: string): Part[] {
  const t = 4;
  const parts: Part[] = [box(0, 0, 0, w, t, d, c), box(0, h - t, 0, w, t, d, c), box(-w / 2 + t / 2, 0, 0, t, h, d, c), box(w / 2 - t / 2, 0, 0, t, h, d, c)];
  for (let i = 1; i < cols; i++) parts.push(box(-w / 2 + (w * i) / cols, t, 0, 1.6, h - 2 * t, d, c));
  for (let j = 1; j < rows; j++) parts.push(box(0, (h * j) / rows, 0, w, 1.6, d, c));
  return parts;
}

/** mobile basso con ante e piano (madia, mobile TV) */
export function lowCabinet(w: number, d: number, h: number, c: string, doors: number, legs = 0): Part[] {
  const parts = cabinet(w, d, h - legs, c, doors).map((p) => shiftPart(p, 0, legs, 0));
  if (legs) for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box((sx * (w - 8)) / 2, 0, (sz * (d - 8)) / 2, 3, legs, 3, DARK));
  return parts;
}

/** mobile lavabo con lavabo integrato */
export function vanity(w: number, d: number, h: number, c: string, rows = 2): Part[] {
  return [...drawers(w, d, h - 4, c, rows), box(0, h - 4, 0, w, 4, d, CERAMIC), box(0, h - 3.5, 2, w * 0.7, 3.6, d * 0.65, '#e9eef0'), cyl(0, h, -d / 2 + 6, 1.5, 14, STEEL)];
}

/** letto a castello / soppalco semplificato */
export function bunk(w: number, d: number, h: number, c: string): Part[] {
  const parts: Part[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box((sx * (w - 6)) / 2, 0, (sz * (d - 6)) / 2, 5, h, 5, c));
  for (const y of [25, h - 55]) parts.push(box(0, y, 0, w - 4, 8, d - 4, c), box(0, y + 8, 0, w - 10, 14, d - 10, WHITE));
  return parts;
}

/** piatto doccia (filo pavimento/ribassato) con piletta */
export function showerTray(w: number, d: number): Part[] {
  return [box(0, 0, 0, w, 3, d, CERAMIC), box(0, 2.6, 0, w - 6, 0.6, d - 6, '#eef2f3'), cyl(w / 2 - 12, 3, 0, 5, 0.4, STEEL)];
}

/** box doccia: piatto + cristallo sul fronte (e sul lato destro se `corner`) + soffione */
export function showerBox(w: number, d: number, corner: boolean): Part[] {
  const parts = showerTray(w, d);
  parts.push(box(0, 3, d / 2 - 0.5, w, 197, 1, GLASS, 0.3), box(w / 2 - 1, 3, d / 2 - 0.5, 2, 197, 2, STEEL));
  if (corner) parts.push(box(w / 2 - 0.5, 3, 0, 1, 197, d, GLASS, 0.3));
  parts.push(cyl(-w / 2 + 15, 180, -d / 2 + 15, 10, 2, STEEL), box(-w / 2 + 3, 100, -d / 2 + 15, 2, 90, 2, STEEL));
  return parts;
}

/** vasca rettangolare */
export function bathtub(w: number, d: number): Part[] {
  return [box(0, 0, 0, w, 56, d, CERAMIC), box(0, 18, 0, w - 16, 39, d - 16, '#dfeff5'), cyl(-w / 2 + 10, 56, 0, 1.6, 14, STEEL)];
}

/** vasca angolare (forma a quarto di cerchio approssimata) */
export function cornerTub(s: number): Part[] {
  return [
    box(-s / 4, 0, -s / 4, s / 2, 56, s / 2, CERAMIC),
    box(s / 4 - 0.01, 0, -s / 4, s / 2, 56, s / 2, CERAMIC),
    box(-s / 4, 0, s / 4 - 0.01, s / 2, 56, s / 2, CERAMIC),
    cyl(-s / 2 + s * 0.55, 18.1, -s / 2 + s * 0.55, s * 0.36, 38.5, '#dfeff5'),
    cyl(-s / 2 + 12, 56, -s / 2 + 12, 1.6, 14, STEEL),
  ];
}

/** vasca da bagno freestanding (ovale) */
export function freeTub(w: number, d: number): Part[] {
  return [box(0, 0, 0, w - d, 58, d, CERAMIC), cyl(-(w - d) / 2, 0, 0, d / 2, 58, CERAMIC), cyl((w - d) / 2, 0, 0, d / 2, 58, CERAMIC), box(0, 20, 0, w - d, 38.5, d - 14, '#dfeff5'), cyl(-(w - d) / 2, 20, 0, d / 2 - 7, 38.6, '#dfeff5'), cyl((w - d) / 2, 20, 0, d / 2 - 7, 38.6, '#dfeff5')];
}

/** armadio con ante scorrevoli: corpo, binario e ante sovrapposte */
export function slidingWardrobe(w: number, d: number, h: number, c: string): Part[] {
  const n = w > 220 ? 3 : 2;
  const dw = w / n + 2;
  const parts: Part[] = [box(0, 0, -3, w, h, d - 6, c), box(0, h - 6, d / 2 - 3, w, 6, 6, STEEL)];
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w / n) * (i + 0.5);
    const z = d / 2 - (i % 2 ? 5 : 2);
    parts.push(box(x, 1, z, dw, h - 8, 1.5, shade(c, i % 2 ? -0.06 : -0.02)));
    parts.push(box(x + (i % 2 ? dw / 2 - 4 : -dw / 2 + 4), h * 0.4, z + 1, 2, h * 0.25, 1, STEEL));
  }
  return parts;
}
