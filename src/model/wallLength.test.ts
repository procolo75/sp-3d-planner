import { describe, expect, it } from 'vitest';
import { computeRooms, computeWallCorners, dist, norm, type V } from './geom';
import { addNode, addWall, draft, normalize, setWallLength, splitWall } from './ops';
import { emptyProject, type Project } from './types';
import { openingDistances, wallClearLength } from '../editor2d/snapping';
import { planSegment, startChain, typedEnd, type ChainStart, type DrawPt } from '../editor2d/drawChain';
import type { SnapPoint } from './store';

const T = 12;

/** simula il disegno: come addWallSegment dello store */
function apply(p: Project, from: SnapPoint, to: SnapPoint, moves: { from: V; to: V }[]) {
  for (const m of moves) {
    const n = Object.values(p.nodes).find((q) => dist(q, m.from) < 0.5);
    if (n) p.nodes[n.id] = { ...n, x: m.to.x, y: m.to.y };
  }
  const res = (sp: SnapPoint) => (sp.nodeId && p.nodes[sp.nodeId] ? sp.nodeId : sp.wallId ? splitWall(p, sp.wallId, sp) : addNode(p, sp));
  addWall(p, res(from), res(to), T, 280);
  normalize(p);
}

/** disegna una catena digitando le misure; `close` = alla fine clicca sul primo punto */
function drawTyped(p: Project, start: SnapPoint, steps: [V, number][], close = false) {
  let s: DrawPt = start;
  let chain: ChainStart = startChain(p, start);
  for (const [dir, L] of steps) {
    const e = typedEnd(p, s, norm(dir), L, T);
    const plan = planSegment(p, s, e, T, chain, true);
    apply(p, plan.from, plan.to, plan.moves);
    s = plan.next;
    chain = plan.chain;
  }
  if (close) {
    const first = Object.values(p.nodes).find((n) => dist(n, start) < 0.5) ?? Object.values(p.nodes).sort((a, b) => dist(a, start) - dist(b, start))[0];
    const plan = planSegment(p, s, { x: start.x, y: start.y, nodeId: first.id }, T, chain, false);
    apply(p, plan.from, plan.to, plan.moves);
  }
}

const net = (p: Project, id: string) => wallClearLength(p, computeWallCorners(p), id).net;
const straight = (p: Project) =>
  Object.values(p.walls).every((w) => {
    const A = p.nodes[w.a];
    const B = p.nodes[w.b];
    return Math.abs(A.x - B.x) < 0.01 || Math.abs(A.y - B.y) < 0.01;
  });

describe('disegno con misure digitate = spazio utile', () => {
  it('muro da 1,10 che finisce libero misura 1,10 (non 1,16)', () => {
    const p = draft(emptyProject());
    drawTyped(p, { x: 0, y: 0 }, [[{ x: 1, y: 0 }, 110]]);
    expect(net(p, Object.keys(p.walls)[0])).toBeCloseTo(110, 5);
  });

  it('muro da 1,10 che parte dalla faccia di un muro esistente misura 1,10', () => {
    const p = draft(emptyProject());
    const a = addNode(p, { x: 0, y: -200 });
    const b = addNode(p, { x: 0, y: 200 });
    addWall(p, a, b, 20, 280);
    drawTyped(p, { x: 0, y: 0, wallId: Object.keys(p.walls)[0] }, [[{ x: 1, y: 0 }, 110]]);
    const w = Object.values(p.walls).find((q) => p.nodes[q.a].y === p.nodes[q.b].y)!;
    expect(net(p, w.id)).toBeCloseTo(110, 5);
  });

  it('1,10 + 1,00 dritti di fila fanno 2,10', () => {
    const p = draft(emptyProject());
    drawTyped(p, { x: 0, y: 0 }, [[{ x: 1, y: 0 }, 110], [{ x: 1, y: 0 }, 100]]);
    const tot = Object.keys(p.walls).reduce((a, id) => a + net(p, id), 0);
    expect(tot).toBeCloseTo(210, 5);
  });

  it('stanza 4,00 × 3,00 digitata e chiusa cliccando il primo punto: dentro 4,00 × 3,00', () => {
    const p = draft(emptyProject());
    drawTyped(p, { x: 0, y: 0 }, [[{ x: 1, y: 0 }, 400], [{ x: 0, y: 1 }, 300], [{ x: -1, y: 0 }, 400]], true);
    expect(straight(p)).toBe(true);
    const r = computeRooms(p);
    expect(r).toHaveLength(1);
    expect(r[0].area).toBeCloseTo(400 * 300, 0);
    for (const w of Object.values(p.walls)) expect([400, 300]).toContain(Math.round(net(p, w.id)));
  });

  it('finestra: distanza sinistra + larghezza + distanza destra = misura del muro', () => {
    const p = draft(emptyProject());
    drawTyped(p, { x: 0, y: 0 }, [[{ x: 1, y: 0 }, 400], [{ x: 0, y: 1 }, 300], [{ x: -1, y: 0 }, 400]], true);
    const w = Object.values(p.walls).find((q) => Math.round(net(p, q.id)) === 400)!;
    const L = dist(p.nodes[w.a], p.nodes[w.b]);
    const o = { wallId: w.id, offset: L / 2 - 37, width: 120 };
    const d = openingDistances(p, computeWallCorners(p), o);
    // lato interno (stanza): due distanze
    const sums = [1, -1].map((side) => d.filter((x) => Math.sign(x.side!.x + x.side!.y) === side).reduce((a, x) => a + x.dist, 0) + o.width);
    expect(sums.some((s) => Math.abs(s - 400) < 0.01)).toBe(true);
  });

  it('finestra su un muro con un estremo libero: le somme tornano', () => {
    const p = draft(emptyProject());
    const a = addNode(p, { x: 0, y: -200 });
    const b = addNode(p, { x: 0, y: 200 });
    addWall(p, a, b, 12, 280);
    drawTyped(p, { x: 0, y: 0, wallId: Object.keys(p.walls)[0] }, [[{ x: 1, y: 0 }, 110]]);
    const w = Object.values(p.walls).find((q) => p.nodes[q.a].y === p.nodes[q.b].y)!;
    const L = dist(p.nodes[w.a], p.nodes[w.b]);
    const o = { wallId: w.id, offset: L / 2, width: 50 };
    const d = openingDistances(p, computeWallCorners(p), o).filter((x) => x.side!.y > 0);
    expect(d).toHaveLength(2);
    expect(d[0].dist + d[1].dist + o.width).toBeCloseTo(net(p, w.id), 5);
    expect(net(p, w.id)).toBeCloseTo(110, 5);
  });
});

describe('cambiare la misura di un muro', () => {
  it('non storce la stanza: il muro accanto si sposta parallelo', () => {
    const p = draft(emptyProject());
    const n = [[0, 0], [400, 0], [400, 300], [0, 300]].map(([x, y]) => addNode(p, { x, y }));
    const top = addWall(p, n[0], n[1], T, 280)!;
    addWall(p, n[1], n[2], T, 280);
    addWall(p, n[2], n[3], T, 280);
    addWall(p, n[3], n[0], T, 280);
    setWallLength(p, top, 500);
    normalize(p);
    expect(straight(p)).toBe(true);
    expect(computeRooms(p)[0].area).toBeCloseTo((500 - T) * (300 - T), 0);
  });

  it('funziona anche con due stanze affiancate', () => {
    const p = draft(emptyProject());
    const n = [[0, 0], [400, 0], [700, 0], [700, 300], [400, 300], [0, 300]].map(([x, y]) => addNode(p, { x, y }));
    const w1 = addWall(p, n[0], n[1], T, 280)!;
    for (const [i, j] of [[1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 4]]) addWall(p, n[i], n[j], T, 280);
    setWallLength(p, w1, 450);
    normalize(p);
    expect(straight(p)).toBe(true);
  });
});
