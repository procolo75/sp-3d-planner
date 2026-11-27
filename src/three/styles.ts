// Stili di resa della scena 3D (vista principale, anteprime e render per Home Assistant).
// Lo stile si applica sopra la scena così com'è: i materiali originali restano da parte e tornano con «normale».
import * as THREE from 'three';
import { boxUV, partSurface, surfaceTextures, type Surface } from './textures';

export type RenderStyle = 'normale' | 'plastico' | 'disegno' | 'blueprint' | 'realistico';

export const STYLE_NAMES: Record<RenderStyle, string> = {
  normale: 'Normale',
  plastico: 'Plastico',
  disegno: 'Disegno',
  blueprint: 'Blueprint',
  realistico: '✨ Realistico',
};

/** colore di sfondo della vista per stile */
export const STYLE_BG: Record<RenderStyle, string> = {
  normale: '#eef1f5',
  plastico: '#e9ecef',
  disegno: '#ffffff',
  blueprint: '#163d73',
  realistico: '#eef1f5',
};

/** stili che usano il path tracing (gli altri lo escludono) */
export const PATH_TRACE_STYLES: RenderStyle[] = ['normale', 'plastico', 'realistico'];

type Mat = THREE.Material | THREE.Material[];
interface StyledData {
  style?: RenderStyle;
  origMaterial?: Mat;
  styleEdge?: boolean;
  /** le mesh con questo flag non vengono toccate (es. aloni, segnaposto) */
  noStyle?: boolean;
  /** superficie per le texture del Realistico: pavimento, muro o «mobile» (il materiale si deduce dal colore) */
  surface?: Surface | 'furniture';
}

const cache = new Map<string, THREE.Material>();
const styleSet = new Set<THREE.Material>();
function cached(key: string, make: () => THREE.Material) {
  let m = cache.get(key);
  if (!m) {
    cache.set(key, (m = make()));
    styleSet.add(m);
  }
  return m;
}
const isStyleMaterial = (m: Mat) => (Array.isArray(m) ? m.length > 0 && m.every((x) => styleSet.has(x)) : styleSet.has(m));

const colorOf = (m: THREE.Material) => ((m as THREE.MeshStandardMaterial).color ? (m as THREE.MeshStandardMaterial).color.getHexString() : 'ffffff');
const isGlass = (m: THREE.Material) => m.transparent && m.opacity < 0.8;

/** Realistico: lo stesso materiale con texture vere (parquet, piastrelle, intonaco, legno, tessuto) */
function textured(m: THREE.Material, surface: StyledData['surface']): THREE.Material {
  const sm = m as THREE.MeshStandardMaterial;
  if (!surface || !sm.isMeshStandardMaterial || isGlass(m)) return m;
  const s = surface === 'furniture' ? partSurface('#' + sm.color.getHexString(), sm.metalness > 0.3, m.transparent) : surface;
  if (!s) return m;
  const t = surfaceTextures(s);
  if (!t) return m;
  const key = `r-${s}-${sm.color.getHexString()}-${m.side}-${sm.polygonOffset ? sm.polygonOffsetFactor : ''}`;
  return cached(key, () => {
    const out = sm.clone();
    out.map = t.map;
    out.normalMap = t.normalMap;
    out.normalScale.set(t.normalScale, t.normalScale);
    out.roughnessMap = t.roughnessMap;
    // la mappa scurisce un po' il colore: lo si compensa per restare vicini a quello scelto
    out.color.multiplyScalar(s === 'parquet' || s === 'stone' ? 1.12 : 1.04);
    out.roughness = 1;
    return out;
  });
}

/** materiale dello stile per un materiale originale */
function styled(m: THREE.Material, style: RenderStyle): THREE.Material {
  const side = m.side;
  if (style === 'plastico') {
    if (isGlass(m)) return cached(`p-glass-${side}`, () => new THREE.MeshStandardMaterial({ color: '#dfe8ec', transparent: true, opacity: 0.35, roughness: 0.2, side, depthWrite: false }));
    return cached(`p-${side}`, () => new THREE.MeshStandardMaterial({ color: '#f2efe9', roughness: 1, metalness: 0, side }));
  }
  if (style === 'disegno') {
    const c = colorOf(m);
    if (isGlass(m)) return cached(`d-glass-${c}-${side}`, () => new THREE.MeshToonMaterial({ color: `#${c}`, transparent: true, opacity: 0.35, side, depthWrite: false }));
    return cached(`d-${c}-${side}`, () => new THREE.MeshToonMaterial({ color: `#${c}`, side }));
  }
  // blueprint
  return cached(`b-${isGlass(m) ? 'g' : 's'}-${side}`, () => new THREE.MeshBasicMaterial({ color: '#1d4f91', transparent: true, opacity: isGlass(m) ? 0.15 : 0.55, side, depthWrite: !isGlass(m) }));
}

const EDGE_COLOR: Partial<Record<RenderStyle, string>> = { disegno: '#1b1b1b', blueprint: '#e8f1ff' };
const edgeMats = new Map<string, THREE.LineBasicMaterial>();
const edgeGeos = new WeakMap<THREE.BufferGeometry, THREE.EdgesGeometry>();

function addEdges(mesh: THREE.Mesh, style: RenderStyle) {
  const color = EDGE_COLOR[style];
  if (!color) return;
  let eg = edgeGeos.get(mesh.geometry);
  if (!eg) edgeGeos.set(mesh.geometry, (eg = new THREE.EdgesGeometry(mesh.geometry, 30)));
  let em = edgeMats.get(color);
  if (!em) edgeMats.set(color, (em = new THREE.LineBasicMaterial({ color })));
  const lines = new THREE.LineSegments(eg, em);
  (lines.userData as StyledData).styleEdge = true;
  lines.raycast = () => {};
  mesh.add(lines);
}

function removeEdges(mesh: THREE.Object3D) {
  for (const c of [...mesh.children]) if ((c.userData as StyledData).styleEdge) mesh.remove(c);
}

/**
 * Applica lo stile alle mesh della scena che non lo hanno ancora (economico: si può chiamare a ogni frame).
 * `lit`: materiali che devono reagire alla luce anche in Blueprint (render delle lampade per HA).
 */
export function applyStyle(root: THREE.Object3D, style: RenderStyle, o: { lit?: boolean } = {}) {
  const want: RenderStyle = style === 'blueprint' && o.lit ? 'plastico' : style;
  const key = (want + (style === 'blueprint' && o.lit ? '+lit' : '')) as RenderStyle;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    const ud = mesh.userData as StyledData;
    if (!mesh.isMesh || ud.styleEdge || ud.noStyle) return;
    // anche quando React cambia solo la geometria (muro modificato), le texture vogliono le UV in metri
    if (want === 'realistico' && ud.surface) boxUV(mesh.geometry);
    if (ud.style === key) {
      // già a posto, a meno che React non abbia rimesso un materiale suo (quello nuovo è il nuovo originale)
      if (isStyleMaterial(mesh.material) || mesh.material === ud.origMaterial) return;
      ud.origMaterial = mesh.material;
    } else if (ud.origMaterial === undefined || !isStyleMaterial(mesh.material)) ud.origMaterial = mesh.material;
    removeEdges(mesh);
    const orig = ud.origMaterial;
    if (want === 'normale') mesh.material = orig;
    else if (want === 'realistico') mesh.material = Array.isArray(orig) ? orig.map((m) => textured(m, ud.surface)) : textured(orig, ud.surface);
    else mesh.material = Array.isArray(orig) ? orig.map((m) => styled(m, want)) : styled(orig, want);
    if (want !== 'normale' && want !== 'realistico') addEdges(mesh, style === 'blueprint' && o.lit ? 'normale' : want);
    ud.style = key;
  });
}
