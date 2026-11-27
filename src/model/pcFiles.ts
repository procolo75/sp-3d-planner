// Salvataggio e apertura dei progetti come file sul computer.
// Con Chrome/Edge si usa la File System Access API: si sceglie dove salvare e le volte
// successive si sovrascrive lo stesso file. Negli altri browser il file viene scaricato
// nella cartella Download e l'apertura usa il normale selettore di file.
import { get, set } from 'idb-keyval';
import { importJSON, saveToLibrary } from './persist';
import { useStore } from './store';
import type { Project } from './types';

export const FILE_EXT = '.sp3d.json';

interface WritableHandle {
  name: string;
  queryPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
  createWritable(): Promise<{ write(data: Blob | string): Promise<void>; close(): Promise<void> }>;
  getFile(): Promise<File>;
}

type Win = Window & {
  showSaveFilePicker?: (o: unknown) => Promise<WritableHandle>;
  showOpenFilePicker?: (o: unknown) => Promise<WritableHandle[]>;
};

const pickerTypes = [{ description: 'Progetto SP 3D Planner', accept: { 'application/json': ['.json'] } }];

/** file collegato al progetto aperto (per «Salva su PC» senza richiedere ogni volta) */
let currentHandle: WritableHandle | null = null;
let currentFileName: string | null = null;
/** il file è stato scelto (o aperto) in questa sessione? Un file ricordato da una sessione precedente
 *  si conferma con «Salva con nome» al primo salvataggio, così non si sovrascrive niente a sorpresa */
let confirmedThisSession = false;

const HANDLE_KEY = 'planner3d:fileHandle';

/** collega il file al progetto (id) e lo ricorda anche dopo aver ricaricato la pagina */
async function remember(projectId: string | undefined, handle: WritableHandle | null, fileName: string | null) {
  currentHandle = handle;
  currentFileName = fileName;
  confirmedThisSession = !!handle;
  try {
    await set(HANDLE_KEY, handle && projectId ? { projectId, handle, fileName } : null);
  } catch {
    /* alcuni browser non permettono di salvare l'handle: pazienza */
  }
}

/** all'avvio: ritrova il file collegato al progetto ripreso */
export async function restoreFile(projectId: string | undefined) {
  if (!projectId) return;
  try {
    const r = (await get(HANDLE_KEY)) as { projectId: string; handle: WritableHandle; fileName: string } | null;
    if (r && r.projectId === projectId) {
      currentHandle = r.handle;
      currentFileName = r.fileName;
    }
  } catch {
    /* ignora */
  }
}

export function currentFile() {
  return currentFileName;
}

export function supportsPicker() {
  return typeof (window as Win).showSaveFilePicker === 'function';
}

function fileNameFor(p: Project) {
  const base = (p.name || 'progetto').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'progetto';
  return base + FILE_EXT;
}

function projectNameFromFile(fileName: string) {
  return fileName.replace(/\.sp3d\.json$/i, '').replace(/\.json$/i, '');
}

function serialize(p: Project) {
  return new Blob([JSON.stringify(p, null, 1)], { type: 'application/json' });
}

function download(p: Project, fileName: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(serialize(p));
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export type SaveResult = { ok: true; fileName: string; where: 'file' | 'download' } | { ok: false; cancelled: boolean; error?: string };

/**
 * Salva il progetto aperto su PC. `askWhere` forza la scelta del file (Salva con nome).
 * Dopo il salvataggio il progetto risulta «salvato» e finisce anche tra i recenti del browser.
 */
export async function saveToPC(askWhere = false): Promise<SaveResult> {
  const st = useStore.getState();
  let p = st.project;
  try {
    const w = window as Win;
    if (w.showSaveFilePicker) {
      let handle = currentHandle;
      if (askWhere || !handle || !confirmedThisSession) {
        // il selettore va aperto subito, prima di ogni altra attesa: il browser lo permette solo durante il clic
        handle = await w.showSaveFilePicker({ suggestedName: currentFileName ?? fileNameFor(p), types: pickerTypes });
        // il nome del file diventa il nome del progetto, se non ne aveva uno vero
        if (!p.name || /^nuovo progetto$/i.test(p.name.trim())) p = { ...p, name: projectNameFromFile(handle.name) };
      }
      const ws = await handle.createWritable();
      const saved = await saveToLibrary(p);
      await ws.write(serialize(saved));
      await ws.close();
      st.markSaved(saved);
      await remember(saved.id, handle, handle.name);
      return { ok: true, fileName: handle.name, where: 'file' };
    }
    const fileName = fileNameFor(p);
    const saved = await saveToLibrary(p);
    download(saved, fileName);
    st.markSaved(saved);
    await remember(saved.id, null, fileName);
    return { ok: true, fileName, where: 'download' };
  } catch (e) {
    if ((e as Error).name === 'AbortError') return { ok: false, cancelled: true };
    // file spostato, cancellato o senza permesso: la prossima volta si sceglie di nuovo dove salvare
    confirmedThisSession = false;
    return { ok: false, cancelled: false, error: (e as Error).message + ' — riprova: ti chiederò dove salvare.' };
  }
}

/** Apre un progetto da un file del PC. Ritorna il nome del file aperto, o null se annullato. */
export async function openFromPC(): Promise<string | null> {
  const w = window as Win;
  let file: File | null = null;
  let handle: WritableHandle | null = null;
  if (w.showOpenFilePicker) {
    try {
      [handle] = await w.showOpenFilePicker({ types: pickerTypes, multiple: false });
      file = await handle.getFile();
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null;
      throw e;
    }
  } else {
    file = await new Promise<File | null>((res) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = () => res(input.files?.[0] ?? null);
      input.click();
    });
  }
  if (!file) return null;
  const p = await importJSON(file);
  // un progetto aperto da file diventa anche un «recente» (con il suo id) e risulta salvato
  const saved = await saveToLibrary(p.name ? p : { ...p, name: projectNameFromFile(file.name) });
  useStore.getState().loadProject(saved);
  await remember(saved.id, handle, file.name);
  return file.name;
}

/** quando si crea o apre un progetto in altro modo, non è più collegato a un file */
export function forgetFile() {
  void remember(undefined, null, null);
}
