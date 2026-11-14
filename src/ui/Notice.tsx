import { useEffect, useState } from 'react';

type Msg = { text: string; error: boolean; id: number };
let push: ((m: Msg) => void) | null = null;

/** Mostra un avviso in alto al centro (gli errori restano finché non li chiudi). */
export function notify(text: string, error = false) {
  push?.({ text, error, id: Date.now() });
}

export function Notice() {
  const [msg, setMsg] = useState<Msg | null>(null);
  useEffect(() => {
    push = setMsg;
    return () => {
      push = null;
    };
  }, []);
  useEffect(() => {
    if (!msg || msg.error) return;
    const t = setTimeout(() => setMsg(null), 7000);
    return () => clearTimeout(t);
  }, [msg]);
  if (!msg) return null;
  return (
    <div className={'notice' + (msg.error ? ' err' : '')}>
      <span>{msg.text}</span>
      <button onClick={() => setMsg(null)}>✕</button>
    </div>
  );
}
