import { describe, expect, it } from 'vitest';
import { detectWalls } from './detectWalls';

/** immagine sintetica: stanza 400×300 cm a 1 cm/px, muri a doppia linea spessi 20 cm, con una quota rossa che li attraversa */
function room() {
  const W = 500;
  const H = 400;
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  const px = (x: number, y: number, c: [number, number, number]) => {
    const i = (y * W + x) * 4;
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
  };
  const hline = (y: number, x0: number, x1: number, c: [number, number, number] = [0, 0, 0]) => {
    for (let x = x0; x <= x1; x++) for (let t = 0; t < 2; t++) px(x, y + t, c);
  };
  const vline = (x: number, y0: number, y1: number, c: [number, number, number] = [0, 0, 0]) => {
    for (let y = y0; y <= y1; y++) for (let t = 0; t < 2; t++) px(x + t, y, c);
  };
  // esterno 40..460 × 40..360, interno 60..440 × 60..340
  hline(40, 40, 460);
  hline(358, 40, 460);
  vline(40, 40, 360);
  vline(458, 40, 360);
  hline(60, 60, 440);
  hline(338, 60, 440);
  vline(60, 60, 340);
  vline(438, 60, 340);
  // quota rossa verticale che attraversa i muri orizzontali
  vline(250, 20, 380, [200, 30, 30]);
  return { width: W, height: H, data };
}

describe('riconoscimento muri', () => {
  it('trova i 4 muri di una stanza a doppia linea, con spessore ~20 cm, ignorando le quote rosse', () => {
    const r = detectWalls(room(), { cmPerPx: 1, originX: 0, originY: 0 });
    expect(r.walls).toHaveLength(4);
    for (const w of r.walls) expect(w.thickness).toBeGreaterThanOrEqual(18);
    for (const w of r.walls) expect(w.thickness).toBeLessThanOrEqual(24);
    // gli angoli sono chiusi: ogni estremità coincide con quella di un altro muro
    const ends = r.walls.flatMap((w) => [
      [w.ax, w.ay],
      [w.bx, w.by],
    ]);
    for (const [x, y] of ends) expect(ends.filter(([a, b]) => Math.hypot(a - x, b - y) < 2).length).toBe(2);
  });
});
