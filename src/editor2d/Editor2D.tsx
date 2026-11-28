import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CATALOG_BY_ID, itemParts, type scaledParts } from '../catalog/catalog';
import { animateDoor, animatePocket, DOOR_OPEN_DEFAULT, openingOpen } from '../model/pocketAnim';
import { derive, focusedRoom, useDerived, type Derived } from '../model/derived';
import { add, dist, dot, mul, norm, perp, pointInPolygon, projectOnSegment, roomSides, sub, v, lineIntersect, type Room, type RoomSide, type V } from '../model/geom';
import { offsetOnWall, redo, undo, useStore, type SnapPoint, type Tool } from '../model/store';
import type { Camera, Item, Light, Opening, OpeningType, Project, Sensor } from '../model/types';
import { cameraCoverage, useCoverage } from '../model/coverage';
import { parseLength } from '../import/pdf';
import { detectOnBackground } from '../import/runDetection';
import { itemCorners, magnetCamera, magnetToWall, openingDistances, wallDistances } from './snapping';

const st0 = () => useStore.getState();

/** larghezza iniziale per tipo di apertura (SKYTTA: 152 cm) */
const OPENING_WIDTH: Record<string, number> = { door: 80, window: 120, frenchWindow: 120, arch: 90, sliding: 152, garage: 250 };
const OPENING_TOOLS = new Set<Tool>(['door', 'window', 'frenchWindow', 'arch', 'sliding', 'garage']);
/** la portafinestra è una finestra con il davanzale a terra */
const openingOf = (t: Tool) => (t === 'frenchWindow' ? 'window' : (t as OpeningType));
const FRENCH_WINDOW = { sill: 0, height: 220 };
/** il pilastro si mette con il suo strumento, gli altri mobili dal catalogo */
const placingId = (tool: Tool, placeCatalogId: string | null) => (tool === 'pillar' ? 'pillar' : tool === 'place' ? placeCatalogId : null);

interface View {
  cx: number;
  cy: number;
  zoom: number; // px per cm
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; v0: View; moved: boolean ; keepSel?: boolean }
  | { kind: 'node'; id: string }
  | { kind: 'wall'; id: string; start: V; base: Project; moved: boolean }
  | { kind: 'item'; id: string; off: V; moved: boolean }
  | { kind: 'rotate'; id: string }
  | { kind: 'opening'; id: string }
  | { kind: 'camera'; id: string; off: V; moved: boolean }
  | { kind: 'aim'; id: string }
  | { kind: 'light' | 'sensor'; id: string; off: V };

const NODE_SNAP_PX = 12;
const WALL_SNAP_PX = 10;
const ALIGN_PX = 8;

export function Editor2D() {
  const project = useStore((s) => s.project);
  const tool = useStore((s) => s.tool);
  const selection = useStore((s) => s.selection);
  const placeCatalogId = useStore((s) => s.placeCatalogId);
  const showDims = useStore((s) => s.showDims);
  const highlightRoom = useStore((s) => s.highlightRoom);
  const focus = useStore((s) => s.focus);
  const showCoverage = useStore((s) => s.showCoverage);
  const der = useDerived(project);
  const cov = useCoverage(project, der.corners);
  const focusKey = focusedRoom(der, focus)?.key ?? null;

  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ cx: 500, cy: 400, zoom: 0.8 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [hover, setHover] = useState<(SnapPoint & { guides?: V[][]; straight?: V[] }) | null>(null);
  const [rawHover, setRawHover] = useState<V | null>(null);
  const [drawStart, setDrawStart] = useState<SnapPoint | null>(null);
  // cambiando strumento spariscono le guide rimaste a schermo
  useEffect(() => {
    setHover(null);
  }, [tool]);
  /** aggiunge un tratto: il muro è la linea disegnata, lo spessore non conta */
  const commitSegment = (s: SnapPoint, e: SnapPoint) => {
    useStore.getState().addWallSegment(s, e);
    setDrawStart({ x: e.x, y: e.y });
  };
  const [typed, setTyped] = useState('');
  const [calib, setCalib] = useState<V[]>([]);
  const [roi, setRoi] = useState<{ a: V; b: V } | null>(null);
  const [detecting, setDetecting] = useState('');
  const [calibInput, setCalibInput] = useState('');
  const [spaceDown, setSpaceDown] = useState(false);
  const dragRef = useRef<Drag | null>(null);
  const [, force] = useState(0);

  // --- dimensioni e vista iniziale --------------------------------------------
  useEffect(() => {
    const el = svgRef.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const p = useStore.getState().project;
    const xs: number[] = [];
    const ys: number[] = [];
    // modalità «arreda questa stanza»: inquadra solo la stanza
    const fr = focusedRoom(derive(p), useStore.getState().focus);
    if (fr) {
      const r0 = svgRef.current!.getBoundingClientRect();
      const fx = fr.poly.map((q) => q.x);
      const fy = fr.poly.map((q) => q.y);
      const [a0, a1, b0, b1] = [Math.min(...fx), Math.max(...fx), Math.min(...fy), Math.max(...fy)];
      const zoom = Math.min(r0.width / (a1 - a0 + 120), r0.height / (b1 - b0 + 120));
      return setView({ cx: (a0 + a1) / 2, cy: (b0 + b1) / 2, zoom });
    }
    for (const n of Object.values(p.nodes)) {
      xs.push(n.x);
      ys.push(n.y);
    }
    for (const it of Object.values(p.items)) {
      xs.push(it.x);
      ys.push(it.y);
    }
    if (p.background?.visible) {
      const b = p.background;
      xs.push(b.x, b.x + b.widthPx * b.cmPerPx);
      ys.push(b.y, b.y + b.heightPx * b.cmPerPx);
    }
    if (!xs.length) return setView({ cx: 500, cy: 400, zoom: 0.8 });
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const r = svgRef.current!.getBoundingClientRect();
    const zoom = Math.min(r.width / Math.max(100, x1 - x0 + 150), r.height / Math.max(100, y1 - y0 + 150));
    setView({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, zoom });
  }, []);

  useEffect(() => {
    const h = () => fit();
    window.addEventListener('planner:fit', h);
    const t = setTimeout(fit, 50);
    return () => {
      window.removeEventListener('planner:fit', h);
      clearTimeout(t);
    };
  }, [fit]);

  useEffect(() => {
    const t = setTimeout(fit, 30);
    return () => clearTimeout(t);
  }, [focus, fit]);

  // reset stato strumenti quando cambia lo strumento
  useEffect(() => {
    setDrawStart(null);
    setTyped('');
    setCalib([]);
    setCalibInput('');
  }, [tool]);

  const toWorld = useCallback(
    (clientX: number, clientY: number): V => {
      const r = svgRef.current!.getBoundingClientRect();
      const vw = viewRef.current;
      return { x: vw.cx + (clientX - r.left - r.width / 2) / vw.zoom, y: vw.cy + (clientY - r.top - r.height / 2) / vw.zoom };
    },
    [],
  );

  // --- snapping ----------------------------------------------------------------
  const snap = useCallback(
    (p: V, opts: { from?: V | null; anchors?: V[]; exclude?: string; free?: boolean }): SnapPoint & { guides?: V[][]; straight?: V[] } => {
      const pr = useStore.getState().project;
      const z = viewRef.current.zoom;
      if (opts.free) return { x: p.x, y: p.y };
      // 1. nodi
      let best: { id: string; d: number } | null = null;
      for (const n of Object.values(pr.nodes)) {
        if (n.id === opts.exclude) continue;
        const d = dist(n, p);
        if (d < NODE_SNAP_PX / z && (!best || d < best.d)) best = { id: n.id, d };
      }
      if (best) return { x: pr.nodes[best.id].x, y: pr.nodes[best.id].y, nodeId: best.id };
      // 1b. punti di aggancio: metà di ogni muro
      for (const w of Object.values(pr.walls)) {
        if (w.a === opts.exclude || w.b === opts.exclude) continue;
        const m = v((pr.nodes[w.a].x + pr.nodes[w.b].x) / 2, (pr.nodes[w.a].y + pr.nodes[w.b].y) / 2);
        if (dist(m, p) < NODE_SNAP_PX / z) return { x: m.x, y: m.y, wallId: w.id };
      }

      let q = { ...p };
      const guides: V[][] = [];
      let angleDir: V | null = null;
      // 2. linea dritta (0/45/90...) rispetto al punto di partenza o ai nodi vicini di quello trascinato
      let from: V | null = null;
      let bestErr = Infinity;
      for (const o of opts.from ? [opts.from] : (opts.anchors ?? [])) {
        const d = sub(p, o);
        const L = Math.hypot(d.x, d.y);
        if (L < 1) continue;
        const ang = Math.atan2(d.y, d.x);
        const step = Math.PI / 4;
        const snapped = Math.round(ang / step) * step;
        // orizzontale/verticale: tolleranza ampia, diagonali più stretta
        const tol = (Math.round(ang / step) % 2 === 0 ? 10 : 4) * (Math.PI / 180);
        const err = Math.abs(snapped - ang);
        if (err < tol && err < bestErr) {
          bestErr = err;
          from = o;
          angleDir = v(Math.cos(snapped), Math.sin(snapped));
          q = add(o, mul(angleDir, dot(d, angleDir)));
        }
      }
      // 3. allineamenti con altri nodi
      let ax: number | null = null;
      let ay: number | null = null;
      for (const n of Object.values(pr.nodes)) {
        if (n.id === opts.exclude) continue;
        if (ax === null && Math.abs(n.x - q.x) < ALIGN_PX / z) {
          ax = n.x;
          guides.push([v(n.x, n.y), v(n.x, q.y)]);
        }
        if (ay === null && Math.abs(n.y - q.y) < ALIGN_PX / z) {
          ay = n.y;
          guides.push([v(n.x, n.y), v(q.x, n.y)]);
        }
      }
      if (angleDir && from) {
        // mantieni la direzione: interseca il raggio con la linea di allineamento
        if (ax !== null && Math.abs(angleDir.x) > 0.01) q = lineIntersect(from, angleDir, v(ax, 0), v(0, 1)) ?? q;
        else if (ay !== null && Math.abs(angleDir.y) > 0.01) q = lineIntersect(from, angleDir, v(0, ay), v(1, 0)) ?? q;
      } else {
        if (ax !== null) q.x = ax;
        if (ay !== null) q.y = ay;
      }
      // guida della linea dritta: lunga, attraverso il punto di partenza
      const straight = angleDir && from ? [add(from, mul(angleDir, -100000)), add(from, mul(angleDir, 100000))] : undefined;
      // 4. muri
      for (const w of Object.values(pr.walls)) {
        if (w.a === opts.exclude || w.b === opts.exclude) continue;
        const A = pr.nodes[w.a];
        const B = pr.nodes[w.b];
        const pj = projectOnSegment(q, A, B);
        if (pj.dist < Math.max(WALL_SNAP_PX / z, w.thickness / 2) && pj.t > 0.001 && pj.t < 0.999) {
          let pt = pj.point;
          if (angleDir && from) pt = lineIntersect(from, angleDir, A, sub(B, A)) ?? pt;
          return { x: pt.x, y: pt.y, wallId: w.id, guides, straight };
        }
      }
      // 5. griglia
      if (ax === null && ay === null && !angleDir) {
        const g = z < 1.5 ? 5 : 1;
        q = v(Math.round(q.x / g) * g, Math.round(q.y / g) * g);
      }
      return { x: q.x, y: q.y, guides, straight };
    },
    [],
  );

  // --- hit test ----------------------------------------------------------------
  const hitTest = useCallback(
    (p: V): { kind: 'node' | 'wall' | 'opening' | 'item' | 'room' | 'rotate' | 'camera' | 'aim' | 'light' | 'sensor'; id: string } | null => {
      const st = useStore.getState();
      const pr = st.project;
      const z = viewRef.current.zoom;
      const sel = st.selection;
      // maniglia di rotazione dell'oggetto selezionato
      if (sel?.kind === 'item' && pr.items[sel.id]) {
        const h = rotateHandlePos(pr.items[sel.id], z);
        if (dist(h, p) < 10 / z) return { kind: 'rotate', id: sel.id };
      }
      // telecamere: maniglia della direzione, poi il simbolo
      const cams = pr.cameras ?? {};
      if (sel?.kind === 'camera' && cams[sel.id] && dist(aimHandlePos(cams[sel.id], z), p) < 10 / z) return { kind: 'aim', id: sel.id };
      for (const c of Object.values(cams)) if (dist(c, p) < 11 / z) return { kind: 'camera', id: c.id };
      // luci e sensori di Home Assistant
      for (const l of Object.values(pr.lights ?? {})) if (dist(l, p) < 10 / z) return { kind: 'light', id: l.id };
      for (const x of Object.values(pr.sensors ?? {})) if (dist(x, p) < 10 / z) return { kind: 'sensor', id: x.id };
      // nodi (solo vicino a un muro selezionato o con zoom alto)
      for (const n of Object.values(pr.nodes)) if (dist(n, p) < 7 / z) return { kind: 'node', id: n.id };
      // aperture (se più aperture si sovrappongono, ogni clic passa alla successiva)
      const hits: string[] = [];
      for (const o of Object.values(pr.openings)) {
        const w = pr.walls[o.wallId];
        if (!w) continue;
        const A = pr.nodes[w.a];
        const B = pr.nodes[w.b];
        const pj = projectOnSegment(p, A, B);
        const off = pj.t * dist(A, B);
        if (pj.dist < w.thickness / 2 + 4 / z && Math.abs(off - o.offset) < o.width / 2) hits.push(o.id);
      }
      if (hits.length) {
        // la più stretta per prima (di solito è quella "nascosta" sotto l'altra)
        hits.sort((a, b) => pr.openings[a].width - pr.openings[b].width);
        const cur = sel?.kind === 'opening' ? hits.indexOf(sel.id) : -1;
        return { kind: 'opening', id: hits[(cur + 1) % hits.length] };
      }
      // mobili (dall'ultimo, cioè quello sopra)
      const items = Object.values(pr.items).sort((a, b) => b.z + b.h - (a.z + a.h));
      for (const it of items) if (pointInPolygon(p, itemCorners(it))) return { kind: 'item', id: it.id };
      // muri
      for (const w of Object.values(pr.walls)) {
        const pj = projectOnSegment(p, pr.nodes[w.a], pr.nodes[w.b]);
        if (pj.dist < w.thickness / 2 + 3 / z) return { kind: 'wall', id: w.id };
      }
      return null;
    },
    [],
  );

  const roomAt = useCallback((p: V, d: Derived) => d.rooms.find((r) => pointInPolygon(p, r.poly)) ?? null, []);
  const derRef = useRef(der);
  derRef.current = der;

  // --- eventi puntatore ----------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent) => {
    const st = useStore.getState();
    const p = toWorld(e.clientX, e.clientY);
    (e.target as Element).setPointerCapture?.(e.pointerId);

    if (e.button === 1 || e.button === 2 || spaceDown) {
      if (e.button === 2 && st.tool === 'wall' && drawStart) {
        setDrawStart(null);
        setTyped('');
        return;
      }
      dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, v0: viewRef.current, moved: false };
      return;
    }

    if (st.tool === 'wall') {
      const sp = snap(p, { from: drawStart, free: e.shiftKey });
      if (!drawStart) {
        setDrawStart(sp);
      } else if (dist(sp, drawStart) > 1) {
        commitSegment(drawStart, sp);
        setTyped('');
      }
      return;
    }

    if (OPENING_TOOLS.has(st.tool)) {
      const h = nearestWall(st.project, p, 30 / viewRef.current.zoom);
      if (h) {
        const w = st.project.walls[h];
        const L = dist(st.project.nodes[w.a], st.project.nodes[w.b]);
        const def = OPENING_WIDTH[st.tool];
        const off = clamp(Math.round(offsetOnWall(st.project, h, p)), def / 2, L - def / 2);
        const id = st.addOpening(h, openingOf(st.tool), off, st.tool === 'frenchWindow' ? FRENCH_WINDOW : undefined);
        st.select({ kind: 'opening', id });
      }
      return;
    }

    if (st.tool === 'camera') {
      const m = e.shiftKey ? null : magnetCamera(st.project, p);
      st.addCamera(m ?? { x: Math.round(p.x), y: Math.round(p.y) }, m?.rotation ?? 0);
      st.setTool('select');
      return;
    }

    if (st.tool === 'light' || st.tool === 'sensor') {
      if (st.tool === 'light') st.addLight(p);
      else st.addSensor(p);
      st.setTool('select');
      return;
    }

    if (st.tool === 'detect') {
      setRoi({ a: p, b: p });
      return;
    }

    if (st.tool === 'calibrate') {
      if (calib.length >= 2) setCalib([p]);
      else setCalib([...calib, p]);
      return;
    }

    const placeId = placingId(st.tool, placeCatalogId);
    if (placeId) {
      const cat = CATALOG_BY_ID[placeId];
      const tmp: Item = { id: '_', catalogId: cat.id, x: p.x, y: p.y, z: cat.z ?? 0, rotation: 0, w: st0().placeOverrides?.w ?? cat.w, d: st0().placeOverrides?.d ?? cat.d, h: st0().placeOverrides?.h ?? cat.h };
      const m = e.shiftKey ? null : magnetToWall(st.project, tmp, der);
      if (m?.d) useStore.setState({ placeOverrides: { ...st0().placeOverrides, d: m.d } });
      const id = st.addItem(placeId, m ?? { x: Math.round(p.x), y: Math.round(p.y) }, m?.rotation ?? 0);
      if (id) st.select({ kind: 'item', id });
      // i pilastri di solito sono tanti: lo strumento resta attivo (Esc per finire)
      if (st.tool !== 'pillar') st.setTool('select');
      return;
    }

    // selezione
    const hit = hitTest(p);
    if (st.locked) {
      // bloccato: il tocco seleziona soltanto, trascinando si sposta la vista
      const sel = hit && hit.kind !== 'rotate' && hit.kind !== 'aim' ? { kind: hit.kind, id: hit.id } : null;
      if (sel) st.select(sel);
      dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, v0: viewRef.current, moved: false, keepSel: !!sel };
      return;
    }
    if (hit?.kind === 'rotate') {
      st.beginDrag();
      dragRef.current = { kind: 'rotate', id: hit.id };
      return;
    }
    if (hit?.kind === 'aim') {
      st.beginDrag();
      dragRef.current = { kind: 'aim', id: hit.id };
      return;
    }
    if (hit?.kind === 'camera') {
      st.select({ kind: 'camera', id: hit.id });
      st.beginDrag();
      dragRef.current = { kind: 'camera', id: hit.id, off: sub(p, st.project.cameras![hit.id]), moved: false };
      return;
    }
    if (hit?.kind === 'light' || hit?.kind === 'sensor') {
      st.select({ kind: hit.kind, id: hit.id });
      const at = hit.kind === 'light' ? st.project.lights![hit.id] : st.project.sensors![hit.id];
      st.beginDrag();
      dragRef.current = { kind: hit.kind, id: hit.id, off: sub(p, at) };
      return;
    }
    if (hit?.kind === 'node') {
      st.beginDrag();
      st.select({ kind: 'node', id: hit.id });
      dragRef.current = { kind: 'node', id: hit.id };
      return;
    }
    if (hit?.kind === 'opening') {
      st.select({ kind: 'opening', id: hit.id });
      st.beginDrag();
      dragRef.current = { kind: 'opening', id: hit.id };
      return;
    }
    if (hit?.kind === 'item') {
      st.select({ kind: 'item', id: hit.id });
      const it = st.project.items[hit.id];
      st.beginDrag();
      dragRef.current = { kind: 'item', id: hit.id, off: sub(p, it), moved: false };
      return;
    }
    if (hit?.kind === 'wall') {
      st.select({ kind: 'wall', id: hit.id });
      st.beginDrag();
      dragRef.current = { kind: 'wall', id: hit.id, start: p, base: st.project, moved: false };
      return;
    }
    dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, v0: viewRef.current, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const st = useStore.getState();
    const p = toWorld(e.clientX, e.clientY);
    setRawHover(p);
    if (st.tool === 'detect' && roi && e.buttons & 1) {
      setRoi({ a: roi.a, b: p });
      return;
    }
    const d = dragRef.current;
    if (d) {
      if (d.kind === 'pan') {
        const dx = e.clientX - d.sx;
        const dy = e.clientY - d.sy;
        if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
        setView({ ...d.v0, cx: d.v0.cx - dx / d.v0.zoom, cy: d.v0.cy - dy / d.v0.zoom });
      } else if (d.kind === 'node') {
        const pr = st.project;
        const anchors = Object.values(pr.walls)
          .filter((w) => w.a === d.id || w.b === d.id)
          .map((w) => pr.nodes[w.a === d.id ? w.b : w.a]);
        const sp = snap(p, { exclude: d.id, anchors, free: e.shiftKey });
        setHover(sp);
        st.moveNode(d.id, sp);
      } else if (d.kind === 'wall') {
        const w = d.base.walls[d.id];
        const dir = norm(sub(d.base.nodes[w.b], d.base.nodes[w.a]));
        const n = perp(dir);
        let k = dot(sub(p, d.start), n);
        if (!e.shiftKey) k = Math.round(k);
        if (Math.abs(k) > 0.5) d.moved = true;
        if (d.moved) st.moveWall(d.id, mul(n, k), d.base);
      } else if (d.kind === 'item') {
        const it = st.project.items[d.id];
        if (!it) return;
        const target = sub(p, d.off);
        d.moved = true;
        const m = e.shiftKey ? null : magnetToWall(st.project, { ...it, x: target.x, y: target.y }, derRef.current);
        st.updateItem(d.id, m ? { x: m.x, y: m.y, rotation: m.rotation, ...(m.d ? { d: m.d } : {}) } : { x: Math.round(target.x), y: Math.round(target.y) });
      } else if (d.kind === 'camera') {
        const c = st.project.cameras?.[d.id];
        if (!c) return;
        const target = sub(p, d.off);
        d.moved = true;
        const m = e.shiftKey ? null : magnetCamera(st.project, target);
        if (!m) st.updateCamera(d.id, { x: Math.round(target.x), y: Math.round(target.y) });
        else {
          // se ora guarderebbe dentro il muro, si gira verso la stanza; altrimenti tiene la sua direzione
          const nat = { x: Math.cos(m.rotation), y: Math.sin(m.rotation) };
          const into = Math.cos(c.rotation) * nat.x + Math.sin(c.rotation) * nat.y < 0.05;
          st.updateCamera(d.id, { x: m.x, y: m.y, ...(into ? { rotation: m.rotation } : {}) });
        }
      } else if (d.kind === 'light' || d.kind === 'sensor') {
        const t = sub(p, d.off);
        const at = { x: Math.round(t.x), y: Math.round(t.y) };
        if (d.kind === 'light') st.updateLight(d.id, at);
        else st.updateSensor(d.id, at);
      } else if (d.kind === 'aim') {
        const c = st.project.cameras?.[d.id];
        if (!c) return;
        let a = Math.atan2(p.y - c.y, p.x - c.x);
        if (!e.shiftKey) a = Math.round(a / (Math.PI / 36)) * (Math.PI / 36);
        st.updateCamera(d.id, { rotation: a });
      } else if (d.kind === 'rotate') {
        const it = st.project.items[d.id];
        let a = Math.atan2(p.y - it.y, p.x - it.x) + Math.PI / 2;
        if (!e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
        st.updateItem(d.id, { rotation: a });
      } else if (d.kind === 'opening') {
        const o = st.project.openings[d.id];
        const w = st.project.walls[o.wallId];
        const L = dist(st.project.nodes[w.a], st.project.nodes[w.b]);
        let off = offsetOnWall(st.project, o.wallId, p);
        if (!e.shiftKey) off = Math.round(off);
        st.updateOpening(d.id, { offset: clamp(off, o.width / 2, L - o.width / 2) });
      }
      return;
    }
    if (st.tool === 'wall') setHover(snap(p, { from: drawStart, free: e.shiftKey }));
    else setHover(null);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const st = useStore.getState();
    if (st.tool === 'detect' && roi) {
      const r = roi;
      setRoi(null);
      if (Math.abs(r.a.x - r.b.x) < 50 || Math.abs(r.a.y - r.b.y) < 50) return;
      setDetecting('Riconoscimento muri…');
      const bg = st.project.background;
      if (!bg) return;
      const px = (q: V) => ({ x: (q.x - bg.x) / bg.cmPerPx, y: (q.y - bg.y) / bg.cmPerPx });
      const pa = px(r.a);
      const pb = px(r.b);
      detectOnBackground(bg, { x0: Math.min(pa.x, pb.x), y0: Math.min(pa.y, pb.y), x1: Math.max(pa.x, pb.x), y1: Math.max(pa.y, pb.y) })
        .then((res) => {
          if (!res.walls.length) return 'Nessun muro riconosciuto in quest\'area';
          st.importDetected(res.walls, res.doors);
          return `Riconosciuti ${res.walls.length} tratti di muro — controlla e correggi (⌘Z per annullare)`;
        })
        .then((n) => {
          setDetecting(n);
          setTimeout(() => setDetecting(''), 4000);
          st.setTool('select');
        })
        .catch((err) => setDetecting('Errore: ' + (err as Error).message));
      return;
    }
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.kind === 'pan') {
      if (!d.moved && !d.keepSel && e.button === 0 && st.tool === 'select') {
        const p = toWorld(e.clientX, e.clientY);
        const r = roomAt(p, derRef.current);
        st.select(r ? { kind: 'room', id: r.key } : null);
      }
      return;
    }
    if (d.kind === 'node' || d.kind === 'wall') {
      st.endDrag();
      if (d.kind === 'wall' && !d.moved) return;
      // ricompone incroci e unioni senza creare un passo di undo separato
      useStore.temporal.getState().pause();
      st.finishGeometryEdit();
      useStore.temporal.getState().resume();
      setHover(null);
      return;
    }
    st.endDrag();
    force((x) => x + 1);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (useStore.getState().tool === 'wall') {
      setDrawStart(null);
      setTyped('');
      return;
    }
    // doppio clic su una porta a scomparsa: la apre o la chiude
    // doppio clic su una porta normale: gira l'anta
    const hit = hitTest(toWorld(e.clientX, e.clientY));
    const pr = useStore.getState().project;
    if (hit?.kind === 'opening' && (pr.openings[hit.id]?.type === 'door' || pr.openings[hit.id]?.type === 'garage')) return animateDoor(hit.id);
    const it = hit?.kind === 'item' ? pr.items[hit.id] : null;
    if (it && CATALOG_BY_ID[it.catalogId]?.pocket) animatePocket(it.id);
  };

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const vw = viewRef.current;
    const r = svgRef.current!.getBoundingClientRect();
    const isZoom = e.ctrlKey || (e.deltaX === 0 && Math.abs(e.deltaY) >= 40 && Number.isInteger(e.deltaY));
    if (isZoom) {
      const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      const zoom = clamp(vw.zoom * k, 0.05, 20);
      const mx = e.clientX - r.left - r.width / 2;
      const my = e.clientY - r.top - r.height / 2;
      const wx = vw.cx + mx / vw.zoom;
      const wy = vw.cy + my / vw.zoom;
      setView({ zoom, cx: wx - mx / zoom, cy: wy - my / zoom });
    } else {
      setView({ ...vw, cx: vw.cx + e.deltaX / vw.zoom, cy: vw.cy + e.deltaY / vw.zoom });
    }
  }, []);
  useEffect(() => {
    const el = svgRef.current!;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  // --- tastiera -----------------------------------------------------------------
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT')) return;
      const st = useStore.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd' && st.selection?.kind === 'item') {
        e.preventDefault();
        st.duplicateItem(st.selection.id);
        return;
      }
      if (mod && e.key.toLowerCase() === 'd' && st.selection?.kind === 'camera') {
        e.preventDefault();
        st.duplicateCamera(st.selection.id);
        return;
      }
      if (e.key === ' ') {
        setSpaceDown(true);
        return;
      }
      if (st.tool === 'wall' && drawStartRef.current) {
        if (/^[0-9.,]$/.test(e.key) || (e.key === 'm' && typedRef.current) || (e.key === 'c' && typedRef.current)) {
          setTyped((t) => t + e.key);
          return;
        }
        if (e.key === 'Backspace') {
          setTyped((t) => t.slice(0, -1));
          return;
        }
        if (e.key === 'Enter' && typedRef.current) {
          const L = parseLength(typedRef.current.replace(/c$/, 'cm'));
          const s = drawStartRef.current;
          const h = hoverRef.current;
          if (L && s) {
            const dir = h && dist(h, s) > 0.5 ? norm(sub(h, s)) : v(1, 0);
            // la misura è lo spazio utile: dalla faccia del muro di partenza (mai dall'asse);
            // se l'estremo resta libero è la punta del muro, se poi si gira l'angolo si allunga da solo
            // la misura è la linea: lo spessore dei muri non esiste
            commitSegment(s, add(s, mul(dir, L)));
          }
          setTyped('');
          return;
        }
      }
      if (e.key === 'Escape') {
        if (st.tool === 'wall' && drawStartRef.current) {
          setDrawStart(null);
          setTyped('');
        } else if (st.tool !== 'select') st.setTool('select');
        else st.select(null);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        st.deleteSelection();
        return;
      }
      if (e.key.toLowerCase() === 'r' && st.selection?.kind === 'camera') {
        const c = st.project.cameras?.[st.selection.id];
        if (c) st.updateCamera(c.id, { rotation: c.rotation + (e.shiftKey ? -1 : 1) * (Math.PI / 12) });
        return;
      }
      if (e.key.toLowerCase() === 'r' && st.selection?.kind === 'item') {
        const it = st.project.items[st.selection.id];
        st.updateItem(it.id, { rotation: it.rotation + (e.shiftKey ? Math.PI / 12 : Math.PI / 2) });
        return;
      }
      if (!mod) {
        const k = e.key.toLowerCase();
        if (k === 'v') st.setTool('select');
        if (k === 'w') st.setTool('wall');
        if (k === 'p') st.setTool('door');
        if (k === 'f') st.setTool('window');
        if (k === 'b') st.setTool('frenchWindow');
        if (k === 't') st.setTool('camera');
        if (k === 'l') st.setTool('light');
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpaceDown(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);
  const drawStartRef = useRef(drawStart);
  drawStartRef.current = drawStart;
  const typedRef = useRef(typed);
  typedRef.current = typed;
  const hoverRef = useRef(hover);
  hoverRef.current = hover;

  // --- rendering ----------------------------------------------------------------
  const z = view.zoom;
  const vb = `${view.cx - size.w / 2 / z} ${view.cy - size.h / 2 / z} ${size.w / z} ${size.h / z}`;
  const fs = (px: number) => px / z;

  const bg = project.background;
  const selWall = selection?.kind === 'wall' ? selection.id : null;

  const openingHover = useMemo(() => {
    if (!OPENING_TOOLS.has(tool) || !rawHover) return null;
    const wid = nearestWall(project, rawHover, 30 / z);
    if (!wid) return null;
    const w = project.walls[wid];
    const L = dist(project.nodes[w.a], project.nodes[w.b]);
    const width = Math.min(OPENING_WIDTH[tool], dist(project.nodes[w.a], project.nodes[w.b]));
    const o: Opening = { id: '_', wallId: wid, type: openingOf(tool), offset: clamp(offsetOnWall(project, wid, rawHover), width / 2, L - width / 2), width, height: 0, sill: 0 };
    return o;
  }, [tool, rawHover, project, z]);

  const placeGhost = useMemo(() => {
    const placeId = placingId(tool, placeCatalogId);
    if (!placeId || !rawHover) return null;
    const cat = CATALOG_BY_ID[placeId];
    const tmp: Item = { id: '_', catalogId: cat.id, x: rawHover.x, y: rawHover.y, z: cat.z ?? 0, rotation: 0, w: st0().placeOverrides?.w ?? cat.w, d: st0().placeOverrides?.d ?? cat.d, h: st0().placeOverrides?.h ?? cat.h };
    const m = magnetToWall(project, tmp, der);
    return m ? { ...tmp, ...m } : tmp;
  }, [tool, placeCatalogId, rawHover, project, der]);

  const cameraGhost = useMemo(() => {
    if (tool !== 'camera' || !rawHover) return null;
    const m = magnetCamera(project, rawHover);
    const c: Camera = { id: '_', x: m?.x ?? rawHover.x, y: m?.y ?? rawHover.y, z: 230, rotation: m?.rotation ?? 0, fov: 90, range: 800, color: '#2f7de1' };
    return { c, poly: cameraCoverage(c, cov.segs) };
  }, [tool, rawHover, project, cov.segs]);

  const cursor = spaceDown || dragRef.current?.kind === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair';

  return (
    <div className="editor2d">
      <svg ref={svgRef} viewBox={vb} style={{ cursor }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onDoubleClick={onDoubleClick} onContextMenu={(e) => e.preventDefault()} onPointerLeave={() => setRawHover(null)}>
        <Grid view={view} size={size} />
        {bg?.visible && <image href={bg.dataUrl} x={bg.x} y={bg.y} width={bg.widthPx * bg.cmPerPx} height={bg.heightPx * bg.cmPerPx} opacity={bg.opacity} style={{ pointerEvents: 'none' }} preserveAspectRatio="none" />}

        <defs>
          <pattern id="outdoor-hatch" patternUnits="userSpaceOnUse" width={20} height={20} patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={20} stroke="#9bbf8a" strokeWidth={3} strokeOpacity={0.5} />
          </pattern>
        </defs>
        {/* stanze (gli spazi esterni sono tratteggiati in verde) */}
        {der.rooms.map((r) => {
          const lab = der.roomLabel.get(r.key);
          const sel = (selection?.kind === 'room' && selection.id === r.key) || highlightRoom === r.key;
          return <polygon key={r.key} points={r.poly.map((q) => `${q.x},${q.y}`).join(' ')} fill={lab?.outdoor ? 'url(#outdoor-hatch)' : lab?.floorColor ?? '#e9dfcf'} fillOpacity={lab?.outdoor ? 1 : bg?.visible ? 0.25 : 0.7} stroke={sel ? '#2f7de1' : 'none'} strokeWidth={2} vectorEffect="non-scaling-stroke" />;
        })}

        {/* mobili */}
        {Object.values(project.items)
          .filter((it) => !CATALOG_BY_ID[it.catalogId]?.pocket && !CATALOG_BY_ID[it.catalogId]?.structure)
          .sort((a, b) => a.z + a.h - (b.z + b.h))
          .map((it) => (
            <ItemSymbol key={it.id} it={it} selected={selection?.kind === 'item' && selection.id === it.id} z={z} />
          ))}

        {/* zone viste dalle telecamere (sotto i muri) */}
        {showCoverage &&
          Object.values(project.cameras ?? {}).map((c) => {
            const poly = cov.polys.get(c.id);
            if (!poly || poly.length < 3) return null;
            const sel = selection?.kind === 'camera' && selection.id === c.id;
            return (
              <polygon key={'cov' + c.id} points={poly.map((q) => `${q.x},${q.y}`).join(' ')} fill={c.color} fillOpacity={sel ? 0.32 : 0.2} stroke={c.color} strokeOpacity={sel ? 0.9 : 0.5} strokeWidth={sel ? 1.5 : 1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none', mixBlendMode: 'multiply' }} />
            );
          })}
        {cameraGhost && (
          <polygon points={cameraGhost.poly.map((q) => `${q.x},${q.y}`).join(' ')} fill="#2f7de1" fillOpacity={0.15} stroke="#2f7de1" strokeDasharray="4 3" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
        )}

        {/* muri */}
        {Object.values(project.walls).map((w) => {
          // il muro è una linea: lo spessore non esiste
          const A = project.nodes[w.a];
          const B = project.nodes[w.b];
          const sel = w.id === selWall;
          return <line key={w.id} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={sel ? '#2f7de1' : '#2b2d31'} strokeWidth={4} strokeLinecap="round" vectorEffect="non-scaling-stroke" />;
        })}

        {/* aperture */}
        {Object.values(project.openings).map((o) => (
          <OpeningSymbol key={o.id} p={project} o={o} selected={selection?.kind === 'opening' && selection.id === o.id} />
        ))}
        {openingHover && <OpeningSymbol p={project} o={openingHover} ghost />}

        {/* porte a scomparsa e pilastri: stanno dentro al muro, quindi sopra al muro */}
        {Object.values(project.items)
          .filter((it) => CATALOG_BY_ID[it.catalogId]?.pocket || CATALOG_BY_ID[it.catalogId]?.structure)
          .map((it) => (
            <ItemSymbol key={it.id} it={it} selected={selection?.kind === 'item' && selection.id === it.id} z={z} />
          ))}

        {/* «arreda questa stanza»: il resto della casa resta sbiadito */}
        {(() => {
          const fr = focusedRoom(der, focus);
          if (!fr) return null;
          const big = 1e6;
          const d = `M ${-big} ${-big} H ${big} V ${big} H ${-big} Z M ` + fr.poly.map((q) => `${q.x} ${q.y}`).join(' L ') + ' Z';
          return <path d={d} fill="#f6f7f9" fillOpacity={0.82} fillRule="evenodd" style={{ pointerEvents: 'none' }} />;
        })()}

        {/* quote interne delle stanze */}
        {showDims && der.rooms.filter((r) => !focusKey || r.key === focusKey).map((r) => <RoomDims key={r.key} room={r} z={z} />)}

        {/* etichette stanze */}
        {der.rooms.filter((r) => !focusKey || r.key === focusKey).map((r) => {
          const lab = der.roomLabel.get(r.key);
          const pos = der.roomLabelPos.get(r.key)!;
          return (
            <g key={r.key} style={{ pointerEvents: 'none' }}>
              {lab?.name ? (
                <text x={pos.x} y={pos.y - fs(6)} fontSize={fs(13)} textAnchor="middle" fontWeight={600} fill="#1d3557">
                  {lab.name}
                </text>
              ) : (
                tool === 'select' &&
                r.area * z * z > 9000 && (
                  <text x={pos.x} y={pos.y - fs(6)} fontSize={fs(11)} textAnchor="middle" fill="#2f7de1" fontStyle="italic">
                    + clicca per dare un nome
                  </text>
                )
              )}
              <text x={pos.x} y={pos.y + fs(10)} fontSize={fs(11)} textAnchor="middle" fill="#1d3557">
                {(r.area / 10000).toFixed(2).replace('.', ',')} m²
              </text>
            </g>
          );
        })}

        {/* quote del muro selezionato */}
        {selWall && project.walls[selWall] && <WallDims p={project} wallId={selWall} der={der} z={z} />}

        {/* nodi */}
        {tool === 'select' && (
          <g data-noexport>
            {Object.values(project.nodes).map((n) => (
              <circle key={n.id} cx={n.x} cy={n.y} r={fs(selection?.kind === 'node' && selection.id === n.id ? 5 : 3)} fill="#fff" stroke="#2f7de1" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        )}

        {/* punti di aggancio: estremi e metà dei muri */}
        {tool === 'wall' &&
          Object.values(project.walls).flatMap((w) => {
            const A = project.nodes[w.a];
            const B = project.nodes[w.b];
            return [
              <rect key={w.id + 'm'} x={(A.x + B.x) / 2 - fs(3)} y={(A.y + B.y) / 2 - fs(3)} width={fs(6)} height={fs(6)} fill="#fff" stroke="#e76f51" strokeWidth={1.2} vectorEffect="non-scaling-stroke" transform={`rotate(45 ${(A.x + B.x) / 2} ${(A.y + B.y) / 2})`} />,
            ];
          })}
        {tool === 'wall' && Object.values(project.nodes).map((n) => <circle key={n.id} cx={n.x} cy={n.y} r={fs(3.5)} fill="#fff" stroke="#e76f51" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />)}
        {/* agganciando a metà di un muro: distanze lungo il muro fino ai muri vicini */}
        {tool === 'wall' && hover?.wallId && project.walls[hover.wallId] && (
          <WallDistances items={openingDistances(project, der.corners, { wallId: hover.wallId, offset: offsetOnWall(project, hover.wallId, hover), width: 0 })} z={z} />
        )}

        {/* disegno muro */}
        {tool === 'wall' && hover && (
          <>
            <Guides h={hover} />
            {drawStart && (
              <>
                <line x1={drawStart.x} y1={drawStart.y} x2={hover.x} y2={hover.y} stroke={hover.straight ? '#2a9d8f' : '#2f7de1'} strokeWidth={4} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                <text x={(drawStart.x + hover.x) / 2} y={(drawStart.y + hover.y) / 2 - fs(10)} fontSize={fs(13)} textAnchor="middle" fill="#1b5fb8" fontWeight={700} style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: fs(3) }}>
                  {typed ? `${typed}▏` : fmtLen(dist(drawStart, hover))}
                </text>
              </>
            )}
            <circle cx={hover.x} cy={hover.y} r={fs(5)} fill={hover.nodeId ? '#e76f51' : hover.wallId ? '#f4a261' : '#2f7de1'} />
          </>
        )}

        {/* trascinando un pallino: guide di allineamento e linea dritta */}
        {tool === 'select' && hover && <Guides h={hover} />}

        {placeGhost && <ItemSymbol it={placeGhost} selected={false} z={z} ghost />}

        {/* distanze dalle pareti del mobile che si sta posizionando o è selezionato */}
        {(() => {
          const target = placeGhost ?? (selection?.kind === 'item' ? project.items[selection.id] : null);
          if (target) return <WallDistances items={wallDistances(project, der.corners, target)} z={z} />;
          // porte e finestre: distanze lungo il muro fino al filo dei muri vicini
          const op = openingHover ?? (selection?.kind === 'opening' ? project.openings[selection.id] : null);
          if (op) return <WallDistances items={openingDistances(project, der.corners, op)} z={z} />;
          return null;
        })()}

        {/* telecamere */}
        {Object.values(project.cameras ?? {}).map((c) => (
          <CameraSymbol key={c.id} c={c} z={z} selected={selection?.kind === 'camera' && selection.id === c.id} />
        ))}
        {cameraGhost && <CameraSymbol c={cameraGhost.c} z={z} selected={false} ghost />}

        {/* luci e sensori di Home Assistant (non finiscono nella pianta da stampare) */}
        <g data-noexport>
          {Object.values(project.lights ?? {}).map((l) => (
            <LightSymbol key={l.id} l={l} z={z} selected={selection?.kind === 'light' && selection.id === l.id} />
          ))}
          {Object.values(project.sensors ?? {}).map((x) => (
            <SensorSymbol key={x.id} s={x} z={z} selected={selection?.kind === 'sensor' && selection.id === x.id} />
          ))}
        </g>

        {roi && (
          <rect x={Math.min(roi.a.x, roi.b.x)} y={Math.min(roi.a.y, roi.b.y)} width={Math.abs(roi.a.x - roi.b.x)} height={Math.abs(roi.a.y - roi.b.y)} fill="#2f7de1" fillOpacity={0.08} stroke="#2f7de1" strokeDasharray="6 4" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        )}

        {/* calibrazione */}
        {tool === 'calibrate' && (
          <>
            {calib.map((c, i) => (
              <circle key={i} cx={c.x} cy={c.y} r={fs(5)} fill="#e63946" />
            ))}
            {calib.length === 1 && rawHover && <line x1={calib[0].x} y1={calib[0].y} x2={rawHover.x} y2={rawHover.y} stroke="#e63946" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
            {calib.length === 2 && <line x1={calib[0].x} y1={calib[0].y} x2={calib[1].x} y2={calib[1].y} stroke="#e63946" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
          </>
        )}
      </svg>

      <div className="hint">
        {tool === 'wall' && (drawStart ? 'Clicca per il prossimo punto · digita una misura (es. 3,62) + Invio: è la lunghezza della linea, lo spessore dei muri non esiste · linea verde = dritto · Esc/doppio clic per terminare · Shift = senza aggancio' : 'Clicca per iniziare un muro: agganciati a un estremo (●) o a metà (◆) di un muro, o su un punto qualsiasi del muro guardando le distanze')}
        {(tool === 'door' || tool === 'window' || tool === 'arch') && 'Clicca su un muro per inserire'}
        {tool === 'garage' && 'Clicca su un muro per mettere il portone del garage (250 cm). Poi a destra scegli larghezza, verso e apertura'}
        {tool === 'sliding' && 'Clicca su un muro per inserire le ante scorrevoli (SKYTTA). Poi a destra scegli larghezza e altezza; se la fai larga quanto il muro lo sostituisce tutto'}
        {tool === 'place' && 'Clicca per posizionare il mobile (si aggancia ai muri; Shift = libero)'}
        {tool === 'camera' && 'Clicca dove montare la telecamera: si aggancia a pareti e angoli e guarda verso la stanza (Shift = libera). Poi trascina il pallino per cambiare direzione'}
        {tool === 'light' && 'Clicca dove si trova la luce (di solito al centro della stanza). Poi a destra scrivi la sua entità di Home Assistant (es. light.cucina)'}
        {tool === 'sensor' && 'Clicca dove vuoi vedere il valore del sensore. Poi a destra scrivi la sua entità di Home Assistant (es. sensor.temperatura_salotto)'}
        {tool === 'select' && 'Clic per selezionare · trascina muri, nodi, mobili · Canc per eliminare/abbattere · R ruota · ⌘D duplica · spazio+trascina per spostare la vista'}
        {tool === 'calibrate' && calib.length < 2 && 'Correggi scala: clicca i due estremi di una misura che conosci (es. un muro o una quota): tutta la pianta verrà riscalata'}
        {tool === 'detect' && 'Trascina un rettangolo attorno all\'appartamento (escludi scale e parti comuni): i muri verranno ricostruiti'}
      </div>

      {tool === 'calibrate' && calib.length === 2 && (
        <form
          className="calib-box"
          onSubmit={(e) => {
            e.preventDefault();
            const L = parseLength(calibInput);
            const st = useStore.getState();
            const measured = dist(calib[0], calib[1]);
            if (!L || measured < 1) return;
            st.scaleProject(L / measured, calib[0]);
            setCalib([]);
            setCalibInput('');
            st.setTool('select');
          }}
        >
          <label>
            Distanza reale (m o cm)
            <input ref={(el) => { if (el && !el.dataset.f) { el.dataset.f = '1'; setTimeout(() => el.focus(), 30); } }} value={calibInput} onChange={(e) => setCalibInput(e.target.value)} placeholder="es. 4,15" />
          </label>
          <button type="submit">Applica scala</button>
          <button type="button" onClick={() => setCalib([])}>
            Rifai
          </button>
        </form>
      )}

      {detecting && <div className="toast">{detecting}</div>}

      <div className="zoom-ctl">
        <button onClick={() => setView((vw) => ({ ...vw, zoom: vw.zoom * 1.25 }))} data-tip="Ingrandisci (o rotellina del mouse)">
          +
        </button>
        <button onClick={() => setView((vw) => ({ ...vw, zoom: vw.zoom / 1.25 }))} data-tip="Rimpicciolisci">
          −
        </button>
        <button onClick={fit} data-tip="Mostra tutta la pianta">
          ⤢
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function clamp(x: number, a: number, b: number) {
  return b < a ? (a + b) / 2 : Math.max(a, Math.min(b, x));
}

export function fmtLen(cm: number) {
  return (cm / 100).toFixed(2).replace('.', ',');
}

/** guide: allineamenti con altri nodi (arancio) e linea dritta orizzontale/verticale/45° (verde) */
function Guides({ h }: { h: { guides?: V[][]; straight?: V[] } }) {
  return (
    <>
      {h.straight && <line x1={h.straight[0].x} y1={h.straight[0].y} x2={h.straight[1].x} y2={h.straight[1].y} stroke="#2a9d8f" strokeDasharray="8 4" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
      {h.guides?.map((g, i) => <line key={i} x1={g[0].x} y1={g[0].y} x2={g[1].x} y2={g[1].y} stroke="#e76f51" strokeDasharray="4 4" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
    </>
  );
}

function nearestWall(p: Project, at: V, maxD: number): string | null {
  let best: string | null = null;
  let bd = Infinity;
  for (const w of Object.values(p.walls)) {
    const pj = projectOnSegment(at, p.nodes[w.a], p.nodes[w.b]);
    const d = pj.dist;
    if (d < maxD && d < bd) {
      bd = d;
      best = w.id;
    }
  }
  return best;
}

function rotateHandlePos(it: Item, z: number): V {
  const c = Math.cos(it.rotation);
  const s = Math.sin(it.rotation);
  const r = it.d / 2 + 22 / z;
  // dietro (lato -y locale)
  return { x: it.x + s * r, y: it.y - c * r };
}

/** maniglia per orientare la telecamera: davanti all'obiettivo, a distanza fissa sullo schermo */
function aimHandlePos(c: Camera, z: number): V {
  const r = 46 / z;
  return { x: c.x + Math.cos(c.rotation) * r, y: c.y + Math.sin(c.rotation) * r };
}

function CameraSymbol({ c, z, selected, ghost }: { c: Camera; z: number; selected: boolean; ghost?: boolean }) {
  const deg = (c.rotation * 180) / Math.PI;
  const k = 1 / z;
  const h = aimHandlePos(c, z);
  return (
    <g style={{ pointerEvents: 'none' }} opacity={ghost ? 0.75 : 1}>
      {selected && (
        <>
          <line x1={c.x} y1={c.y} x2={h.x} y2={h.y} stroke={c.color} strokeWidth={1.5} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
          <circle cx={h.x} cy={h.y} r={6 * k} fill="#fff" stroke={c.color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </>
      )}
      <g transform={`translate(${c.x} ${c.y}) rotate(${deg}) scale(${k})`}>
        {/* corpo e obiettivo */}
        <rect x={-9} y={-6} width={14} height={12} rx={2.5} fill={c.color} stroke={selected ? '#1b5fb8' : '#fff'} strokeWidth={selected ? 2.5 : 1.5} />
        <path d="M 5 -4 L 12 -7 L 12 7 L 5 4 Z" fill={c.color} stroke={selected ? '#1b5fb8' : '#fff'} strokeWidth={selected ? 2.5 : 1.5} strokeLinejoin="round" />
        <circle cx={-3} cy={0} r={2.2} fill="#fff" />
      </g>
      {!ghost && c.label && z > 0.35 && (
        <text x={c.x} y={c.y + 20 * k} fontSize={10 * k} textAnchor="middle" fontWeight={700} fill={c.color} style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 * k }}>
          {c.label}
        </text>
      )}
    </g>
  );
}

/** luce di Home Assistant: lampadina gialla con alone */
function LightSymbol({ l, z, selected }: { l: Light; z: number; selected: boolean }) {
  const k = 1 / z;
  const ok = !!l.entityId;
  return (
    <g style={{ pointerEvents: 'none' }}>
      <circle cx={l.x} cy={l.y} r={16 * k} fill={l.color} fillOpacity={0.35} />
      <circle cx={l.x} cy={l.y} r={8 * k} fill="#ffd23f" stroke={selected ? '#1b5fb8' : ok ? '#8a6d00' : '#e63946'} strokeWidth={selected ? 2.5 : 1.5} vectorEffect="non-scaling-stroke" />
      <text x={l.x} y={l.y + 3.5 * k} fontSize={10 * k} textAnchor="middle" fill="#5a4500" fontWeight={700}>
        ☀
      </text>
      {z > 0.35 && (l.label || !ok) && (
        <text x={l.x} y={l.y + 22 * k} fontSize={10 * k} textAnchor="middle" fontWeight={700} fill={ok ? '#8a6d00' : '#e63946'} style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 * k }}>
          {l.label || ''}
          {!ok && ' (senza entità)'}
        </text>
      )}
    </g>
  );
}

const SENSOR_ICON = { temperature: '🌡', humidity: '💧', co2: '🫧', door: '🚪', window: '🪟', generic: '◉' } as const;

/** sensore di Home Assistant: etichetta con icona */
function SensorSymbol({ s, z, selected }: { s: Sensor; z: number; selected: boolean }) {
  const k = 1 / z;
  const ok = !!s.entityId;
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={s.x - 10 * k} y={s.y - 10 * k} width={20 * k} height={20 * k} rx={5 * k} fill="#fff" stroke={selected ? '#1b5fb8' : ok ? '#2a9d8f' : '#e63946'} strokeWidth={selected ? 2.5 : 1.5} vectorEffect="non-scaling-stroke" />
      <text x={s.x} y={s.y + 4 * k} fontSize={11 * k} textAnchor="middle">
        {SENSOR_ICON[s.kind]}
      </text>
      {z > 0.35 && (s.label || !ok) && (
        <text x={s.x} y={s.y + 22 * k} fontSize={10 * k} textAnchor="middle" fontWeight={700} fill={ok ? '#2a9d8f' : '#e63946'} style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 * k }}>
          {s.label || ''}
          {!ok && ' (senza entità)'}
        </text>
      )}
    </g>
  );
}

function Grid({ view, size }: { view: View; size: { w: number; h: number } }) {
  const z = view.zoom;
  const step = z > 2 ? 10 : z > 0.5 ? 50 : 100;
  const major = step * (step === 50 ? 2 : 10);
  const x0 = view.cx - size.w / 2 / z;
  const y0 = view.cy - size.h / 2 / z;
  const x1 = x0 + size.w / z;
  const y1 = y0 + size.h / z;
  const lines: React.ReactElement[] = [];
  for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) lines.push(<line key={'x' + x} x1={x} y1={y0} x2={x} y2={y1} stroke={x % major === 0 ? '#d5d9df' : '#eceef1'} strokeWidth={1} vectorEffect="non-scaling-stroke" />);
  for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) lines.push(<line key={'y' + y} x1={x0} y1={y} x2={x1} y2={y} stroke={y % major === 0 ? '#d5d9df' : '#eceef1'} strokeWidth={1} vectorEffect="non-scaling-stroke" />);
  return (
    <g style={{ pointerEvents: 'none' }} data-noexport>
      {lines}
    </g>
  );
}

function OpeningSymbol({ p, o, selected, ghost }: { p: Project; o: Opening; selected?: boolean; ghost?: boolean }) {
  const w = p.walls[o.wallId];
  if (!w) return null;
  const A = p.nodes[w.a];
  const B = p.nodes[w.b];
  const dir = norm(sub(B, A));
  const n = perp(dir);
  const h = w.thickness / 2 + 0.5;
  const s0 = add(A, mul(dir, o.offset - o.width / 2));
  const s1 = add(A, mul(dir, o.offset + o.width / 2));
  const quad = [add(s0, mul(n, h)), add(s1, mul(n, h)), add(s1, mul(n, -h)), add(s0, mul(n, -h))];
  const color = ghost ? '#2f7de1' : selected ? '#2f7de1' : '#2b2d31';
  const els: React.ReactElement[] = [<polygon key="cut" points={quad.map((q) => `${q.x},${q.y}`).join(' ')} fill="#fafaf8" stroke={color} strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={ghost ? 0.8 : 1} />];
  if (o.type === 'door') {
    const hinge = o.flipHinge ? s1 : s0;
    const other = o.flipHinge ? s0 : s1;
    const side = o.flipSide ? -1 : 1;
    const hingeFace = add(hinge, mul(n, side * h));
    // anta girata dell'angolo di apertura (0 = chiusa nel vano, 1 = 90°)
    const th = (Math.max(0, Math.min(1, o.open ?? DOOR_OPEN_DEFAULT)) * Math.PI) / 2;
    const along = norm(sub(other, hinge));
    const leafEnd = add(hingeFace, mul(add(mul(along, Math.cos(th)), mul(n, side * Math.sin(th))), o.width));
    const otherFace = add(other, mul(n, side * h));
    const sweep = (leafEnd.x - hingeFace.x) * (otherFace.y - hingeFace.y) - (leafEnd.y - hingeFace.y) * (otherFace.x - hingeFace.x) > 0 ? 1 : 0;
    els.push(<line key="leaf" x1={hingeFace.x} y1={hingeFace.y} x2={leafEnd.x} y2={leafEnd.y} stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />);
    if (th > 0.02) els.push(<path key="arc" d={`M ${leafEnd.x} ${leafEnd.y} A ${o.width} ${o.width} 0 0 ${sweep} ${otherFace.x} ${otherFace.y}`} fill="none" stroke={color} strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />);
  } else if (o.type === 'sliding') {
    // ante scorrevoli: pannelli sfalsati dentro lo spessore del muro
    const nPanels = o.width > 220 ? 3 : 2;
    const pw = o.width / nPanels;
    for (let i = 0; i < nPanels; i++) {
      const k = (i % 2 ? -1 : 1) * 0.3;
      const a = add(add(s0, mul(dir, i * pw - (i ? 4 : 0))), mul(n, h * k));
      const b = add(add(s0, mul(dir, (i + 1) * pw + (i < nPanels - 1 ? 4 : 0))), mul(n, h * k));
      els.push(<line key={'p' + i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={3} vectorEffect="non-scaling-stroke" />);
    }
  } else if (o.type === 'garage') {
    // portone: pannello sul filo del muro e guide a soffitto (tratteggio) verso l'interno
    const side = o.flipSide ? -1 : 1;
    const a = add(s0, mul(n, side * h * 0.6));
    const b = add(s1, mul(n, side * h * 0.6));
    els.push(<line key="panel" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={3} vectorEffect="non-scaling-stroke" />);
    const depth = Math.min(o.height, 260) * Math.max(0.15, openingOpen(o));
    const c0 = add(a, mul(n, side * depth));
    const c1 = add(b, mul(n, side * depth));
    const pts = [a, c0, c1, b].map((q) => `${q.x},${q.y}`).join(' ');
    els.push(<polyline key="track" points={pts} fill="none" stroke={color} strokeWidth={1} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />);
  } else if (o.type === 'window') {
    for (const k of [-0.25, 0.25]) {
      const a = add(s0, mul(n, h * k * 2));
      const b = add(s1, mul(n, h * k * 2));
      els.push(<line key={'g' + k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />);
    }
  }
  return <g style={{ pointerEvents: 'none' }}>{els}</g>;
}

function ItemSymbol({ it, selected, z, ghost }: { it: Item; selected: boolean; z: number; ghost?: boolean }) {
  const cat = CATALOG_BY_ID[it.catalogId];
  const parts = useMemo(() => (cat ? itemParts(cat, { w: it.w, d: it.d, h: it.h, color: it.color, color2: it.color2, open: it.open }) : []), [cat, it.w, it.d, it.h, it.color, it.color2, it.open]);
  if (!cat) return null;
  const sorted = [...parts].sort((a, b) => topOf(a) - topOf(b));
  const deg = (it.rotation * 180) / Math.PI;
  const hz = 22 / z;
  if (cat.structure) {
    // pilastro: pieno e scuro come i muri
    const round = parts[0]?.t === 'cyl';
    const look = { fill: selected ? '#2f7de1' : '#4a4e55', stroke: selected ? '#1d5fb8' : '#2b2d31', strokeWidth: 1.5, vectorEffect: 'non-scaling-stroke' as const };
    return (
      <g transform={`translate(${it.x} ${it.y}) rotate(${deg})`} opacity={ghost ? 0.5 : 1} style={{ pointerEvents: 'none' }}>
        {round ? <ellipse cx={0} cy={0} rx={it.w / 2} ry={it.d / 2} {...look} /> : <rect x={-it.w / 2} y={-it.d / 2} width={it.w} height={it.d} {...look} />}
      </g>
    );
  }
  return (
    <g transform={`translate(${it.x} ${it.y}) rotate(${deg})`} opacity={ghost ? 0.6 : 1} style={{ pointerEvents: 'none' }}>
      <rect x={-it.w / 2} y={-it.d / 2} width={it.w} height={it.d} fill="#fff" fillOpacity={0.9} stroke="none" />
      {sorted.map((pt, i) =>
        pt.t === 'box' ? (
          <rect key={i} x={pt.p[0] - pt.s[0] / 2} y={pt.p[2] - pt.s[2] / 2} width={pt.s[0]} height={pt.s[2]} fill={pt.c} fillOpacity={pt.o ?? 1} stroke="#00000033" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
        ) : (
          <circle key={i} cx={pt.p[0]} cy={pt.p[2]} r={pt.r} fill={pt.c} fillOpacity={pt.o ?? 1} stroke="#00000033" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
        ),
      )}
      {/* contorno ben visibile sopra le parti */}
      <rect x={-it.w / 2} y={-it.d / 2} width={it.w} height={it.d} fill="none" stroke={selected ? '#2f7de1' : '#374151'} strokeWidth={selected ? 2 : 1.4} strokeDasharray={selected ? '5 3' : undefined} vectorEffect="non-scaling-stroke" />
      {Math.min(it.w, it.d) * z > 14 && Math.max(it.w, it.d) * z > 34 && (
        <text
          x={0}
          y={0}
          fontSize={Math.min(11, Math.min(it.w, it.d) * z * 0.55) / z}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#1f2937"
          fontWeight={600}
          transform={`rotate(${textRot(deg, it.w >= it.d)})`}
          style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 / z }}
        >
          {shortName(it.label || cat.name)}
        </text>
      )}
      {selected && (
        <>
          <line x1={0} y1={-it.d / 2} x2={0} y2={-it.d / 2 - hz} stroke="#2f7de1" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <circle cx={0} cy={-it.d / 2 - hz} r={6 / z} fill="#fff" stroke="#2f7de1" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </>
      )}
    </g>
  );
}

function WallDistances({ items, z }: { items: { from: V; to: V; dist: number; side?: V }[]; z: number }) {
  return (
    <g style={{ pointerEvents: 'none' }}>
      {items.map((d, i) => {
        // le scritte delle porte/finestre vanno dal lato della propria stanza
        const m = add(mul(add(d.from, d.to), 0.5), d.side ? mul(d.side, 11 / z) : { x: 0, y: 0 });
        const label = `${Math.round(d.dist)} cm`;
        const close = d.dist < 0.5;
        return (
          <g key={i}>
            {!close && <line x1={d.from.x} y1={d.from.y} x2={d.to.x} y2={d.to.y} stroke="#e8590c" strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
            {!close && <circle cx={d.to.x} cy={d.to.y} r={3 / z} fill="#e8590c" />}
            {!close && (
              <text x={m.x} y={m.y} fontSize={12 / z} fontWeight={700} textAnchor="middle" dominantBaseline="middle" fill="#c2410c" style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 4 / z }}>
                {label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

/** rotazione locale del testo: lungo il lato lungo e mai capovolto */
function textRot(deg: number, alongX: boolean) {
  const local = alongX ? 0 : 90;
  const world = (((deg + local) % 360) + 360) % 360;
  return world > 90 && world <= 270 ? local + 180 : local;
}

/** nome breve per la pianta: per IKEA la famiglia (es. "PAX"), altrimenti le prime parole */
function shortName(n: string) {
  const m = /^([A-ZÅÄÖÜ]{3,})\b/.exec(n);
  if (m) return m[1];
  return n.replace(/^Su misura: /, '').split(' ').slice(0, 2).join(' ');
}

function topOf(p: ReturnType<typeof scaledParts>[number]) {
  if (p.t === 'box') return p.p[1] + p.s[1] / 2;
  if (p.t === 'cyl') return p.p[1] + p.h / 2;
  return p.p[1] + p.r;
}

function RoomDims({ room, z }: { room: Room; z: number }) {
  const out: React.ReactElement[] = [];
  roomSides(room).forEach((sd, i) => {
    if (sd.len * z < 40) return;
    const dir = norm(sub(sd.b, sd.a));
    const nrm = perp(dir); // verso l'interno (area positiva)
    const m = add(mul(add(sd.a, sd.b), 0.5), mul(nrm, 12 / z));
    let ang = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
    if (ang > 90) ang -= 180;
    if (ang < -90) ang += 180;
    out.push(
      <text key={i} x={m.x} y={m.y} fontSize={10 / z} textAnchor="middle" dominantBaseline="middle" fill="#b5332e" transform={`rotate(${ang} ${m.x} ${m.y})`}>
        {fmtLen(sd.len)}
      </text>,
    );
  });
  return <g style={{ pointerEvents: 'none' }}>{out}</g>;
}

/** lati di stanza (da angolo ad angolo) di cui fa parte il muro: sono le stesse misure scritte in pianta */
export function wallRoomSides(p: Project, wallId: string, der: Derived) {
  const w = p.walls[wallId];
  const out: { room: Room; side: RoomSide }[] = [];
  if (!w) return out;
  for (const r of der.rooms)
    for (const sd of roomSides(r))
      if (sd.edges.some(([x, y]) => (x === w.a && y === w.b) || (x === w.b && y === w.a))) out.push({ room: r, side: sd });
  return out;
}

function WallDims({ p, wallId, z }: { p: Project; wallId: string; der: Derived; z: number }) {
  const w = p.walls[wallId];
  if (!w) return null;
  const A = p.nodes[w.a];
  const B = p.nodes[w.b];
  const off = mul(perp(norm(sub(B, A))), 22 / z);
  // lunghezza della linea del muro, da estremo a estremo
  return <g style={{ pointerEvents: 'none' }}>{dimLine(add(A, off), add(B, off), dist(A, B), z, '#1b5fb8', 'L')}</g>;
}

function dimLine(a: V, b: V, len: number, z: number, color: string, key: string) {
  const dir = norm(sub(b, a));
  const m = mul(add(a, b), 0.5);
  let ang = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
  if (ang > 90) ang -= 180;
  if (ang < -90) ang += 180;
  const t = mul(perp(dir), 5 / z);
  return (
    <g key={key}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      <line x1={a.x - t.x} y1={a.y - t.y} x2={a.x + t.x} y2={a.y + t.y} stroke={color} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      <line x1={b.x - t.x} y1={b.y - t.y} x2={b.x + t.x} y2={b.y + t.y} stroke={color} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      <text x={m.x} y={m.y - 4 / z} fontSize={12 / z} textAnchor="middle" fill={color} fontWeight={700} transform={`rotate(${ang} ${m.x} ${m.y})`} style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 / z }}>
        {fmtLen(len)}
      </text>
    </g>
  );
}
