import { useEffect, useState } from 'react';
import { ProjectsDialog } from './ProjectsDialog';
import { currentFile, openFromPC, saveToPC } from '../model/pcFiles';
import { notify } from './Notice';

async function savePC(askWhere: boolean) {
  const r = await saveToPC(askWhere);
  if (r.ok)
    notify(
      r.where === 'file'
        ? `Salvato sul PC: «${r.fileName}» ✓`
        : `Salvato nella cartella Download: «${r.fileName}». (Questo browser non permette di scegliere la cartella: con Chrome o Edge puoi farlo.)`,
    );
  else if (!r.cancelled) notify('Salvataggio non riuscito: ' + (r.error ?? 'errore sconosciuto'), true);
}

async function openPC() {
  try {
    const name = await openFromPC();
    if (!name) return;
    setTimeout(() => {
      window.dispatchEvent(new Event('planner:fit'));
      window.dispatchEvent(new CustomEvent('planner:fit3d'));
    }, 80);
    notify(`Aperto dal PC: «${name}»`);
  } catch (e) {
    notify('Non riesco ad aprire il file: ' + (e as Error).message, true);
  }
}
import logoSp from '../assets/logo-sp.svg?raw';
import logoVolto from '../assets/logo-volto.svg?raw';
import { isDirty, redo, setLocked, undo, useStore, type Tool } from '../model/store';

const TOOLS: { t: Tool; label: string; icon: string; tip: string }[] = [
  { t: 'select', label: 'Seleziona', icon: '↖', tip: 'Seleziona e sposta muri, angoli, porte e mobili. Clic su una stanza per darle un nome. (tasto V)' },
  { t: 'wall', label: 'Muro', icon: '▭', tip: 'Disegna muri: clic su ogni angolo. Mentre disegni puoi scrivere la lunghezza (es. 3,62) e premere Invio. Esc per finire. (tasto W)' },
  { t: 'door', label: 'Porta', icon: '🚪', tip: 'Clic su un muro per mettere una porta. Poi puoi cambiare larghezza e verso di apertura a destra. (tasto P)' },
  { t: 'window', label: 'Finestra', icon: '🪟', tip: 'Clic su un muro per mettere una finestra. (tasto F)' },
  { t: 'arch', label: 'Varco', icon: '⌒', tip: 'Clic su un muro per aprire un passaggio senza porta.' },
  { t: 'sliding', label: 'Scorrevole', icon: '⇆', tip: 'Ante scorrevoli (es. IKEA SKYTTA): clic su un muro. Sostituiscono una porta o un tratto di muro (fronte della cabina armadio). Larghezza e altezza SKYTTA si scelgono a destra.' },
  { t: 'camera', label: 'Telecamera', icon: '📹', tip: 'Metti una telecamera: clic sul punto dove la monti (si aggancia a pareti e angoli). Trascina il pallino davanti per girarla; angolo di visione e portata si scelgono a destra. Vedi le zone coperte e quanto della casa è sorvegliato. (tasto T)' },
];

export function Toolbar() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const name = useStore((s) => s.project.name);
  const showDims = useStore((s) => s.showDims);
  const showCoverage = useStore((s) => s.showCoverage);
  const locked = useStore((s) => s.locked);
  const nCameras = useStore((s) => Object.keys(s.project.cameras ?? {}).length);
  const bg = useStore((s) => s.project.background);
  const wallThickness = useStore((s) => s.wallThickness);
  const [dialog, setDialog] = useState<'save' | 'list' | null>(null);
  // nome del file collegato (si aggiorna quando cambia lo stato di salvataggio)
  useStore((st) => st.savedProject);
  const fileName = currentFile();
  // da salvare: modifiche nuove, oppure progetto mai salvato in un file sul PC
  const dirty = useStore(isDirty) || !fileName;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        savePC(e.shiftKey);
      } else if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        openPC();
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
          <button
            className={dirty ? 'primary' : ''}
            onClick={() => savePC(false)}
            data-tip={
              (fileName ? `Salva le modifiche nel file «${fileName}» sul tuo computer` : 'Salva il progetto in un file sul tuo computer: la prima volta scegli dove e con che nome') +
              ' (⌘S). Il pallino • vuol dire che ci sono modifiche non salvate.'
            }
          >
            💾 Salva su PC{dirty ? ' •' : ''}
          </button>
          <button onClick={() => savePC(true)} data-tip="Salva in un nuovo file (es. una variante del progetto), scegliendo cartella e nome (⇧⌘S)">
            Salva con nome…
          </button>
          <button onClick={openPC} data-tip="Apri un progetto salvato sul tuo computer (file .sp3d.json) (⌘O)">
            📂 Apri da PC
          </button>
          <button onClick={() => setDialog('list')} data-tip="I progetti usati di recente in questo browser: riaprili al volo, scaricali o eliminali">
            🕘 Recenti
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
        <div className="group">
          <button
            className={locked ? 'on' : ''}
            onClick={() => setLocked(!locked)}
            data-tip={locked ? 'Bloccato: tocchi e selezioni senza spostare nulla. Clic per sbloccare e tornare a spostare muri, porte e mobili.' : 'Blocca muri, porte, mobili e telecamere: in Seleziona li tocchi (e li modifichi dal pannello a destra) ma non si spostano più per sbaglio, es. col pennino. Trascinando sposti la vista.'}
          >
            {locked ? '🔒 Bloccato' : '🔓 Blocca'}
          </button>
        </div>
        <div className="spacer" />
        <div className="group">
          <span className="gtitle">Vista</span>
          <button className={showDims ? 'on' : ''} onClick={() => useStore.getState().set('showDims', !showDims)} data-tip="Mostra o nascondi le misure interne delle stanze">
            📐 Quote
          </button>
          <button className={showCoverage ? 'on' : ''} onClick={() => useStore.getState().set('showCoverage', !showCoverage)} data-tip={nCameras ? 'Mostra o nascondi le zone viste dalle telecamere (in pianta e in 3D)' : 'Mostra o nascondi le zone viste dalle telecamere. Aggiungi una telecamera con lo strumento 📹 Telecamera'}>
            📹 Copertura
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
