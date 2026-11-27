// Motori di render della mappa di Home Assistant.
// «fast»: three.js normale, con supersampling (bordi lisci) e ombreggiatura negli angoli (N8AO) sulle immagini di base.
// «high»: path tracing (three-gpu-pathtracer), con luce che rimbalza, ombre morbide e angoli scuri veri. Più lento.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { N8AOPass } from 'n8ao';
import { DenoiseMaterial, GradientEquirectTexture, WebGLPathTracer } from 'three-gpu-pathtracer';
import { S } from '../three/wallGeometry';
import type { Light } from '../model/types';
import { applyStyle, type RenderStyle } from '../three/styles';

export type HaQuality = 'fast' | 'high';
export type RigMode = 'day' | 'night' | 'bright';

export interface Engine {
  /** renderizza la scena con le luci di `mode` (+ la lampada) e mette il risultato, W×H, nel canvas 2D */
  /** `forLights`: render di riferimento per le lampade (stessi materiali dei render delle lampade) */
  shot(mode: RigMode, opts?: { lamp?: Light; ao?: boolean; forLights?: boolean; progress?: (pct: number) => void }): Promise<void>;
  dispose(): void;
}

const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

/** luci di scena per il render normale: «giorno» come nella vista 3D, «notte» quasi buio */
export function rig(mode: RigMode) {
  const g = new THREE.Group();
  if (mode === 'bright') {
    // luce piena e morbida, nessuna ombra: le facce dei muri si distinguono solo per l'orientamento
    g.add(new THREE.HemisphereLight('#ffffff', '#c8bca8', 1.1));
    g.add(new THREE.AmbientLight('#ffffff', 0.45));
    const key = new THREE.DirectionalLight('#ffffff', 0.9);
    key.position.set(8, 14, 6);
    g.add(key);
    const fill = new THREE.DirectionalLight('#ffffff', 0.35);
    fill.position.set(-6, 8, -10);
    g.add(fill);
  } else if (mode === 'day') {
    g.add(new THREE.HemisphereLight('#ffffff', '#b8a990', 0.7));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6);
    sun.position.set(8, 14, 6);
    sun.castShadow = true;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 });
    g.add(sun);
    g.add(new THREE.AmbientLight('#ffffff', 0.35));
    const fill = new THREE.DirectionalLight('#ffffff', 0.5);
    fill.position.set(-6, 8, -10);
    g.add(fill);
  } else {
    // sera: abbastanza luce da leggere muri e stanze, con un «chiaro di luna» che distingue le facce dei muri
    g.add(new THREE.HemisphereLight('#9aaad0', '#4a4238', 0.9));
    g.add(new THREE.AmbientLight('#8090b0', 0.3));
    const moon = new THREE.DirectionalLight('#b8c8ff', 0.45);
    moon.position.set(8, 14, 6);
    g.add(moon);
  }
  return g;
}

/** lampada: luce puntiforme con ombre (così non attraversa i muri) */
export function lamp(l: Light, shadows = true, scale = 1) {
  const h = Math.max(0.3, l.z * S);
  const pl = new THREE.PointLight(l.color, scale * (2 + 18 * l.intensity) * Math.max(1, (h * h) / 5.76), 0, 2);
  pl.position.set(l.x * S, h, l.y * S);
  if (shadows) {
    pl.castShadow = true;
    pl.shadow.mapSize.set(1024, 1024);
    pl.shadow.bias = -0.002;
    pl.shadow.camera.near = 0.05;
    pl.shadow.camera.far = 40;
  }
  return pl;
}

function removeAll(scene: THREE.Scene, objs: THREE.Object3D[]) {
  for (const x of objs) {
    scene.remove(x);
    x.traverse((n) => (n as THREE.PointLight).shadow?.dispose());
  }
}

/** copia il canvas WebGL (anche più grande, se supercampionato) nel canvas 2D W×H */
function grab(gl: THREE.WebGLRenderer, out: CanvasRenderingContext2D) {
  const { width, height } = out.canvas;
  out.clearRect(0, 0, width, height);
  out.imageSmoothingEnabled = true;
  out.imageSmoothingQuality = 'high';
  out.drawImage(gl.domElement, 0, 0, width, height);
}

/** ombreggiatura negli angoli (N8AO) + uscita con tone mapping e sRGB, come il render normale */
export function makeAoComposer(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, w: number, h: number) {
  const composer = new EffectComposer(gl, new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType }));
  composer.setPixelRatio(1);
  composer.setSize(w, h);
  const pass = new N8AOPass(scene, camera, w, h);
  // scena in metri: angoli e spigoli scuriti per una ventina di centimetri
  pass.configuration.aoRadius = 0.35;
  pass.configuration.distanceFalloff = 1;
  pass.configuration.intensity = 2.2;
  pass.configuration.gammaCorrection = false;
  pass.setQualityMode('High');
  composer.addPass(pass);
  composer.addPass(new OutputPass());
  return composer;
}

/** render normale: supersampling 2× e, sulle immagini di base, ombreggiatura negli angoli */
export function rasterEngine(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, out: CanvasRenderingContext2D, style: RenderStyle = 'normale'): Engine {
  const { width: W, height: H } = out.canvas;
  // con i contorni (Disegno, Blueprint) niente supersampling: le linee sono larghe 1 px e ridotte sparirebbero
  const ss = style === 'disegno' || style === 'blueprint' ? 1 : Math.max(1, Math.min(2, Math.floor(8192 / Math.max(W, H))));
  gl.setSize(W * ss, H * ss, false);
  let composer: EffectComposer | null = null;
  const ao = () => (composer ??= makeAoComposer(gl, scene, camera, W * ss, H * ss));
  const prevBg = scene.background;
  scene.background = null;
  return {
    async shot(mode, o = {}) {
      const objs = [rig(mode), ...(o.lamp ? [lamp(o.lamp)] : [])];
      for (const x of objs) scene.add(x);
      // Blueprint: le lampade (e il loro riferimento al buio) hanno bisogno di materiali che reagiscono alla luce
      applyStyle(scene, style, { lit: !!o.lamp || !!o.forLights });
      gl.shadowMap.needsUpdate = true;
      gl.render(scene, camera);
      grab(gl, out);
      if (o.ao) {
        // la trasparenza (fuori dalla casa) viene dal render normale, i colori da quello con l'ombreggiatura
        const alpha = out.getImageData(0, 0, W, H).data;
        gl.shadowMap.needsUpdate = true;
        ao().render();
        grab(gl, out);
        const img = out.getImageData(0, 0, W, H);
        const d = img.data;
        for (let i = 3; i < d.length; i += 4) d[i] = alpha[i];
        out.putImageData(img, 0, 0);
      }
      removeAll(scene, objs);
    },
    dispose() {
      composer?.dispose();
      scene.background = prevBg;
    },
  };
}

/** cielo uniforme per il path tracer: colore in alto e in basso, con la sua intensità */
export function sky(top: string, bottom: string) {
  const t = new GradientEquirectTexture(64);
  t.topColor.set(top);
  t.bottomColor.set(bottom);
  t.exponent = 1.5;
  t.update();
  return t;
}

/** path tracing: luce globale vera. `samples` campioni per immagine */
/** cieli del path tracer per giorno, «sempre chiara» e notte (texture da liberare con dispose) */
export function ptSkies(): Record<RigMode, { tex: GradientEquirectTexture; intensity: number }> {
  return {
    bright: { tex: sky('#ffffff', '#d8cfc0'), intensity: 0.78 },
    day: { tex: sky('#dfeaff', '#c9bba3'), intensity: 0.6 },
    night: { tex: sky('#8090b8', '#3a3530'), intensity: 0.2 },
  };
}

/** luci «vere» per il path tracer: il cielo fa da luce d'ambiente, più un sole/luna direzionale */
export function ptLights(mode: RigMode) {
  const g = new THREE.Group();
  const key = new THREE.DirectionalLight(mode === 'night' ? '#b8c8ff' : '#ffffff', mode === 'day' ? 1.8 : mode === 'bright' ? 0.55 : 0.2);
  key.position.set(8, 14, 6);
  g.add(key);
  return g;
}

/**
 * Filtro anti-grana: a ogni immagine mostrata il risultato del path tracer passa per uno «smart denoise» che
 * leviga la grana senza sciogliere i bordi. Forte con pochi campioni, poi sempre più leggero.
 */
export function addDenoise(pt: WebGLPathTracer) {
  const mat = new DenoiseMaterial({ premultipliedAlpha: false, transparent: true, blending: THREE.NoBlending });
  // come il materiale standard del path tracer applica tone mapping e conversione sRGB; l'alfa esce già
  // moltiplicato dal filtro (premultipliedAlpha: false per non moltiplicarlo due volte)
  const u = mat.uniforms as Record<string, THREE.IUniform>;
  pt.renderToCanvasCallback = (target, renderer, quad) => {
    const prev = quad.material;
    const n = pt.samples;
    u.map.value = target.texture;
    u.sigma.value = Math.max(1.5, 5 - n / 25);
    u.threshold.value = Math.max(0.04, 0.12 - n / 600);
    u.kSigma.value = 1.5;
    quad.material = mat;
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    quad.render(renderer);
    renderer.autoClear = auto;
    quad.material = prev;
  };
  return () => mat.dispose();
}

/** con la luce che rimbalza la stessa lampada illumina molto di più che nel render normale */
export const PT_LAMP_SCALE = 0.3;

export function pathEngine(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, out: CanvasRenderingContext2D, samples: number, style: RenderStyle = 'normale'): Engine {
  const { width: W, height: H } = out.canvas;
  gl.setSize(W, H, false);
  const pt = new WebGLPathTracer(gl);
  pt.renderDelay = 0;
  pt.fadeDuration = 0;
  pt.minSamples = 1;
  pt.rasterizeScene = false;
  pt.dynamicLowRes = false;
  pt.bounces = 5;
  pt.filterGlossyFactor = 0.5;
  pt.tiles.set(2, 2);
  const undenoise = addDenoise(pt);
  const prevEnv = scene.environment;
  const prevBg = scene.background;
  const prevEnvI = scene.environmentIntensity;
  scene.background = null;
  const skies = ptSkies();
  const lights = ptLights;
  let built = false;
  return {
    async shot(mode, o = {}) {
      const objs: THREE.Object3D[] = [lights(mode), ...(o.lamp ? [lamp(o.lamp, false, PT_LAMP_SCALE)] : [])];
      for (const x of objs) scene.add(x);
      scene.environment = skies[mode].tex;
      scene.environmentIntensity = skies[mode].intensity;
      if (!built) {
        // con i colori del progetto il path tracer usa anche le texture (parquet, piastrelle, intonaco…)
        applyStyle(scene, style === 'normale' ? 'realistico' : style);
        // la geometria non cambia tra un'immagine e l'altra: il BVH si costruisce una volta sola
        pt.setScene(scene, camera);
        built = true;
      } else {
        scene.updateMatrixWorld(true);
        pt.updateLights();
        pt.updateEnvironment();
      }
      pt.reset();
      const t0 = performance.now();
      let n = 0;
      // le lampade (solo la differenza di luce) si accontentano di metà campioni
      const want = o.lamp ? Math.ceil(samples / 2) : samples;
      while (pt.samples < want) {
        pt.renderSample();
        // ogni tanto lascia respirare la pagina (e il compilatore degli shader, la prima volta)
        if (++n % 3 === 0) {
          o.progress?.(Math.min(99, Math.round((pt.samples / want) * 100)));
          await frame();
        }
        if (performance.now() - t0 > 180_000) break;
      }
      grab(gl, out);
      removeAll(scene, objs);
    },
    dispose() {
      undenoise();
      pt.dispose();
      for (const s of Object.values(skies)) s.tex.dispose();
      scene.environment = prevEnv;
      scene.background = prevBg;
      scene.environmentIntensity = prevEnvI;
    },
  };
}
