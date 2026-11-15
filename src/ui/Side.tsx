import { useState, type ReactNode } from 'react';

/** sotto questa larghezza (tablet) le barre laterali partono chiuse */
const NARROW = 1200;

function initialOpen(side: string) {
  try {
    const v = localStorage.getItem('planner3d:side:' + side);
    if (v === 'open' || v === 'closed') return v === 'open';
  } catch {
    /* ignora */
  }
  return window.innerWidth >= NARROW;
}

/** barra laterale collassabile: una linguetta sul bordo la apre e la chiude */
export function Side({ side, label, children }: { side: 'left' | 'right'; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(() => initialOpen(side));
  const toggle = () =>
    setOpen((o) => {
      try {
        localStorage.setItem('planner3d:side:' + side, o ? 'closed' : 'open');
      } catch {
        /* ignora */
      }
      return !o;
    });
  const arrow = (side === 'left') === open ? '‹' : '›';
  return (
    <div className={`side ${side} ${open ? 'open' : 'closed'}`}>
      {open && children}
      <button className="side-tab" onClick={toggle} aria-expanded={open} aria-label={(open ? 'Chiudi ' : 'Apri ') + label} data-tip={open ? `Chiudi «${label}» per avere più spazio` : `Apri «${label}»`}>
        <span className="arrow">{arrow}</span>
        {!open && <span className="side-label">{label}</span>}
      </button>
    </div>
  );
}
