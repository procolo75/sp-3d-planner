import type { Background } from '../model/types';
import { detectWalls, type DetectedDoor, type DetectedWall, type Img } from './detectWalls';

export async function loadBgImage(bg: Background): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('immagine non leggibile'));
    i.src = bg.dataUrl;
  });
}

/** Pixel dell'immagine di sfondo (eventualmente solo un rettangolo, in px immagine). */
export async function bgPixels(bg: Background, roi?: { x0: number; y0: number; x1: number; y1: number }, scale = 1): Promise<Img> {
  const img = await loadBgImage(bg);
  const x0 = Math.max(0, Math.floor(roi?.x0 ?? 0));
  const y0 = Math.max(0, Math.floor(roi?.y0 ?? 0));
  const x1 = Math.min(img.naturalWidth, Math.ceil(roi?.x1 ?? img.naturalWidth));
  const y1 = Math.min(img.naturalHeight, Math.ceil(roi?.y1 ?? img.naturalHeight));
  const w = Math.max(1, Math.round((x1 - x0) * scale));
  const h = Math.max(1, Math.round((y1 - y0) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: d.data };
}

/**
 * Riconosce i muri dello sfondo dentro il rettangolo indicato (px immagine).
 * Ritorna muri e porte in cm, nelle coordinate del progetto.
 */
export async function detectOnBackground(bg: Background, roi?: { x0: number; y0: number; x1: number; y1: number }): Promise<{ walls: DetectedWall[]; doors: DetectedDoor[] }> {
  // riduce solo le immagini ad altissima risoluzione (< 0,5 cm/px): ridurre sfoca le linee sottili
  const scale = Math.min(1, bg.cmPerPx / 0.5);
  const img = await bgPixels(bg, roi, scale);
  const k = bg.cmPerPx / scale;
  const ox = Math.max(0, Math.floor(roi?.x0 ?? 0));
  const oy = Math.max(0, Math.floor(roi?.y0 ?? 0));
  return detectWalls(img, { cmPerPx: k, originX: bg.x + ox * bg.cmPerPx, originY: bg.y + oy * bg.cmPerPx });
}
