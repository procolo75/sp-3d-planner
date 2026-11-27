// Immagini del progetto da salvare o stampare: la pianta 2D (in alta risoluzione) e la vista 3D così com'è.
import { useStore } from '../model/store';
import { notify } from './Notice';

type Picker = (o: unknown) => Promise<{ createWritable(): Promise<{ write(d: Blob): Promise<void>; close(): Promise<void> }> }>;

const frames = (n: number) =>
  new Promise<void>((res) => {
    const step = (k: number) => (k <= 0 ? res() : requestAnimationFrame(() => step(k - 1)));
    step(n);
  });

function baseName() {
  const n = useStore.getState().project.name?.trim() || 'progetto';
  return n.replace(/[\\/:*?"<>|]+/g, '_');
}

/** salva un'immagine: con Chrome/Edge si sceglie dove, altrimenti finisce in Download. false se annullato */
export async function saveImage(blob: Blob, suffix: string): Promise<boolean> {
  const name = `${baseName()} - ${suffix}.png`;
  const picker = (window as unknown as { showSaveFilePicker?: Picker }).showSaveFilePicker;
  if (picker) {
    try {
      const h = await picker({ suggestedName: name, types: [{ description: 'Immagine PNG', accept: { 'image/png': ['.png'] } }] });
      const w = await h.createWritable();
      await w.write(blob);
      await w.close();
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false;
      // selettore non disponibile in questo momento (es. il clic è troppo lontano): si scarica
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return true;
}

/** stampa un'immagine da sola, adattata al foglio (orizzontale se è larga) con il nome del progetto */
export function printImage(blob: Blob, title: string) {
  const url = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const img = new Image();
  img.onload = () => {
    const land = img.width > img.height;
    const doc = frame.contentDocument!;
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      @page { size: A4 ${land ? 'landscape' : 'portrait'}; margin: 10mm; }
      html, body { margin: 0; height: 100%; font-family: system-ui, sans-serif; }
      body { display: flex; flex-direction: column; }
      h1 { font-size: 13pt; margin: 0 0 4mm; font-weight: 600; }
      .img { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
      img { max-width: 100%; max-height: 100%; object-fit: contain; }
    </style></head><body><h1>${esc(title)}</h1><div class="img"><img src="${url}"></div></body></html>`);
    doc.close();
    const go = () => {
      frame.contentWindow!.focus();
      frame.contentWindow!.print();
      setTimeout(() => (frame.remove(), URL.revokeObjectURL(url)), 60_000);
    };
    const im = doc.querySelector('img')!;
    if (im.complete) go();
    else im.onload = go;
  };
  img.src = url;
}

/** pixel per cm della pianta esportata (una casa di 15 m esce larga circa 4500 px: buona per A3) */
const PX_PER_CM = 3;
const MAX_PX = 8000;

/** la pianta 2D come immagine PNG, senza griglia né selezione, inquadrata su tutta la casa */
export async function planImage(): Promise<Blob> {
  const st = useStore.getState();
  const prevView = st.view;
  const prevSel = st.selection;
  st.select(null);
  if (prevView === '3d') st.setView('split');
  await frames(2);
  // tutta la casa nella vista: le scritte prendono la grandezza giusta per l'insieme
  window.dispatchEvent(new Event('planner:fit'));
  await frames(3);
  try {
    const svg = document.querySelector('.editor2d svg') as SVGSVGElement | null;
    if (!svg) throw new Error('la pianta 2D non è visibile');
    const p = useStore.getState().project;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const n of Object.values(p.nodes)) (xs.push(n.x), ys.push(n.y));
    for (const it of Object.values(p.items)) (xs.push(it.x - it.w / 2, it.x + it.w / 2), ys.push(it.y - it.d / 2, it.y + it.d / 2));
    if (!xs.length) throw new Error('la pianta è vuota');
    const m = 60;
    const [x0, x1, y0, y1] = [Math.min(...xs) - m, Math.max(...xs) + m, Math.min(...ys) - m, Math.max(...ys) + m];
    const k = Math.min(PX_PER_CM, MAX_PX / Math.max(x1 - x0, y1 - y0));
    const W = Math.round((x1 - x0) * k);
    const H = Math.round((y1 - y0) * k);
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll('[data-noexport]').forEach((e) => e.remove());
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('viewBox', `${x0} ${y0} ${x1 - x0} ${y1 - y0}`);
    clone.setAttribute('width', String(W));
    clone.setAttribute('height', String(H));
    clone.setAttribute('style', 'font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif');
    // le linee «non-scaling» restano sottili come a schermo: in un'immagine grande le si ingrossa un po'
    const scale = Math.max(1, (k / (svg.getScreenCTM()?.a ?? k)) * 0.6);
    clone.querySelectorAll('[vector-effect="non-scaling-stroke"]').forEach((e) => {
      const w = parseFloat(e.getAttribute('stroke-width') ?? '1') || 1;
      e.setAttribute('stroke-width', String(w * scale));
    });
    const xml = new XMLSerializer().serializeToString(clone);
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('non riesco a disegnare la pianta'));
        img.src = url;
      });
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);
      return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('immagine troppo grande'))), 'image/png'));
    } finally {
      URL.revokeObjectURL(url);
    }
  } finally {
    if (prevView === '3d') st.setView('3d');
    if (prevSel) st.select(prevSel);
  }
}

/** la vista 3D così come si vede (con lo stile scelto), dal prossimo fotogramma disegnato */
export function scene3dImage(): Promise<Blob> {
  return new Promise((res, rej) => {
    const ok = window.dispatchEvent(new CustomEvent('planner:snap3d', { detail: { res, rej }, cancelable: true }));
    // nessuna vista 3D montata (solo pianta): nessuno ha preso la richiesta
    if (ok) rej(new Error('apri la vista 3D (o 2D | 3D) per salvarne l\'immagine'));
  });
}

/** salva (o stampa) l'immagine della vista 3D */
export async function snap3d(print: boolean) {
  try {
    const b = await scene3dImage();
    if (print) printImage(b, `${useStore.getState().project.name || 'Progetto'} — vista 3D`);
    else if (await saveImage(b, 'vista 3D')) notify('Immagine della vista 3D salvata ✓');
  } catch (e) {
    notify('Non riesco a salvare l\'immagine: ' + (e as Error).message, true);
  }
}

/** salva (o stampa) la pianta 2D */
export async function snapPlan(print: boolean) {
  try {
    const b = await planImage();
    if (print) printImage(b, `${useStore.getState().project.name || 'Progetto'} — pianta`);
    else if (await saveImage(b, 'pianta')) notify('Immagine della pianta salvata ✓');
  } catch (e) {
    notify('Non riesco a preparare la pianta: ' + (e as Error).message, true);
  }
}
