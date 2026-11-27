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

/** garage = portone basculante/sezionale che sale e rientra sotto il soffitto */
export type OpeningType = 'door' | 'window' | 'arch' | 'sliding' | 'garage';

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
  /** portone del garage: colore del pannello */
  color?: string;
  /** porta: apertura dell'anta, 0 = chiusa … 1 = aperta a 90° (default); garage: 0 = chiuso (default) … 1 = tutto alzato */
  open?: number;
  /** Home Assistant: sensore di apertura collegato (es. binary_sensor.porta_ingresso) */
  haEntity?: string;
  /** Home Assistant: cosa succede toccandola sulla mappa (default: info) */
  tap?: TapAction;
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
  /** secondo colore del mobile (es. gambe del tavolo, struttura del letto): vedi colorSlots */
  color2?: string;
  /** porte a scomparsa: apertura 0 (chiusa) … 1 (tutta aperta) */
  open?: number;
}

export interface RoomLabel {
  id: ID;
  x: number;
  y: number;
  name: string;
  floorColor?: string;
  /** spazio esterno (cortile, giardino tra casa e garage): niente pavimento */
  outdoor?: boolean;
}

/** Telecamera di sorveglianza: punto in pianta, direzione e angolo di visione */
export interface Camera {
  id: ID;
  x: number;
  y: number;
  /** quota di montaggio (cm da terra) */
  z: number;
  /** direzione in cui guarda, in pianta (radianti, 0 = verso destra) */
  rotation: number;
  /** angolo di visione orizzontale (gradi, 360 = fisheye) */
  fov: number;
  /** distanza massima utile (cm) */
  range: number;
  color: string;
  label?: string;
  /** Home Assistant: entità della telecamera (es. camera.ingresso) */
  haEntity?: string;
  /** Home Assistant: cosa succede toccandola sulla mappa (default: info) */
  tap?: TapAction;
}

/** Azioni al tocco di ha-floorplan */
export type TapActionKind = 'more-info' | 'toggle' | 'call-service' | 'navigate' | 'url' | 'none';

/** Cosa succede toccando un elemento sulla mappa di Home Assistant */
export interface TapAction {
  action: TapActionKind;
  /** more-info / toggle / call-service: un'altra entità (vuoto = quella dell'elemento) */
  entity?: string;
  /** call-service: es. script.buonanotte, cover.open_cover */
  service?: string;
  /** navigate: es. /lovelace/clima */
  path?: string;
  /** url: indirizzo da aprire */
  url?: string;
}

/** Luce di casa collegata a Home Assistant: punto in pianta, altezza e colore della luce */
export interface Light {
  id: ID;
  x: number;
  y: number;
  /** altezza da terra (cm) */
  z: number;
  /** entità di Home Assistant (es. light.cucina) */
  entityId: string;
  label?: string;
  /** colore della luce */
  color: string;
  /** potenza relativa 0…1 */
  intensity: number;
  /** Home Assistant: cosa succede toccandola sulla mappa (default: accendi/spegni) */
  tap?: TapAction;
}

export type SensorKind = 'temperature' | 'humidity' | 'co2' | 'door' | 'window' | 'generic';

/** sensori binari (aperto/chiuso): in Home Assistant sono binary_sensor */
export const BINARY_SENSORS: SensorKind[] = ['door', 'window'];

/** Sensore di Home Assistant mostrato in pianta con il suo valore (temperatura, umidità…) */
export interface Sensor {
  id: ID;
  x: number;
  y: number;
  entityId: string;
  kind: SensorKind;
  label?: string;
  /** Home Assistant: cosa succede toccandolo sulla mappa (default: info) */
  tap?: TapAction;
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
  /** assente nei progetti salvati prima delle telecamere */
  cameras?: Record<ID, Camera>;
  /** luci e sensori di Home Assistant (assenti nei progetti più vecchi) */
  lights?: Record<ID, Light>;
  sensors?: Record<ID, Sensor>;
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
  cameras: {},
  lights: {},
  sensors: {},
});

export const uid = () => Math.random().toString(36).slice(2, 10);
