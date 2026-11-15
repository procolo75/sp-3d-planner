import { get, set } from 'idb-keyval';
import { consumeAllowEmpty } from './saveGuard';
import { useStore } from './store';
import type { Project } from './types';

const KEY = 'planner3d:project';
const BACKUPS = 'planner3d:backups';
const MAX_BACKUPS = 5;
const BACKUP_EVERY_MS = 2 * 60 * 1000;

export interface Backup {
  time: number;
  project: Project;
}

const isEmpty = (p: Project) => !Object.keys(p.walls).length && !Object.keys(p.items).length && !p.background;

export async function listBackups(): Promise<Backup[]> {
  try {
    return ((await get(BACKUPS)) as Backup[] | undefined) ?? [];
  } catch {
    return [];
  }
}

let lastBackup = 0;
async function save(p: Project) {
  if (isEmpty(p) && !consumeAllowEmpty()) {
    // mai sovrascrivere un progetto con contenuto con uno vuoto (es. ricaricamenti a caldo)
    const prev = (await get(KEY)) as Project | undefined;
    if (prev && !isEmpty(prev)) return;
  }
  await set(KEY, p);
  if (isEmpty(p) || Date.now() - lastBackup < BACKUP_EVERY_MS) return;
  lastBackup = Date.now();
  const list = await listBackups();
  list.unshift({ time: Date.now(), project: p });
  await set(BACKUPS, list.slice(0, MAX_BACKUPS));
}

export async function loadSaved(): Promise<Project | null> {
  try {
    const p = (await get(KEY)) as Project | undefined;
    return p && p.version === 1 ? p : null;
  } catch {
    return null;
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
export function startAutosave() {
  return useStore.subscribe((s, prev) => {
    if (s.project === prev.project) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      save(s.project).catch((e) => console.warn('autosave fallito', e));
    }, 600);
  });
}

export function exportJSON(p: Project) {
  const blob = new Blob([JSON.stringify(p)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (p.name || 'progetto').replace(/[\\/:*?"<>|]+/g, '_') + '.sp3d.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importJSON(file: File): Promise<Project> {
  const p = JSON.parse(await file.text()) as Project;
  if (p.version !== 1 || !p.nodes || !p.walls) throw new Error('File non valido');
  p.openings ??= {};
  p.items ??= {};
  p.labels ??= {};
  p.cameras ??= {};
  return p;
}

// ---------------------------------------------------------------------------
// «I miei progetti»: raccolta di progetti salvati con un nome

const LIBRARY = 'planner3d:library';

export interface SavedProject {
  id: string;
  name: string;
  updated: number;
  walls: number;
  items: number;
  project: Project;
}

export async function listLibrary(): Promise<SavedProject[]> {
  try {
    const l = ((await get(LIBRARY)) as SavedProject[] | undefined) ?? [];
    return l.sort((a, b) => b.updated - a.updated);
  } catch {
    return [];
  }
}

/** Salva (o aggiorna) il progetto nella raccolta. Ritorna il progetto con il suo id. */
export async function saveToLibrary(p: Project): Promise<Project> {
  const id = p.id ?? Math.random().toString(36).slice(2, 10);
  const proj: Project = { ...p, id };
  const list = (await listLibrary()).filter((x) => x.id !== id);
  list.unshift({ id, name: proj.name || 'Senza nome', updated: Date.now(), walls: Object.keys(proj.walls).length, items: Object.keys(proj.items).length, project: proj });
  await set(LIBRARY, list);
  return proj;
}

export async function deleteFromLibrary(id: string) {
  await set(LIBRARY, (await listLibrary()).filter((x) => x.id !== id));
}
