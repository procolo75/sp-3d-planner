import { useEffect, useState } from 'react';

/**
 * Fumetto di aiuto unico per tutta l'app: qualsiasi elemento con `data-tip="..."`
 * mostra il testo subito al passaggio del mouse (senza il ritardo dei title nativi).
 */
export function Tooltip() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; below: boolean } | null>(null);
  useEffect(() => {
    const over = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null;
      if (!el) return setTip(null);
      const r = el.getBoundingClientRect();
      const below = r.top < window.innerHeight / 2;
      setTip({ text: el.dataset.tip!, x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below });
    };
    const hide = () => setTip(null);
    document.addEventListener('mouseover', over);
    document.addEventListener('mousedown', hide);
    document.addEventListener('wheel', hide, { passive: true });
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('mouseover', over);
      document.removeEventListener('mousedown', hide);
      document.removeEventListener('wheel', hide);
      window.removeEventListener('blur', hide);
    };
  }, []);
  if (!tip) return null;
  const left = Math.max(150, Math.min(window.innerWidth - 150, tip.x));
  return (
    <div className="tooltip" style={{ left, top: tip.y, transform: `translate(-50%, ${tip.below ? '0' : '-100%'})` }}>
      {tip.text}
    </div>
  );
}
