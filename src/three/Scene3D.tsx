import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, OrbitControls, PointerLockControls } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { CATALOG_BY_ID, scaledParts } from '../catalog/catalog';
import { derive, focusedRoom, useDerived } from '../model/derived';
import { add, labelPoint, mul, norm, perp, pointInPolygon, sub } from '../model/geom';
import { degree } from '../model/ops';
import { useStore } from '../model/store';
import type { Item, Opening, Project } from '../model/types';
import { magnetToWall } from '../editor2d/snapping';
import { buildFloorGeometry, buildWallGeometry, S } from './wallGeometry';

export function Scene3D() {
  const [walk, setWalk] = useState(false);
  const [walkFov, setWalkFov] = useState(() => {
    try {
      return Number(localStorage.getItem('planner3d:walkFov')) || 80;
    } catch {
      return 80;
    }
  });
  const [walkSpeed, setWalkSpeed] = useState(1.4);
  const [fovFlash, setFovFlash] = useState(0);
  const walkRef = useRef(false);
  walkRef.current = walk;
  const changeFov = (f: number) => {
    setWalkFov(f);
    setFovFlash(Date.now());
    try {
      localStorage.setItem('planner3d:walkFov', String(f));
    } catch {
      /* ignora */
    }
  };
  const [cutaway, setCutaway] = useState(false);
  const [shadows, setShadows] = useState(() => {
    try {
      return localStorage.getItem('planner3d:shadows') !== 'off';
    } catch {
      return true;
    }
  });
  const toggleShadows = () => {
    setShadows((v) => {
      try {
        localStorage.setItem('planner3d:shadows', v ? 'off' : 'on');
      } catch {
        /* ignora */
      }
      return !v;
    });
  };
  return (
    <div className="scene3d">
      <Canvas shadows gl={{ logarithmicDepthBuffer: true }} camera={{ position: [8, 10, 12], fov: ORBIT_FOV, near: 0.05, far: 500 }} onPointerMissed={() => !walkRef.current && useStore.getState().select(null)}>
        <color attach="background" args={['#eef1f5']} />
        <hemisphereLight args={['#ffffff', '#b8a990', 0.7]} />
        <directionalLight position={[8, 14, 6]} intensity={shadows ? 1.6 : 1.1} castShadow={shadows} shadow-bias={-0.0005} shadow-normalBias={0.02} shadow-mapSize={[2048, 2048]} shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[-6, 8, -10]} intensity={0.5} />
        <World cutaway={cutaway} interactive={!walk} />
        {shadows && <ContactShadows position={[0, 0.014, 0]} opacity={0.35} scale={60} blur={2} far={3} />}
        {!shadows && <ambientLight intensity={0.35} />}
        {walk ? <Walk onExit={() => setWalk(false)} fov={walkFov} speed={walkSpeed} onFov={changeFov} /> : <Orbit />}
      </Canvas>
      <div className="scene-ctl">
        <button className={cutaway ? 'on' : ''} onClick={() => setCutaway((c) => !c)} data-tip="Abbassa i muri a 1 metro per vedere bene dentro le stanze e i mobili">
          Muri bassi
        </button>
        <button className={shadows ? 'on' : ''} onClick={toggleShadows} data-tip="Accendi o spegni le ombre nella vista 3D">
          Ombre
        </button>
        <button onClick={() => window.dispatchEvent(new CustomEvent('planner:fit3d', { detail: 'persp' }))} data-tip="Mostra tutta la casa in prospettiva">
          ⤢ Inquadra
        </button>
        <button onClick={() => window.dispatchEvent(new CustomEvent('planner:fit3d', { detail: 'top' }))} data-tip="Guarda la casa dall'alto, come una pianta">
          ⬇ Dall'alto
        </button>
        <button onClick={() => setWalk(true)} data-tip="Cammina dentro casa ad altezza occhi: clicca nella vista, muovi il mouse per guardare, WASD o frecce per camminare, Esc per uscire">
          🚶 Passeggiata
        </button>
      </div>
      {walk && fovFlash > 0 && <FovFlash at={fovFlash} fov={walkFov} />}
      {walk && (
        <div className="walk-hint">
          <span>Clicca nella vista per iniziare · mouse = guarda · WASD/frecce = cammina (Shift più veloce) · rotellina = campo visivo · Esc = esci</span>
          <span className="walk-ctl">
            <label data-tip="Quanto ambiente vedi: più alto = vista più ampia (meno «zoomata»)">
              Vista {Math.round(walkFov)}°
              <input type="range" min={FOV_MIN} max={FOV_MAX} step={2} value={walkFov} onChange={(e) => changeFov(+e.target.value)} />
            </label>
            <label data-tip="Velocità di camminata">
              Velocità
              <input type="range" min={0.5} max={4} step={0.1} value={walkSpeed} onChange={(e) => setWalkSpeed(+e.target.value)} />
            </label>
            <button onClick={() => setWalk(false)}>Esci</button>
          </span>
        </div>
      )}
    </div>
  );
}

type FitMode = 'persp' | 'top';

/** Posiziona la camera in modo che tutta la casa stia nella vista (sfera che la contiene). */
/** punti da inquadrare: la stanza in primo piano oppure tutta la casa */
function framePoints(project: Project, focus: { x: number; y: number } | null) {
  const fr = focusedRoom(derive(project), focus);
  return fr ? fr.poly : Object.values(project.nodes);
}

function fitCamera(camera: THREE.PerspectiveCamera, ctl: { target: THREE.Vector3; update(): void }, project: Project, mode: FitMode) {
  const ns = framePoints(project, useStore.getState().focus);
  if (ns.length < 2) return false;
  const xs = ns.map((n) => n.x * S);
  const zs = ns.map((n) => n.y * S);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const H = Math.max(...Object.values(project.walls).map((w) => w.height), 250) * S;
  const c = new THREE.Vector3((x0 + x1) / 2, mode === 'top' ? 0 : H / 3, (z0 + z1) / 2);
  let dir: THREE.Vector3;
  if (mode === 'top') {
    dir = new THREE.Vector3(0, 1, 0.001).normalize();
  } else {
    const el = (55 * Math.PI) / 180;
    const az = (20 * Math.PI) / 180;
    dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  }
  // distanza minima perché tutti gli spigoli (pavimento e sommità dei muri) stiano nella vista, con un po' di margine
  const corners: THREE.Vector3[] = [];
  for (const q of ns) for (const y of [0, H]) corners.push(new THREE.Vector3(q.x * S, y, q.y * S));
  const fits = (d: number) => {
    camera.position.copy(c).addScaledVector(dir, d);
    camera.lookAt(c);
    camera.near = Math.max(0.05, d / 500);
    camera.far = d * 20 + 50;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const v = new THREE.Vector3();
    return corners.every((p) => {
      v.copy(p).project(camera);
      return Math.abs(v.x) <= 0.92 && Math.abs(v.y) <= 0.9 && v.z < 1;
    });
  };
  let lo = 0.5;
  let hi = 400;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  const dist = hi;
  ctl.target.copy(c);
  camera.position.copy(c).addScaledVector(dir, dist);
  camera.near = Math.max(0.05, dist / 500);
  camera.far = dist * 20;
  camera.updateProjectionMatrix();
  ctl.update();
  return true;
}

function Orbit() {
  const ref = useRef<any>(null);
  const project = useStore((s) => s.project);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as any;
  // inquadra automaticamente la casa quando cambia, finché l'utente non muove la camera
  const userMoved = useRef(false);
  const focus = useStore((s) => s.focus);
  const lastFocus = useRef(focus);
  const mode = useRef<FitMode>('persp');
  const lastKey = useRef('');
  const projRef = useRef(project);
  projRef.current = project;

  useEffect(() => {
    const ctl = controls ?? ref.current;
    // entrando/uscendo da «arreda questa stanza» si inquadra di nuovo
    if (lastFocus.current !== focus) {
      lastFocus.current = focus;
      userMoved.current = false;
    }
    if (!ctl || userMoved.current) return;
    const ns = framePoints(project, focus);
    const key = (focus ? `${Math.round(focus.x)},${Math.round(focus.y)}|` : '') + ns.length + ':' + Math.round(Math.min(...ns.map((n) => n.x))) + ',' + Math.round(Math.max(...ns.map((n) => n.x))) + ',' + Math.round(Math.max(...ns.map((n) => n.y))) + '|' + size.width + 'x' + size.height;
    if (key === lastKey.current) return;
    if (fitCamera(camera, ctl, project, mode.current)) lastKey.current = key;
  }, [project, camera, controls, size.width, size.height, focus]);

  useEffect(() => {
    const h = (e: Event) => {
      const ctl = controls ?? ref.current;
      if (!ctl) return;
      mode.current = (e as CustomEvent).detail === 'top' ? 'top' : 'persp';
      userMoved.current = false;
      fitCamera(camera, ctl, projRef.current, mode.current);
    };
    window.addEventListener('planner:fit3d', h);
    return () => window.removeEventListener('planner:fit3d', h);
  }, [camera, controls]);
  return <OrbitControls ref={ref} makeDefault maxPolarAngle={Math.PI / 2 - 0.02} onStart={() => (userMoved.current = true)} />;
}

/** indicatore grande al centro quando si cambia il campo visivo */
function FovFlash({ at, fov }: { at: number; fov: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => tick((x) => x + 1), 1300);
    return () => clearTimeout(t);
  }, [at]);
  if (Date.now() - at > 1200) return null;
  const r = Math.round(fov);
  return (
    <div className="fov-flash">
      Vista {r}°{r >= FOV_MAX ? ' (massimo)' : r <= FOV_MIN ? ' (minimo)' : ''}
    </div>
  );
}

const ORBIT_FOV = 45;
const FOV_MIN = 30;
const FOV_MAX = 120;

function Walk({ onExit, fov, speed, onFov }: { onExit: () => void; fov: number; speed: number; onFov: (f: number) => void }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const keys = useRef<Record<string, boolean>>({});
  const project = useStore((s) => s.project);
  const fovRef = useRef(fov);
  fovRef.current = fov;

  useEffect(() => {
    // parte dal centro della stanza più grande, ad altezza occhi, guardando verso il centro della casa
    const dd = derive(project);
    const rooms = dd.rooms;
    const big = focusedRoom(dd, useStore.getState().focus) ?? rooms.slice().sort((a, b) => b.area - a.area)[0];
    const start = big ? labelPoint(big.inner.length >= 3 ? big.inner : big.poly) : null;
    const ns = Object.values(project.nodes);
    const cx = ns.reduce((a, n) => a + n.x, 0) / Math.max(1, ns.length);
    const cy = ns.reduce((a, n) => a + n.y, 0) / Math.max(1, ns.length);
    const p = start ?? { x: cx, y: cy };
    camera.position.set(p.x * S, 1.6, p.y * S);
    camera.near = 0.05;
    camera.far = 200;
    camera.lookAt(cx * S + (cx === p.x ? 1 : 0), 1.6, cy * S);
    const d = (e: KeyboardEvent) => (keys.current[e.code] = true);
    const u = (e: KeyboardEvent) => (keys.current[e.code] = false);
    // rotellina = campo visivo (più grande = vedi più ambiente)
    // proporzionale allo scorrimento (rotellina a scatti o trackpad): ~2–3° per scatto
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      const step = Math.max(-6, Math.min(6, dy * 0.025));
      const next = Math.round(Math.max(FOV_MIN, Math.min(FOV_MAX, fovRef.current + step)) * 10) / 10;
      fovRef.current = next;
      onFov(next);
    };
    const el = gl.domElement;
    window.addEventListener('keydown', d);
    window.addEventListener('keyup', u);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', d);
      window.removeEventListener('keyup', u);
      el.removeEventListener('wheel', wheel);
      camera.fov = ORBIT_FOV;
      camera.updateProjectionMatrix();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }, [fov, camera]);

  useFrame((_, dt) => {
    const k = keys.current;
    const f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const r = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    if (!f && !r) return;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
    const v = speed * (k.ShiftLeft || k.ShiftRight ? 2 : 1);
    camera.position.addScaledVector(dir, f * dt * v).addScaledVector(right, r * dt * v);
    camera.position.y = 1.6;
  });
  // il blocco del puntatore richiede un clic dell'utente: si attiva cliccando nella vista
  const wasLocked = useRef(false);
  return <PointerLockControls selector=".scene3d canvas" onLock={() => (wasLocked.current = true)} onUnlock={() => wasLocked.current && onExit()} />;
}

function World({ cutaway, interactive }: { cutaway: boolean; interactive: boolean }) {
  const project = useStore((s) => s.project);
  const der = useDerived(project);
  const selection = useStore((s) => s.selection);
  const focus = useStore((s) => s.focus);
  const fr = focusedRoom(der, focus);
  // «arreda questa stanza»: solo i muri che la delimitano
  const focusWalls = useMemo(() => {
    if (!fr) return null;
    const set = new Set<string>();
    const n = fr.nodeIds.length;
    for (let i = 0; i < n; i++) {
      const a = fr.nodeIds[i];
      const b = fr.nodeIds[(i + 1) % n];
      for (const w of Object.values(project.walls)) if ((w.a === a && w.b === b) || (w.a === b && w.b === a)) set.add(w.id);
    }
    return set;
  }, [fr, project.walls]);

  const wallGeos = useMemo(() => {
    const byWall = new Map<string, Opening[]>();
    for (const o of Object.values(project.openings)) {
      if (!byWall.has(o.wallId)) byWall.set(o.wallId, []);
      byWall.get(o.wallId)!.push(o);
    }
    const out: { id: string; geo: THREE.BufferGeometry; color?: string }[] = [];
    for (const w of Object.values(project.walls)) {
      if (focusWalls && !focusWalls.has(w.id)) continue;
      const c = der.corners.get(w.id);
      if (!c) continue;
      const ww = cutaway ? { ...w, height: Math.min(w.height, 110) } : w;
      out.push({ id: w.id, geo: buildWallGeometry(project, ww, c, byWall.get(w.id) ?? [], degree(project, w.a) === 1, degree(project, w.b) === 1), color: w.color });
    }
    return out;
  }, [project, der, cutaway, focusWalls]);
  useEffect(() => () => wallGeos.forEach((g) => g.geo.dispose()), [wallGeos]);

  const floors = useMemo(
    () =>
      der.rooms.filter((r) => !fr || r.key === fr.key).map((r) => ({
        key: r.key,
        // 8 mm sopra il pavimento generale: abbastanza per evitare lo sfarfallio (z-fighting)
        geo: buildFloorGeometry(r.poly, 0.008),
        color: der.roomLabel.get(r.key)?.floorColor ?? '#d9c2a0',
      })),
    [der, fr],
  );
  useEffect(() => () => floors.forEach((f) => f.geo.dispose()), [floors]);

  // pavimento continuo sotto tutta la casa (anche dove le stanze non sono ancora chiuse)
  const base = useMemo(() => {
    const ns = Object.values(project.nodes);
    if (ns.length < 2) return null;
    const xs = ns.map((n) => n.x);
    const ys = ns.map((n) => n.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    return { cx: ((x0 + x1) / 2) * S, cz: ((y0 + y1) / 2) * S, w: (x1 - x0) * S, d: (y1 - y0) * S };
  }, [project.nodes]);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.03, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#e3e6ea" polygonOffset polygonOffsetFactor={4} polygonOffsetUnits={4} />
      </mesh>
      {base && !fr && (
        <mesh rotation-x={-Math.PI / 2} position={[base.cx, 0, base.cz]} receiveShadow>
          <planeGeometry args={[base.w, base.d]} />
          <meshStandardMaterial color="#d6c3a3" roughness={0.85} polygonOffset polygonOffsetFactor={2} polygonOffsetUnits={2} />
        </mesh>
      )}
      {floors.map((f) => (
        <mesh key={f.key} geometry={f.geo} receiveShadow onClick={interactive ? (e) => (e.stopPropagation(), useStore.getState().select({ kind: 'room', id: f.key })) : undefined}>
          <meshStandardMaterial color={f.color} side={THREE.DoubleSide} roughness={0.8} />
        </mesh>
      ))}
      {wallGeos.map((g) => {
        const sel = selection?.kind === 'wall' && selection.id === g.id;
        return (
          <mesh
            key={g.id}
            geometry={g.geo}
            castShadow
            receiveShadow
            onClick={!interactive ? undefined : (e) => {
              e.stopPropagation();
              useStore.getState().select({ kind: 'wall', id: g.id });
            }}
          >
            <meshStandardMaterial color={sel ? '#7fb2f0' : g.color ?? '#f4f1ec'} side={THREE.DoubleSide} roughness={0.9} />
          </mesh>
        );
      })}
      {Object.values(project.openings)
        .filter((o) => !focusWalls || focusWalls.has(o.wallId))
        .map((o) => (
        <Opening3D key={o.id} p={project} o={o} cutaway={cutaway} isSel={selection?.kind === 'opening' && selection.id === o.id} />
      ))}
      {Object.values(project.items)
        .filter((it) => !fr || pointInPolygon(it, fr.poly))
        .map((it) => (
        <Item3D key={it.id} it={it} selected={selection?.kind === 'item' && selection.id === it.id} interactive={interactive} />
      ))}
    </group>
  );
}

function Opening3D({ p, o, cutaway, isSel }: { p: Project; o: Opening; cutaway: boolean; isSel: boolean }) {
  const w = p.walls[o.wallId];
  if (!w) return null;
  const A = p.nodes[w.a];
  const B = p.nodes[w.b];
  const dir = norm(sub(B, A));
  const n = perp(dir);
  const c = add(A, mul(dir, o.offset));
  const ang = -Math.atan2(dir.y, dir.x);
  const frame = isSel ? '#2f7de1' : '#ffffff';
  if (o.type === 'window') {
    if (cutaway && o.sill > 110) return null;
    const h = cutaway ? Math.min(o.height, 110 - o.sill) : o.height;
    if (h <= 0) return null;
    return (
      <group position={[c.x * S, (o.sill + h / 2) * S, c.y * S]} rotation-y={ang}>
        <mesh>
          <boxGeometry args={[o.width * S, h * S, 0.02]} />
          <meshPhysicalMaterial color="#bfe3f2" transparent opacity={0.35} roughness={0.05} />
        </mesh>
        {[-1, 1].map((k) => (
          <mesh key={k} position={[(k * (o.width / 2 - 2.5)) * S, 0, 0]}>
            <boxGeometry args={[0.05, h * S, 0.07]} />
            <meshStandardMaterial color={frame} />
          </mesh>
        ))}
        {[-1, 1].map((k) => (
          <mesh key={'h' + k} position={[0, (k * (h / 2 - 2.5)) * S, 0]}>
            <boxGeometry args={[o.width * S, 0.05, 0.07]} />
            <meshStandardMaterial color={frame} />
          </mesh>
        ))}
        <mesh>
          <boxGeometry args={[0.04, h * S, 0.05]} />
          <meshStandardMaterial color={frame} />
        </mesh>
      </group>
    );
  }
  if (o.type === 'sliding') {
    // ante scorrevoli (SKYTTA): pannelli sfalsati sul piano del muro + binario in alto
    const h = cutaway ? Math.min(o.height, 110) : o.height;
    const nP = o.width > 220 ? 3 : 2;
    const pw = o.width / nP + 4;
    return (
      <group position={[c.x * S, 0, c.y * S]} rotation-y={ang}>
        {Array.from({ length: nP }, (_, i) => {
          const x = -o.width / 2 + (o.width / nP) * (i + 0.5);
          const zz = (i % 2 ? -1 : 1) * Math.min(3, w.thickness / 4);
          return (
            <group key={i} position={[x * S, (h / 2) * S, zz * S]}>
              <mesh castShadow={o.finish === 'white' || o.finish === 'mirror'}>
                <boxGeometry args={[pw * S, (h - 4) * S, 0.012]} />
                <SlidingPanelMaterial finish={o.finish ?? 'glass'} selected={isSel} />
              </mesh>
              {[-1, 1].map((k) => (
                <mesh key={k} position={[(k * (pw / 2 - 1)) * S, 0, 0]}>
                  <boxGeometry args={[0.02, (h - 4) * S, 0.025]} />
                  <meshStandardMaterial color="#b8bcc0" metalness={0.4} roughness={0.4} />
                </mesh>
              ))}
            </group>
          );
        })}
        {!cutaway && (
          <mesh position={[0, (h - 1.5) * S, 0]}>
            <boxGeometry args={[o.width * S, 0.03, Math.max(0.05, (w.thickness - 2) * S)]} />
            <meshStandardMaterial color="#b8bcc0" metalness={0.4} roughness={0.4} />
          </mesh>
        )}
      </group>
    );
  }
  if (o.type === 'door') {
    // anta aperta a 90° sul lato scelto
    const hingeU = o.flipHinge ? o.offset + o.width / 2 : o.offset - o.width / 2;
    const side = o.flipSide ? -1 : 1;
    const hinge = add(add(A, mul(dir, hingeU)), mul(n, side * (w.thickness / 2)));
    const leafMid = add(hinge, mul(n, (side * o.width) / 2));
    const h = cutaway ? Math.min(o.height, 110) : o.height;
    return (
      <group>
        <mesh position={[leafMid.x * S, (h / 2) * S, leafMid.y * S]} rotation-y={ang + Math.PI / 2} castShadow>
          <boxGeometry args={[o.width * S, h * S, 0.04]} />
          <meshStandardMaterial color={isSel ? '#7fb2f0' : '#c8a27a'} />
        </mesh>
      </group>
    );
  }
  return null;
}

/** materiale delle ante scorrevoli secondo la finitura scelta */
function SlidingPanelMaterial({ finish, selected }: { finish: NonNullable<Opening['finish']>; selected: boolean }) {
  if (selected) return <meshStandardMaterial color="#7fb2f0" transparent opacity={finish === 'glass' ? 0.45 : 0.85} />;
  if (finish === 'white') return <meshStandardMaterial color="#f1efe9" roughness={0.6} />;
  if (finish === 'mirror') return <meshStandardMaterial color="#dfe6ea" metalness={0.95} roughness={0.05} />;
  if (finish === 'frosted') return <meshPhysicalMaterial color="#eef3f5" transparent opacity={0.72} roughness={0.9} depthWrite={false} />;
  return <meshPhysicalMaterial color="#cfe8f0" transparent opacity={0.22} roughness={0.05} depthWrite={false} />;
}

const tmpPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function Item3D({ it, selected, interactive = true }: { it: Item; selected: boolean; interactive?: boolean }) {
  const cat = CATALOG_BY_ID[it.catalogId];
  const parts = useMemo(() => (cat ? scaledParts(cat, it.w, it.d, it.h, it.color) : []), [cat, it.w, it.d, it.h, it.color]);
  const drag = useRef<{ off: THREE.Vector3 } | null>(null);
  const controls = useThree((s) => s.controls) as any;
  if (!cat) return null;

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const st = useStore.getState();
    st.select({ kind: 'item', id: it.id });
    const hit = new THREE.Vector3();
    e.ray.intersectPlane(tmpPlane, hit);
    drag.current = { off: new THREE.Vector3(hit.x - it.x * S, 0, hit.z - it.y * S) };
    st.beginDrag();
    if (controls) controls.enabled = false;
    (e.target as any).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    e.stopPropagation();
    const hit = new THREE.Vector3();
    if (!e.ray.intersectPlane(tmpPlane, hit)) return;
    const st = useStore.getState();
    const x = (hit.x - drag.current.off.x) / S;
    const y = (hit.z - drag.current.off.z) / S;
    const cur = st.project.items[it.id];
    const m = e.shiftKey ? null : magnetToWall(st.project, { ...cur, x, y });
    st.updateItem(it.id, m ?? { x: Math.round(x), y: Math.round(y) });
  };
  const onUp = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    e.stopPropagation();
    drag.current = null;
    useStore.getState().endDrag();
    if (controls) controls.enabled = true;
  };

  return (
    <group position={[it.x * S, it.z * S, it.y * S]} rotation-y={-it.rotation} onPointerDown={interactive ? onDown : undefined} onPointerMove={interactive ? onMove : undefined} onPointerUp={interactive ? onUp : undefined}>
      {parts.map((pt, i) => {
        const pos: [number, number, number] = [pt.p[0] * S, pt.p[1] * S, pt.p[2] * S];
        const mat = <meshStandardMaterial color={pt.c} transparent={pt.o !== undefined} opacity={pt.o ?? 1} roughness={0.7} />;
        if (pt.t === 'box')
          return (
            <mesh key={i} position={pos} castShadow receiveShadow>
              <boxGeometry args={[pt.s[0] * S, pt.s[1] * S, pt.s[2] * S]} />
              {mat}
            </mesh>
          );
        if (pt.t === 'cyl')
          return (
            <mesh key={i} position={pos} castShadow receiveShadow>
              <cylinderGeometry args={[pt.r * S, pt.r * S, pt.h * S, 24]} />
              {mat}
            </mesh>
          );
        return (
          <mesh key={i} position={pos} castShadow>
            <sphereGeometry args={[pt.r * S, 16, 12]} />
            {mat}
          </mesh>
        );
      })}
      {selected && (
        <mesh position={[0, (it.h / 2) * S, 0]}>
          <boxGeometry args={[it.w * S + 0.02, it.h * S + 0.02, it.d * S + 0.02]} />
          <meshBasicMaterial color="#2f7de1" wireframe />
        </mesh>
      )}
    </group>
  );
}
