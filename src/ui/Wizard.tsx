import { useRef, useState } from 'react';
import { CLAUDE_PROMPT } from '../import/claudePrompt';
import { MapError, parseMapText } from '../import/mapJson';
import { useStore } from '../model/store';

type Step = 'choose' | 'claude';

/**
 * Wizard "nuovo progetto".
 * Strada consigliata: la mappa (muri, porte, finestre) la crea Claude dalla pianta; qui si incolla e si genera il 3D.
 */
export function Wizard({ onClose }: { onClose: () => void }) {
  const hasWork = useStore((s) => Object.keys(s.project.walls).length > 0 || Object.keys(s.project.items).length > 0);
  const [step, setStep] = useState<Step>('choose');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CLAUDE_PROMPT);
    } catch {
      // fallback per browser senza permesso agli appunti
      const ta = document.createElement('textarea');
      ta.value = CLAUDE_PROMPT;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const build = (src: string) => {
    setError('');
    try {
      const { project, stats } = parseMapText(src);
      const st = useStore.getState();
      st.loadProject(project);
      st.setView('split');
      st.setTool('select');
      onClose();
      setTimeout(() => {
        window.dispatchEvent(new Event('planner:fit'));
        window.dispatchEvent(new Event('planner:fit3d'));
      }, 80);
      import('./Notice').then(({ notify }) =>
        notify(
          `Casa creata: ${stats.walls} muri, ${stats.openings} porte e finestre.` +
            (stats.skippedOpenings ? ` ${stats.skippedOpenings} aperture non erano su nessun muro e le ho saltate.` : '') +
            ' Ora scegli i mobili a sinistra e cliccali in pianta.',
        ),
      );
    } catch (e) {
      setError(e instanceof MapError ? e.message : 'Errore: ' + (e as Error).message);
    }
  };

  const startEmpty = () => {
    const st = useStore.getState();
    st.newProject();
    st.setTool('wall');
    onClose();
    import('./Notice').then(({ notify }) => notify('Progetto vuoto: disegna i muri cliccando sugli angoli. Mentre disegni puoi scrivere la lunghezza (es. 4,15) e premere Invio.'));
  };

  return (
    <div className="wizard-back">
      <div className="wizard">
        <header>
          <h2>Nuovo progetto</h2>
          <span style={{ flex: 1 }} />
          <button className="x" onClick={onClose} data-tip="Chiudi senza cambiare niente">
            ✕
          </button>
        </header>

        {step === 'choose' && (
          <div className="body">
            {hasWork && <p className="warn">Attenzione: il progetto attuale verrà sostituito. Se vuoi tenerlo chiudi e usa prima «Esporta» (resta comunque in «Versioni precedenti»).</p>}
            <div className="choices">
              <button className="choice main" onClick={() => setStep('claude')}>
                <span className="big">🤖</span>
                <b>Ho una pianta: la faccio leggere a Claude</b>
                <span>Claude legge la pianta (anche le quote) e prepara la mappa di muri, porte e finestre. Tu la incolli qui e il 3D è pronto.</span>
                <em>Consigliato</em>
              </button>
              <button className="choice" onClick={startEmpty}>
                <span className="big">✏️</span>
                <b>Disegno a mano</b>
                <span>Parti da un foglio vuoto e disegni i muri cliccando sugli angoli.</span>
              </button>
            </div>
          </div>
        )}

        {step === 'claude' && (
          <div className="body">
            <ol className="howto">
              <li>
                <b>Copia le istruzioni</b>{' '}
                <button className="primary" onClick={copy}>
                  {copied ? '✓ Copiate' : '📋 Copia istruzioni per Claude'}
                </button>
              </li>
              <li>
                Apri{' '}
                <a href="https://claude.ai/new" target="_blank" rel="noreferrer">
                  claude.ai
                </a>
                , <b>allega la pianta</b> (PDF o foto) e <b>incolla le istruzioni</b>. Invia.
              </li>
              <li>
                Quando Claude risponde, <b>copia tutta la risposta</b> (il blocco che inizia con <code>{'{'}</code>) e <b>incollala qui sotto</b>.
              </li>
            </ol>
            <textarea className="paste" value={text} onChange={(e) => setText(e.target.value)} placeholder='Incolla qui la risposta di Claude…  { "muri": [ … ] }' spellCheck={false} />
            {error && <p className="error">{error}</p>}
            <div className="row-c">
              <button onClick={() => setStep('choose')}>← Indietro</button>
              <button onClick={() => fileRef.current?.click()} data-tip="Se hai la mappa salvata in un file .json">
                📂 Carica file mappa
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json,text/plain"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  const t = await f.text();
                  setText(t);
                  build(t);
                }}
              />
              <span style={{ flex: 1 }} />
              <button className="primary big" disabled={!text.trim()} onClick={() => build(text)}>
                Crea il 3D →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
