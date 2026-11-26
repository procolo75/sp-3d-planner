import { describe, expect, it } from 'vitest';
import { CATALOG, CATALOG_BY_ID, colorSlots, scaledParts } from './catalog';

describe('colori dei mobili', () => {
  it('divano bianco: anche i cuscini diventano bianchi', () => {
    const cat = CATALOG_BY_ID['sofa3'];
    const parts = scaledParts(cat, cat.w, cat.d, cat.h, '#ffffff');
    const big = parts.filter((p) => p.t === 'box' && p.s[0] > 30);
    expect(big.length).toBeGreaterThan(4);
    expect(big.every((p) => p.c === '#ffffff')).toBe(true);
  });
  it('ogni mobile ha almeno un colore modificabile', () => {
    const none = CATALOG.filter((c) => !colorSlots(c).length).map((c) => c.id);
    expect(none).toEqual([]);
  });
  it('tavolo: piano e gambe sono due colori separati', () => {
    const cat = CATALOG_BY_ID['dining4'];
    expect(colorSlots(cat)).toHaveLength(2);
    const parts = scaledParts(cat, cat.w, cat.d, cat.h, undefined, '#202124');
    expect(parts.some((p) => p.c === '#202124')).toBe(true);
    expect(parts.some((p) => p.c !== '#202124')).toBe(true);
  });
});
