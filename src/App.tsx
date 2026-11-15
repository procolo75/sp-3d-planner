import { useEffect, useState } from 'react';
import { CatalogPanel } from './catalog/CatalogPanel';
import { Editor2D } from './editor2d/Editor2D';
import { listLibrary, loadSaved, startAutosave } from './model/persist';
import { restoreFile } from './model/pcFiles';
import { useStore } from './model/store';
import { Scene3D } from './three/Scene3D';
import { Properties } from './ui/Properties';
import { Toolbar } from './ui/Toolbar';
import { Tooltip } from './ui/Tooltip';
import { Notice } from './ui/Notice';
import { Wizard } from './ui/Wizard';
import { FocusBar } from './ui/FocusBar';
import './App.css';

export default function App() {
  const view = useStore((s) => s.view);
  const [ready, setReady] = useState(false);
  const [wizard, setWizard] = useState(false);
  useEffect(() => {
    const open = () => setWizard(true);
    window.addEventListener('planner:wizard', open);
    return () => window.removeEventListener('planner:wizard', open);
  }, []);
  useEffect(() => {
    let unsub: (() => void) | undefined;
    loadSaved().then(async (p) => {
      if (p) {
        useStore.getState().loadProject(p);
        await restoreFile(p.id);
        // il lavoro ripreso coincide con la versione salvata in «I miei progetti»? altrimenti ci sono modifiche da salvare
        if (p.id) {
          const saved = (await listLibrary()).find((x) => x.id === p.id);
          if (!saved || JSON.stringify(saved.project) !== JSON.stringify(p)) useStore.setState({ savedProject: saved?.project ?? null });
        }
      }
      // primo avvio o progetto vuoto: parte il wizard
      if (!p || (!Object.keys(p.walls).length && !p.background)) setWizard(true);
      unsub = startAutosave();
      setReady(true);
      setTimeout(() => (window.dispatchEvent(new Event('planner:fit')), window.dispatchEvent(new CustomEvent('planner:fit3d'))), 300);
    });
    return () => unsub?.();
  }, []);
  if (!ready) return <div className="loading">Caricamento…</div>;
  return (
    <div className="app">
      <Toolbar />
      <div className="main">
        <CatalogPanel />
        <div className={'views ' + view}>
          <FocusBar />
          {view !== '3d' && <Editor2D />}
          {view !== '2d' && <Scene3D />}
        </div>
        <Properties />
      </div>
      <Tooltip />
      <Notice />
      {wizard && <Wizard onClose={() => setWizard(false)} />}
    </div>
  );
}
