import { useEffect, useState } from 'react';
import { ProjectsDialog, saveCurrent } from './ProjectsDialog';
import logoSp from '../assets/logo-sp.svg?raw';
import logoVolto from '../assets/logo-volto.svg?raw';
import { isDirty, redo, undo, useStore, type Tool } from '../model/store';

const TOOLS: { t: Tool; label: string; icon: string; tip: string }[] = [
  { t: 'select', label: 'Seleziona', icon: '↖', tip: 'Seleziona e sposta muri, angoli, porte e mobili. Clic su una stanza per darle un nome. (tasto V)' },
  { t: 'wall', label: 'Muro', icon: '▭', tip: 'Disegna muri: clic su ogni angolo. Mentre disegni puoi scrivere la lunghezza (es. 3,62) e premere Invio. Esc per finire. (tasto W)' },
  { t: 'door', label: 'Porta', icon: '🚪', tip: 'Clic su un muro per mettere una porta. Poi puoi cambiare larghezza e verso di apertura a destra. (tasto P)' },
  { t: 'window', label: 'Finestra', icon: '🪟', tip: 'Clic su un muro per mettere una finestra. (tasto F)' },
  { t: 'arch', label: 'Varco', icon: '⌒', tip: 'Clic su un muro per aprire un passaggio senza porta.' },
  { t: 'sliding', label: 'Scorrevole', icon: '⇆', tip: 'Ante scorrevoli (es. IKEA SKYTTA): clic su un muro. Sostituiscono una porta o un tratto di muro (fronte della cabina armadio). Larghezza e altezza SKYTTA si scelgono a destra.' },
];

export function Toolbar() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const name = useStore((s) => s.project.name);
  const showDims = useStore((s) => s.showDims);
  const bg = useStore((s) => s.project.background);
  const wallThickness = useStore((s) => s.wallThickness);
  const [dialog, setDialog] = useState<'save' | 'list' | null>(null);
  const dirty = useStore(isDirty);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveCurrent(() => setDialog('save'));
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  return (
    <header className="toolbar">
      {/* riga 1: progetto e pianta di partenza */}
      <div className="trow">
        <span className="brand" aria-label="SP 3D Planner">
          <span className="logo" aria-hidden="true" dangerouslySetInnerHTML={{ __html: logoVolto }} />
          <span className="names">
            <span className="title">SP 3D Planner</span>
            <span className="tagline">progetta e arreda la tua casa in 3D</span>
          </span>
        </span>
        <input className="proj-name" value={name} onChange={(e) => useStore.getState().rename(e.target.value)} data-tip="Nome del progetto (clicca per cambiarlo)" />
        <div className="group">
          <span className="gtitle">Pianta</span>
          <button className="primary" onClick={() => window.dispatchEvent(new Event('planner:wizard'))} data-tip="Crea la casa da una pianta: Claude la legge e prepara la mappa, qui diventa 3D. Oppure parti da un foglio vuoto.">
            📄 Nuovo progetto…
          </button>
          {bg && (
            <>
              <button className={tool === 'calibrate' ? 'on' : ''} onClick={() => setTool('calibrate')} data-tip="Le misure non tornano? Clicca i due estremi di qualcosa di cui conosci la lunghezza e scrivi la misura: tutta la casa viene riscalata.">
                📏 Correggi scala
              </button>
              <button className={bg.visible ? 'on' : ''} onClick={() => useStore.getState().updateBackground({ visible: !bg.visible })} data-tip="Mostra o nascondi la pianta originale sotto i muri">
                👁 Pianta sotto
              </button>
              <input type="range" min={0.1} max={1} step={0.05} value={bg.opacity} onChange={(e) => useStore.getState().updateBackground({ opacity: +e.target.value })} data-tip="Trasparenza della pianta originale" />

            </>
          )}
        </div>
        <div className="spacer" />
        <div className="group">
          <span className="gtitle">File</span>
          <button className={dirty ? 'primary' : ''} onClick={() => saveCurrent(() => setDialog('save'))} data-tip="Salva il progetto tra «I miei progetti» (⌘S). Il lavoro viene comunque tenuto in automatico finché non apri un altro progetto.">
            💾 Salva{dirty ? ' •' : ''}
          </button>
          <button onClick={() => setDialog('list')} data-tip="Apri, scarica o elimina i progetti salvati">
            📂 I miei progetti
          </button>
          <button onClick={() => window.dispatchEvent(new Event('planner:wizard'))} data-tip="Inizia un nuovo progetto (da una pianta o da zero)">
            ✚ Nuovo
          </button>
        </div>
        {dialog && <ProjectsDialog mode={dialog} onClose={() => setDialog(null)} />}
        <span className="sp-mark" aria-hidden="true" dangerouslySetInnerHTML={{ __html: logoSp }} />
      </div>

      {/* riga 2: strumenti di disegno e vista */}
      <div className="trow">
        <div className="group">
          <span className="gtitle">Disegna</span>
          {TOOLS.map((x) => (
            <button key={x.t} className={tool === x.t ? 'on' : ''} onClick={() => setTool(x.t)} data-tip={x.tip}>
              <span className="ic">{x.icon}</span>
              {x.label}
            </button>
          ))}
          <label className="mini" data-tip="Spessore dei NUOVI muri che disegni. Per cambiare un muro esistente selezionalo e modificalo nel pannello a destra.">
            spessore
            <input type="number" min={2} max={80} value={wallThickness} onChange={(e) => useStore.getState().set('wallThickness', Math.max(2, +e.target.value || 12))} />
            cm
          </label>
        </div>
        <div className="group">
          <button onClick={() => undo()} data-tip="Annulla l'ultima modifica (⌘Z)">
            ↶ Annulla
          </button>
          <button onClick={() => redo()} data-tip="Rifai la modifica annullata (⇧⌘Z)">
            ↷ Ripeti
          </button>
        </div>
        <div className="spacer" />
        <div className="group">
          <span className="gtitle">Vista</span>
          <button className={showDims ? 'on' : ''} onClick={() => useStore.getState().set('showDims', !showDims)} data-tip="Mostra o nascondi le misure interne delle stanze">
            📐 Quote
          </button>
          {(['2d', 'split', '3d'] as const).map((v) => (
            <button
              key={v}
              className={view === v ? 'on' : ''}
              onClick={() => setView(v)}
              data-tip={v === '2d' ? 'Solo la pianta' : v === '3d' ? 'Solo il 3D' : 'Pianta e 3D affiancati'}
            >
              {v === 'split' ? '2D | 3D' : v.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
