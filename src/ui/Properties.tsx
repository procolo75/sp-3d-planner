import { useEffect, useState } from 'react';
import { listBackups, type Backup } from '../model/persist';
import { CATALOG_BY_ID } from '../catalog/catalog';
import { focusedRoom, focusOnRoom, useDerived } from '../model/derived';
import { dist } from '../model/geom';
import { parseLength } from '../import/pdf';
import { useStore } from '../model/store';
import { fmtLen, wallRoomSides } from '../editor2d/Editor2D';

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

const FLOOR_COLORS = ['#d9c2a0', '#b98b5e', '#8c6a4f', '#e8e2d6', '#c9c9c9', '#9aa5ad', '#e6d3b3', '#a3b18a'];
const WALL_COLORS = ['#f4f1ec', '#ffffff', '#e9e1d3', '#d8e2dc', '#cfd8e3', '#f2d7c9', '#b7c4cf', '#8a9a5b'];

export function Properties() {
  const sel = useStore((s) => s.selection);
  const project = useStore((s) => s.project);
  const der = useDerived(project);
  const focus = useStore((s) => s.focus);
  const focusRoomKey = focusedRoom(der, focus)?.key ?? null;
  const st = useStore.getState();

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
          <Num tip="Lunghezza del muro. Scrivi es. 4,15 e premi Invio." label="Lunghezza" value={L} length onChange={(v) => st.setWallLength(w.id, v)} />
        )}
        <Num label="Spessore" value={w.thickness} onChange={(v) => st.updateWall(w.id, { thickness: Math.max(2, v) })} />
        <Num label="Altezza" value={w.height} onChange={(v) => st.updateWall(w.id, { height: Math.max(10, v) })} />
        <div className="swatches">
          {WALL_COLORS.map((c) => (
            <button key={c} style={{ background: c }} className={w.color === c ? 'on' : ''} onClick={() => st.updateWall(w.id, { color: c })} data-tip="Colore della parete" />
          ))}
        </div>
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
    const names = { door: 'Porta', window: o.sill === 0 ? 'Portafinestra' : 'Finestra', arch: 'Varco', sliding: 'Ante scorrevoli (SKYTTA)' };
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
              st.updateOpening(o.id, { type: t, ...(t === 'window' ? { sill: o.sill || 95, height: 140 } : t === 'sliding' ? { sill: 0, height: 205 } : { sill: 0, height: Math.max(o.height, 210) }) });
            }}
          >
            <option value="door">Porta</option>
            <option value="sliding">Ante scorrevoli (SKYTTA)</option>
            <option value="window">Finestra</option>
            <option value="arch">Varco</option>
          </select>
        </label>
        <Num label="Larghezza" value={o.width} onChange={(v) => st.updateOpening(o.id, { width: Math.max(20, v) })} />
        <Num label="Altezza" value={o.height} onChange={(v) => st.updateOpening(o.id, { height: Math.max(20, v) })} />
        {o.type === 'window' && <Num label="Davanzale" value={o.sill} onChange={(v) => st.updateOpening(o.id, { sill: Math.max(0, v) })} />}
        <Num tip="Distanza del centro dell'apertura dall'inizio del muro, in cm" label="Posizione" value={o.offset} onChange={(v) => st.updateOpening(o.id, { offset: v })} />
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
        <Num label="Larghezza" value={it.w} onChange={(v) => st.updateItem(it.id, { w: Math.max(1, v) })} />
        <Num label="Profondità" value={it.d} onChange={(v) => st.updateItem(it.id, { d: Math.max(1, v) })} />
        <Num label="Altezza" value={it.h} onChange={(v) => st.updateItem(it.id, { h: Math.max(1, v) })} />
        <Num tip="Altezza da terra (es. per pensili e mensole)" label="Da terra" value={it.z} onChange={(v) => st.updateItem(it.id, { z: Math.max(0, v) })} />
        <Num label="Rotazione" unit="°" value={Math.round(((((it.rotation * 180) / Math.PI) % 360) + 360) % 360)} onChange={(v) => st.updateItem(it.id, { rotation: (v * Math.PI) / 180 })} />
        {cat?.color && (
          <label className="prop">
            <span>Colore</span>
            <input type="color" value={it.color ?? cat.color} onChange={(e) => st.updateItem(it.id, { color: e.target.value })} />
          </label>
        )}
        <div className="row">
          <button onClick={() => st.updateItem(it.id, { rotation: it.rotation + Math.PI / 2 })} data-tip="Ruota di 90° (tasto R; Shift+R per 15°)">⟳ 90°</button>
          <button onClick={() => st.duplicateItem(it.id)} data-tip="Crea una copia accanto (⌘D)">Duplica</button>
          <button onClick={() => st.updateItem(it.id, { w: cat.w, d: cat.d, h: cat.h, color: undefined })} data-tip="Torna alle misure e al colore originali">Ripristina</button>
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
        <span className="muted small">Pavimento</span>
        <div className="swatches">
          {FLOOR_COLORS.map((c) => (
            <button key={c} style={{ background: c }} className={lab?.floorColor === c ? 'on' : ''} onClick={() => st.setLabel(pos, lab?.name ?? '', lab?.id, c)} data-tip="Colore del pavimento" />
          ))}
        </div>
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

const OPENING_NAMES = { door: 'Porta', window: 'Finestra', arch: 'Varco', sliding: 'Ante scorrevoli' } as const;

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
