// Scelta del colore a pastiglie (con nome), per pavimenti, pareti e mobili. L'ultima pastiglia «+»
// apre il selettore del sistema per un colore qualsiasi.

export interface Swatch {
  c: string;
  name: string;
}

const sw = (list: [string, string][]): Swatch[] => list.map(([c, name]) => ({ c, name }));

export const FURNITURE_COLORS = sw([
  ['#ffffff', 'Bianco'],
  ['#f2f0eb', 'Bianco panna'],
  ['#e4dccd', 'Avorio'],
  ['#d8c9b0', 'Beige'],
  ['#a89a8a', 'Tortora'],
  ['#c9ccd0', 'Grigio chiaro'],
  ['#8a8f96', 'Grigio'],
  ['#3b3f45', 'Antracite'],
  ['#202124', 'Nero'],
  ['#d9bd8f', 'Rovere chiaro'],
  ['#b98b5e', 'Rovere'],
  ['#7a5235', 'Noce'],
  ['#4a3426', 'Wengé'],
  ['#6f7f99', 'Blu polvere'],
  ['#2f4566', 'Blu notte'],
  ['#9fbcd6', 'Azzurro'],
  ['#9caf88', 'Verde salvia'],
  ['#3f6b4a', 'Verde bosco'],
  ['#d4a239', 'Senape'],
  ['#c0643f', 'Terracotta'],
  ['#a83a32', 'Rosso'],
  ['#e3b8b0', 'Rosa cipria'],
]);

export const FLOOR_COLORS = sw([
  ['#d9c2a0', 'Rovere chiaro'],
  ['#e6d3b3', 'Rovere sbiancato'],
  ['#b98b5e', 'Rovere'],
  ['#8c6a4f', 'Noce'],
  ['#5a4232', 'Wengé'],
  ['#ffffff', 'Bianco'],
  ['#f2f0ea', 'Bianco marmo'],
  ['#e8e2d6', 'Avorio'],
  ['#c9c9c9', 'Grigio perla'],
  ['#9aa5ad', 'Cemento'],
  ['#6b7075', 'Grigio scuro'],
  ['#3e4145', 'Antracite'],
  ['#b5653e', 'Cotto'],
  ['#a3b18a', 'Verde'],
  ['#8fa3b8', 'Azzurro'],
]);

export const WALL_COLORS = sw([
  ['#ffffff', 'Bianco'],
  ['#f4f1ec', 'Bianco caldo'],
  ['#efe6d6', 'Panna'],
  ['#e9e1d3', 'Beige'],
  ['#cbbfb0', 'Tortora'],
  ['#dadcdf', 'Grigio perla'],
  ['#b7bcc2', 'Grigio'],
  ['#5a5e64', 'Antracite'],
  ['#d8e2dc', 'Salvia chiaro'],
  ['#a9b79a', 'Verde salvia'],
  ['#cfd8e3', 'Azzurro'],
  ['#8ea4bf', 'Blu'],
  ['#f2d7c9', 'Rosa'],
  ['#d49a7a', 'Terracotta'],
  ['#e3c27a', 'Senape'],
]);

export function ColorPicker({ value, onChange, colors, tip }: { value: string | undefined; onChange: (c: string) => void; colors: Swatch[]; tip?: string }) {
  const v = value?.toLowerCase();
  const known = colors.find((s) => s.c === v);
  const custom = v && !known;
  return (
    <div className="swatches picker">
      {colors.map((s) => (
        <button key={s.c} style={{ background: s.c }} className={v === s.c ? 'on' : ''} onClick={() => onChange(s.c)} data-tip={tip ? `${s.name} — ${tip}` : s.name} aria-label={s.name} />
      ))}
      <label className={'custom-color' + (custom ? ' on' : '')} style={custom ? { background: v } : undefined} data-tip="Un altro colore a scelta">
        {!custom && '+'}
        <input type="color" value={v ?? '#ffffff'} onChange={(e) => onChange(e.target.value)} />
      </label>
      <span className="muted small picked">{known?.name ?? (custom ? 'Colore personalizzato' : '')}</span>
    </div>
  );
}
