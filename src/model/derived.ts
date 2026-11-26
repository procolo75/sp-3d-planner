import { useMemo } from 'react';
import { computeOutlines, computeRooms, computeWallCorners, labelPoint, pointInPolygon, polygonArea, type Room, type WallCorners } from './geom';
import type { ID, Project, RoomLabel } from './types';

export interface Derived {
  corners: Map<ID, WallCorners>;
  rooms: Room[];
  /** etichetta associata a ciascuna stanza (per chiave) */
  roomLabel: Map<string, RoomLabel>;
  roomLabelPos: Map<string, { x: number; y: number }>;
  /** contorni esterni di ogni edificio staccato (casa, garage…) */
  outlines: { x: number; y: number }[][];
}

export function derive(p: Project): Derived {
  const corners = computeWallCorners(p);
  // le "stanze" minuscole (giunzioni, errori di riconoscimento) non vengono mostrate
  const rooms = computeRooms(p).filter((r) => r.area >= 5000);
  const roomLabel = new Map<string, RoomLabel>();
  const roomLabelPos = new Map<string, { x: number; y: number }>();
  const labels = Object.values(p.labels);
  for (const r of rooms) {
    const l = labels.find((l) => pointInPolygon(l, r.poly));
    if (l) roomLabel.set(r.key, l);
    roomLabelPos.set(r.key, labelPoint(r.inner.length >= 3 ? r.inner : r.poly));
  }
  const outlines = computeOutlines(p).filter((o) => Math.abs(polygonArea(o)) >= 5000);
  return { corners, rooms, roomLabel, roomLabelPos, outlines };
}

export function useDerived(p: Project): Derived {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => derive(p), [p.nodes, p.walls, p.labels]);
}

/** stanza su cui è concentrata la vista («Arreda questa stanza»), se esiste ancora */
/** la stanza è segnata come spazio esterno (cortile, giardino): niente pavimento */
export const isOutdoor = (der: Derived, key: string) => !!der.roomLabel.get(key)?.outdoor;

export function focusedRoom(der: Derived, focus: { x: number; y: number } | null): Room | null {
  if (!focus) return null;
  return der.rooms.find((r) => pointInPolygon(focus, r.poly)) ?? null;
}

/** avvia la modalità «arreda questa stanza» */
export function focusOnRoom(der: Derived, key: string, setFocus: (p: { x: number; y: number } | null) => void) {
  const pos = der.roomLabelPos.get(key);
  if (pos) setFocus({ x: pos.x, y: pos.y });
}
