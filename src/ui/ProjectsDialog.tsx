import { useEffect, useRef, useState } from 'react';
import { deleteFromLibrary, exportJSON, importJSON, listLibrary, saveToLibrary, type SavedProject } from '../model/persist';
import { isDirty, useStore } from '../model/store';
import { notify } from './Notice';

/** Salva il progetto attuale; se non ha ancora un nome «vero» lo chiede. */
export async function saveCurrent(askName: () => void) {
  const p = useStore.getState().project;
  if (!p.id && (!p.name || /^(nuovo progetto|casa)$/i.test(p.name.trim()))) return askName();
  const saved = await saveToLibrary(p);
  useStore.getState().markSaved(saved);
  notify(`Progetto «${saved.name}» salvato ✓`);
}

export function ProjectsDialog({ mode, onClose }: { mode: 'save' | 'list'; onClose: () => void }) {
  const project = useStore((s) => s.project);
  const dirty = useStore(isDirty);
  const [list, setList] = useState<SavedProject[]>([]);
  const [name, setName] = useState(project.name && project.name !== 'Nuovo progetto' ? project.name : '');
  const [view, setView] = useState(mode);
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => listLibrary().then(setList);
  useEffect(() => {
    refresh();
  }, []);

  const doSave = async (asNew = false) => {
    const n = name.trim() || 'La mia casa';
    const st = useStore.getState();
    const saved = await saveToLibrary({ ...st.project, name: n, ...(asNew ? { id: undefined } : {}) });
    st.markSaved(saved);
    notify(`Progetto «${saved.name}» salvato ✓`);
    onClose();
  };

  const open = (sp: SavedProject) => {
    useStore.getState().loadProject(sp.project);
    setTimeout(() => {
      window.dispatchEvent(new Event('planner:fit'));
      window.dispatchEvent(new CustomEvent('planner:fit3d'));
    }, 80);
    notify(`Aperto «${sp.name}»`);
    onClose();
  };

  return (
    <div className="wizard-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="wizard" style={{ width: 'min(640px, 100%)' }}>
        <header>
          <h2>{view === 'save' ? 'Salva il progetto' : 'I miei progetti'}</h2>
          <span style={{ flex: 1 }} />
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </header>

        {view === 'save' && (
          <form
            className="body"
            onSubmit={(e) => {
              e.preventDefault();
              doSave();
            }}
          >
            <label className="lead">
              Nome del progetto
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Casa – versione con cucina aperta" style={{ width: '100%', marginTop: 6, fontSize: 15, padding: 8 }} />
            </label>
            <div className="row-c">
              <button type="button" onClick={() => setView('list')}>
                📂 I miei progetti
              </button>
              <span style={{ flex: 1 }} />
              {project.id && (
                <button type="button" onClick={() => doSave(true)} data-tip="Salva una copia separata, lasciando com'è quello già salvato (utile per confrontare varianti)">
                  Salva come copia
                </button>
              )}
              <button className="primary big" type="submit">
                💾 Salva
              </button>
            </div>
          </form>
        )}

        {view === 'list' && (
          <div className="body">
            {dirty && (
              <p className="warn">
                Il progetto aperto ha modifiche non salvate.{' '}
                <button onClick={() => setView('save')}>💾 Salvalo prima</button>
              </p>
            )}
            {!list.length && <p className="muted">Non hai ancora salvato nessun progetto. Usa «💾 Salva» in alto.</p>}
            <div className="plist">
              {list.map((sp) => (
                <div key={sp.id} className={'pitem' + (sp.id === project.id ? ' cur' : '')}>
                  <div>
                    <b>{sp.name}</b>
                    {sp.id === project.id && <span className="badge">aperto</span>}
                    <div className="muted small">
                      {new Date(sp.updated).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · {sp.walls} muri · {sp.items} mobili
                    </div>
                  </div>
                  <span style={{ flex: 1 }} />
                  <button className="primary" onClick={() => open(sp)}>
                    Apri
                  </button>
                  <button onClick={() => exportJSON(sp.project)} data-tip="Scarica questo progetto in un file (per backup o per un altro computer)">
                    ⬇ File
                  </button>
                  <button
                    className="danger"
                    onClick={async () => {
                      if (!confirm(`Eliminare «${sp.name}» dai progetti salvati? Non si può annullare.`)) return;
                      await deleteFromLibrary(sp.id);
                      refresh();
                    }}
                  >
                    Elimina
                  </button>
                </div>
              ))}
            </div>
            <div className="row-c">
              <button onClick={() => fileRef.current?.click()} data-tip="Apri un progetto da un file .json scaricato in precedenza">
                📥 Apri da file
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  try {
                    const p = await importJSON(f);
                    useStore.getState().loadProject({ ...p, id: undefined });
                    setTimeout(() => {
                      window.dispatchEvent(new Event('planner:fit'));
                      window.dispatchEvent(new CustomEvent('planner:fit3d'));
                    }, 80);
                    notify(`Aperto da file «${p.name}». Premi «Salva» per tenerlo tra i tuoi progetti.`);
                    onClose();
                  } catch (err) {
                    notify((err as Error).message, true);
                  }
                }}
              />
              <span style={{ flex: 1 }} />
              <button onClick={() => setView('save')}>💾 Salva quello aperto</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
