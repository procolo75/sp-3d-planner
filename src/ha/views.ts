// Camere per i render della mappa di Home Assistant e proiezione dei punti della pianta in pixel dell'immagine.
import * as THREE from 'three';
import { S } from '../three/wallGeometry';
import type { Project } from '../model/types';

export type HaView = 'top' | 'iso' | 'persp' | '2d';

export const VIEW_NAMES: Record<HaView, string> = {
  top: '3D dall\'alto',
  iso: '3D isometrica',
  persp: '3D prospettica',
  '2d': 'Pianta 2D',
};

export interface ViewOpts {
  /** lato lungo dell'immagine, in pixel */
  res: number;
  /** dimensione esatta dell'immagine in pixel (es. lo schermo del tablet): la casa viene centrata
   *  e il resto resta vuoto. Se manca, l'immagine prende la forma della casa con lato lungo `res`. */
  size?: { width: number; height: number };
  /** da che lato si guarda la casa (gradi, 0 = dal basso della pianta); vista dall'alto: rotazione della pianta */
  azimuth: number;
  /** viste inclinate: quanto dall'alto (gradi sopra l'orizzonte) */
  elevation: number;
  /** muri bassi (1,1 m) per vedere dentro le stanze */
  cutaway: boolean;
}

export interface CaptureCamera {
  camera: THREE.OrthographicCamera | THREE.PerspectiveCamera;
  width: number;
  height: number;
  /** punto della pianta (cm, z = altezza da terra in cm) → pixel dell'immagine */
  toPixel(x: number, y: number, z?: number): { x: number; y: number };
}

const MARGIN = 0.04;

/** punti da inquadrare: angoli della casa a terra e in cima ai muri */
/** direzione «su» dell'immagine nella vista dall'alto, ruotata di `azimuth` (0 = nord della pianta in alto) */
export function topUp(azimuthDeg: number) {
  const az = (azimuthDeg * Math.PI) / 180;
  return new THREE.Vector3(-Math.sin(az), 0, -Math.cos(az));
}

/** da posizione della camera e punto guardato: rotazione e inclinazione in gradi (stesse convenzioni di viewDir) */
export function anglesFrom(pos: THREE.Vector3, target: THREE.Vector3) {
  const d = pos.clone().sub(target).normalize();
  return { azimuth: (Math.atan2(d.x, d.z) * 180) / Math.PI, elevation: (Math.asin(Math.max(-1, Math.min(1, d.y))) * 180) / Math.PI };
}

function houseCorners(p: Project, cutaway: boolean, frame?: { x: number; y: number }[]): THREE.Vector3[] {
  const ns = frame && frame.length >= 3 ? frame : Object.values(p.nodes);
  const H = cutaway ? 110 : Math.max(250, ...Object.values(p.walls).map((w) => w.height));
  const xs = ns.map((n) => n.x);
  const ys = ns.map((n) => n.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const out: THREE.Vector3[] = [];
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [0, H]) out.push(new THREE.Vector3(x * S, z * S, y * S));
  return out;
}

function viewDir(view: HaView, o: ViewOpts) {
  if (view === 'top') return new THREE.Vector3(0, 1, 0);
  const el = (o.elevation * Math.PI) / 180;
  const az = (o.azimuth * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

function sizeFor(aspect: number, res: number) {
  // aspect = altezza / larghezza
  const width = aspect <= 1 ? res : Math.round(res / aspect);
  const height = Math.round(width * aspect);
  return { width: Math.max(16, width), height: Math.max(16, height) };
}

/** Camera che inquadra tutta la casa per la vista scelta, con le dimensioni dell'immagine adatte alla forma della casa.
 *  Con `frame` (poligono di una stanza, in cm) inquadra solo quello. */
export function captureCamera(p: Project, view: Exclude<HaView, '2d'>, o: ViewOpts, frame?: { x: number; y: number }[]): CaptureCamera | null {
  if (Object.keys(p.nodes).length < 2) return null;
  const corners = houseCorners(p, o.cutaway, frame);
  const box = new THREE.Box3().setFromPoints(corners);
  const center = box.getCenter(new THREE.Vector3());
  if (view === 'top') center.y = 0;
  const dir = viewDir(view, o);
  const up = view === 'top' ? topUp(o.azimuth) : new THREE.Vector3(0, 1, 0);
  const radius = box.getSize(new THREE.Vector3()).length();

  // estensione della casa vista da quella direzione (camera ortografica)
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, radius * 6 + 100);
  ortho.up.copy(up);
  ortho.position.copy(center).addScaledVector(dir, radius * 3 + 10);
  ortho.lookAt(center);
  ortho.updateMatrixWorld();
  const inv = ortho.matrixWorldInverse;
  const vs = corners.map((c) => c.clone().applyMatrix4(inv));
  let [minX, maxX, minY, maxY] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const q of vs) {
    minX = Math.min(minX, q.x);
    maxX = Math.max(maxX, q.x);
    minY = Math.min(minY, q.y);
    maxY = Math.max(maxY, q.y);
  }
  const mx = (maxX - minX) * MARGIN;
  const my = (maxY - minY) * MARGIN;
  minX -= mx;
  maxX += mx;
  minY -= my;
  maxY += my;
  let aspect = (maxY - minY) / (maxX - minX);
  let { width, height } = sizeFor(aspect, o.res);
  if (o.size) {
    // formato fisso: allargo l'inquadratura sul lato che avanza, tenendo la casa al centro
    width = Math.max(16, Math.round(o.size.width));
    height = Math.max(16, Math.round(o.size.height));
    const target = height / width;
    if (aspect < target) {
      const extra = ((maxX - minX) * target - (maxY - minY)) / 2;
      minY -= extra;
      maxY += extra;
    } else {
      const extra = ((maxY - minY) / target - (maxX - minX)) / 2;
      minX -= extra;
      maxX += extra;
    }
    aspect = target;
  }

  let camera: THREE.OrthographicCamera | THREE.PerspectiveCamera;
  if (view !== 'persp') {
    ortho.left = minX;
    ortho.right = maxX;
    ortho.top = maxY;
    ortho.bottom = minY;
    ortho.updateProjectionMatrix();
    camera = ortho;
  } else {
    const pc = new THREE.PerspectiveCamera(35, width / height, 0.05, 500);
    pc.up.copy(up);
    // distanza minima dal centro della casa perché tutti gli angoli stiano dentro
    const target = center;
    const fits = (d: number) => {
      pc.position.copy(target).addScaledVector(dir, d);
      pc.lookAt(target);
      pc.near = Math.max(0.05, d / 200);
      pc.far = d * 10 + 50;
      pc.updateProjectionMatrix();
      pc.updateMatrixWorld();
      const v = new THREE.Vector3();
      return corners.every((c) => {
        v.copy(c).project(pc);
        return Math.abs(v.x) <= 1 - MARGIN * 2 && Math.abs(v.y) <= 1 - MARGIN * 2 && v.z < 1;
      });
    };
    let lo = 0.5;
    let hi = 500;
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2;
      if (fits(m)) hi = m;
      else lo = m;
    }
    fits(hi);
    camera = pc;
  }
  camera.updateMatrixWorld();
  const v = new THREE.Vector3();
  const toPixel = (x: number, y: number, z = 0) => {
    v.set(x * S, z * S, y * S).project(camera);
    return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height };
  };
  return { camera, width, height, toPixel };
}
