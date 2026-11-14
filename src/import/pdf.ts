import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Background } from '../model/types';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Risoluzione di rendering della pagina PDF (px per punto PDF). */
const RENDER_SCALE = 3;
/** 1 punto PDF = 1/72 di pollice = 0,035278 cm sulla carta */
const CM_PER_PT = 2.54 / 72;

export interface ImportedPlan {
  bg: Background;
  pages: number;
}

/**
 * Carica un PDF o un'immagine come sfondo.
 * `drawingScale` (es. 200 per 1:200) permette di impostare subito la scala; altrimenti si calibra dopo.
 */
export async function importPlanFile(file: File, page = 1, drawingScale?: number): Promise<ImportedPlan> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const data = new Uint8Array(await file.arrayBuffer());
    const base = import.meta.env.BASE_URL + 'pdfjs/';
    const doc = await pdfjs.getDocument({
      data,
      wasmUrl: base + 'wasm/',
      cMapUrl: base + 'cmaps/',
      cMapPacked: true,
      standardFontDataUrl: base + 'standard_fonts/',
      iccUrl: base + 'iccs/',
    }).promise;
    const pg = await doc.getPage(Math.min(page, doc.numPages));
    const vp = pg.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pg.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
    if (isBlank(ctx, canvas.width, canvas.height))
      throw new Error('la pagina del PDF risulta vuota (immagine in un formato che non riesco a leggere). Prova a esportarla come immagine JPG/PNG e caricare quella.');
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    const cmPerPx = drawingScale ? (CM_PER_PT * drawingScale) / RENDER_SCALE : 1;
    return {
      pages: doc.numPages,
      bg: { dataUrl, widthPx: canvas.width, heightPx: canvas.height, cmPerPx, x: 0, y: 0, opacity: 0.6, visible: true, name: file.name },
    };
  }
  // immagine
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  return {
    pages: 1,
    bg: { dataUrl, widthPx: img.naturalWidth, heightPx: img.naturalHeight, cmPerPx: 1, x: 0, y: 0, opacity: 0.6, visible: true, name: file.name },
  };
}

/**
 * Calibrazione: due punti (in cm, coordinate attuali) che nella realtà distano `realCm`.
 * Ritorna lo sfondo riscalato tenendo fermo il primo punto.
 */
export function calibrate(bg: Background, p1: { x: number; y: number }, p2: { x: number; y: number }, realCm: number): Background {
  const measured = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (measured < 1e-6 || realCm <= 0) return bg;
  const k = realCm / measured;
  return {
    ...bg,
    cmPerPx: bg.cmPerPx * k,
    x: p1.x + (bg.x - p1.x) * k,
    y: p1.y + (bg.y - p1.y) * k,
  };
}

/** Interpreta una misura digitata: "3,62" o "3.62" → metri (se < 30), "362" → cm. Ritorna cm. */
export function parseLength(s: string): number | null {
  const t = s.trim().replace(',', '.').replace(/\s*(m|cm)$/i, '');
  const unit = /cm\s*$/i.test(s.trim()) ? 'cm' : /m\s*$/i.test(s.trim()) ? 'm' : null;
  const n = parseFloat(t);
  if (!isFinite(n) || n <= 0) return null;
  if (unit === 'cm') return n;
  if (unit === 'm') return n * 100;
  return n < 30 ? n * 100 : n;
}

/** true se il canvas è (quasi) tutto bianco */
function isBlank(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const step = Math.max(1, Math.floor(Math.min(w, h) / 300));
  const d = ctx.getImageData(0, 0, w, h).data;
  let dark = 0;
  for (let y = 0; y < h; y += step)
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200) if (++dark > 50) return false;
    }
  return true;
}
