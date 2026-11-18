// Simulazione apertura/chiusura di porte: anima `open` (0 chiusa … 1 aperta) di una porta a
// scomparsa (mobile) o di una porta normale (apertura nel muro, 1 = anta a 90°).
// Tutta l'animazione è un solo passo di annulla (come un trascinamento).
import { POCKET_OPEN_DEFAULT } from '../catalog/catalog';
import { useStore } from './store';

export type OpenRef = { kind: 'item' | 'opening'; id: string };

/** apertura di default delle porte normali: anta a 90° (come prima della simulazione) */
export const DOOR_OPEN_DEFAULT = 1;

const running = new Map<string, number>();
/** secondi per passare da tutta chiusa a tutta aperta */
const SECONDS_PER_FULL = 1.3;

const key = (r: OpenRef) => r.kind + ':' + r.id;

export function getOpen(r: OpenRef): number | null {
  const p = useStore.getState().project;
  if (r.kind === 'item') {
    const it = p.items[r.id];
    return it ? (it.open ?? POCKET_OPEN_DEFAULT) : null;
  }
  const o = p.openings[r.id];
  return o ? (o.open ?? DOOR_OPEN_DEFAULT) : null;
}

export function setOpen(r: OpenRef, open: number) {
  const st = useStore.getState();
  if (r.kind === 'item') st.updateItem(r.id, { open });
  else st.updateOpening(r.id, { open });
}

/** anima la porta verso `target`; senza target apre se è più chiusa che aperta, altrimenti chiude */
export function animateOpen(r: OpenRef, target?: number) {
  const from = getOpen(r);
  if (from === null) return;
  const to = target ?? (from < 0.5 ? 1 : 0);
  stopOpen(r);
  if (Math.abs(to - from) < 0.005) return;
  const dur = Math.abs(to - from) * SECONDS_PER_FULL * 1000;
  const t0 = performance.now();
  useStore.getState().beginDrag();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / dur);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // parte e frena dolcemente
    if (getOpen(r) === null) return stopOpen(r);
    setOpen(r, Math.round((from + (to - from) * e) * 1000) / 1000);
    if (k < 1) running.set(key(r), requestAnimationFrame(step));
    else stopOpen(r);
  };
  running.set(key(r), requestAnimationFrame(step));
}

export function stopOpen(r: OpenRef) {
  const id = running.get(key(r));
  if (id === undefined) return;
  cancelAnimationFrame(id);
  running.delete(key(r));
  useStore.getState().endDrag();
}

export const animatePocket = (id: string, target?: number) => animateOpen({ kind: 'item', id }, target);
export const animateDoor = (id: string, target?: number) => animateOpen({ kind: 'opening', id }, target);
