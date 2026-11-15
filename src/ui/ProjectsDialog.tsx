import { useEffect, useState } from 'react';
import { deleteFromLibrary, exportJSON, listLibrary, type SavedProject } from '../model/persist';
import { forgetFile } from '../model/pcFiles';
import { isDirty, useStore } from '../model/store';
import { notify } from './Notice';

/**
 * «Recenti»: copie dei progetti usati in questo browser (si aggiornano a ogni «Salva su PC»).
 * Il salvataggio vero è il file sul computer; questo elenco serve per riaprire al volo.
 */
export function ProjectsDialog({ onClose }: { mode?: 'save' | 'list'; onClose: () => void }) {
  const project = useStore((s) => s.project);
  const dirty = useStore(isDirty);
  const [list, setList] = useState<SavedProject[]>([]);
  const refresh = () => listLibrary().then(setList);
  useEffect(() => {
    refresh();
  }, []);

  const open = (sp: SavedProject) => {
    useStore.getState().loadProject(sp.project);
    forgetFile();
    setTimeout(() => {
      window.dispatchEvent(new Event('planner:fit'));
      window.dispatchEvent(new CustomEvent('planner:fit3d'));
    }, 80);
    notify(`Aperto «${sp.name}» dai recenti. «Salva su PC» ti chiederà dove salvarlo.`);
    onClose();
  };

  return (
    <div className="wizard-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="wizard" style={{ width: 'min(680px, 100%)' }}>
        <header>
          <h2>Progetti recenti</h2>
          <span style={{ flex: 1 }} />
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="body">
          <p className="muted" style={{ margin: 0 }}>
            Copie dei progetti che hai usato <b>in questo browser</b>, aggiornate ogni volta che salvi. Il salvataggio sicuro è il file sul PC (<b>💾 Salva su PC</b>): queste copie spariscono se cancelli i dati del browser.
          </p>
          {dirty && <p className="warn">Il progetto aperto ha modifiche non salvate: se ne apri un altro le perdi. Chiudi e premi prima «💾 Salva su PC».</p>}
          {!list.length && <p className="muted">Ancora nessun progetto recente: compariranno qui dopo il primo «Salva su PC».</p>}
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
                <button onClick={() => exportJSON(sp.project)} data-tip="Scarica questo progetto come file nella cartella Download">
                  ⬇ Scarica
                </button>
                <button
                  className="danger"
                  onClick={async () => {
                    if (!confirm(`Togliere «${sp.name}» dai recenti? Il file sul PC, se l'hai salvato, non viene toccato.`)) return;
                    await deleteFromLibrary(sp.id);
                    refresh();
                  }}
                >
                  Togli
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
