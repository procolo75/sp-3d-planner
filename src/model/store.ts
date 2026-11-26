import { create } from 'zustand';
import { temporal } from 'zundo';
import { CATALOG_BY_ID } from '../catalog/catalog';
import type { V } from './geom';
import type { DetectedDoor, DetectedWall } from '../import/detectWalls';
import { projectOnSegment } from './geom';
import * as ops from './ops';
import { allowEmptySave } from './saveGuard';
import { CAMERA_COLORS, CAMERA_DEFAULTS } from './coverage';
import { emptyProject, uid, type Background, type Camera, type ID, type Item, type Light, type Sensor, type Opening, type OpeningType, type Project, type RoomLabel, type Wall } from './types';

const LOCK_KEY = 'sp3d-locked';
function readLocked() {
  try {
    return localStorage.getItem(LOCK_KEY) === '1';
  } catch {
    return false;
  }
}
/** attiva/disattiva il blocco degli spostamenti (ricordato in questo browser) */
export function setLocked(v: boolean) {
  useStore.setState({ locked: v });
  try {
    localStorage.setItem(LOCK_KEY, v ? '1' : '0');
  } catch {
    /* archiviazione non disponibile: il blocco vale solo per questa sessione */
  }
}

export type Tool = 'select' | 'wall' | 'door' | 'window' | 'arch' | 'sliding' | 'garage' | 'calibrate' | 'place' | 'detect' | 'camera' | 'light' | 'sensor';
export type Selection = { kind: 'wall' | 'opening' | 'item' | 'room' | 'node' | 'camera' | 'light' | 'sensor'; id: string } | null;

/** Punto risolto dallo snapping: nodo esistente, punto su un muro, o libero */
export type SnapPoint = { x: number; y: number; nodeId?: ID; wallId?: ID };

interface State {
  project: Project;
  tool: Tool;
  placeCatalogId: string | null;
  selection: Selection;
  wallThickness: number;
  wallHeight: number;
  view: '2d' | '3d' | 'split';
  showDims: boolean;
  /** mostra le zone viste dalle telecamere */
  showCoverage: boolean;
  /** «Blocca»: in Seleziona si sceglie ma non si sposta niente (utile col pennino/touch) */
  locked: boolean;
  /** stanza evidenziata (passando sopra al suo nome nell'elenco) */
  highlightRoom: string | null;
  /** «Arreda questa stanza»: punto (cm) dentro la stanza su cui concentrarsi; null = tutta la casa */
  focus: V | null;

  setTool(t: Tool): void;
  setView(v: State['view']): void;
  select(s: Selection): void;
  set<K extends keyof State>(k: K, v: State[K]): void;

  /** registra lo stato attuale nello storico e mette in pausa (per i trascinamenti) */
  beginDrag(): void;
  endDrag(): void;

  loadProject(p: Project): void;
  newProject(): void;
  rename(name: string): void;

  addWallSegment(from: SnapPoint, to: SnapPoint): ID | null;
  updateWall(id: ID, patch: Partial<Wall>): void;
  /** stesso colore a tutti i muri della casa */
  setAllWallsColor(color: string): void;
  setWallLength(id: ID, L: number): void;
  deleteWall(id: ID): void;
  moveNode(id: ID, at: V, normalizeAfter?: boolean): void;
  moveWall(id: ID, delta: V, base: Project): void;
  finishGeometryEdit(): void;

  addOpening(wallId: ID, type: OpeningType, offset: number): ID;
  updateOpening(id: ID, patch: Partial<Opening>): void;
  deleteOpening(id: ID): void;

  addItem(catalogId: string, at: V, rotation?: number): ID | null;
  /** misure/nome da usare per il prossimo mobile posizionato (mobile su misura) */
  placeOverrides: { label?: string; w?: number; d?: number; h?: number } | null;
  /** progetto come era all'ultimo salvataggio/apertura (per sapere se ci sono modifiche non salvate) */
  savedProject: Project | null;
  markSaved(p: Project): void;
  updateItem(id: ID, patch: Partial<Item>): void;
  deleteItem(id: ID): void;
  duplicateItem(id: ID): ID | null;

  addCamera(at: V, rotation: number): ID;
  updateCamera(id: ID, patch: Partial<Camera>): void;
  deleteCamera(id: ID): void;
  duplicateCamera(id: ID): ID | null;

  addLight(at: V): ID;
  updateLight(id: ID, patch: Partial<Light>): void;
  deleteLight(id: ID): void;
  addSensor(at: V): ID;
  updateSensor(id: ID, patch: Partial<Sensor>): void;
  deleteSensor(id: ID): void;

  setLabel(at: V, name: string, existingId?: ID, floorColor?: string, outdoor?: boolean): void;
  deleteLabel(id: ID): void;

  setBackground(bg: Background | undefined): void;
  updateBackground(patch: Partial<Background>): void;

  deleteSelection(): void;
  importDetected(walls: DetectedWall[], doors: DetectedDoor[], dropSmall?: boolean): void;
  /** riscala tutto il progetto (pianta, muri, aperture, posizione mobili) attorno a un punto */
  scaleProject(k: number, origin: V): void;
}

/** colori delle luci: calda (2700K), neutra (4000K), fredda (6000K) */
export const LIGHT_WARM = '#ffc78a';
export const LIGHT_COLORS = [
  { c: LIGHT_WARM, name: 'Calda' },
  { c: '#fff0d8', name: 'Neutra' },
  { c: '#dde9ff', name: 'Fredda' },
];

const OPENING_DEFAULTS: Record<OpeningType, Pick<Opening, 'width' | 'height' | 'sill'>> = {
  door: { width: 80, height: 210, sill: 0 },
  window: { width: 120, height: 140, sill: 95 },
  arch: { width: 90, height: 220, sill: 0 },
  sliding: { width: 152, height: 205, sill: 0 },
  garage: { width: 250, height: 215, sill: 0 },
};

export const useStore = create<State>()(
  temporal(
    (set, get) => {
      const mutate = (fn: (p: Project) => void) => {
        const p = ops.draft(get().project);
        fn(p);
        set({ project: p });
      };
      const resolve = (p: Project, sp: SnapPoint): ID => {
        if (sp.nodeId && p.nodes[sp.nodeId]) return sp.nodeId;
        if (sp.wallId && p.walls[sp.wallId]) return ops.splitWall(p, sp.wallId, sp);
        return ops.addNode(p, sp);
      };
      return {
        project: emptyProject(),
        tool: 'select',
        placeCatalogId: null,
        placeOverrides: null,
        savedProject: null,
        markSaved: (p) => {
          // aggiunge solo l'id: non è una modifica da annullare
          useStore.temporal.getState().pause();
          set({ project: p, savedProject: p });
          useStore.temporal.getState().resume();
        },
        selection: null,
        wallThickness: 12,
        wallHeight: 280,
        view: 'split',
        showDims: true,
        showCoverage: true,
        locked: readLocked(),
        highlightRoom: null,
        focus: null,

        setTool: (t) => set({ tool: t, ...(t !== 'place' ? { placeCatalogId: null, placeOverrides: null } : {}) }),
        setView: (v) => set({ view: v }),
        select: (s) => set({ selection: s }),
        set: (k, v) => set({ [k]: v } as Partial<State>),

        beginDrag: () => {
          set({ project: { ...get().project } });
          useStore.temporal.getState().pause();
        },
        endDrag: () => {
          useStore.temporal.getState().resume();
        },

        loadProject: (p) => {
          set({ project: p, selection: null, savedProject: p, focus: null });
          useStore.temporal.getState().clear();
        },
        newProject: () => {
          allowEmptySave();
          set({ project: emptyProject(), selection: null });
          useStore.temporal.getState().clear();
        },
        rename: (name) => mutate((p) => (p.name = name)),

        addWallSegment: (from, to) => {
          let id: ID | null = null;
          mutate((p) => {
            const a = resolve(p, from);
            const b = resolve(p, to);
            const { wallThickness, wallHeight } = get();
            id = ops.addWall(p, a, b, wallThickness, wallHeight);
            ops.normalize(p);
          });
          return id;
        },
        updateWall: (id, patch) => mutate((p) => p.walls[id] && (p.walls[id] = { ...p.walls[id], ...patch })),
        setAllWallsColor: (color) => mutate((p) => Object.values(p.walls).forEach((w) => (p.walls[w.id] = { ...w, color }))),
        setWallLength: (id, L) =>
          mutate((p) => {
            if (!p.walls[id]) return;
            ops.setWallLength(p, id, L);
            ops.normalize(p);
          }),
        deleteWall: (id) => {
          mutate((p) => ops.deleteWall(p, id));
          set({ selection: null });
        },
        moveNode: (id, at, normalizeAfter) =>
          mutate((p) => {
            if (!p.nodes[id]) return;
            p.nodes[id] = { ...p.nodes[id], x: at.x, y: at.y };
            if (normalizeAfter) ops.normalize(p);
          }),
        moveWall: (id, delta, base) =>
          mutate((p) => {
            const w = base.walls[id];
            if (!w) return;
            for (const nid of [w.a, w.b]) {
              const n = base.nodes[nid];
              if (n) p.nodes[nid] = { ...n, x: n.x + delta.x, y: n.y + delta.y };
            }
          }),
        finishGeometryEdit: () =>
          mutate((p) => {
            ops.normalize(p);
          }),

        addOpening: (wallId, type, offset) => {
          const id = uid();
          mutate((p) => {
            p.openings[id] = { id, wallId, type, offset, ...OPENING_DEFAULTS[type] };
          });
          return id;
        },
        updateOpening: (id, patch) => mutate((p) => p.openings[id] && (p.openings[id] = { ...p.openings[id], ...patch })),
        deleteOpening: (id) => {
          mutate((p) => delete p.openings[id]);
          set({ selection: null });
        },

        addItem: (catalogId, at, rotation = 0) => {
          const cat = CATALOG_BY_ID[catalogId];
          if (!cat) return null;
          const id = uid();
          mutate((p) => {
            const o = get().placeOverrides;
            p.items[id] = { id, catalogId, x: at.x, y: at.y, z: cat.z ?? 0, rotation, w: o?.w ?? cat.w, d: o?.d ?? cat.d, h: o?.h ?? cat.h, ...(o?.label ? { label: o.label } : {}) };
          });
          set({ placeOverrides: null });
          return id;
        },
        updateItem: (id, patch) => mutate((p) => p.items[id] && (p.items[id] = { ...p.items[id], ...patch })),
        deleteItem: (id) => {
          mutate((p) => delete p.items[id]);
          set({ selection: null });
        },
        duplicateItem: (id) => {
          const it = get().project.items[id];
          if (!it) return null;
          const nid = uid();
          mutate((p) => (p.items[nid] = { ...it, id: nid, x: it.x + 30, y: it.y + 30 }));
          set({ selection: { kind: 'item', id: nid } });
          return nid;
        },

        addCamera: (at, rotation) => {
          const id = uid();
          mutate((p) => {
            const used = new Set(Object.values(p.cameras!).map((c) => c.color));
            const n = Object.keys(p.cameras!).length;
            const color = CAMERA_COLORS.find((c) => !used.has(c)) ?? CAMERA_COLORS[n % CAMERA_COLORS.length];
            p.cameras![id] = { id, x: at.x, y: at.y, rotation, ...CAMERA_DEFAULTS, color, label: `Telecamera ${n + 1}` };
          });
          set({ selection: { kind: 'camera', id } });
          return id;
        },
        updateCamera: (id, patch) => mutate((p) => p.cameras![id] && (p.cameras![id] = { ...p.cameras![id], ...patch })),
        deleteCamera: (id) => {
          mutate((p) => delete p.cameras![id]);
          set({ selection: null });
        },
        duplicateCamera: (id) => {
          const c = get().project.cameras?.[id];
          if (!c) return null;
          const nid = uid();
          mutate((p) => {
            const used = new Set(Object.values(p.cameras!).map((x) => x.color));
            const color = CAMERA_COLORS.find((x) => !used.has(x)) ?? c.color;
            p.cameras![nid] = { ...c, id: nid, x: c.x + 40, y: c.y + 40, color, label: c.label ? c.label + ' (copia)' : undefined };
          });
          set({ selection: { kind: 'camera', id: nid } });
          return nid;
        },

        addLight: (at) => {
          const id = uid();
          mutate((p) => {
            const n = Object.keys(p.lights!).length;
            p.lights![id] = { id, x: Math.round(at.x), y: Math.round(at.y), z: 240, entityId: '', label: `Luce ${n + 1}`, color: LIGHT_WARM, intensity: 0.6 };
          });
          set({ selection: { kind: 'light', id } });
          return id;
        },
        updateLight: (id, patch) => mutate((p) => p.lights![id] && (p.lights![id] = { ...p.lights![id], ...patch })),
        deleteLight: (id) => {
          mutate((p) => delete p.lights![id]);
          set({ selection: null });
        },
        addSensor: (at) => {
          const id = uid();
          mutate((p) => {
            const n = Object.keys(p.sensors!).length;
            p.sensors![id] = { id, x: Math.round(at.x), y: Math.round(at.y), entityId: '', kind: 'temperature', label: `Sensore ${n + 1}` };
          });
          set({ selection: { kind: 'sensor', id } });
          return id;
        },
        updateSensor: (id, patch) => mutate((p) => p.sensors![id] && (p.sensors![id] = { ...p.sensors![id], ...patch })),
        deleteSensor: (id) => {
          mutate((p) => delete p.sensors![id]);
          set({ selection: null });
        },

        setLabel: (at, name, existingId, floorColor, outdoor) =>
          mutate((p) => {
            const id = existingId ?? uid();
            const prev: RoomLabel | undefined = p.labels[id];
            const out = outdoor ?? prev?.outdoor;
            p.labels[id] = { id, x: prev?.x ?? at.x, y: prev?.y ?? at.y, name, floorColor: floorColor ?? prev?.floorColor, ...(out ? { outdoor: true } : {}) };
          }),
        deleteLabel: (id) => mutate((p) => delete p.labels[id]),

        setBackground: (bg) => mutate((p) => (p.background = bg)),
        updateBackground: (patch) => mutate((p) => p.background && (p.background = { ...p.background, ...patch })),

        importDetected: (walls, doors, dropSmall) =>
          mutate((p) => {
            const H = get().wallHeight;
            for (const w of walls) {
              const a = ops.addNode(p, { x: w.ax, y: w.ay });
              const b = ops.addNode(p, { x: w.bx, y: w.by });
              ops.addWall(p, a, b, w.thickness, H);
            }
            ops.normalize(p);
            if (dropSmall) ops.dropSmallComponents(p, 0.2);
            for (const d of doors) {
              let best: string | null = null;
              let bd = Infinity;
              for (const w of Object.values(p.walls)) {
                const pr = projectOnSegment(d, p.nodes[w.a], p.nodes[w.b]);
                if (pr.dist < bd && pr.t > 0 && pr.t < 1) {
                  bd = pr.dist;
                  best = w.id;
                }
              }
              if (!best || bd > 10) continue;
              const id = uid();
              const type = d.type ?? 'door';
              const width = type === 'door' ? Math.min(110, d.width) : d.width;
              p.openings[id] = { id, wallId: best, type, offset: offsetOnWall(p, best, d), width, ...(type === 'window' ? { height: d.height ?? 140, sill: d.sill ?? 95 } : { height: type === 'door' ? 210 : 220, sill: 0 }) };
            }
          }),

        scaleProject: (k, o) =>
          mutate((p) => {
            const sc = (q: { x: number; y: number }) => ({ x: o.x + (q.x - o.x) * k, y: o.y + (q.y - o.y) * k });
            for (const n of Object.values(p.nodes)) p.nodes[n.id] = { ...n, ...sc(n) };
            for (const w of Object.values(p.walls)) p.walls[w.id] = { ...w, thickness: Math.max(3, Math.round(w.thickness * k)) };
            for (const op of Object.values(p.openings)) p.openings[op.id] = { ...op, offset: op.offset * k, width: Math.round(op.width * k) };
            for (const it of Object.values(p.items)) p.items[it.id] = { ...it, ...sc(it) };
            for (const l of Object.values(p.labels)) p.labels[l.id] = { ...l, ...sc(l) };
            for (const c of Object.values(p.cameras!)) p.cameras![c.id] = { ...c, ...sc(c), range: c.range * k };
            for (const l of Object.values(p.lights!)) p.lights![l.id] = { ...l, ...sc(l) };
            for (const x of Object.values(p.sensors!)) p.sensors![x.id] = { ...x, ...sc(x) };
            if (p.background) {
              const b = p.background;
              p.background = { ...b, cmPerPx: b.cmPerPx * k, ...sc({ x: b.x, y: b.y }) };
            }
          }),

        deleteSelection: () => {
          const s = get().selection;
          if (!s) return;
          if (s.kind === 'wall') get().deleteWall(s.id);
          else if (s.kind === 'opening') get().deleteOpening(s.id);
          else if (s.kind === 'item') get().deleteItem(s.id);
          else if (s.kind === 'camera') get().deleteCamera(s.id);
          else if (s.kind === 'light') get().deleteLight(s.id);
          else if (s.kind === 'sensor') get().deleteSensor(s.id);
        },
      };
    },
    {
      partialize: (s) => ({ project: s.project }),
      limit: 200,
      equality: (a, b) => a.project === b.project,
    },
  ),
);

export const undo = () => useStore.temporal.getState().undo();
export const redo = () => useStore.temporal.getState().redo();

/** offset (cm dal nodo a) del punto proiettato sul muro */
export function offsetOnWall(p: Project, wallId: ID, at: V) {
  const w = p.walls[wallId];
  const A = p.nodes[w.a];
  const B = p.nodes[w.b];
  const pr = projectOnSegment(at, A, B);
  return pr.t * Math.hypot(B.x - A.x, B.y - A.y);
}

/** true se il progetto ha modifiche rispetto all'ultimo salvataggio (confronta i contenuti, non la sola identità) */
export function isDirty(s: { project: Project; savedProject: Project | null }) {
  const p = s.project;
  const q = s.savedProject;
  if (!p.id || !q) return true;
  return p.nodes !== q.nodes || p.walls !== q.walls || p.openings !== q.openings || p.items !== q.items || p.labels !== q.labels || p.cameras !== q.cameras || p.lights !== q.lights || p.sensors !== q.sensors || p.background !== q.background || p.name !== q.name;
}
