// Scena 3D nascosta usata solo per i render della mappa di Home Assistant: non tocca la vista dell'utente.
import { Canvas, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useRef, useState } from 'react';
import { World } from '../three/Scene3D';
import type { Light, Project } from '../model/types';
import { derive } from '../model/derived';
import { pointInPolygon, type Room } from '../model/geom';
import { captureCamera, type CaptureCamera, type HaView, type ViewOpts } from './views';
import { pathEngine, rasterEngine, type Engine, type HaQuality } from './renderEngine';

export type { HaQuality } from './renderEngine';

export interface CaptureResult extends CaptureCamera {
  /** render «notte»: luci spente */
  base: Uint8Array;
  /** render «giorno» (illuminazione normale), se richiesto */
  day?: Uint8Array;
  /** un render per luce accesa, per entity_id */
  lights: Map<string, Uint8Array>;
  /** anteprima (render giorno o notte) da mostrare nella finestra */
  previewUrl: string;
}

export interface CaptureApi {
  /** con `room` rende solo quella stanza (i suoi muri e i suoi mobili), inquadrata da vicino */
  /** `quality`: «fast» render normale ritoccato, «high» path tracing (più lento) */
  capture(p: Project, view: Exclude<HaView, '2d'>, o: ViewOpts, lights: Light[], look: HaLook, progress?: (msg: string) => void, room?: Room, quality?: HaQuality): Promise<CaptureResult>;
}

/** «bright»: casa sempre chiara, senza ombre; «daynight»: buia di sera + immagine di giorno che segue sun.sun */
export type HaLook = 'bright' | 'daynight';

function dataUrlBytes(url: string) {
  const b = atob(url.slice(url.indexOf(',') + 1));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

type Pt = { x: number; y: number };
/** cosa mostra la scena: stanza da sola (o casa intera) e muri bassi */
type SceneSel = { at: Pt | null; cutaway: boolean };
type SetFocus = (sel: SceneSel) => Promise<void>;

function Bridge({ onReady, setFocus }: { onReady: (api: CaptureApi) => void; setFocus: SetFocus }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    onReady({
      async capture(p, view, o, lights, look, progress, room, quality = 'fast') {
        const cam = captureCamera(p, view, o, room?.poly);
        if (!cam) throw new Error('La casa non ha ancora muri');
        await setFocus({ at: room ? (derive(p).roomLabelPos.get(room.key) ?? room.poly[0]) : null, cutaway: o.cutaway });
        await frame();
        await frame();
        gl.setPixelRatio(1);
        // copia 2D del render (W×H), per leggere i pixel
        const c2 = document.createElement('canvas');
        c2.width = cam.width;
        c2.height = cam.height;
        const ctx = c2.getContext('2d', { willReadFrequently: true })!;
        const pixels = () => ctx.getImageData(0, 0, cam.width, cam.height);
        const high = quality === 'high';
        const engine: Engine = high ? pathEngine(gl, scene, cam.camera, ctx, 128) : rasterEngine(gl, scene, cam.camera, ctx);
        /** render con il motore scelto; con il path tracing mostra la percentuale */
        const shot = async (msg: string, mode: 'night' | 'bright' | 'day', opts: { lamp?: Light; ao?: boolean } = {}) => {
          progress?.(msg);
          await frame();
          await engine.shot(mode, { ...opts, progress: high ? (pct) => progress?.(`${msg} ${pct}%`) : undefined });
          return c2.toDataURL('image/png');
        };
        try {
        // le luci si calcolano sempre rispetto al buio: così danno tutto il loro contributo
        // (senza ombreggiatura negli angoli, come i render delle lampade, così la differenza è solo la luce)
        const nightUrl = await shot('Render della casa al buio…', 'night');
        const basePx = pixels().data;
        let baseUrl = nightUrl;
        if (look === 'bright') baseUrl = await shot('Render della casa…', 'bright', { ao: true });
        else if (!high) baseUrl = await shot('Render della casa al buio…', 'night', { ao: true });
        /** solo la luce aggiunta dalla lampada (acceso − buio), da sommare alla base: si vede sia di notte sia sull'immagine di giorno */
        // ritaglio sulla stanza della lampada: pavimento, soffitto e pareti (il «prisma» della stanza visto dalla camera)
        const rooms = derive(p).rooms;
        const H = o.cutaway ? 110 : Math.max(250, ...Object.values(p.walls).map((w) => w.height));
        const mc = document.createElement('canvas');
        mc.width = cam.width;
        mc.height = cam.height;
        const mctx = mc.getContext('2d', { willReadFrequently: true })!;
        const roomMask = (l: Light) => {
          const r = rooms.find((x) => pointInPolygon(l, x.poly));
          if (!r) return null;
          mctx.clearRect(0, 0, cam.width, cam.height);
          mctx.filter = 'blur(1.5px)';
          mctx.fillStyle = '#fff';
          const poly = (pts: { x: number; y: number }[]) => {
            mctx.beginPath();
            pts.forEach((q, i) => (i ? mctx.lineTo(q.x, q.y) : mctx.moveTo(q.x, q.y)));
            mctx.closePath();
            mctx.fill();
          };
          const lo = r.poly.map((q) => cam.toPixel(q.x, q.y, 0));
          const hi = r.poly.map((q) => cam.toPixel(q.x, q.y, H));
          poly(lo);
          poly(hi);
          for (let i = 0; i < lo.length; i++) {
            const j = (i + 1) % lo.length;
            poly([lo[i], lo[j], hi[j], hi[i]]);
          }
          mctx.filter = 'none';
          return mctx.getImageData(0, 0, cam.width, cam.height).data;
        };
        const lightOnly = (mask: Uint8ClampedArray | null) => {
          const img = pixels();
          const d = img.data;
          for (let i = 0; i < d.length; i += 4) {
            if (mask && !mask[i + 3]) {
              d[i + 3] = 0;
              continue;
            }
            const r = Math.max(0, d[i] - basePx[i]);
            const g = Math.max(0, d[i + 1] - basePx[i + 1]);
            const b = Math.max(0, d[i + 2] - basePx[i + 2]);
            const a = Math.max(r, g, b);
            // colore «premoltiplicato» = differenza: sommato alla base ridà il render acceso
            d[i] = a ? (r * 255) / a : 0;
            d[i + 1] = a ? (g * 255) / a : 0;
            d[i + 2] = a ? (b * 255) / a : 0;
            d[i + 3] = mask ? (a * mask[i + 3]) / 255 : a;
          }
          ctx.putImageData(img, 0, 0);
          return c2.toDataURL('image/png');
        };
        let day: Uint8Array | undefined;
        let dayUrl: string | undefined;
        if (look === 'daynight') {
          dayUrl = await shot('Render della casa di giorno…', 'day', { ao: true });
          day = dataUrlBytes(dayUrl);
        }
        const out = new Map<string, Uint8Array>();
        for (let i = 0; i < lights.length; i++) {
          await shot(`Render luce ${i + 1}/${lights.length}: ${lights[i].label || lights[i].entityId}…`, 'night', { lamp: lights[i] });
          out.set(lights[i].entityId, dataUrlBytes(lightOnly(roomMask(lights[i]))));
        }
        return { ...cam, base: dataUrlBytes(baseUrl), day, lights: out, previewUrl: dayUrl ?? baseUrl };
        } finally {
          engine.dispose();
        }
      },
    });
  }, [gl, scene, onReady, setFocus]);
  return null;
}

/** avvisa quando la scena ha montato la stanza richiesta */
function FocusDone({ sel, onDone }: { sel: SceneSel; onDone: (sel: SceneSel) => void }) {
  useEffect(() => onDone(sel), [sel, onDone]);
  return null;
}

/** canvas WebGL fuori dallo schermo con la casa: i render vengono letti da qui */
export function HaCaptureCanvas({ cutaway, onReady }: { cutaway: boolean; onReady: (api: CaptureApi) => void }) {
  // stanza da rendere da sola e muri bassi: la scena si aggiorna con React, il render aspetta che sia montata
  const [sel, setSel] = useState<SceneSel>({ at: null, cutaway });
  const waiting = useRef<(() => void) | null>(null);
  const current = useRef(sel);
  // chiamata da dentro il Canvas (ha un suo renderer React): a quel punto la scena è già aggiornata
  const done = useCallback((v: SceneSel) => {
    current.current = v;
    waiting.current?.();
    waiting.current = null;
  }, []);
  const setFocus = useCallback<SetFocus>((v) => {
    const c = current.current;
    const same = c.cutaway === v.cutaway && (c.at === v.at || (!!c.at && !!v.at && c.at.x === v.at.x && c.at.y === v.at.y));
    if (same) return Promise.resolve();
    return new Promise<void>((resolve) => {
      waiting.current = resolve;
      setSel(v);
    });
  }, []);
  return (
    <div style={{ position: 'fixed', left: -10000, top: 0, width: 64, height: 64, pointerEvents: 'none' }} aria-hidden="true">
      <Canvas shadows dpr={1} frameloop="never" gl={{ preserveDrawingBuffer: true, alpha: true, logarithmicDepthBuffer: true, antialias: true }}>
        <World cutaway={sel.cutaway} interactive={false} exportMode focusAt={sel.at} />
        <Bridge onReady={onReady} setFocus={setFocus} />
        <FocusDone sel={sel} onDone={done} />
      </Canvas>
    </div>
  );
}
