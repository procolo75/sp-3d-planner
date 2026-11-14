import { focusedRoom, useDerived } from '../model/derived';
import { useStore } from '../model/store';

/** barra in alto quando si arreda una sola stanza */
export function FocusBar() {
  const project = useStore((s) => s.project);
  const focus = useStore((s) => s.focus);
  const der = useDerived(project);
  if (!focus) return null;
  const fr = focusedRoom(der, focus);
  const name = fr ? der.roomLabel.get(fr.key)?.name || 'stanza senza nome' : null;
  const exit = () => useStore.getState().set('focus', null);
  return (
    <div className="focus-bar">
      {fr ? (
        <span>
          Stai arredando: <b>{name}</b> ({(fr.area / 10000).toFixed(1).replace('.', ',')} m²)
        </span>
      ) : (
        <span>La stanza scelta non esiste più (hai cambiato i muri).</span>
      )}
      <button className="primary" onClick={exit} data-tip="Torna a vedere tutto l'appartamento">
        ← Tutta la casa
      </button>
    </div>
  );
}
