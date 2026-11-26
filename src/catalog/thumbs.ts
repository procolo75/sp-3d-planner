// Miniature 3D dei mobili del catalogo: una vista di tre quarti con luci e ombra morbida, fatta con un solo
// renderer WebGL fuori schermo e tenuta in memoria come immagine (data URL).
import * as THREE from 'three';
import { partGeometry, partLook } from '../three/partMeshes';
import { S } from '../three/wallGeometry';
import { scaledParts, type CatalogItem } from './catalog';

const SIZE = 192;
const cache = new Map<string, string>();
const listeners = new Map<string, Set<(url: string) => void>>();
const queue: CatalogItem[] = [];
let busy = false;
let failed = false;

let ctx: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; holder: THREE.Group; sun: THREE.DirectionalLight; ground: THREE.Mesh } | null = null;

function setup() {
  if (ctx || failed) return ctx;
  try {
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#b9ad98', 1.2));
    const sun = new THREE.DirectionalLight('#fff6ea', 2.0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.radius = 6;
    sun.shadow.bias = -0.0008;
    scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight('#dfe8ff', 0.6);
    fill.position.set(-4, 3, -2);
    scene.add(fill);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.22 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const holder = new THREE.Group();
    scene.add(holder);
    const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
    ctx = { renderer, scene, camera, holder, sun, ground };
  } catch {
    failed = true;
  }
  return ctx;
}

function render(c: CatalogItem): string | null {
  const k = setup();
  if (!k) return null;
  const { renderer, scene, camera, holder, sun, ground } = k;
  holder.clear();
  const mats: THREE.Material[] = [];
  for (const pt of scaledParts(c, c.w, c.d, c.h)) {
    const mat = new THREE.MeshStandardMaterial({ color: pt.c, transparent: pt.o !== undefined, opacity: pt.o ?? 1, ...partLook(pt) });
    mats.push(mat);
    const m = new THREE.Mesh(partGeometry(pt), mat);
    m.position.set(pt.p[0] * S, pt.p[1] * S, pt.p[2] * S);
    m.castShadow = pt.o === undefined;
    m.receiveShadow = true;
    holder.add(m);
  }
  const box = new THREE.Box3().setFromObject(holder);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(0.05, size.length() / 2);
  // mobili bassi e larghi (tappeti, piatti doccia) si vedono meglio più dall'alto
  const flat = size.y < 0.18 * Math.max(size.x, size.z);
  const el = ((flat ? 58 : 24) * Math.PI) / 180;
  const az = (32 * Math.PI) / 180;
  const dist = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 0.98;
  camera.position.set(center.x + Math.sin(az) * Math.cos(el) * dist, center.y + Math.sin(el) * dist, center.z + Math.cos(az) * Math.cos(el) * dist);
  camera.near = dist / 50;
  camera.far = dist * 4;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  ground.scale.setScalar(radius * 6);
  sun.position.set(center.x + radius * 1.5, center.y + radius * 3, center.z + radius * 2);
  sun.target.position.copy(center);
  Object.assign(sun.shadow.camera, { left: -radius * 2, right: radius * 2, top: radius * 2, bottom: -radius * 2, near: 0.01, far: radius * 10 });
  sun.shadow.camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  mats.forEach((m) => m.dispose());
  holder.clear();
  return url;
}

const key = (c: CatalogItem) => c.id + (c.color ?? '');

function pump() {
  if (busy) return;
  busy = true;
  const step = () => {
    // qualche miniatura per fotogramma, così la lista resta fluida
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < 12) {
      const c = queue.shift()!;
      const k = key(c);
      if (cache.has(k)) continue;
      const url = render(c);
      if (!url) {
        queue.length = 0;
        break;
      }
      cache.set(k, url);
      listeners.get(k)?.forEach((f) => f(url));
      listeners.delete(k);
    }
    if (queue.length) requestAnimationFrame(step);
    else busy = false;
  };
  requestAnimationFrame(step);
}

/** miniatura già pronta (o null), e richiesta di farla: `done` viene chiamata quando è pronta */
export function thumbnail(c: CatalogItem, done: (url: string) => void): { url: string | null; cancel: () => void } {
  const k = key(c);
  const hit = cache.get(k);
  if (hit) return { url: hit, cancel: () => {} };
  if (failed) return { url: null, cancel: () => {} };
  let set = listeners.get(k);
  if (!set) listeners.set(k, (set = new Set()));
  set.add(done);
  if (!queue.some((q) => key(q) === k)) queue.push(c);
  pump();
  return {
    url: null,
    cancel: () => {
      set!.delete(done);
      if (!set!.size) {
        listeners.delete(k);
        const i = queue.findIndex((q) => key(q) === k);
        if (i >= 0) queue.splice(i, 1);
      }
    },
  };
}
