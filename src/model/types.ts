// Tutte le misure del modello sono in centimetri. Coordinate di pianta: x a destra, y in basso.
export type ID = string;

export interface PNode {
  id: ID;
  x: number;
  y: number;
}

export interface Wall {
  id: ID;
  a: ID;
  b: ID;
  thickness: number;
  height: number;
  color?: string;
}

/** sliding = ante scorrevoli (es. IKEA SKYTTA): occupano il vano senza ingombro di apertura */
export type SlidingFinish = 'glass' | 'frosted' | 'white' | 'mirror';

export type OpeningType = 'door' | 'window' | 'arch' | 'sliding';

export interface Opening {
  id: ID;
  wallId: ID;
  type: OpeningType;
  /** distanza del centro dell'apertura dal nodo `a` del muro, lungo il muro */
  offset: number;
  width: number;
  height: number;
  /** quota del davanzale (finestre) */
  sill: number;
  /** porta: cerniera dal lato del nodo b invece che a */
  flipHinge?: boolean;
  /** porta: apre verso l'altro lato del muro */
  flipSide?: boolean;
  /** ante scorrevoli: finitura dei pannelli (default vetro trasparente) */
  finish?: SlidingFinish;
}

export interface Item {
  id: ID;
  catalogId: string;
  x: number;
  y: number;
  /** quota da terra */
  z: number;
  /** rotazione in pianta, radianti */
  rotation: number;
  w: number;
  d: number;
  h: number;
  color?: string;
  /** nome scelto dall'utente (es. "PAX 150 camera") */
  label?: string;
}

export interface RoomLabel {
  id: ID;
  x: number;
  y: number;
  name: string;
  floorColor?: string;
}

export interface Background {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  /** centimetri reali per pixel dell'immagine */
  cmPerPx: number;
  /** posizione (cm) dell'angolo in alto a sinistra */
  x: number;
  y: number;
  opacity: number;
  visible: boolean;
  name?: string;
}

export interface Project {
  version: 1;
  /** id nella raccolta «I miei progetti» (assente finché non viene salvato) */
  id?: string;
  name: string;
  nodes: Record<ID, PNode>;
  walls: Record<ID, Wall>;
  openings: Record<ID, Opening>;
  items: Record<ID, Item>;
  labels: Record<ID, RoomLabel>;
  background?: Background;
}

export const emptyProject = (): Project => ({
  version: 1,
  name: 'Nuovo progetto',
  nodes: {},
  walls: {},
  openings: {},
  items: {},
  labels: {},
});

export const uid = () => Math.random().toString(36).slice(2, 10);
