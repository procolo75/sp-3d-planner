// Texture «vere» per lo stile Realistico, disegnate al volo (niente immagini da scaricare).
// Ogni superficie ha una mappa di colore in scala di grigi (si moltiplica per il colore scelto nel progetto),
// una mappa di rilievo (fughe, venature) e una di ruvidità. Le coordinate UV sono in metri (vedi `boxUV`).
import * as THREE from 'three';

export type Surface = 'parquet' | 'tiles' | 'stone' | 'concrete' | 'plaster' | 'wood' | 'fabric';

const SIZE = 512;

/** generatore pseudo-casuale ripetibile: le texture escono sempre uguali */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** rumore «a valori» liscio, ripetibile ai bordi (per venature e macchie) */
function noise(rand: () => number, cells: number) {
  const g = Array.from({ length: cells * cells }, rand);
  const at = (x: number, y: number) => g[(((y % cells) + cells) % cells) * cells + (((x % cells) + cells) % cells)];
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (u: number, v: number) => {
    const x = u * cells;
    const y = v * cells;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = sm(x - x0);
    const fy = sm(y - y0);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
    return a + (b - a) * fy;
  };
}

interface Maps {
  /** luminosità 0…1 (moltiplica il colore) */
  color: Float32Array;
  /** altezza 0…1 (per il rilievo) */
  height: Float32Array;
  /** ruvidità 0…1 */
  rough: Float32Array;
}

function blank(): Maps {
  const n = SIZE * SIZE;
  return { color: new Float32Array(n).fill(1), height: new Float32Array(n).fill(1), rough: new Float32Array(n).fill(0.8) };
}

/** disegna una superficie; `tile`: metri coperti dalla texture */
const SURFACES: Record<Surface, { tile: number; normal: number; draw: () => Maps }> = {
  // listoni 15×120 cm sfalsati, con venature e fughe sottili
  parquet: {
    tile: 1.2,
    normal: 1.2,
    draw() {
      const m = blank();
      const r = rng(7);
      const rows = 8;
      const grain = noise(rng(11), 64);
      const blotch = noise(rng(12), 8);
      const shade = Array.from({ length: rows * 3 }, () => 0.9 + r() * 0.1);
      const offs = Array.from({ length: rows }, () => r());
      for (let y = 0; y < SIZE; y++) {
        const v = y / SIZE;
        const row = Math.floor(v * rows);
        const fy = v * rows - row;
        for (let x = 0; x < SIZE; x++) {
          const u = (x / SIZE + offs[row]) % 1;
          const plank = Math.floor(u * 1) + row * 3;
          const fx = u;
          const i = y * SIZE + x;
          const seam = Math.min(fy, 1 - fy) * SIZE / rows < 1.2 || Math.min(fx, 1 - fx) * SIZE < 1.2;
          const g = grain(u * 0.15, v * 4 + plank * 0.37);
          const lines = 0.5 + 0.5 * Math.sin((v * rows * 9 + g * 6 + plank) * Math.PI);
          m.color[i] = seam ? 0.6 : shade[plank % shade.length] * (0.86 + 0.14 * lines) * (0.94 + 0.08 * blotch(u, v));
          m.height[i] = seam ? 0 : 1 - 0.06 * lines;
          m.rough[i] = seam ? 0.95 : 0.62 + 0.12 * lines;
        }
      }
      return m;
    },
  },
  // piastrelle 30×30 cm con fuga chiara
  tiles: {
    tile: 1.2,
    normal: 2,
    draw() {
      const m = blank();
      const n = 4;
      const r = rng(21);
      const shade = Array.from({ length: n * n }, () => 0.93 + r() * 0.07);
      const speck = noise(rng(22), 128);
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          const i = y * SIZE + x;
          const fx = ((x / SIZE) * n) % 1;
          const fy = ((y / SIZE) * n) % 1;
          const d = Math.min(fx, 1 - fx, fy, 1 - fy) * (SIZE / n);
          const grout = d < 2;
          const t = Math.floor((y / SIZE) * n) * n + Math.floor((x / SIZE) * n);
          m.color[i] = grout ? 0.78 : shade[t] * (0.97 + 0.03 * speck(x / SIZE, y / SIZE));
          m.height[i] = grout ? 0 : Math.min(1, d / 3);
          m.rough[i] = grout ? 0.95 : 0.3;
        }
      return m;
    },
  },
  // lastre di pietra 40×40 per balconi e verande, più ruvide
  stone: {
    tile: 1.6,
    normal: 2.5,
    draw() {
      const m = blank();
      const n = 4;
      const r = rng(31);
      const shade = Array.from({ length: n * n }, () => 0.85 + r() * 0.15);
      const grain = noise(rng(32), 96);
      const big = noise(rng(33), 12);
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          const i = y * SIZE + x;
          const fx = ((x / SIZE) * n) % 1;
          const fy = ((y / SIZE) * n) % 1;
          const d = Math.min(fx, 1 - fx, fy, 1 - fy) * (SIZE / n);
          const grout = d < 2.5;
          const t = Math.floor((y / SIZE) * n) * n + Math.floor((x / SIZE) * n);
          const g = grain(x / SIZE, y / SIZE);
          m.color[i] = grout ? 0.62 : shade[t] * (0.88 + 0.12 * g) * (0.95 + 0.07 * big(x / SIZE, y / SIZE));
          m.height[i] = grout ? 0 : 0.7 + 0.3 * g;
          m.rough[i] = grout ? 1 : 0.75 + 0.15 * g;
        }
      return m;
    },
  },
  // cemento del garage: macchie larghe e grana fine
  concrete: {
    tile: 2.4,
    normal: 0.8,
    draw() {
      const m = blank();
      const big = noise(rng(41), 6);
      const mid = noise(rng(42), 24);
      const fine = noise(rng(43), 160);
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          const i = y * SIZE + x;
          const u = x / SIZE;
          const v = y / SIZE;
          const f = fine(u, v);
          m.color[i] = 0.82 + 0.1 * big(u, v) + 0.05 * mid(u, v) + 0.04 * f;
          m.height[i] = f;
          m.rough[i] = 0.7 + 0.2 * mid(u, v);
        }
      return m;
    },
  },
  // intonaco dei muri: quasi liscio, con una grana appena visibile da vicino
  plaster: {
    tile: 1.5,
    normal: 0.6,
    draw() {
      const m = blank();
      const mid = noise(rng(51), 20);
      const fine = noise(rng(52), 200);
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          const i = y * SIZE + x;
          const u = x / SIZE;
          const v = y / SIZE;
          const f = fine(u, v);
          m.color[i] = 0.965 + 0.025 * mid(u, v) + 0.01 * f;
          m.height[i] = 0.6 * f + 0.4 * mid(u, v);
          m.rough[i] = 0.88;
        }
      return m;
    },
  },
  // legno dei mobili: venature lunghe in una direzione
  wood: {
    tile: 0.8,
    normal: 0.7,
    draw() {
      const m = blank();
      const warp = noise(rng(61), 16);
      const fine = noise(rng(62), 96);
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          const i = y * SIZE + x;
          const u = x / SIZE;
          const v = y / SIZE;
          const w = warp(u * 0.25, v);
          const ring = 0.5 + 0.5 * Math.sin((v * 22 + w * 5) * Math.PI);
          const f = fine(u * 0.2, v);
          m.color[i] = 0.84 + 0.1 * ring + 0.06 * f;
          m.height[i] = 1 - 0.3 * ring;
          m.rough[i] = 0.5 + 0.15 * ring;
        }
      return m;
    },
  },
  // tessuto di divani, letti e cuscini: trama fitta
  fabric: {
    tile: 0.12,
    normal: 1.2,
    draw() {
      const m = blank();
      const fine = noise(rng(71), 64);
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          const i = y * SIZE + x;
          const u = x / SIZE;
          const v = y / SIZE;
          const a = 0.5 + 0.5 * Math.sin(u * 48 * Math.PI * 2);
          const b = 0.5 + 0.5 * Math.sin(v * 48 * Math.PI * 2);
          const weave = (Math.floor(u * 48) + Math.floor(v * 48)) % 2 ? a : b;
          const f = fine(u, v);
          m.color[i] = 0.9 + 0.06 * weave + 0.04 * f;
          m.height[i] = weave;
          m.rough[i] = 0.95;
        }
      return m;
    },
  },
};

function toTexture(data: Uint8ClampedArray, srgb: boolean, tile: number) {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.putImageData(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, SIZE, SIZE), 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / tile, 1 / tile);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

export interface SurfaceTextures {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  normalScale: number;
}

const texCache = new Map<Surface, SurfaceTextures | null>();

/** texture di una superficie (create la prima volta); null se il browser non sa disegnarle */
export function surfaceTextures(s: Surface): SurfaceTextures | null {
  if (texCache.has(s)) return texCache.get(s)!;
  let out: SurfaceTextures | null = null;
  try {
    if (typeof document !== 'undefined' && document.createElement('canvas').getContext('2d')) {
      const def = SURFACES[s];
      const m = def.draw();
      const n = SIZE * SIZE;
      const col = new Uint8ClampedArray(n * 4);
      const nor = new Uint8ClampedArray(n * 4);
      const rou = new Uint8ClampedArray(n * 4);
      const h = (x: number, y: number) => m.height[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          const i = y * SIZE + x;
          const c = Math.round(Math.min(1, m.color[i]) * 255);
          col.set([c, c, c, 255], i * 4);
          // rilievo → normali (differenze tra i pixel vicini)
          const dx = (h(x + 1, y) - h(x - 1, y)) * 2;
          const dy = (h(x, y + 1) - h(x, y - 1)) * 2;
          const len = Math.hypot(dx, dy, 1);
          nor.set([((-dx / len) * 0.5 + 0.5) * 255, ((dy / len) * 0.5 + 0.5) * 255, ((1 / len) * 0.5 + 0.5) * 255, 255], i * 4);
          const r = Math.round(m.rough[i] * 255);
          // il path tracer e three leggono la ruvidità dal canale verde
          rou.set([r, r, r, 255], i * 4);
        }
      const map = toTexture(col, true, def.tile);
      const normalMap = toTexture(nor, false, def.tile);
      const roughnessMap = toTexture(rou, false, def.tile);
      if (map && normalMap && roughnessMap) out = { map, normalMap, roughnessMap, normalScale: def.normal };
    }
  } catch {
    out = null;
  }
  texCache.set(s, out);
  return out;
}

/** pavimento di una stanza dal suo nome */
export function floorSurface(name: string | undefined): Surface {
  const n = (name ?? '').toLowerCase();
  if (/garage|box|cantina|ripostiglio|lavanderia|deposito/.test(n)) return 'concrete';
  if (/balcon|veranda|terrazz|portico|loggia|patio/.test(n)) return 'stone';
  if (/bagno|w\.?c|cucina|doccia|angolo cottura/.test(n)) return 'tiles';
  return 'parquet';
}

/** materiale di un mobile dal suo colore: legno (marroni/beige caldi), tessuto (colori morbidi) o niente */
export function partSurface(hex: string, metal: boolean, glass: boolean): Surface | null {
  if (metal || glass) return null;
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl, THREE.SRGBColorSpace);
  const deg = hsl.h * 360;
  if (deg >= 15 && deg <= 50 && hsl.s >= 0.2 && hsl.l >= 0.15 && hsl.l <= 0.75) return 'wood';
  if (hsl.l < 0.08 || hsl.l > 0.94) return null;
  return 'fabric';
}

const uvDone = new WeakSet<THREE.BufferGeometry>();

/**
 * Coordinate UV «in metri» proiettate sulla faccia dominante (box mapping): le texture hanno la stessa scala
 * su muri, pavimenti e mobili di qualsiasi misura. Si calcolano una volta per geometria.
 */
export function boxUV(geo: THREE.BufferGeometry) {
  if (uvDone.has(geo)) return;
  const pos = geo.getAttribute('position');
  if (!pos) return;
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const nor = geo.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const [ax, ay, az] = [Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i))];
    if (ay >= ax && ay >= az) uv.set([x, z], i * 2);
    else if (ax >= az) uv.set([z, y], i * 2);
    else uv.set([x, y], i * 2);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  uvDone.add(geo);
}
