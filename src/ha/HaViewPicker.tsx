// Anteprima 3D della finestra «🏠 Home Assistant»: si trascina la casa per scegliere da dove guardarla.
// La vista scelta (rotazione e inclinazione) è quella che poi viene renderizzata per la mappa.
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitImpl } from 'three-stdlib';
import { World } from '../three/Scene3D';
import { S } from '../three/wallGeometry';
import { useStore } from '../model/store';
import { rig } from './HaCaptureCanvas';
import { anglesFrom, type HaView } from './views';

export interface PickerProps {
  view: Exclude<HaView, '2d'>;
  azimuth: number;
  elevation: number;
  cutaway: boolean;
  /** cambia quando la camera va rimessa sugli angoli dati (es. «Reimposta», cambio vista) */
  resetKey: number;
  /** formato fisso dell'immagine (larghezza/altezza): il riquadro prende la stessa forma */
  aspect?: number;
  onChange: (a: { azimuth: number; elevation: number }) => void;
}

const MIN_EL = 20;
const MAX_EL = 80;
const deg = Math.PI / 180;

function useHouseFrame(cutaway: boolean) {
  const nodes = useStore((s) => s.project.nodes);
  const walls = useStore((s) => s.project.walls);
  return useMemo(() => {
    const ns = Object.values(nodes);
    if (!ns.length) return { center: new THREE.Vector3(), radius: 5 };
    const xs = ns.map((n) => n.x);
    const ys = ns.map((n) => n.y);
    const H = cutaway ? 110 : Math.max(250, ...Object.values(walls).map((w) => w.height));
    const box = new THREE.Box3(new THREE.Vector3(Math.min(...xs) * S, 0, Math.min(...ys) * S), new THREE.Vector3(Math.max(...xs) * S, H * S, Math.max(...ys) * S));
    return { center: box.getCenter(new THREE.Vector3()), radius: box.getSize(new THREE.Vector3()).length() / 2 };
  }, [nodes, walls, cutaway]);
}

function Rig({ view, azimuth, elevation, cutaway, resetKey, onChange }: PickerProps) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const invalidate = useThree((s) => s.invalidate);
  const ctl = useRef<OrbitImpl>(null);
  const { center, radius } = useHouseFrame(cutaway);
  const top = view === 'top';
  const target = useMemo(() => (top ? new THREE.Vector3(center.x, 0, center.z) : center.clone()), [center, top]);
  const light = useMemo(() => rig('bright'), []);
  // inquadratura: distanza perché la casa stia tutta nel riquadro
  const distance = (radius / Math.sin((camera.fov * deg) / 2)) * 0.8;

  // rimette la camera sugli angoli dati (all'apertura, al cambio vista, con «Reimposta»)
  useEffect(() => {
    const az = azimuth * deg;
    // dall'alto: quasi a picco, la rotazione gira la pianta
    const el = (top ? 89.9 : Math.max(MIN_EL, Math.min(MAX_EL, elevation))) * deg;
    camera.position.set(target.x + Math.sin(az) * Math.cos(el) * distance, target.y + Math.sin(el) * distance, target.z + Math.cos(az) * Math.cos(el) * distance);
    camera.near = distance / 100;
    camera.far = distance * 10;
    camera.updateProjectionMatrix();
    camera.lookAt(target);
    ctl.current?.target.copy(target);
    ctl.current?.update();
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, view, target, distance]);

  return (
    <>
      <primitive object={light} />
      <World cutaway={cutaway} interactive={false} exportMode />
      <OrbitControls
        ref={ctl as never}
        makeDefault
        target={target}
        enableZoom={false}
        enablePan={false}
        rotateSpeed={0.6}
        minPolarAngle={top ? 0.0001 : (90 - MAX_EL) * deg}
        maxPolarAngle={top ? 0.0002 : (90 - MIN_EL) * deg}
        onChange={() => {
          const c = ctl.current;
          if (!c) return;
          if (top) onChange({ azimuth: Math.round((c.getAzimuthalAngle() / deg) * 10) / 10, elevation });
          else {
            const a = anglesFrom(camera.position, c.target);
            onChange({ azimuth: Math.round(a.azimuth * 10) / 10, elevation: Math.round(a.elevation * 10) / 10 });
          }
        }}
      />
    </>
  );
}

export function HaViewPicker(props: PickerProps) {
  return (
    <div
      className="ha-picker"
      style={props.aspect ? (props.aspect >= 1 ? { aspectRatio: String(props.aspect), height: 'auto', maxHeight: 260 } : { aspectRatio: String(props.aspect), width: 'auto', height: 260, alignSelf: 'center' }) : undefined}
      data-tip={props.view === 'top' ? 'Trascina per girare la pianta' : 'Trascina per girare la casa e scegliere da dove guardarla'}>
      <Canvas key={props.view === 'persp' ? 'p' : 'o'} frameloop="demand" dpr={[1, 2]} gl={{ logarithmicDepthBuffer: true, antialias: true }} camera={{ fov: props.view === 'persp' ? 35 : 15 }}>
        <color attach="background" args={['#eef1f5']} />
        <Rig {...props} />
      </Canvas>
    </div>
  );
}
