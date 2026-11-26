// «🏠 Home Assistant»: crea la mappa interattiva per la card ha-floorplan e la scarica come ZIP.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../model/store';
import { derive } from '../model/derived';
import { collectEntities, slugify } from '../ha/entities';
import { buildBundle, haBase, zipBundle, type BundleFiles } from '../ha/bundle';
import { buildCss } from '../ha/css';
import { HaCaptureCanvas, type CaptureApi, type HaLook } from '../ha/HaCaptureCanvas';
import { VIEW_NAMES, type HaView } from '../ha/views';
import { notify } from './Notice';

const RES = [1024, 1600, 2048];

function pngDataUrl(b: Uint8Array) {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return 'data:image/png;base64,' + btoa(s);
}

/** pagina di prova dentro l'anteprima: clic su stanze e simboli per accendere/spegnere le luci, come farà Home Assistant */
function previewDoc(svg: string, css: string) {
  return `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;background:#1c1f24;}
#floorplan{padding:8px;box-sizing:border-box;height:100vh;display:flex;align-items:center;justify-content:center;}
${css}
#floorplan > svg{width:auto;height:auto;max-width:100%;max-height:100%;}
</style><div id="floorplan">${svg.replace(/^<\?xml[^>]*>/, '')}</div><script>
const $ = (id) => document.getElementById(id);
const setLight = (id, on) => {
  for (const el of [$(id), $(id + '.marker')]) if (el) { el.classList.toggle('light-on', on); el.classList.toggle('light-off', !on); }
};
document.querySelectorAll('#lights > *').forEach((el) => setLight(el.id, false));
const toggle = (id) => setLight(id, !$(id).classList.contains('light-on'));
document.querySelectorAll('#light-markers circle').forEach((el) => el.addEventListener('click', () => toggle(el.id.replace(/\\.marker$/, ''))));
document.querySelectorAll('#areas polygon').forEach((el) => el.addEventListener('click', () => el.dataset.light && toggle(el.dataset.light)));
document.querySelectorAll('#contacts polygon').forEach((el) => el.addEventListener('click', () => el.classList.toggle('contact-on')));
// sensori di prova: clic per cambiare stato
const DEMO = { temperature: ['21,5 °C', '25,8 °C'], humidity: ['48 %', '71 %'], co2: ['650 ppm', '950 ppm', '1400 ppm'], door: ['Chiusa', 'Aperta'], window: ['Chiusa', 'Aperta'], generic: ['on', 'off'] };
document.querySelectorAll('#sensors g.sensor').forEach((g) => {
  const kind = g.dataset.kind; const t = g.querySelector('text[id]'); const bg = g.querySelector('rect'); let k = 0;
  const icon = t.textContent.replace(' --', '');
  const show = () => {
    const v = DEMO[kind][k];
    t.textContent = icon + ' ' + v;
    if (kind === 'door' || kind === 'window') bg.setAttribute('class', v === 'Aperta' ? 'sensor-on' : 'sensor-off');
    if (kind === 'co2') bg.setAttribute('class', 'co2-' + ['good', 'fair', 'bad'][k]);
  };
  show();
  g.addEventListener('click', () => { k = (k + 1) % DEMO[kind].length; show(); });
});
const sun = $('sun.sun'); if (sun) document.body.addEventListener('keydown', (e) => e.key === 'g' && sun.classList.toggle('sun-below_horizon'));
</script>`;
}

export function HaExportDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const [view, setView] = useState<HaView>('top');
  const [res, setRes] = useState(1600);
  const [azimuth, setAzimuth] = useState(25);
  const [elevation, setElevation] = useState(45);
  const [cutaway, setCutaway] = useState(false);
  const [look, setLook] = useState<HaLook>('bright');
  const [slug, setSlug] = useState(() => slugify(project.name || 'casa'));
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState<{ bundle: BundleFiles; doc: string; view: HaView } | null>(null);
  const api = useRef<CaptureApi | null>(null);
  const onReady = useCallback((a: CaptureApi) => (api.current = a), []);

  const der = useMemo(() => derive(project), [project]);
  const ents = useMemo(() => collectEntities(project, der), [project, der]);
  const nWalls = Object.keys(project.walls).length;

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [busy, onClose]);

  const generate = async () => {
    const s = slugify(slug);
    setSlug(s);
    setResult(null);
    try {
      let bundle: BundleFiles;
      if (view === '2d') bundle = buildBundle(project, view, s);
      else {
        if (!api.current) throw new Error('la scena 3D non è ancora pronta, riprova tra un attimo');
        const r = await api.current.capture(project, view, { res, azimuth, elevation, cutaway }, ents.lights, look, setBusy);
        bundle = buildBundle(project, view, s, r);
      }
      // anteprima: le immagini puntano a /local/… di Home Assistant, qui le sostituisco con copie locali
      let svg = bundle.files[`${s}.svg`] as string;
      for (const [path, data] of Object.entries(bundle.files)) {
        if (path.endsWith('.png')) svg = svg.split(`"${haBase(s)}${path}"`).join(`"${pngDataUrl(data as Uint8Array)}"`);
      }
      // nell'anteprima toccando una stanza si accende la sua luce
      for (const a of bundle.layout.areas) if (a.entity) svg = svg.replace(`id="${a.id}"`, `id="${a.id}" data-light="${a.entity}"`);
      setResult({ bundle, doc: previewDoc(svg, buildCss(view)), view });
      setBusy('');
    } catch (e) {
      setBusy('');
      notify('Non riesco a creare la mappa: ' + (e as Error).message, true);
    }
  };

  const download = () => {
    if (!result) return;
    const s = slugify(slug);
    const zip = zipBundle(s, result.bundle.files);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }));
    a.download = `floorplan-${s}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    notify(`Scaricato «floorplan-${s}.zip»: copia la cartella floorplan in /config/www/ di Home Assistant`);
  };

  const copyYaml = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.bundle.yaml);
      notify('YAML copiato: incollalo in una card Manuale della dashboard');
    } catch {
      notify('Non riesco a copiare: apri il file .yaml dentro lo ZIP', true);
    }
  };

  const tilted = view === 'iso' || view === 'persp';
  return (
    <div className="wizard-back" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="wizard ha-export">
        <header>
          <h2>🏠 Mappa per Home Assistant</h2>
          <span className="muted small">card ha-floorplan</span>
          <span style={{ flex: 1 }} />
          <button className="x" onClick={onClose} disabled={!!busy}>
            ✕
          </button>
        </header>
        <div className="body ha-body">
          <div className="ha-opts">
            {!nWalls && <p className="warn">Disegna prima la casa: non ci sono muri.</p>}
            <span className="muted small">Vista</span>
            <div className="row presets">
              {(Object.keys(VIEW_NAMES) as HaView[]).map((v) => (
                <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
                  {VIEW_NAMES[v]}
                </button>
              ))}
            </div>
            {view !== '2d' && (
              <>
                <span className="muted small">Dimensione immagine (lato lungo)</span>
                <div className="row presets">
                  {RES.map((r) => (
                    <button key={r} className={res === r ? 'on' : ''} onClick={() => setRes(r)}>
                      {r} px
                    </button>
                  ))}
                </div>
                {tilted && (
                  <>
                    <label className="prop" data-tip="Da che lato guardi la casa">
                      <span>Rotazione</span>
                      <input type="range" min={-180} max={180} step={5} value={azimuth} onChange={(e) => setAzimuth(+e.target.value)} />
                      <em>{azimuth}°</em>
                    </label>
                    <label className="prop" data-tip="Quanto dall'alto: 90° = perpendicolare">
                      <span>Inclinazione</span>
                      <input type="range" min={20} max={80} step={5} value={elevation} onChange={(e) => setElevation(+e.target.value)} />
                      <em>{elevation}°</em>
                    </label>
                  </>
                )}
                <label className="check">
                  <input type="checkbox" checked={cutaway} onChange={(e) => setCutaway(e.target.checked)} /> Muri bassi (si vede meglio dentro le stanze)
                </label>
                <span className="muted small">Aspetto</span>
                <div className="row presets">
                  <button className={look === 'bright' ? 'on' : ''} onClick={() => setLook('bright')} data-tip="Casa sempre chiara, senza ombre: le luci accese la illuminano">
                    ☀ Sempre chiara
                  </button>
                  <button className={look === 'daynight' ? 'on' : ''} onClick={() => setLook('daynight')} data-tip="Di giorno chiara con le ombre del sole, dopo il tramonto buia (segue sun.sun)">
                    🌙 Giorno/notte
                  </button>
                </div>
              </>
            )}
            <label className="prop" data-tip="Nome della cartella in Home Assistant: /config/www/floorplan/<nome>/">
              <span>Cartella</span>
              <input value={slug} onChange={(e) => setSlug(e.target.value)} onBlur={() => setSlug(slugify(slug))} />
            </label>
            <p className="muted small" style={{ margin: 0 }}>
              → <code>{haBase(slugify(slug))}</code>
            </p>

            <span className="muted small">Entità collegate</span>
            <ul className="ha-ents">
              <li>💡 {ents.lights.length} luci{view !== '2d' && ents.lights.length > 0 && ` (${ents.lights.length} render)`}</li>
              <li>🌡 {ents.sensors.length} sensori</li>
              <li>🚪 {ents.contacts.length} porte/finestre con sensore</li>
              <li>📹 {ents.cameras.length} telecamere</li>
            </ul>
            {!ents.lights.length && !ents.sensors.length && <p className="warn small">Nessuna luce o sensore: aggiungili con 💡 Luce e 🌡 Sensore nella barra «Disegna» e scrivi la loro entità.</p>}
            {ents.warnings.map((w) => (
              <p key={w} className="warn small">
                {w}
              </p>
            ))}
            <div className="row">
              <button className="primary" disabled={!nWalls || !!busy} onClick={generate}>
                {busy ? '⏳ Creo…' : result ? '↻ Rigenera' : '✨ Crea mappa'}
              </button>
              <button disabled={!result || !!busy} onClick={download}>
                ⬇ Scarica ZIP
              </button>
              <button disabled={!result || !!busy} onClick={copyYaml} data-tip="Copia la configurazione della card da incollare in Home Assistant">
                📋 Copia YAML
              </button>
            </div>
          </div>
          <div className="ha-preview">
            {busy && <p className="muted">{busy}</p>}
            {!busy && !result && <p className="muted">Scegli la vista e premi «✨ Crea mappa» per vedere l'anteprima.</p>}
            {result && !busy && (
              <>
                <iframe title="Anteprima mappa" srcDoc={result.doc} sandbox="allow-scripts" />
                <p className="muted small" style={{ margin: 0 }}>
                  Prova: clicca le stanze o i pallini gialli per accendere le luci, una porta per «aprirla»{result.view !== '2d' && look === 'daynight' ? ', G per giorno/notte' : ''}.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
      {view !== '2d' && <HaCaptureCanvas cutaway={cutaway} onReady={onReady} />}
    </div>
  );
}
