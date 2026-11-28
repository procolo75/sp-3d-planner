import { useEffect, useState } from 'react';
import { ProjectsDialog } from './ProjectsDialog';
import { currentFile, openFromPC, saveToPC } from '../model/pcFiles';
import { notify } from './Notice';
import { snap3d, snapPlan } from './imageExport';

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
import { MenuBar, type Menu } from './MenuBar';

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

const TOOLS: { t: Tool; label: string; icon: string; tip: string }[] = [
  { t: 'select', label: 'Seleziona', icon: '↖', tip: 'Seleziona e sposta muri, angoli, porte e mobili. Clic su una stanza per darle un nome. (tasto V)' },
  { t: 'wall', label: 'Muro', icon: '▭', tip: 'Disegna muri: clic su ogni angolo. Mentre disegni puoi scrivere la lunghezza (es. 3,62) e premere Invio. Esc per finire. (tasto W)' },
  { t: 'door', label: 'Porta', icon: '🚪', tip: 'Clic su un muro per mettere una porta. Poi puoi cambiare larghezza e verso di apertura a destra. (tasto P)' },
  { t: 'window', label: 'Finestra', icon: '🪟', tip: 'Clic su un muro per mettere una finestra. (tasto F)' },
  { t: 'frenchWindow', label: 'Portafinestra', icon: '▯', tip: 'Finestra fino a terra (es. verso il balcone o il terrazzo): clic su un muro. A destra scegli larghezza e altezza. (tasto B)' },
  { t: 'arch', label: 'Varco', icon: '⌒', tip: 'Clic su un muro per aprire un passaggio senza porta.' },
  { t: 'sliding', label: 'Scorrevole', icon: '⇆', tip: 'Ante scorrevoli (es. IKEA SKYTTA): clic su un muro. Sostituiscono una porta o un tratto di muro (fronte della cabina armadio). Larghezza e altezza SKYTTA si scelgono a destra.' },
  { t: 'garage', label: 'Garage', icon: '🚘', tip: 'Portone del garage (basculante/sezionale): clic su un muro. A destra scegli larghezza, verso (lato interno) e apertura; si alza e rientra sotto il soffitto.' },
  { t: 'pillar', label: 'Pilastro', icon: '▪', tip: "Clic per mettere un pilastro (30×30, alto come i muri): si aggancia agli angoli e alle linee dei muri. Puoi metterne più di uno di fila; Esc per finire. A destra cambi misure e forma (quadrato o tondo). Shift = senza aggancio." },
  { t: 'camera', label: 'Telecamera', icon: '📹', tip: 'Metti una telecamera: clic sul punto dove la monti (si aggancia a pareti e angoli). Trascina il pallino davanti per girarla; angolo di visione e portata si scelgono a destra. Vedi le zone coperte e quanto della casa è sorvegliato. (tasto T)' },
  { t: 'light', label: 'Luce', icon: '💡', tip: 'Metti una luce di Home Assistant: clic dove si trova (di solito al centro della stanza), poi a destra scrivi la sua entità (es. light.cucina). Serve per la mappa 🏠 Home Assistant. (tasto L)' },
  { t: 'sensor', label: 'Sensore', icon: '🌡', tip: 'Metti un sensore di Home Assistant (temperatura, umidità…): clic dove vuoi vederne il valore sulla mappa, poi a destra scrivi la sua entità (es. sensor.temperatura_salotto).' },
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

  const st = useStore.getState;
  const fire = (ev: string) => () => window.dispatchEvent(new Event(ev));
  const menus: Menu[] = [
    {
      title: 'File',
      entries: [
        { label: 'Nuovo progetto…', icon: '📄', onClick: fire('planner:wizard'), tip: 'Crea la casa da una pianta (Claude la legge e prepara la mappa) oppure parti da un foglio vuoto' },
        { label: 'Apri da PC…', icon: '📂', keys: `${MOD}O`, onClick: openPC },
        { label: 'Recenti…', icon: '🕘', onClick: () => setDialog('list'), tip: 'I progetti usati di recente in questo browser: riaprili al volo, scaricali o eliminali' },
        { sep: true },
        { label: fileName ? `Salva («${fileName}»)` : 'Salva su PC…', icon: '💾', keys: `${MOD}S`, onClick: () => savePC(false) },
        { label: 'Salva con nome…', keys: `⇧${MOD}S`, onClick: () => savePC(true), tip: 'Salva in un nuovo file (es. una variante del progetto), scegliendo cartella e nome' },
        { sep: true },
        { label: 'Salva pianta come immagine…', icon: '🖼', onClick: () => snapPlan(false), tip: 'La pianta 2D in un\'immagine PNG ad alta risoluzione (senza griglia), buona da stampare anche in A3' },
        { label: 'Salva vista 3D come immagine…', icon: '📷', onClick: () => snap3d(false), tip: 'La vista 3D così come la vedi, con lo stile scelto. Con Realistico aspetta «✨ pronto»' },
        { label: 'Stampa pianta…', icon: '🖨', onClick: () => snapPlan(true), tip: 'Stampa la pianta 2D su un foglio A4, adattata alla pagina (o salvala in PDF dalla finestra di stampa)' },
        { label: 'Stampa vista 3D…', icon: '🖨', onClick: () => snap3d(true), tip: 'Stampa la vista 3D così come la vedi (o salvala in PDF dalla finestra di stampa)' },
        { sep: true },
        {
          label: 'Mappa per Home Assistant…',
          icon: '🏠',
          onClick: fire('planner:ha-export'),
          tip: 'Crea la mappa interattiva per Home Assistant (card ha-floorplan): immagine 3D o pianta, luci che si accendono, sensori, porte e telecamere',
        },
      ],
    },
    {
      title: 'Modifica',
      entries: [
        { label: 'Annulla', icon: '↶', keys: `${MOD}Z`, onClick: () => undo() },
        { label: 'Ripeti', icon: '↷', keys: `⇧${MOD}Z`, onClick: () => redo() },
        { sep: true },
        {
          label: 'Blocca spostamenti',
          icon: '🔒',
          checked: locked,
          onClick: () => setLocked(!locked),
          tip: 'In Seleziona tocchi muri, porte, mobili e telecamere (e li modifichi dal pannello a destra) ma non si spostano più per sbaglio',
        },
      ],
    },
    {
      title: 'Pianta',
      entries: [
        { label: 'Nuova pianta da file…', icon: '📄', onClick: fire('planner:wizard') },
        { sep: true },
        { label: 'Correggi scala', icon: '📏', disabled: !bg, checked: tool === 'calibrate', onClick: () => setTool('calibrate'), tip: 'Clicca i due estremi di qualcosa di cui conosci la lunghezza e scrivi la misura: tutta la casa viene riscalata' },
        { label: 'Mostra la pianta sotto i muri', icon: '👁', disabled: !bg, checked: !!bg?.visible, onClick: () => bg && st().updateBackground({ visible: !bg.visible }) },
        ...(bg
          ? [
              {
                custom: (
                  <label className="mslider">
                    Trasparenza
                    <input type="range" min={0.1} max={1} step={0.05} value={bg.opacity} onChange={(e) => st().updateBackground({ opacity: +e.target.value })} />
                  </label>
                ),
              },
            ]
          : []),
      ],
    },
    {
      title: 'Vista',
      entries: [
        { label: 'Solo pianta 2D', checked: view === '2d', onClick: () => setView('2d') },
        { label: 'Pianta e 3D affiancati', checked: view === 'split', onClick: () => setView('split') },
        { label: 'Solo 3D', checked: view === '3d', onClick: () => setView('3d') },
        { sep: true },
        { label: 'Quote delle stanze', icon: '📐', checked: showDims, onClick: () => st().set('showDims', !showDims) },
        {
          label: 'Zone viste dalle telecamere',
          icon: '📹',
          checked: showCoverage,
          onClick: () => st().set('showCoverage', !showCoverage),
          tip: nCameras ? 'Mostra o nascondi le zone viste dalle telecamere (in pianta e in 3D)' : 'Aggiungi una telecamera con lo strumento 📹 Telecamera',
        },
      ],
    },
  ];

  return (
    <header className="toolbar">
      {/* riga 1: logo, menu, nome del progetto, salva */}
      <div className="trow">
        <span className="brand" aria-label="SP 3D Planner">
          <span className="logo" aria-hidden="true" dangerouslySetInnerHTML={{ __html: logoVolto }} />
          <span className="names">
            <span className="title">SP 3D Planner</span>
            <span className="tagline">progetta e arreda la tua casa in 3D</span>
          </span>
        </span>
        <MenuBar menus={menus} />
        <input className="proj-name" value={name} onChange={(e) => st().rename(e.target.value)} data-tip="Nome del progetto (clicca per cambiarlo)" />
        <button
          className={dirty ? 'primary' : ''}
          onClick={() => savePC(false)}
          data-tip={
            (fileName ? `Salva le modifiche nel file «${fileName}» sul tuo computer` : 'Salva il progetto in un file sul tuo computer: la prima volta scegli dove e con che nome') +
            ` (${MOD}S). Il pallino • vuol dire che ci sono modifiche non salvate.`
          }
        >
          💾 Salva{dirty ? ' •' : ''}
        </button>
        <div className="spacer" />
        {dialog && <ProjectsDialog mode={dialog} onClose={() => setDialog(null)} />}
        <span className="sp-mark" aria-hidden="true" dangerouslySetInnerHTML={{ __html: logoSp }} />
      </div>

      {/* riga 2: strumenti di disegno e vista */}
      <div className="trow">
        <div className="group">
          {TOOLS.map((x) => (
            <button key={x.t} className={tool === x.t ? 'on' : ''} onClick={() => setTool(x.t)} data-tip={x.tip}>
              <span className="ic">{x.icon}</span>
              {x.label}
            </button>
          ))}
        </div>
        <div className="group">
          <button onClick={() => undo()} data-tip={`Annulla l'ultima modifica (${MOD}Z)`} aria-label="Annulla">
            ↶
          </button>
          <button onClick={() => redo()} data-tip={`Rifai la modifica annullata (⇧${MOD}Z)`} aria-label="Ripeti">
            ↷
          </button>
          <button
            className={locked ? 'on' : ''}
            onClick={() => setLocked(!locked)}
            aria-label={locked ? 'Sblocca' : 'Blocca'}
            data-tip={locked ? 'Bloccato: tocchi e selezioni senza spostare nulla. Clic per sbloccare.' : 'Blocca muri, porte, mobili e telecamere: li tocchi ma non si spostano più per sbaglio, es. col pennino.'}
          >
            {locked ? '🔒' : '🔓'}
          </button>
        </div>
        <div className="spacer" />
        <div className="seg" role="group" aria-label="Vista">
          {(['2d', 'split', '3d'] as const).map((v) => (
            <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)} data-tip={v === '2d' ? 'Solo la pianta' : v === '3d' ? 'Solo il 3D' : 'Pianta e 3D affiancati'}>
              {v === 'split' ? '2D | 3D' : v.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
