// Barra dei menu stile applicazione (File, Modifica, Pianta, Vista): raccoglie i comandi meno usati
// che prima erano pulsanti sempre visibili.
import { useEffect, useRef, useState, type ReactNode } from 'react';

export type MenuEntry =
  | {
      label: string;
      icon?: string;
      /** scorciatoia mostrata a destra (solo testo, il tasto lo gestisce chi la definisce) */
      keys?: string;
      /** voce con spunta / scelta: mostra ✓ */
      checked?: boolean;
      disabled?: boolean;
      tip?: string;
      onClick: () => void;
    }
  | { sep: true }
  /** contenuto libero (es. uno slider) */
  | { custom: ReactNode };

export interface Menu {
  title: string;
  entries: MenuEntry[];
}

export function MenuBar({ menus }: { menus: Menu[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open === null) return;
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(null);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      else if (e.key === 'ArrowRight') setOpen((o) => (o === null ? o : (o + 1) % menus.length));
      else if (e.key === 'ArrowLeft') setOpen((o) => (o === null ? o : (o - 1 + menus.length) % menus.length));
    };
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key);
    };
  }, [open, menus.length]);

  return (
    <div className="menubar" ref={ref} role="menubar">
      {menus.map((m, i) => (
        <div key={m.title} className="menu">
          <button
            className={'mtitle' + (open === i ? ' open' : '')}
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={open === i}
            onClick={() => setOpen(open === i ? null : i)}
            // con un menu già aperto, passando sopra un altro titolo si apre quello (come sul Mac)
            onPointerEnter={() => open !== null && setOpen(i)}
          >
            {m.title}
          </button>
          {open === i && (
            <div className="mdrop" role="menu">
              {m.entries.map((e, k) =>
                'sep' in e ? (
                  <hr key={k} />
                ) : 'custom' in e ? (
                  <div key={k} className="mcustom">
                    {e.custom}
                  </div>
                ) : (
                  <button
                    key={k}
                    role="menuitem"
                    disabled={e.disabled}
                    data-tip={e.tip}
                    onClick={() => {
                      setOpen(null);
                      e.onClick();
                    }}
                  >
                    <span className="mcheck">{e.checked ? '✓' : ''}</span>
                    <span className="mic">{e.icon ?? ''}</span>
                    <span className="mlabel">{e.label}</span>
                    {e.keys && <span className="mkeys">{e.keys}</span>}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
