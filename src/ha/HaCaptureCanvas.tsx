// Scena 3D nascosta usata solo per i render della mappa di Home Assistant: non tocca la vista dell'utente.
import { Canvas, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { World } from '../three/Scene3D';
import { S } from '../three/wallGeometry';
import type { Light, Project } from '../model/types';
import { derive } from '../model/derived';
import { pointInPolygon, type Room } from '../model/geom';
import { captureCamera, type CaptureCamera, type HaView, type ViewOpts } from './views';

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
  capture(p: Project, view: Exclude<HaView, '2d'>, o: ViewOpts, lights: Light[], look: HaLook, progress?: (msg: string) => void, room?: Room): Promise<CaptureResult>;
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

/** luci di scena: «giorno» come nella vista 3D, «notte» quasi buio */
export function rig(mode: 'day' | 'night' | 'bright') {
  const g = new THREE.Group();
  if (mode === 'bright') {
    // luce piena e morbida, nessuna ombra: le facce dei muri si distinguono solo per l'orientamento
    g.add(new THREE.HemisphereLight('#ffffff', '#c8bca8', 1.1));
    g.add(new THREE.AmbientLight('#ffffff', 0.45));
    const key = new THREE.DirectionalLight('#ffffff', 0.9);
    key.position.set(8, 14, 6);
    g.add(key);
    const fill = new THREE.DirectionalLight('#ffffff', 0.35);
    fill.position.set(-6, 8, -10);
    g.add(fill);
  } else if (mode === 'day') {
    g.add(new THREE.HemisphereLight('#ffffff', '#b8a990', 0.7));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6);
    sun.position.set(8, 14, 6);
    sun.castShadow = true;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 });
    g.add(sun);
    g.add(new THREE.AmbientLight('#ffffff', 0.35));
    const fill = new THREE.DirectionalLight('#ffffff', 0.5);
    fill.position.set(-6, 8, -10);
    g.add(fill);
  } else {
    // sera: abbastanza luce da leggere muri e stanze, con un «chiaro di luna» che distingue le facce dei muri
    g.add(new THREE.HemisphereLight('#9aaad0', '#4a4238', 0.9));
    g.add(new THREE.AmbientLight('#8090b0', 0.3));
    const moon = new THREE.DirectionalLight('#b8c8ff', 0.45);
    moon.position.set(8, 14, 6);
    g.add(moon);
  }
  return g;
}

/** lampada: luce puntiforme con ombre (così non attraversa i muri) */
function lamp(l: Light) {
  const h = Math.max(0.3, l.z * S);
  const pl = new THREE.PointLight(l.color, (2 + 18 * l.intensity) * Math.max(1, (h * h) / 5.76), 0, 2);
  pl.position.set(l.x * S, h, l.y * S);
  pl.castShadow = true;
  pl.shadow.mapSize.set(1024, 1024);
  pl.shadow.bias = -0.002;
  pl.shadow.camera.near = 0.05;
  pl.shadow.camera.far = 40;
  return pl;
}

type Pt = { x: number; y: number };
/** cosa mostra la scena: stanza da sola (o casa intera) e muri bassi */
type SceneSel = { at: Pt | null; cutaway: boolean };
type SetFocus = (sel: SceneSel) => Promise<void>;

function Bridge({ onReady, setFocus }: { onReady: (api: CaptureApi) => void; setFocus: SetFocus }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    onReady({
      async capture(p, view, o, lights, look, progress, room) {
        const cam = captureCamera(p, view, o, room?.poly);
        if (!cam) throw new Error('La casa non ha ancora muri');
        await setFocus({ at: room ? (derive(p).roomLabelPos.get(room.key) ?? room.poly[0]) : null, cutaway: o.cutaway });
        await frame();
        await frame();
        gl.setPixelRatio(1);
        gl.setSize(cam.width, cam.height, false);
        const shot = (extra: THREE.Object3D[]) => {
          for (const x of extra) scene.add(x);
          gl.shadowMap.needsUpdate = true;
          gl.render(scene, cam.camera);
          const url = gl.domElement.toDataURL('image/png');
          for (const x of extra) {
            scene.remove(x);
            x.traverse((n) => (n as THREE.PointLight).shadow?.dispose());
          }
          return url;
        };
        // copia 2D del render, per leggere i pixel
        const c2 = document.createElement('canvas');
        c2.width = cam.width;
        c2.height = cam.height;
        const ctx = c2.getContext('2d', { willReadFrequently: true })!;
        const pixels = () => {
          ctx.clearRect(0, 0, cam.width, cam.height);
          ctx.drawImage(gl.domElement, 0, 0);
          return ctx.getImageData(0, 0, cam.width, cam.height);
        };
        progress?.('Render della casa al buio…');
        const nightUrl = shot([rig('night')]);
        // le luci si calcolano sempre rispetto al buio: così danno tutto il loro contributo
        const basePx = pixels().data;
        let baseUrl = nightUrl;
        if (look === 'bright') {
          progress?.('Render della casa…');
          await frame();
          baseUrl = shot([rig('bright')]);
        }
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
          progress?.('Render della casa di giorno…');
          await frame();
          dayUrl = shot([rig('day')]);
          day = dataUrlBytes(dayUrl);
        }
        const out = new Map<string, Uint8Array>();
        for (let i = 0; i < lights.length; i++) {
          progress?.(`Render luce ${i + 1}/${lights.length}: ${lights[i].label || lights[i].entityId}…`);
          await frame();
          shot([rig('night'), lamp(lights[i])]);
          out.set(lights[i].entityId, dataUrlBytes(lightOnly(roomMask(lights[i]))));
        }
        return { ...cam, base: dataUrlBytes(baseUrl), day, lights: out, previewUrl: dayUrl ?? baseUrl };
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
