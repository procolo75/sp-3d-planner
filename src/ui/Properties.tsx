import { useEffect, useMemo, useState } from 'react';
import { CAMERA_COLORS, coverageStats, useCoverage, type CoverageStats } from '../model/coverage';
import type { Room } from '../model/geom';
import { listBackups, type Backup } from '../model/persist';
import { CATALOG_BY_ID, colorSlots, POCKET_OPEN_DEFAULT, pocketItemSize, pocketSize } from '../catalog/catalog';
import { ColorPicker, FLOOR_COLORS, FURNITURE_COLORS, WALL_COLORS } from './ColorPicker';
import { animateOpen, DOOR_OPEN_DEFAULT, openingOpen, setOpen, stopOpen, type OpenRef } from '../model/pocketAnim';
import { BINARY_SENSORS, type Item, type TapAction, type TapActionKind } from '../model/types';
import { focusedRoom, focusOnRoom, useDerived } from '../model/derived';
import { dist } from '../model/geom';
import { parseLength } from '../import/pdf';
import { LIGHT_COLORS, useStore } from '../model/store';
import { suggestEntity, validEntityId } from '../ha/entities';
import { TAP_LABELS, tapIssue } from '../ha/tap';
import { fmtLen, wallRoomSides } from '../editor2d/Editor2D';
import { wallClearLength } from '../editor2d/snapping';

/** campo numerico che conferma su Invio/blur (accetta "3,62" in metri o "362" in cm se `length`) */
function Num({ label, value, onChange, unit = 'cm', length, step = 1, tip }: { tip?: string; label: string; value: number; onChange: (v: number) => void; unit?: string; length?: boolean; step?: number }) {
  const show = length ? fmtLen(value) : String(Math.round(value * 100) / 100);
  const [s, setS] = useState(show);
  useEffect(() => setS(show), [show]);
  const commit = () => {
    const n = length ? parseLength(s) : parseFloat(s.replace(',', '.'));
    if (n !== null && isFinite(n) && n !== value) onChange(n);
    else setS(show);
  };
  return (
    <label className="prop" data-tip={tip}>
      <span>{label}</span>
      <input value={s} step={step} onChange={(e) => setS(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      <em>{length ? 'm' : unit}</em>
    </label>
  );
}

/** porta scorrevole doppia a scomparsa: misure del passaggio e simulazione di apertura */
function PocketDoorProps({ it }: { it: Item }) {
  const st = useStore.getState();
  const { luce, h } = pocketSize(it);
  const open = it.open ?? POCKET_OPEN_DEFAULT;
  const setSize = (l: number, hh: number) => {
    const sz = pocketItemSize(Math.max(40, Math.round(l)), Math.max(150, Math.round(hh)));
    // il passaggio resta centrato: cambia solo l'ingombro del controtelaio
    st.updateItem(it.id, sz);
  };
  return (
    <>
      <Num tip="Larghezza del passaggio libero (le due ante insieme)" label="Luce" value={luce} onChange={(v) => setSize(v, h)} />
      <Num tip="Altezza del passaggio (ante)" label="Altezza" value={h} onChange={(v) => setSize(luce, v)} />
      <Num tip="Spessore del muro che ospita il controtelaio: si adegua da solo quando la porta si aggancia al muro" label="Spessore muro" value={it.d} onChange={(v) => st.updateItem(it.id, { d: Math.max(5, v) })} />
      <p className="muted small" style={{ margin: '2px 0 6px' }}>
        Controtelaio nel muro: {Math.round(it.w)} × {Math.round(it.h)} cm (2 × luce + 10)
      </p>
      <OpenControls r={{ kind: 'item', id: it.id }} open={open} />
    </>
  );
}

/** simulazione apertura/chiusura: cursore + Apri/Chiudi animati (porte a scomparsa e porte normali) */
function OpenControls({ r, open, door, garage }: { r: OpenRef; open: number; door?: boolean; garage?: boolean }) {
  const st = useStore.getState();
  return (
    <>
      <label className="prop" data-tip={door ? "Trascina per girare l'anta (100% = aperta a 90°)" : garage ? 'Trascina per alzare o abbassare il portone' : 'Trascina per aprire o chiudere le ante'}>
        <span>Apertura</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(open * 100)}
          onPointerDown={() => {
            stopOpen(r);
            st.beginDrag();
          }}
          onPointerUp={() => st.endDrag()}
          onChange={(e) => setOpen(r, Number(e.target.value) / 100)}
        />
        <em>{door ? `${Math.round(open * 90)}°` : `${Math.round(open * 100)}%`}</em>
      </label>
      <div className="row">
        <button onClick={() => animateOpen(r, 1)} data-tip={door ? "L'anta gira fino a 90°" : garage ? 'Il portone sale e rientra sotto il soffitto' : 'Le ante scorrono dentro al muro'}>Apri</button>
        <button onClick={() => animateOpen(r, 0)} data-tip={door ? "L'anta si chiude nel vano" : garage ? 'Il portone scende e chiude il vano' : 'Le ante escono e si chiudono al centro'}>Chiudi</button>
        <button onClick={() => animateOpen(r)} data-tip="Apri o chiudi (anche con doppio clic sulla porta)">⇆</button>
      </div>
    </>
  );
}

/** entità di Home Assistant: campo testo con controllo del formato e proposta dal nome */
function EntityField({ value, domain, name, onChange, tip }: { value: string | undefined; domain: string; name?: string; onChange: (v: string | undefined) => void; tip?: string }) {
  const [s, setS] = useState(value ?? '');
  useEffect(() => setS(value ?? ''), [value]);
  const commit = () => {
    const t = s.trim().toLowerCase();
    if (t !== (value ?? '')) onChange(t || undefined);
  };
  const bad = !!value && !validEntityId(value);
  return (
    <>
      <label className="prop" data-tip={tip ?? `Entità di Home Assistant, come la trovi in Impostazioni → Dispositivi → Entità (es. ${suggestEntity(domain, name)})`}>
        <span>Entità HA</span>
        <input value={s} placeholder={`${domain}.…`} onChange={(e) => setS(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      </label>
      {bad && <p className="warn small">Formato non valido: dominio.nome, minuscole e _ (es. {suggestEntity(domain, name)})</p>}
      {!value && name && (
        <button className="link small" onClick={() => onChange(suggestEntity(domain, name))} data-tip="Usa questo nome: controlla che sia uguale a quello in Home Assistant">
          usa «{suggestEntity(domain, name)}»
        </button>
      )}
    </>
  );
}

/** campo di testo che conferma su Invio/blur */
function TextProp({ label, value, placeholder, onChange, tip }: { label: string; value: string | undefined; placeholder?: string; onChange: (v: string | undefined) => void; tip?: string }) {
  const [s, setS] = useState(value ?? '');
  useEffect(() => setS(value ?? ''), [value]);
  const commit = () => {
    const t = s.trim();
    if (t !== (value ?? '')) onChange(t || undefined);
  };
  return (
    <label className="prop" data-tip={tip}>
      <span>{label}</span>
      <input value={s} placeholder={placeholder} onChange={(e) => setS(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    </label>
  );
}

/** «Al tocco»: cosa succede toccando l'elemento sulla mappa di Home Assistant */
function TapField({ value, def, onChange }: { value: TapAction | undefined; def: TapActionKind; onChange: (v: TapAction | undefined) => void }) {
  const t = value ?? { action: def };
  // tornare al default (senza altri campi) toglie l'azione dal progetto
  const set = (n: TapAction) => {
    const clean = Object.fromEntries(Object.entries(n).filter(([, v]) => v !== undefined)) as unknown as TapAction;
    onChange(clean.action === def && Object.keys(clean).length === 1 ? undefined : clean);
  };
  const issue = value && tapIssue(value);
  const withEntity = t.action === 'more-info' || t.action === 'toggle' || t.action === 'call-service';
  return (
    <>
      <label className="prop" data-tip="Cosa succede toccandolo sulla mappa di Home Assistant">
        <span>Al tocco</span>
        <select value={t.action} onChange={(e) => set({ action: e.target.value as TapActionKind })}>
          {(Object.keys(TAP_LABELS) as TapActionKind[]).map((k) => (
            <option key={k} value={k}>
              {TAP_LABELS[k]}
              {k === def ? ' (predefinito)' : ''}
            </option>
          ))}
        </select>
      </label>
      {t.action === 'call-service' && (
        <TextProp label="Servizio" value={t.service} placeholder="script.buonanotte" onChange={(v) => set({ ...t, service: v?.toLowerCase() })} tip="Servizio o script di Home Assistant da eseguire (es. script.buonanotte, cover.toggle, scene.turn_on)" />
      )}
      {t.action === 'navigate' && <TextProp label="Pagina" value={t.path} placeholder="/lovelace/clima" onChange={(v) => set({ ...t, path: v })} tip="Percorso della pagina della dashboard da aprire: lo vedi nella barra dell'indirizzo (es. /lovelace/clima)" />}
      {t.action === 'url' && <TextProp label="Link" value={t.url} placeholder="https://…" onChange={(v) => set({ ...t, url: v })} tip="Indirizzo da aprire toccandolo" />}
      {withEntity && (
        <TextProp
          label="Su entità"
          value={t.entity}
          placeholder="la sua (lascia vuoto)"
          onChange={(v) => set({ ...t, entity: v?.toLowerCase() })}
          tip="Facoltativo: un'altra entità su cui agire (es. climate.salotto per aprire il termostato toccando il sensore di temperatura)"
        />
      )}
      {issue && <p className="warn small">Azione incompleta: {issue}. Nella mappa userà «{TAP_LABELS[def]}».</p>}
    </>
  );
}

/** riepilogo di cosa finirà nella mappa di Home Assistant */
function HaSummary() {
  const p = useStore((s) => s.project);
  const nl = Object.keys(p.lights ?? {}).length;
  const ns = Object.keys(p.sensors ?? {}).length;
  const nc = Object.values(p.openings).filter((o) => o.haEntity).length;
  const nt = Object.values(p.cameras ?? {}).filter((c) => c.haEntity).length;
  return (
    <div className="rooms">
      <h4>🏠 Home Assistant</h4>
      <p className="muted small" style={{ margin: '0 0 4px' }}>
        {nl} luci · {ns} sensori · {nc} porte/finestre con sensore · {nt} telecamere collegate
      </p>
      <button onClick={() => window.dispatchEvent(new Event('planner:ha-export'))} data-tip="Crea la mappa interattiva per la card ha-floorplan">
        Crea mappa per Home Assistant…
      </button>
    </div>
  );
}


export function Properties() {
  const sel = useStore((s) => s.selection);
  const project = useStore((s) => s.project);
  const der = useDerived(project);
  const focus = useStore((s) => s.focus);
  const focusRoomKey = focusedRoom(der, focus)?.key ?? null;
  const st = useStore.getState();
  const cov = useCoverage(project, der.corners);
  const stats = useMemo(() => (cov.polys.size ? coverageStats(der.rooms, cov.polys) : null), [cov, der.rooms]);

  if (!sel) {
    const area = der.rooms.reduce((a, r) => a + r.area, 0) / 10000;
    return (
      <aside className="props">
        <h3>Progetto</h3>
        <p className="muted">
          {Object.keys(project.walls).length} muri · {der.rooms.length} stanze · {Object.keys(project.items).length} mobili
        </p>
        <p>
          Superficie netta: <b>{area.toFixed(2).replace('.', ',')} m²</b>
        </p>
        {der.rooms.length > 0 && (
          <div className="rooms">
            <h4>Stanze</h4>
            <p className="muted small" style={{ margin: '0 0 4px' }}>
              Scrivi il nome di ogni stanza (oppure clicca una stanza in pianta).
            </p>
            {der.rooms
              .slice()
              .sort((a, b) => b.area - a.area)
              .map((r) => {
                const lab = der.roomLabel.get(r.key);
                const pos = der.roomLabelPos.get(r.key)!;
                return (
                  <div key={r.key} className="roomrow" onMouseEnter={() => useStore.getState().set('highlightRoom', r.key)} onMouseLeave={() => useStore.getState().set('highlightRoom', null)}>
                    <RoomName compact value={lab?.name ?? ''} placeholder="senza nome" onChange={(name) => st.setLabel(pos, name, lab?.id)} />
                    <button className="lens" onClick={() => focusOnRoom(der, r.key, (p) => st.set('focus', p))} data-tip="Arreda solo questa stanza (ingrandita in pianta e in 3D)">
                      🔍
                    </button>
                    <span className="muted small">{(r.area / 10000).toFixed(1).replace('.', ',')} m²</span>
                  </div>
                );
              })}
          </div>
        )}
        {stats && <CameraSummary stats={stats} rooms={der.rooms} roomName={(k) => der.roomLabel.get(k)?.name} />}
        <HaSummary />
        <Backups />
        <div className="help">
          <h4>Come si usa</h4>
          <ol>
            <li>
              <b>📄 Nuovo progetto…</b>: fai leggere la pianta a Claude, incolli la sua risposta e il 3D è pronto.
            </li>
            <li>
              Se manca un muro: <b>Muro</b>, clic sugli angoli (si aggancia da solo). Esc per finire.
            </li>
            <li>
              <b>Mobili</b>: clicca un mobile a sinistra e poi clicca in pianta. Si appoggia ai muri da solo.
            </li>
            <li>
              <b>Abbattere un muro</b>: cliccalo e premi Canc. ⌘Z per tornare indietro.
            </li>
            <li>
              <b>💾 Salva su PC</b> (⌘S) salva il progetto in un file sul computer; <b>📂 Apri da PC</b> (⌘O) lo riapre.
            </li>
          </ol>
        </div>
      </aside>
    );
  }

  if (sel.kind === 'wall') {
    const w = project.walls[sel.id];
    if (!w) return null;
    const L = dist(project.nodes[w.a], project.nodes[w.b]);
    const sides = wallRoomSides(project, w.id, der);
    return (
      <aside className="props">
        <h3>Muro</h3>
        {sides.length > 0 && (
          <p className="muted small" style={{ margin: 0 }}>
            Misure interne delle stanze, come in pianta:
          </p>
        )}
        {sides.length > 0 ? (
          sides.map(({ room, side }) => {
            const name = der.roomLabel.get(room.key)?.name || 'stanza senza nome';
            return (
              <Num
                key={room.key}
                tip={`Misura interna del lato di «${name}», da angolo ad angolo: è la stessa scritta in pianta. Cambiala e il muro si allunga o accorcia della differenza.`}
                label={`Lato ${name}`}
                value={side.len}
                length
                onChange={(v) => st.setWallLength(w.id, Math.max(1, L + (v - side.len)))}
              />
            );
          })
        ) : (
          (() => {
            const c = wallClearLength(project, der.corners, w.id);
            return (
              <Num
                tip="Lunghezza netta del muro, misurata dalla faccia dei muri a cui è agganciato. Scrivi es. 4,15 e premi Invio."
                label="Lunghezza"
                value={c.net}
                length
                onChange={(v) => st.setWallLength(w.id, Math.max(1, v + c.offA + c.offB))}
              />
            );
          })()
        )}
        <Num label="Spessore" value={w.thickness} onChange={(v) => st.updateWall(w.id, { thickness: Math.max(2, v) })} />
        <Num label="Altezza" value={w.height} onChange={(v) => st.updateWall(w.id, { height: Math.max(10, v) })} />
        <span className="muted small">Colore della parete</span>
        <ColorPicker value={w.color ?? '#f4f1ec'} colors={WALL_COLORS} onChange={(c) => st.updateWall(w.id, { color: c })} />
        <button onClick={() => st.setAllWallsColor(w.color ?? '#f4f1ec')} data-tip="Dà questo colore a tutti i muri della casa">
          Stesso colore a tutti i muri
        </button>
        <WallOpenings wallId={w.id} />
        <button className="danger" onClick={() => st.deleteWall(w.id)} data-tip="Elimina il muro: le stanze ai due lati diventano una sola (si può annullare con ⌘Z)">
          🔨 Abbatti muro
        </button>
        <p className="muted small">Trascina il muro per spostarlo parallelamente. Trascina i pallini per spostare gli angoli.</p>
      </aside>
    );
  }

  if (sel.kind === 'opening') {
    const o = project.openings[sel.id];
    if (!o) return null;
    const names = { door: 'Porta', window: o.sill === 0 ? 'Portafinestra' : 'Finestra', arch: 'Varco', sliding: 'Ante scorrevoli (SKYTTA)', garage: 'Portone del garage' };
    const wl = project.walls[o.wallId];
    const wallLen = wl ? dist(project.nodes[wl.a], project.nodes[wl.b]) : 0;
    return (
      <aside className="props">
        <h3>{names[o.type]}</h3>
        <label className="prop">
          <span>Tipo</span>
          <select
            value={o.type}
            onChange={(e) => {
              const t = e.target.value as typeof o.type;
              st.updateOpening(o.id, { type: t, ...(t === 'window' ? { sill: o.sill || 95, height: 140 } : t === 'sliding' ? { sill: 0, height: 205 } : t === 'garage' ? { sill: 0, height: 215, width: Math.max(o.width, 240) } : { sill: 0, height: Math.max(o.height, 210) }) });
            }}
          >
            <option value="door">Porta</option>
            <option value="sliding">Ante scorrevoli (SKYTTA)</option>
            <option value="garage">Portone del garage</option>
            <option value="window">Finestra</option>
            <option value="arch">Varco</option>
          </select>
        </label>
        <Num label="Larghezza" value={o.width} onChange={(v) => st.updateOpening(o.id, { width: Math.max(20, v) })} />
        <Num label="Altezza" value={o.height} onChange={(v) => st.updateOpening(o.id, { height: Math.max(20, v) })} />
        {o.type === 'door' && <OpenControls r={{ kind: 'opening', id: o.id }} open={o.open ?? DOOR_OPEN_DEFAULT} door />}
        {o.type === 'garage' && (
          <>
            <span className="muted small">Misure comuni</span>
            <div className="row presets">
              {[
                [240, 200],
                [250, 215],
                [300, 225],
                [500, 225],
              ].map(([wd, hh]) => (
                <button key={wd} className={Math.round(o.width) === wd && Math.round(o.height) === hh ? 'on' : ''} disabled={wd > wallLen + 0.5} onClick={() => st.updateOpening(o.id, { width: wd, height: hh, offset: Math.max(wd / 2, Math.min(wallLen - wd / 2, o.offset)) })}>
                  {wd}×{hh}
                </button>
              ))}
            </div>
            <OpenControls r={{ kind: 'opening', id: o.id }} open={openingOpen(o)} garage />
            <span className="muted small">Colore</span>
            <ColorPicker value={o.color ?? '#e9eaec'} colors={FURNITURE_COLORS} onChange={(c) => st.updateOpening(o.id, { color: c })} />
            <div className="row">
              <button onClick={() => st.updateOpening(o.id, { flipSide: !o.flipSide })} data-tip="Il portone rientra verso l'altro lato del muro (deve andare dentro al garage)">
                ⇅ Lato interno
              </button>
            </div>
          </>
        )}
        {o.type === 'window' && <Num label="Davanzale" value={o.sill} onChange={(v) => st.updateOpening(o.id, { sill: Math.max(0, v) })} />}
        <Num tip="Distanza del centro dell'apertura dall'inizio del muro, in cm" label="Posizione" value={o.offset} onChange={(v) => st.updateOpening(o.id, { offset: v })} />
        {o.type !== 'arch' && (
          <>
            <EntityField value={o.haEntity} domain="binary_sensor" onChange={(v) => st.updateOpening(o.id, { haEntity: v })} tip="Sensore di apertura in Home Assistant (es. binary_sensor.porta_ingresso): sulla mappa la porta diventa rossa quando è aperta. Lascia vuoto se non c'è." />
            {o.haEntity && <TapField value={o.tap} def="more-info" onChange={(tap) => st.updateOpening(o.id, { tap })} />}
          </>
        )}
        {o.type === 'sliding' && (
          <div className="skytta">
            <span className="muted small">Larghezze SKYTTA</span>
            <div className="row">
              {[102, 152, 202, 252, 302].map((wd) => (
                <button key={wd} className={Math.round(o.width) === wd ? 'on' : ''} disabled={wd > wallLen + 0.5} onClick={() => st.updateOpening(o.id, { width: wd, offset: Math.max(wd / 2, Math.min(wallLen - wd / 2, o.offset)) })}>
                  {wd}
                </button>
              ))}
              <button onClick={() => st.updateOpening(o.id, { width: wallLen, offset: wallLen / 2 })} data-tip="Le ante occupano tutto il muro: il muro viene sostituito dalle ante (es. fronte della cabina armadio)">
                Tutto il muro
              </button>
            </div>
            <span className="muted small">Finitura ante</span>
            <div className="row">
              {(
                [
                  ['glass', 'Vetro trasparente'],
                  ['frosted', 'Vetro satinato'],
                  ['white', 'Bianco'],
                  ['mirror', 'Specchio'],
                ] as const
              ).map(([f, label]) => (
                <button key={f} className={(o.finish ?? 'glass') === f ? 'on' : ''} onClick={() => st.updateOpening(o.id, { finish: f })}>
                  {label}
                </button>
              ))}
            </div>
            <span className="muted small">Altezza</span>
            <div className="row">
              {[205, 240].map((hh) => (
                <button key={hh} className={Math.round(o.height) === hh ? 'on' : ''} onClick={() => st.updateOpening(o.id, { height: hh })}>
                  {hh}
                </button>
              ))}
            </div>
          </div>
        )}
        {o.type === 'door' && (
          <div className="row">
            <button onClick={() => st.updateOpening(o.id, { flipHinge: !o.flipHinge })} data-tip="Sposta la cerniera dall'altro lato della porta">↔ Cerniera</button>
            <button onClick={() => st.updateOpening(o.id, { flipSide: !o.flipSide })} data-tip="Fa aprire la porta verso l'altra stanza">⇅ Verso</button>
          </div>
        )}
        <button className="danger" onClick={() => st.deleteOpening(o.id)}>
          Elimina
        </button>
      </aside>
    );
  }

  if (sel.kind === 'item') {
    const it = project.items[sel.id];
    if (!it) return null;
    const cat = CATALOG_BY_ID[it.catalogId];
    return (
      <aside className="props">
        <h3>{it.label || cat?.name || 'Mobile'}</h3>
        {it.label && cat && <p className="muted small" style={{ margin: 0 }}>{cat.name}</p>}
        <RoomName value={it.label ?? ''} placeholder="nome (facoltativo)" onChange={(label) => st.updateItem(it.id, { label: label || undefined })} />
        {cat?.pocket ? (
          <PocketDoorProps it={it} />
        ) : (
          <>
            <Num label="Larghezza" value={it.w} onChange={(v) => st.updateItem(it.id, { w: Math.max(1, v) })} />
            <Num label="Profondità" value={it.d} onChange={(v) => st.updateItem(it.id, { d: Math.max(1, v) })} />
            <Num label="Altezza" value={it.h} onChange={(v) => st.updateItem(it.id, { h: Math.max(1, v) })} />
            <Num tip="Altezza da terra (es. per pensili e mensole)" label="Da terra" value={it.z} onChange={(v) => st.updateItem(it.id, { z: Math.max(0, v) })} />
          </>
        )}
        <Num label="Rotazione" unit="°" value={Math.round(((((it.rotation * 180) / Math.PI) % 360) + 360) % 360)} onChange={(v) => st.updateItem(it.id, { rotation: (v * Math.PI) / 180 })} />
        {cat &&
          colorSlots(cat).map((base, i) => (
            <div key={i} className="color-slot">
              <span className="muted small">{i === 0 ? 'Colore' : 'Secondo colore'}</span>
              <ColorPicker value={(i === 0 ? it.color : it.color2) ?? base} colors={FURNITURE_COLORS} onChange={(c) => st.updateItem(it.id, i === 0 ? { color: c } : { color2: c })} />
            </div>
          ))}
        <div className="row">
          <button onClick={() => st.updateItem(it.id, { rotation: it.rotation + Math.PI / 2 })} data-tip="Ruota di 90° (tasto R; Shift+R per 15°)">⟳ 90°</button>
          <button onClick={() => st.duplicateItem(it.id)} data-tip="Crea una copia accanto (⌘D)">Duplica</button>
          <button onClick={() => st.updateItem(it.id, { w: cat.w, d: cat.d, h: cat.h, color: undefined, color2: undefined, open: undefined })} data-tip="Torna alle misure e ai colori originali">Ripristina</button>
        </div>
        <button className="danger" onClick={() => st.deleteItem(it.id)}>
          Elimina
        </button>
      </aside>
    );
  }

  if (sel.kind === 'room') {
    const r = der.rooms.find((x) => x.key === sel.id);
    if (!r) return null;
    const lab = der.roomLabel.get(r.key);
    const pos = der.roomLabelPos.get(r.key)!;
    return (
      <aside className="props">
        <h3>Stanza{lab?.name ? `: ${lab.name}` : ''}</h3>
        {focusRoomKey !== r.key ? (
          <button className="primary" onClick={() => focusOnRoom(der, r.key, (p) => st.set('focus', p))} data-tip="Mostra solo questa stanza, ingrandita, sia in pianta sia in 3D, per arredarla comodamente">
            🔍 Arreda questa stanza
          </button>
        ) : (
          <button onClick={() => st.set('focus', null)}>← Tutta la casa</button>
        )}
        <RoomName key={r.key} autoFocus={!lab?.name} value={lab?.name ?? ''} onChange={(name) => st.setLabel(pos, name, lab?.id)} />
        <p>
          Superficie netta: <b>{(r.area / 10000).toFixed(2).replace('.', ',')} m²</b>
        </p>
        <label className="check" data-tip="Cortile, giardino o spazio tra casa e garage chiuso da muri o recinzioni: non viene messo il pavimento">
          <input type="checkbox" checked={!!lab?.outdoor} onChange={(e) => st.setLabel(pos, lab?.name ?? '', lab?.id, undefined, e.target.checked)} /> Spazio esterno (senza pavimento)
        </label>
        {!lab?.outdoor && (
          <>
            <span className="muted small">Pavimento</span>
            <ColorPicker value={lab?.floorColor ?? '#d9c2a0'} colors={FLOOR_COLORS} onChange={(c) => st.setLabel(pos, lab?.name ?? '', lab?.id, c)} />
          </>
        )}
      </aside>
    );
  }

  if (sel.kind === 'camera') {
    const c = project.cameras?.[sel.id];
    if (!c) return null;
    const dirDeg = Math.round(((((c.rotation * 180) / Math.PI) % 360) + 360) % 360);
    const seen = stats?.perCamera.get(c.id) ?? 0;
    return (
      <aside className="props">
        <h3>📹 {c.label || 'Telecamera'}</h3>
        <RoomName value={c.label ?? ''} placeholder="es. Ingresso" onChange={(label) => st.updateCamera(c.id, { label: label || undefined })} />
        <EntityField value={c.haEntity} domain="camera" name={c.label} onChange={(v) => st.updateCamera(c.id, { haEntity: v })} tip="Entità della telecamera in Home Assistant (es. camera.ingresso): sulla mappa toccandola vedi le immagini (o l'azione scelta in «Al tocco»). Lascia vuoto se non c'è." />
        {c.haEntity && <TapField value={c.tap} def="more-info" onChange={(tap) => st.updateCamera(c.id, { tap })} />}
        <p className="muted small" style={{ margin: 0 }}>
          Vede circa <b>{seen.toFixed(1).replace('.', ',')} m²</b> della casa
        </p>
        <Num tip="Angolo di visione orizzontale dell'obiettivo (lo trovi nella scheda della telecamera, es. 110°)" label="Angolo visione" unit="°" value={c.fov} onChange={(v) => st.updateCamera(c.id, { fov: Math.max(5, Math.min(360, v)) })} />
        <div className="row presets">
          {[60, 90, 110, 130, 180, 360].map((f) => (
            <button key={f} className={Math.round(c.fov) === f ? 'on' : ''} onClick={() => st.updateCamera(c.id, { fov: f })} data-tip={f === 360 ? 'Fisheye a 360° (montata al soffitto)' : `Angolo di ${f}°`}>
              {f}°
            </button>
          ))}
        </div>
        <Num tip="Fin dove la telecamera vede abbastanza bene da riconoscere qualcosa (es. 8 m). Scrivi in metri, es. 6,5" label="Portata" value={c.range} length onChange={(v) => st.updateCamera(c.id, { range: Math.max(50, v) })} />
        <div className="row presets">
          {[400, 600, 800, 1200].map((r) => (
            <button key={r} className={Math.round(c.range) === r ? 'on' : ''} onClick={() => st.updateCamera(c.id, { range: r })}>
              {r / 100} m
            </button>
          ))}
        </div>
        <Num tip="Direzione in cui guarda, in gradi (0° = verso destra della pianta, 90° = verso il basso). Più comodo: trascina il pallino davanti alla telecamera, o premi R" label="Direzione" unit="°" value={dirDeg} onChange={(v) => st.updateCamera(c.id, { rotation: (v * Math.PI) / 180 })} />
        <Num tip="Altezza a cui è montata (serve per il 3D)" label="Altezza" value={c.z} onChange={(v) => st.updateCamera(c.id, { z: Math.max(0, v) })} />
        <div className="swatches">
          {CAMERA_COLORS.map((col) => (
            <button key={col} style={{ background: col }} className={c.color === col ? 'on' : ''} onClick={() => st.updateCamera(c.id, { color: col })} data-tip="Colore della zona coperta" />
          ))}
        </div>
        <div className="row">
          <button onClick={() => st.updateCamera(c.id, { rotation: c.rotation + Math.PI / 12 })} data-tip="Gira di 15° (tasto R; Shift+R nell'altro verso)">⟳ 15°</button>
          <button onClick={() => st.duplicateCamera(c.id)} data-tip="Crea una copia accanto (⌘D)">Duplica</button>
        </div>
        <p className="muted small">
          La vista è fermata da muri, finestre e mobili alti (armadi, frigo…). Porte e varchi sono considerati aperti.
          {!useStore.getState().showCoverage && ' La copertura è nascosta: attivala dal menu Vista → Zone viste dalle telecamere.'}
        </p>
        <button className="danger" onClick={() => st.deleteCamera(c.id)}>
          Elimina
        </button>
      </aside>
    );
  }

  if (sel.kind === 'light') {
    const l = project.lights?.[sel.id];
    if (!l) return null;
    return (
      <aside className="props">
        <h3>💡 {l.label || 'Luce'}</h3>
        <RoomName value={l.label ?? ''} placeholder="es. Lampadario cucina" onChange={(label) => st.updateLight(l.id, { label: label || undefined })} />
        <EntityField value={l.entityId || undefined} domain="light" name={l.label} onChange={(v) => st.updateLight(l.id, { entityId: v ?? '' })} tip="Entità della luce in Home Assistant (es. light.cucina). Può essere anche un interruttore: switch.luce_bagno" />
        <TapField value={l.tap} def="toggle" onChange={(tap) => st.updateLight(l.id, { tap })} />
        <Num tip="Altezza della lampada da terra: soffitto ~240-270, lampada da tavolo ~120" label="Altezza" value={l.z} onChange={(v) => st.updateLight(l.id, { z: Math.max(10, v) })} />
        <label className="prop" data-tip="Quanto è forte la luce nel render della mappa">
          <span>Intensità</span>
          <input type="range" min={5} max={100} value={Math.round(l.intensity * 100)} onChange={(e) => st.updateLight(l.id, { intensity: +e.target.value / 100 })} />
          <em>{Math.round(l.intensity * 100)}%</em>
        </label>
        <div className="row presets">
          {LIGHT_COLORS.map((c) => (
            <button key={c.c} className={l.color === c.c ? 'on' : ''} onClick={() => st.updateLight(l.id, { color: c.c })}>
              <span className="dot" style={{ background: c.c, display: 'inline-block', width: 10, height: 10, borderRadius: 5, marginRight: 4 }} />
              {c.name}
            </button>
          ))}
        </div>
        <p className="muted small">Nella mappa di Home Assistant la stanza si illumina quando la luce è accesa; toccando la luce o la stanza {l.tap && l.tap.action !== 'toggle' ? 'fai l\'azione scelta in «Al tocco»' : 'la accendi o spegni'}.</p>
        <button className="danger" onClick={() => st.deleteLight(l.id)}>
          Elimina
        </button>
      </aside>
    );
  }

  if (sel.kind === 'sensor') {
    const x = project.sensors?.[sel.id];
    if (!x) return null;
    return (
      <aside className="props">
        <h3>🌡 {x.label || 'Sensore'}</h3>
        <RoomName value={x.label ?? ''} placeholder="es. Temperatura salotto" onChange={(label) => st.updateSensor(x.id, { label: label || undefined })} />
        <label className="prop">
          <span>Tipo</span>
          <select value={x.kind} onChange={(e) => st.updateSensor(x.id, { kind: e.target.value as typeof x.kind })}>
            <option value="temperature">Temperatura</option>
            <option value="humidity">Umidità</option>
            <option value="co2">Qualità aria (eCO2 / CO2)</option>
            <option value="door">Porta aperta/chiusa</option>
            <option value="window">Finestra aperta/chiusa</option>
            <option value="generic">Altro</option>
          </select>
        </label>
        <EntityField
          value={x.entityId || undefined}
          domain={BINARY_SENSORS.includes(x.kind) ? 'binary_sensor' : 'sensor'}
          name={x.label}
          onChange={(v) => st.updateSensor(x.id, { entityId: v ?? '' })}
          tip={
            BINARY_SENSORS.includes(x.kind)
              ? 'Sensore di apertura in Home Assistant (es. binary_sensor.finestra_cucina): sulla mappa diventa rosso e scrive «Aperta» quando è aperto'
              : x.kind === 'co2'
                ? 'Sensore eCO2/CO2 in Home Assistant (es. sensor.salotto_eco2, in ppm): verde sotto 800, giallo fino a 1200, rosso oltre'
                : 'Entità del sensore in Home Assistant (es. sensor.temperatura_salotto): sulla mappa vedi il suo valore aggiornato'
          }
        />
        <TapField value={x.tap} def="more-info" onChange={(tap) => st.updateSensor(x.id, { tap })} />
        {BINARY_SENSORS.includes(x.kind) && <p className="muted small">Puoi anche collegare il sensore direttamente alla porta o finestra: selezionala e scrivi l'entità in «Entità HA», così sulla mappa si colora l'apertura stessa.</p>}
        <button className="danger" onClick={() => st.deleteSensor(x.id)}>
          Elimina
        </button>
      </aside>
    );
  }

  if (sel.kind === 'node') {
    const n = project.nodes[sel.id];
    if (!n) return null;
    return (
      <aside className="props">
        <h3>Angolo</h3>
        <Num label="X" value={n.x} onChange={(v) => st.moveNode(n.id, { x: v, y: n.y }, true)} />
        <Num label="Y" value={n.y} onChange={(v) => st.moveNode(n.id, { x: n.x, y: v }, true)} />
      </aside>
    );
  }
  return null;
}

/** riepilogo: quanto della casa (e di ogni stanza) è visto dalle telecamere */
function CameraSummary({ stats, rooms, roomName }: { stats: CoverageStats; rooms: Room[]; roomName: (key: string) => string | undefined }) {
  const cams = Object.values(useStore((s) => s.project.cameras) ?? {});
  const st = useStore.getState();
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <div className="rooms cams">
      <h4>Telecamere</h4>
      <p style={{ margin: '0 0 4px' }}>
        Casa coperta: <b>{pct(stats.total)}</b>
      </p>
      {cams.map((c) => (
        <div key={c.id} className="roomrow">
          <span className="dot" style={{ background: c.color }} />
          <button className="link" onClick={() => st.select({ kind: 'camera', id: c.id })} data-tip="Seleziona la telecamera">
            {c.label || 'Telecamera'}
          </button>
          <span className="muted small">{(stats.perCamera.get(c.id) ?? 0).toFixed(1).replace('.', ',')} m²</span>
        </div>
      ))}
      <span className="muted small">Per stanza</span>
      {rooms
        .slice()
        .sort((a, b) => b.area - a.area)
        .map((r) => {
          const v = stats.perRoom.get(r.key) ?? 0;
          return (
            <div key={r.key} className="roomrow" onMouseEnter={() => st.set('highlightRoom', r.key)} onMouseLeave={() => st.set('highlightRoom', null)}>
              <span style={{ flex: 1 }} className="small">
                {roomName(r.key) || 'senza nome'}
              </span>
              <span className="covbar">
                <span style={{ width: pct(v) }} />
              </span>
              <span className="small" style={{ width: 34, textAlign: 'right', color: v < 0.05 ? '#b5332e' : undefined }}>
                {pct(v)}
              </span>
            </div>
          );
        })}
    </div>
  );
}

function RoomName({ value, onChange, placeholder = 'es. Cucina', autoFocus, compact }: { value: string; onChange: (s: string) => void; placeholder?: string; autoFocus?: boolean; compact?: boolean }) {
  const [s, setS] = useState(value);
  useEffect(() => setS(value), [value]);
  const input = (
    <input
      value={s}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(e) => setS(e.target.value)}
      onBlur={() => s !== value && onChange(s)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
  if (compact) return input;
  return (
    <label className="prop">
      <span>Nome</span>
      {input}
    </label>
  );
}

function Backups() {
  const [list, setList] = useState<Backup[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open) listBackups().then(setList);
  }, [open]);
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} data-tip="Le ultime versioni salvate automaticamente (una ogni qualche minuto di lavoro). Utile se hai cancellato qualcosa per sbaglio.">
        🕘 Versioni precedenti
      </button>
      {open && (
        <div className="backups">
          {!list.length && <p className="muted small">Nessuna versione salvata ancora.</p>}
          {list.map((b) => (
            <div key={b.time} className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="small">
                {new Date(b.time).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {Object.keys(b.project.walls).length} muri
              </span>
              <button
                onClick={() => {
                  useStore.getState().loadProject(b.project);
                  window.dispatchEvent(new Event('planner:fit'));
                  window.dispatchEvent(new CustomEvent('planner:fit3d'));
                }}
                data-tip="Torna a questa versione (se vuoi tenere quella attuale, esportala prima)"
              >
                Ripristina
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const OPENING_NAMES = { door: 'Porta', window: 'Finestra', arch: 'Varco', sliding: 'Ante scorrevoli', garage: 'Portone garage' } as const;

/** porte e finestre del muro selezionato: selezionabili ed eliminabili anche se sovrapposte */
function WallOpenings({ wallId }: { wallId: string }) {
  const all = useStore((s) => s.project.openings);
  const openings = Object.values(all).filter((o) => o.wallId === wallId);
  if (!openings.length) return null;
  const st = useStore.getState();
  return (
    <div className="wall-openings">
      <span className="muted small">Porte e finestre su questo muro</span>
      {openings
        .slice()
        .sort((a, b) => a.offset - b.offset)
        .map((o) => (
          <div key={o.id} className="row" style={{ alignItems: 'center' }}>
            <span style={{ flex: 1 }}>
              {o.type === 'window' && o.sill === 0 ? 'Portafinestra' : OPENING_NAMES[o.type]} {Math.round(o.width)} cm
            </span>
            <button onClick={() => st.select({ kind: 'opening', id: o.id })}>Seleziona</button>
            <button className="danger" onClick={() => st.deleteOpening(o.id)}>
              Elimina
            </button>
          </div>
        ))}
    </div>
  );
}
