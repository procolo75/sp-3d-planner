import { useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { CATALOG, scaledParts, type CatalogItem } from './catalog';

type Brand = 'tutti' | 'IKEA' | 'generici';

const KINDS: { id: string; name: string }[] = [
  { id: 'su-armadio', name: 'Armadio' },
  { id: 'su-libreria', name: 'Libreria / scaffale' },
  { id: 'su-cassettiera', name: 'Cassettiera / comodino' },
  { id: 'su-box', name: 'Mobile con ante' },
  { id: 'su-tavolo', name: 'Tavolo / scrivania' },
  { id: 'su-divano', name: 'Divano / poltrona' },
  { id: 'su-letto', name: 'Letto' },
];

export function CatalogPanel() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [brand, setBrand] = useState<Brand>('tutti');
  const [custom, setCustom] = useState(false);
  const placing = useStore((s) => s.placeCatalogId);

  const pool = useMemo(() => CATALOG.filter((c) => c.category !== 'Su misura' && (brand === 'tutti' || (brand === 'IKEA' ? c.brand === 'IKEA' : !c.brand))), [brand]);
  const categories = useMemo(() => [...new Set(pool.map((c) => c.category))], [pool]);
  const items = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return pool.filter((c) => (!cat || c.category === cat) && (!qq || c.name.toLowerCase().includes(qq) || c.category.toLowerCase().includes(qq)));
  }, [q, cat, pool]);

  const pick = (id: string) => {
    const st = useStore.getState();
    st.set('placeOverrides', null);
    st.set('placeCatalogId', id);
    st.set('tool', 'place');
  };

  return (
    <aside className="catalog">
      <h3>Mobili</h3>
      <p className="muted small" style={{ margin: 0 }}>
        Clicca un mobile, poi clicca sulla pianta dove vuoi metterlo.
      </p>
      <div className="cats brands">
        {(['tutti', 'IKEA', 'generici'] as Brand[]).map((b) => (
          <button
            key={b}
            className={brand === b ? 'on' : ''}
            onClick={() => {
              setBrand(b);
              setCat(null);
            }}
          >
            {b === 'tutti' ? 'Tutti' : b === 'IKEA' ? 'IKEA' : 'Generici'}
          </button>
        ))}
      </div>
      <input className="search" placeholder="Cerca… (es. pax, kallax, divano)" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="cats">
        <button className={!cat ? 'on' : ''} onClick={() => setCat(null)}>
          Tutte
        </button>
        {categories.map((c) => (
          <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>
      <button className="custom-btn" onClick={() => setCustom((v) => !v)} data-tip="Per qualsiasi mobile che non trovi (anche IKEA): scrivi nome e misure prese dal sito o dal metro">
        ➕ Mobile su misura
      </button>
      {custom && <CustomForm onDone={() => setCustom(false)} />}
      <div className="grid">
        {items.map((c) => (
          <button
            key={c.id}
            className={'card' + (placing === c.id ? ' on' : '')}
            onClick={() => pick(c.id)}
            data-tip={`${c.name}: ${c.w}×${c.d} cm, alto ${c.h} cm. Clicca qui e poi clicca sulla pianta per posizionarlo.`}
          >
            <Thumb c={c} />
            <span className="nm">{c.name}</span>
            <span className="dm">
              {c.w}×{c.d}×{c.h}
            </span>
          </button>
        ))}
        {!items.length &&
          (/skyt|scorrev/i.test(q) ? (
            <p className="hint-box">
              Le ante scorrevoli <b>SKYTTA</b> sostituiscono una porta o un muro: usa lo strumento <b>⇆ Scorrevole</b> nella barra «Disegna» in alto e clicca su un muro.
            </p>
          ) : (
            <p className="muted small">Nessun mobile trovato. Prova «Mobile su misura».</p>
          ))}
      </div>
    </aside>
  );
}

function CustomForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('su-armadio');
  const [w, setW] = useState('');
  const [d, setD] = useState('');
  const [h, setH] = useState('');
  const n = (s: string) => {
    const v = parseFloat(s.replace(',', '.'));
    return isFinite(v) && v > 0 ? v : undefined;
  };
  const ok = n(w) && n(d) && n(h);
  return (
    <form
      className="custom-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        const st = useStore.getState();
        st.set('placeCatalogId', kind);
        st.set('tool', 'place');
        st.set('placeOverrides', { label: name.trim() || undefined, w: n(w), d: n(d), h: n(h) });
        onDone();
      }}
    >
      <input placeholder="Nome (es. PAX 150 camera)" value={name} onChange={(e) => setName(e.target.value)} />
      <select value={kind} onChange={(e) => setKind(e.target.value)}>
        {KINDS.map((k) => (
          <option key={k.id} value={k.id}>
            {k.name}
          </option>
        ))}
      </select>
      <div className="dims">
        <input placeholder="Largh." value={w} onChange={(e) => setW(e.target.value)} />
        <input placeholder="Prof." value={d} onChange={(e) => setD(e.target.value)} />
        <input placeholder="Alt." value={h} onChange={(e) => setH(e.target.value)} />
        <span className="muted small">cm</span>
      </div>
      <button className="primary" disabled={!ok}>
        Metti in pianta
      </button>
    </form>
  );
}

/** miniatura: vista dall'alto generata dalle parti */
function Thumb({ c }: { c: CatalogItem }) {
  const parts = useMemo(() => scaledParts(c, c.w, c.d, c.h).sort((a, b) => top(a) - top(b)), [c]);
  const m = Math.max(c.w, c.d) * 1.1;
  return (
    <svg viewBox={`${-m / 2} ${-m / 2} ${m} ${m}`} className="thumb">
      {parts.map((p, i) =>
        p.t === 'box' ? (
          <rect key={i} x={p.p[0] - p.s[0] / 2} y={p.p[2] - p.s[2] / 2} width={p.s[0]} height={p.s[2]} fill={p.c} fillOpacity={p.o ?? 1} stroke="#0003" strokeWidth={m / 150} />
        ) : (
          <circle key={i} cx={p.p[0]} cy={p.p[2]} r={p.r} fill={p.c} fillOpacity={p.o ?? 1} stroke="#0003" strokeWidth={m / 150} />
        ),
      )}
    </svg>
  );
}

function top(p: ReturnType<typeof scaledParts>[number]) {
  return p.t === 'box' ? p.p[1] + p.s[1] / 2 : p.t === 'cyl' ? p.p[1] + p.h / 2 : p.p[1] + p.r;
}
