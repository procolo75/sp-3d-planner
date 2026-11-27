// «🏠 Home Assistant»: crea la mappa interattiva per la card ha-floorplan e la scarica come ZIP.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../model/store';
import { derive } from '../model/derived';
import { collectEntities, slugify } from '../ha/entities';
import { buildBundle, haBase, zipBundle, type BundleFiles, type Rendered } from '../ha/bundle';
import { mapRooms } from '../ha/layout';
import { dashboardPath } from '../ha/yaml';
import { pointInPolygon } from '../model/geom';
import { buildCss } from '../ha/css';
import { HaCaptureCanvas, type CaptureApi, type HaLook, type HaQuality } from '../ha/HaCaptureCanvas';
import { VIEW_NAMES, type HaView } from '../ha/views';
import { HaViewPicker } from '../ha/HaViewPicker';
import { notify } from './Notice';

/** formati dell'immagine: «adatta» = forma della casa (lato lungo), gli altri = schermi comuni */
const FORMATS: { id: string; name: string; fit?: number; w?: number; h?: number }[] = [
  { id: 'fit1024', name: 'Forma della casa · 1024 px', fit: 1024 },
  { id: 'fit1600', name: 'Forma della casa · 1600 px', fit: 1600 },
  { id: 'fit2048', name: 'Forma della casa · 2048 px', fit: 2048 },
  { id: 'fire10', name: 'Fire HD 10 orizzontale · 1920×1200', w: 1920, h: 1200 },
  { id: 'fire10v', name: 'Fire HD 10 verticale · 1200×1920', w: 1200, h: 1920 },
  { id: 'fhd', name: 'Full HD 16:9 · 1920×1080', w: 1920, h: 1080 },
  { id: 'qhd', name: 'Tablet 2K 16:10 · 2560×1600', w: 2560, h: 1600 },
  { id: 'ipad', name: 'iPad 4:3 · 2048×1536', w: 2048, h: 1536 },
  { id: 'hd', name: 'Tablet HD · 1280×800', w: 1280, h: 800 },
];
const MAX_PX = 4096;

/** vista di una stanza: rotazione/inclinazione e muri bassi (scelti nell'anteprima della stanza) */
interface RoomView {
  azimuth: number;
  elevation: number;
  cutaway: boolean;
}
/** viste delle stanze salvate nel browser, per cartella: non si perdono chiudendo la finestra */
const roomViewsKey = (slug: string) => `planner:ha-room-views:${slug}`;
function loadRoomViews(slug: string): Record<string, RoomView> {
  try {
    return JSON.parse(localStorage.getItem(roomViewsKey(slug)) ?? '{}');
  } catch {
    return {};
  }
}

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
document.querySelectorAll('#areas polygon').forEach((el) => {
  // mappa della casa con le pagine delle stanze: il clic apre la stanza, come farà Home Assistant
  el.addEventListener('click', () => (el.dataset.room ? parent.postMessage({ haRoom: el.dataset.room }, '*') : el.dataset.light && toggle(el.dataset.light)));
  el.addEventListener('contextmenu', (e) => { if (el.dataset.room && el.dataset.light) { e.preventDefault(); toggle(el.dataset.light); } });
});
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
  const [format, setFormat] = useState('fit1600');
  /** formato fisso: larghezza e altezza in pixel (anche scritte a mano) */
  const [size, setSize] = useState({ width: 1920, height: 1200 });
  const fmt = FORMATS.find((f) => f.id === format);
  const res = fmt?.fit ?? 1600;
  const fixed = !fmt?.fit;
  const [azimuth, setAzimuth] = useState(25);
  const [elevation, setElevation] = useState(45);
  /** vista dall'alto: rotazione della pianta (0 = come nel planner) */
  const [topRot, setTopRot] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [cutaway, setCutaway] = useState(false);
  const [look, setLook] = useState<HaLook>('bright');
  const [quality, setQuality] = useState<HaQuality>('fast');
  const [slug, setSlug] = useState(() => slugify(project.name || 'casa'));
  /** una pagina per stanza: toccando la stanza sulla mappa della casa si apre la sua */
  const [perRoom, setPerRoom] = useState(true);
  // indirizzo della dashboard in HA, ricordato per cartella (es. /dashboard-floorplan2)
  const [dashboard, setDashboard] = useState(() => localStorage.getItem(`planner:ha-dashboard:${slugify(slug)}`) ?? '');
  const dash = dashboardPath(dashboard || `dashboard-${slugify(slug)}`);
  const [busy, setBusy] = useState('');
  /** anteprime: casa (chiave '') e stanze (slug) */
  const [result, setResult] = useState<{ bundle: BundleFiles; docs: Map<string, string>; view: HaView } | null>(null);
  const [shown, setShown] = useState('');
  const api = useRef<CaptureApi | null>(null);
  const onReady = useCallback((a: CaptureApi) => (api.current = a), []);

  const der = useMemo(() => derive(project), [project]);
  const ents = useMemo(() => collectEntities(project, der), [project, der]);
  const nWalls = Object.keys(project.walls).length;
  const roomList = useMemo(() => mapRooms(der, ents), [der, ents]);
  const rooms = perRoom && roomList.length > 1;

  // vista di ogni stanza: la chiave distingue la vista dall'alto (solo rotazione) da quelle inclinate
  const [roomViews, setRoomViews] = useState<Record<string, RoomView>>(() => loadRoomViews(slugify(slug)));
  const [roomSel, setRoomSel] = useState('');
  const [roomReset, setRoomReset] = useState(0);
  const rvKey = (roomSlug: string) => `${view === 'top' ? 'top' : 'tilt'}:${roomSlug}`;
  const roomView = (roomSlug: string): RoomView => roomViews[rvKey(roomSlug)] ?? { azimuth: view === 'top' ? topRot : azimuth, elevation, cutaway: true };
  const setRoomView = (roomSlug: string, v: Partial<RoomView>) =>
    setRoomViews((all) => {
      const next = { ...all, [rvKey(roomSlug)]: { ...roomView(roomSlug), ...v } };
      try {
        localStorage.setItem(roomViewsKey(slugify(slug)), JSON.stringify(next));
      } catch {
        /* spazio pieno: pazienza */
      }
      return next;
    });
  const selRoom = roomList.find((a) => a.slug === roomSel) ?? roomList[0];
  const pickerRoom = useMemo(() => (selRoom ? { poly: selRoom.room.poly, at: der.roomLabelPos.get(selRoom.room.key) ?? selRoom.room.poly[0] } : undefined), [selRoom, der]);

  // clic su una stanza nell'anteprima della casa
  useEffect(() => {
    const m = (e: MessageEvent) => typeof e.data?.haRoom === 'string' && setShown(e.data.haRoom);
    window.addEventListener('message', m);
    return () => window.removeEventListener('message', m);
  }, []);

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
      const opts = rooms ? { dashboard: dash, rooms: new Map<string, Rendered>() } : {};
      if (view === '2d') bundle = buildBundle(project, view, s, undefined, opts);
      else {
        if (!api.current) throw new Error('la scena 3D non è ancora pronta, riprova tra un attimo');
        const vo = { res, size: fixed ? size : undefined, azimuth: view === 'top' ? topRot : azimuth, elevation, cutaway };
        const r = await api.current.capture(project, view, vo, ents.lights, look, setBusy, undefined, quality);
        if (rooms)
          for (let i = 0; i < roomList.length; i++) {
            const a = roomList[i];
            const tag = `Stanza ${i + 1}/${roomList.length}: ${a.name} · `;
            const lights = ents.lights.filter((l) => pointInPolygon(l, a.room.poly));
            const rv = roomView(a.slug);
            opts.rooms!.set(a.slug, await api.current.capture(project, view, { ...vo, azimuth: rv.azimuth, elevation: rv.elevation, cutaway: rv.cutaway }, lights, look, (m) => setBusy(tag + m), a.room, quality));
          }
        bundle = buildBundle(project, view, s, r, opts);
      }
      // anteprima: le immagini puntano a /local/… di Home Assistant, qui le sostituisco con copie locali
      const local = (svg: string) => {
        for (const [path, data] of Object.entries(bundle.files)) {
          if (path.endsWith('.png')) svg = svg.split(`"${haBase(s)}${path}"`).join(`"${pngDataUrl(data as Uint8Array)}"`);
        }
        return svg;
      };
      const css = buildCss(view);
      let svg = local(bundle.files[`${s}.svg`] as string);
      // nell'anteprima toccando una stanza si accende la sua luce (o si apre la stanza)
      const roomOf = new Map(bundle.rooms.map((x) => [x.areaId, x.slug]));
      for (const a of bundle.layout.areas) {
        const attrs = [a.entity ? `data-light="${a.entity}"` : '', roomOf.has(a.id) ? `data-room="${roomOf.get(a.id)}"` : ''].filter(Boolean).join(' ');
        if (attrs) svg = svg.replace(`id="${a.id}"`, `id="${a.id}" ${attrs}`);
      }
      const docs = new Map([['', previewDoc(svg, css)]]);
      for (const x of bundle.rooms) {
        let rs = local(x.svg);
        for (const a of x.layout.areas) if (a.entity) rs = rs.replace(`id="${a.id}"`, `id="${a.id}" data-light="${a.entity}"`);
        docs.set(x.slug, previewDoc(rs, css));
      }
      setResult({ bundle, docs, view });
      setShown('');
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
      notify(result.bundle.rooms.length ? "YAML copiato: incollalo nell'«Editor di configurazione raw» della dashboard" : 'YAML copiato: incollalo in una card Manuale della dashboard');
    } catch {
      notify('Non riesco a copiare: apri il file .yaml dentro lo ZIP', true);
    }
  };

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
            <label className="prop">
              <span>Vista</span>
              <select value={view} onChange={(e) => setView(e.target.value as HaView)}>
                {(Object.keys(VIEW_NAMES) as HaView[]).map((v) => (
                  <option key={v} value={v}>
                    {VIEW_NAMES[v]}
                  </option>
                ))}
              </select>
            </label>
            {view !== '2d' && (
              <>
                {nWalls > 0 && (
                  <HaViewPicker
                    view={view}
                    azimuth={view === 'top' ? topRot : azimuth}
                    elevation={elevation}
                    cutaway={cutaway}
                    resetKey={resetKey}
                    aspect={fixed && size.width > 0 && size.height > 0 ? size.width / size.height : undefined}
                    onChange={(a) => {
                      if (view === 'top') setTopRot(a.azimuth);
                      else {
                        setAzimuth(a.azimuth);
                        setElevation(a.elevation);
                      }
                    }}
                  />
                )}
                <div className="row ha-angles">
                  <span className="muted small">
                    {view === 'top' ? `Rotazione ${Math.round(topRot)}°` : `Rotazione ${Math.round(azimuth)}° · Inclinazione ${Math.round(elevation)}°`} — trascina la casa
                  </span>
                  <button
                    className="small"
                    onClick={() => {
                      if (view === 'top') setTopRot(0);
                      else {
                        setAzimuth(25);
                        setElevation(45);
                      }
                      setResetKey((k) => k + 1);
                    }}
                    data-tip="Torna alla vista di partenza"
                  >
                    ↺ Reimposta
                  </button>
                </div>
                <label className="prop" data-tip="«Forma della casa»: l'immagine ha la forma della casa. Gli altri formati hanno la misura dello schermo (es. il tablet a muro): la casa sta al centro e riempie lo schermo senza bande">
                  <span>Formato</span>
                  <select
                    value={format}
                    onChange={(e) => {
                      const f = FORMATS.find((x) => x.id === e.target.value);
                      setFormat(e.target.value);
                      if (f?.w && f.h) setSize({ width: f.w, height: f.h });
                    }}
                  >
                    {FORMATS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                    <option value="custom">Personalizzato…</option>
                  </select>
                </label>
                {fixed && (
                  <div className="row ha-size">
                    <label data-tip="Larghezza dell'immagine in pixel">
                      X
                      <input type="number" min={256} max={MAX_PX} step={10} value={size.width} onChange={(e) => (setFormat('custom'), setSize({ ...size, width: Math.min(MAX_PX, Math.max(0, +e.target.value || 0)) }))} onBlur={() => setSize((s) => ({ ...s, width: Math.max(256, s.width) }))} />
                    </label>
                    <button className="small" onClick={() => (setFormat(FORMATS.find((f) => f.w === size.height && f.h === size.width)?.id ?? 'custom'), setSize({ width: size.height, height: size.width }))} data-tip="Scambia: orizzontale ↔ verticale">
                      ⇄
                    </button>
                    <label data-tip="Altezza dell'immagine in pixel">
                      Y
                      <input type="number" min={256} max={MAX_PX} step={10} value={size.height} onChange={(e) => (setFormat('custom'), setSize({ ...size, height: Math.min(MAX_PX, Math.max(0, +e.target.value || 0)) }))} onBlur={() => setSize((s) => ({ ...s, height: Math.max(256, s.height) }))} />
                    </label>
                    <span className="muted small">px</span>
                  </div>
                )}
                <label className="check">
                  <input type="checkbox" checked={cutaway} onChange={(e) => setCutaway(e.target.checked)} /> Muri bassi (si vede meglio dentro le stanze)
                </label>
                <label className="prop" data-tip="☀ Sempre chiara: casa chiara e senza ombre, le luci accese la illuminano. 🌙 Giorno/notte: chiara di giorno con le ombre del sole, buia dopo il tramonto (segue sun.sun)">
                  <span>Aspetto</span>
                  <select value={look} onChange={(e) => setLook(e.target.value as HaLook)}>
                    <option value="bright">☀ Sempre chiara</option>
                    <option value="daynight">🌙 Giorno/notte</option>
                  </select>
                </label>
                <label className="prop" data-tip="Veloce: render normale con bordi lisci e angoli ombreggiati, pochi secondi. Alta: path tracing, la luce rimbalza davvero (ombre morbide, angoli e lampade realistici), ma ogni immagine richiede da qualche secondo a un minuto">
                  <span>Qualità</span>
                  <select value={quality} onChange={(e) => setQuality(e.target.value as HaQuality)}>
                    <option value="fast">⚡ Veloce</option>
                    <option value="high">✨ Alta (path tracing, lenta)</option>
                  </select>
                </label>
              </>
            )}
            {roomList.length > 1 && (
              <label className="check" data-tip="Toccando una stanza sulla mappa della casa si apre una pagina con la mappa di quella stanza, ingrandita. Tenendola premuta accendi/spegni la sua luce">
                <input type="checkbox" checked={perRoom} onChange={(e) => setPerRoom(e.target.checked)} /> Una pagina per ogni stanza ({roomList.length})
              </label>
            )}
            {rooms && (
              <>
                <label className="prop" data-tip="Indirizzo della dashboard in Home Assistant: crea una dashboard nuova (Impostazioni → Dashboard → Aggiungi) e copia qui la parte dell'indirizzo dopo il nome del server, es. /dashboard-casa">
                  <span>Dashboard</span>
                  <input value={dashboard} placeholder={dash} onChange={(e) => setDashboard(e.target.value)} onBlur={() => {
                      const d = dashboard.trim() ? dashboardPath(dashboard) : '';
                      setDashboard(d);
                      localStorage.setItem(`planner:ha-dashboard:${slugify(slug)}`, d);
                    }} />
                </label>
                <p className="muted small" style={{ margin: 0 }}>
                  → pagine <code>{dash}/casa</code>, <code>{dash}/{roomList[0].slug}</code>…
                </p>
                {view !== '2d' && selRoom && (
                  <div className="ha-room-view">
                    <label className="prop" data-tip="Scegli la stanza e trascinala qui sotto per decidere da dove guardarla nella sua pagina">
                      <span>Vista stanza</span>
                      <select value={selRoom.slug} onChange={(e) => setRoomSel(e.target.value)}>
                        {roomList.map((a) => (
                          <option key={a.slug} value={a.slug}>
                            {a.name}
                            {roomViews[rvKey(a.slug)] ? ' ✓' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <HaViewPicker
                      view={view}
                      azimuth={roomView(selRoom.slug).azimuth}
                      elevation={roomView(selRoom.slug).elevation}
                      cutaway={roomView(selRoom.slug).cutaway}
                      resetKey={roomReset}
                      aspect={fixed && size.width > 0 && size.height > 0 ? size.width / size.height : undefined}
                      room={pickerRoom}
                      onChange={(a) => setRoomView(selRoom.slug, view === 'top' ? { azimuth: a.azimuth } : a)}
                    />
                    <div className="row ha-angles">
                      <span className="muted small">
                        {view === 'top' ? `Rotazione ${Math.round(roomView(selRoom.slug).azimuth)}°` : `Rotazione ${Math.round(roomView(selRoom.slug).azimuth)}° · Inclinazione ${Math.round(roomView(selRoom.slug).elevation)}°`}
                      </span>
                      <button
                        className="small"
                        onClick={() => {
                          setRoomViews((all) => {
                            const next = { ...all };
                            delete next[rvKey(selRoom.slug)];
                            localStorage.setItem(roomViewsKey(slugify(slug)), JSON.stringify(next));
                            return next;
                          });
                          setRoomReset((k) => k + 1);
                        }}
                        data-tip="Torna alla stessa vista della casa"
                      >
                        ↺ Come la casa
                      </button>
                    </div>
                    <label className="check">
                      <input type="checkbox" checked={roomView(selRoom.slug).cutaway} onChange={(e) => setRoomView(selRoom.slug, { cutaway: e.target.checked })} /> Muri bassi in questa stanza
                    </label>
                    <p className="muted small" style={{ margin: 0 }}>
                      ✓ = vista già scelta. Le altre usano la vista della casa con i muri bassi.
                    </p>
                  </div>
                )}
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
              <button disabled={!result || !!busy} onClick={copyYaml} data-tip={rooms ? 'Copia la configurazione della dashboard (casa + stanze) da incollare in Home Assistant' : 'Copia la configurazione della card da incollare in Home Assistant'}>
                📋 Copia YAML
              </button>
            </div>
          </div>
          <div className="ha-preview">
            {busy && <p className="muted">{busy}</p>}
            {!busy && !result && <p className="muted">Scegli la vista e premi «✨ Crea mappa» per vedere l'anteprima.</p>}
            {result && !busy && (
              <>
                {result.bundle.rooms.length > 0 && (
                  <div className="row ha-pages">
                    <button className={shown === '' ? 'on small' : 'small'} onClick={() => setShown('')}>
                      🏠 Casa
                    </button>
                    {result.bundle.rooms.map((x) => (
                      <button key={x.slug} className={shown === x.slug ? 'on small' : 'small'} onClick={() => setShown(x.slug)}>
                        {x.name}
                      </button>
                    ))}
                  </div>
                )}
                <iframe key={shown} title="Anteprima mappa" srcDoc={result.docs.get(shown) ?? result.docs.get('')} sandbox="allow-scripts" />
                <p className="muted small" style={{ margin: 0 }}>
                  {result.bundle.rooms.length > 0 && shown === ''
                    ? 'Prova: clicca una stanza per aprirla (tasto destro = la sua luce), i pallini gialli accendono le luci'
                    : 'Prova: clicca le stanze o i pallini gialli per accendere le luci'}
                  , una porta per «aprirla»{result.view !== '2d' && look === 'daynight' ? ', G per giorno/notte' : ''}.
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
