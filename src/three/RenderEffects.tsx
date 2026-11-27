// Effetti della vista 3D: luci di scena (giorno/sera), lampade simulate, ombreggiatura negli angoli e path tracing.
import { addAfterEffect, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
import { useStore } from '../model/store';
import { addDenoise, lamp, makeAoComposer, PT_LAMP_SCALE, ptSkies, rig } from '../ha/renderEngine';

/** luci di scena: di giorno come sempre, di sera quelle delle mappe di Home Assistant */
export function SceneLights({ evening, shadows }: { evening: boolean; shadows: boolean }) {
  const night = useMemo(() => rig('night'), []);
  if (evening) return <primitive object={night} />;
  return (
    <>
      <hemisphereLight args={['#ffffff', '#b8a990', 0.7]} />
      <directionalLight position={[8, 14, 6]} intensity={shadows ? 1.6 : 1.1} castShadow={shadows} shadow-bias={-0.0005} shadow-normalBias={0.02} shadow-mapSize={[2048, 2048]} shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[-6, 8, -10]} intensity={0.5} />
      {!shadows && <ambientLight intensity={0.35} />}
    </>
  );
}

/** ombre delle lampade solo per le prime accese: ognuna costa 6 render della scena */
const MAX_LAMP_SHADOWS = 4;

/** una luce vera per ogni lampada accesa nella simulazione */
export function LampLights({ shadows, scale = 1 }: { shadows: boolean; scale?: number }) {
  const lights = useStore((s) => s.project.lights);
  const lit = useStore((s) => s.litLights);
  const objs = useMemo(
    () =>
      Object.values(lights ?? {})
        .filter((l) => lit[l.id])
        .map((l, i) => lamp(l, shadows && i < MAX_LAMP_SHADOWS, scale)),
    [lights, lit, shadows, scale],
  );
  useEffect(() => () => objs.forEach((o) => o.shadow?.dispose()), [objs]);
  return (
    <>
      {objs.map((o) => (
        <primitive key={o.uuid} object={o} />
      ))}
    </>
  );
}

/** ombreggiatura negli angoli (N8AO): prende il posto del render normale */
export function AOEffect() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const composer = useMemo(() => {
    const v = gl.getDrawingBufferSize(new THREE.Vector2());
    return makeAoComposer(gl, scene, camera, v.x, v.y);
  }, [gl, scene, camera]);
  useEffect(() => {
    const v = gl.getDrawingBufferSize(new THREE.Vector2());
    composer.setSize(v.x, v.y);
  }, [composer, gl, size]);
  useEffect(() => () => composer.dispose(), [composer]);
  useFrame(() => composer.render(), 1);
  return null;
}

/** richiesta di foto della vista: il path tracer, anche se ha finito, ridisegna un fotogramma */
const snapRequest = { pending: false };

/**
 * Foto della vista 3D (evento `planner:snap3d`): l'immagine si legge subito dopo il prossimo fotogramma
 * disegnato, quando il contenuto del canvas è ancora valido.
 */
export function SnapshotHandler() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const h = (e: Event) => {
      const { res, rej } = (e as CustomEvent<{ res: (b: Blob) => void; rej: (e: Error) => void }>).detail;
      e.preventDefault();
      snapRequest.pending = true;
      const unsub = addAfterEffect(() => {
        unsub();
        snapRequest.pending = false;
        gl.domElement.toBlob((b) => (b ? res(b) : rej(new Error('immagine non disponibile'))), 'image/png');
      });
    };
    window.addEventListener('planner:snap3d', h);
    return () => window.removeEventListener('planner:snap3d', h);
  }, [gl]);
  return null;
}

/** campioni dopo i quali l'immagine si considera finita */
const PT_MAX = 300;

/**
 * Path tracing progressivo: mentre la camera si muove si vede il render normale, appena si ferma l'immagine
 * diventa fotorealistica. `label`: elemento in cui scrivere l'avanzamento.
 */
export function PathTraceView({ evening, label }: { evening: boolean; label?: React.RefObject<HTMLElement | null> }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const project = useStore((s) => s.project);
  const lit = useStore((s) => s.litLights);
  const skies = useMemo(() => ptSkies(), []);
  const pt = useMemo(() => {
    const p = new WebGLPathTracer(gl);
    p.renderDelay = 0;
    p.fadeDuration = 0;
    p.minSamples = 1;
    p.dynamicLowRes = false;
    p.bounces = 5;
    p.filterGlossyFactor = 0.5;
    p.tiles.set(2, 2);
    return p;
  }, [gl]);
  useEffect(() => addDenoise(pt), [pt]);
  useEffect(
    () => () => {
      pt.dispose();
      Object.values(skies).forEach((s) => s.tex.dispose());
    },
    [pt, skies],
  );

  const state = useRef({ dirty: true, lightsDirty: false, moving: true, lastMove: 0, last: new THREE.Matrix4(), built: false });
  // geometria cambiata (muri, mobili…): il BVH va ricostruito, con calma
  useEffect(() => {
    state.current.dirty = true;
  }, [project]);
  useEffect(() => {
    state.current.lightsDirty = true;
  }, [lit, evening]);
  useEffect(() => {
    state.current.lastMove = performance.now();
    pt.updateCamera();
  }, [size, pt]);

  /** cielo come luce d'ambiente solo per il path tracer (il render normale resta com'è) */
  const withSky = (fn: () => void) => {
    const prev = scene.environment;
    const prevI = scene.environmentIntensity;
    const s = skies[evening ? 'night' : 'day'];
    scene.environment = s.tex;
    // di giorno ci sono già sole e luce di riempimento della vista: il cielo fa solo da ambiente
    scene.environmentIntensity = s.intensity * (evening ? 1 : 0.35);
    fn();
    scene.environment = prev;
    scene.environmentIntensity = prevI;
  };

  useFrame(() => {
    const st = state.current;
    const now = performance.now();
    camera.updateMatrixWorld();
    if (!st.last.equals(camera.matrixWorld)) {
      st.last.copy(camera.matrixWorld);
      st.lastMove = now;
      st.moving = true;
    }
    // in movimento (o appena dopo una modifica): render normale
    if (now - st.lastMove < 250 || (st.dirty && now - st.lastMove < 400)) {
      gl.render(scene, camera);
      if (label?.current) label.current.textContent = '';
      return;
    }
    if (st.moving || st.dirty || st.lightsDirty) {
      if (st.dirty || !st.built) {
        // gli oggetti senza materiale «fisico» (zone delle telecamere, selezione) restano fuori
        const hidden: THREE.Object3D[] = [];
        scene.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | undefined;
          if ((o as THREE.Mesh).isMesh && o.visible && m && !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
            o.visible = false;
            hidden.push(o);
          }
        });
        withSky(() => pt.setScene(scene, camera));
        hidden.forEach((o) => (o.visible = true));
        st.built = true;
      } else {
        scene.updateMatrixWorld(true);
        withSky(() => {
          pt.updateLights();
          pt.updateEnvironment();
        });
        pt.updateCamera();
      }
      st.dirty = st.lightsDirty = st.moving = false;
      pt.reset();
    }
    if (pt.samples < PT_MAX || snapRequest.pending) {
      pt.renderSample();
      if (label?.current) label.current.textContent = `✨ ${Math.floor(pt.samples)}/${PT_MAX}`;
    } else if (label?.current) label.current.textContent = '✨ pronto';
  }, 1);
  return <LampLights shadows={false} scale={PT_LAMP_SCALE} />;
}
