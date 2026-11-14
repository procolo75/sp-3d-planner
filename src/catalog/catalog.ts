// Catalogo mobili procedurale: ogni mobile è fatto di parti semplici (scatole, cilindri)
// in coordinate locali in cm: x = larghezza, y = altezza, z = profondità (z+ = fronte).
// L'origine è al centro dell'ingombro, a terra. Le parti sono definite sulle dimensioni di
// default e vengono scalate se l'utente cambia le misure.

export type Part =
  | { t: 'box'; p: [number, number, number]; s: [number, number, number]; c: string; o?: number }
  | { t: 'cyl'; p: [number, number, number]; r: number; h: number; c: string; o?: number }
  | { t: 'sph'; p: [number, number, number]; r: number; c: string; o?: number };

export interface CatalogItem {
  id: string;
  name: string;
  category: string;
  w: number;
  d: number;
  h: number;
  /** quota da terra di default (es. pensili) */
  z?: number;
  parts: Part[];
  /** colore principale modificabile */
  color?: string;
  /** marca (es. IKEA); assente = mobile generico */
  brand?: string;
  /** mobile su misura creato dall'utente */
  custom?: boolean;
}

import { BLACK, CERAMIC, DARK, FABRIC, FABRIC2, GLASS, GREY, STEEL, WHITE, WOOD, WOOD_D, armchair, bed, box, cabinet, chair, cornerSofa, cyl, drawers, kitchenBase, lamp, plant, shelf, shiftPart, sofa, sph, table, wallCabinet } from './builders';
import { bathtub, cornerTub, freeTub, showerBox, showerTray } from './builders';
import { IKEA } from './ikea';
export { shade } from './builders';

// --- catalogo ---------------------------------------------------------------

const C: CatalogItem[] = [];
const add = (it: CatalogItem) => C.push(it);

// Soggiorno
add({ id: 'sofa2', name: 'Divano 2 posti', category: 'Soggiorno', w: 170, d: 90, h: 83, color: FABRIC, parts: sofa(170, 90, 2, FABRIC) });
add({ id: 'sofa3', name: 'Divano 3 posti', category: 'Soggiorno', w: 220, d: 95, h: 83, color: FABRIC, parts: sofa(220, 95, 3, FABRIC) });
add({ id: 'sofaL', name: 'Divano angolare', category: 'Soggiorno', w: 270, d: 170, h: 83, color: FABRIC2, parts: cornerSofa(270, 170, FABRIC2) });
add({ id: 'armchair', name: 'Poltrona', category: 'Soggiorno', w: 85, d: 85, h: 83, color: FABRIC2, parts: armchair(FABRIC2) });
add({ id: 'coffee', name: 'Tavolino', category: 'Soggiorno', w: 110, d: 60, h: 42, parts: table(110, 60, 42, WOOD, WOOD_D) });
add({ id: 'coffeeR', name: 'Tavolino tondo', category: 'Soggiorno', w: 80, d: 80, h: 42, parts: table(80, 80, 42, WHITE, DARK, true) });
add({ id: 'tvunit', name: 'Mobile TV', category: 'Soggiorno', w: 180, d: 42, h: 50, parts: [...drawers(180, 42, 45, WHITE, 1).map((p) => shiftPart(p, 0, 5, 0)), box(0, 50, -5, 140, 80, 5, BLACK), box(0, 50, -5, 30, 2, 20, BLACK)] });
add({ id: 'bookcase', name: 'Libreria', category: 'Soggiorno', w: 100, d: 35, h: 200, parts: shelf(100, 35, 200, WOOD, 5) });
add({ id: 'bookcaseL', name: 'Libreria larga', category: 'Soggiorno', w: 180, d: 35, h: 200, parts: shelf(180, 35, 200, WHITE, 5) });
add({ id: 'sideboard', name: 'Madia', category: 'Soggiorno', w: 180, d: 45, h: 80, parts: cabinet(180, 45, 80, WOOD_D, 4) });
add({ id: 'rug', name: 'Tappeto 200×140', category: 'Soggiorno', w: 200, d: 140, h: 1, color: '#b0623f', parts: [box(0, 0, 0, 200, 1, 140, '#b0623f')] });
add({ id: 'floorlamp', name: 'Lampada da terra', category: 'Soggiorno', w: 40, d: 40, h: 170, parts: lamp(170) });
add({ id: 'plant', name: 'Pianta', category: 'Soggiorno', w: 50, d: 50, h: 120, parts: plant(120) });

// Pranzo
add({ id: 'dining4', name: 'Tavolo 4 posti', category: 'Pranzo', w: 140, d: 80, h: 75, parts: table(140, 80, 75, WOOD, WOOD_D) });
add({ id: 'dining6', name: 'Tavolo 6 posti', category: 'Pranzo', w: 180, d: 90, h: 75, parts: table(180, 90, 75, WOOD, WOOD_D) });
add({ id: 'diningR', name: 'Tavolo tondo', category: 'Pranzo', w: 110, d: 110, h: 75, parts: table(110, 110, 75, WHITE, DARK, true) });
add({ id: 'chair', name: 'Sedia', category: 'Pranzo', w: 44, d: 46, h: 90, parts: chair(WOOD_D) });
add({ id: 'stool', name: 'Sgabello', category: 'Pranzo', w: 38, d: 38, h: 75, parts: [cyl(0, 71, 0, 19, 4, WOOD), cyl(0, 0, 0, 2.5, 71, DARK), cyl(0, 0, 0, 18, 2, DARK)] });

// Camera
add({ id: 'bedD', name: 'Letto matrimoniale', category: 'Camera', w: 170, d: 210, h: 105, color: '#5c6f86', parts: bed(170, 210, '#5c6f86') });
add({ id: 'bedQ', name: 'Letto una piazza e mezza', category: 'Camera', w: 130, d: 205, h: 105, color: '#7d8f6a', parts: bed(130, 205, '#7d8f6a') });
add({ id: 'bedS', name: 'Letto singolo', category: 'Camera', w: 90, d: 200, h: 105, color: '#8a6aa0', parts: bed(90, 200, '#8a6aa0') });
add({ id: 'night', name: 'Comodino', category: 'Camera', w: 45, d: 40, h: 50, parts: drawers(45, 40, 50, WOOD, 2) });
add({ id: 'wardrobe2', name: 'Armadio 2 ante', category: 'Camera', w: 100, d: 60, h: 220, parts: cabinet(100, 60, 220, WHITE, 2) });
add({ id: 'wardrobe3', name: 'Armadio 3 ante', category: 'Camera', w: 150, d: 60, h: 236, parts: cabinet(150, 60, 236, WHITE, 3) });
add({ id: 'wardrobe4', name: 'Armadio 4 ante', category: 'Camera', w: 200, d: 60, h: 236, parts: cabinet(200, 60, 236, WOOD, 4) });
add({ id: 'dresser', name: 'Cassettiera', category: 'Camera', w: 100, d: 48, h: 80, parts: drawers(100, 48, 80, WOOD, 4) });
add({ id: 'crib', name: 'Lettino', category: 'Camera', w: 66, d: 126, h: 90, parts: [box(0, 0, 0, 66, 40, 126, WHITE), box(0, 40, 0, 62, 10, 120, '#cfe3f0'), box(0, 40, -61, 66, 50, 4, WHITE), box(0, 40, 61, 66, 50, 4, WHITE)] });

// Studio
add({ id: 'desk', name: 'Scrivania', category: 'Studio', w: 120, d: 60, h: 75, parts: [...table(120, 60, 75, WHITE, DARK), box(0, 75, -15, 55, 35, 3, BLACK), box(0, 75, -15, 15, 3, 15, DARK)] });
add({ id: 'deskL', name: 'Scrivania grande', category: 'Studio', w: 160, d: 80, h: 75, parts: [...table(160, 80, 75, WOOD, DARK), box(0, 0, 0, 40, 60, 50, WHITE)] });
add({ id: 'officechair', name: 'Sedia ufficio', category: 'Studio', w: 60, d: 60, h: 110, parts: [cyl(0, 0, 0, 28, 4, BLACK), cyl(0, 4, 0, 3, 40, DARK), box(0, 44, 0, 50, 8, 48, BLACK), box(0, 52, -22, 46, 55, 6, BLACK)] });
add({ id: 'shelfLow', name: 'Scaffale basso', category: 'Studio', w: 80, d: 35, h: 110, parts: shelf(80, 35, 110, WOOD, 3) });

// Cucina
add({ id: 'kBase60', name: 'Base 60', category: 'Cucina', w: 60, d: 60, h: 90, parts: kitchenBase(60, WHITE) });
add({ id: 'kBase90', name: 'Base 90', category: 'Cucina', w: 90, d: 60, h: 90, parts: kitchenBase(90, WHITE) });
add({ id: 'kSink', name: 'Base lavello', category: 'Cucina', w: 90, d: 60, h: 90, parts: kitchenBase(90, WHITE, 'sink') });
add({ id: 'kHob', name: 'Base piano cottura', category: 'Cucina', w: 60, d: 60, h: 91, parts: kitchenBase(60, WHITE, 'hob') });
add({ id: 'kOven', name: 'Forno', category: 'Cucina', w: 60, d: 60, h: 90, parts: kitchenBase(60, WHITE, 'oven') });
add({ id: 'kDw', name: 'Lavastoviglie', category: 'Cucina', w: 60, d: 60, h: 90, parts: kitchenBase(60, WHITE, 'dw') });
add({ id: 'fridge', name: 'Frigorifero', category: 'Cucina', w: 60, d: 65, h: 190, parts: [box(0, 0, 0, 60, 190, 65, STEEL), box(0, 120, 33, 58, 1, 1, DARK), box(25, 60, 34, 2, 40, 2, DARK), box(25, 140, 34, 2, 30, 2, DARK)] });
add({ id: 'fridgeAm', name: 'Frigo americano', category: 'Cucina', w: 90, d: 72, h: 180, parts: [box(0, 0, 0, 90, 180, 72, STEEL), box(0, 0, 36.5, 1, 180, 1, DARK), box(-4, 70, 38, 2, 50, 2, DARK), box(4, 70, 38, 2, 50, 2, DARK)] });
add({ id: 'kTall', name: 'Colonna forno', category: 'Cucina', w: 60, d: 60, h: 220, parts: [...cabinet(60, 60, 220, WHITE, 1), box(0, 85, 31, 56, 55, 1, BLACK)] });
add({ id: 'kWall60', name: 'Pensile 60', category: 'Cucina', w: 60, d: 35, h: 70, z: 145, parts: wallCabinet(60, WHITE) });
add({ id: 'kWall90', name: 'Pensile 90', category: 'Cucina', w: 90, d: 35, h: 70, z: 145, parts: wallCabinet(90, WHITE) });
add({ id: 'hood', name: 'Cappa', category: 'Cucina', w: 60, d: 50, h: 60, z: 155, parts: [box(0, 0, 0, 60, 10, 50, STEEL), box(0, 10, -8, 26, 50, 26, STEEL)] });
add({ id: 'island', name: 'Isola', category: 'Cucina', w: 180, d: 90, h: 90, parts: [...cabinet(180, 90, 86, WOOD_D, 3), box(0, 86, 0, 190, 4, 100, '#d8d4cc')] });

// Bagno
add({ id: 'wc', name: 'WC', category: 'Bagno', w: 38, d: 55, h: 40, parts: [box(0, 0, -5, 22, 30, 30, CERAMIC), cyl(0, 25, 5, 18, 15, CERAMIC), box(0, 0, -24, 36, 80, 8, CERAMIC)] });
add({ id: 'bidet', name: 'Bidet', category: 'Bagno', w: 38, d: 55, h: 40, parts: [box(0, 0, -5, 22, 30, 30, CERAMIC), cyl(0, 25, 5, 18, 15, CERAMIC), cyl(0, 40, -18, 1.5, 8, STEEL)] });
add({ id: 'sinkB', name: 'Lavabo', category: 'Bagno', w: 60, d: 45, h: 85, parts: [cyl(0, 0, -10, 8, 70, CERAMIC), box(0, 70, 0, 60, 15, 45, CERAMIC), cyl(0, 85, -16, 1.5, 15, STEEL), box(0, 105, -21, 55, 70, 2, GLASS, 0.6)] });
add({ id: 'vanity', name: 'Mobile lavabo', category: 'Bagno', w: 80, d: 48, h: 85, parts: [...drawers(80, 48, 70, WOOD, 2).map((p) => shiftPart(p, 0, 15, 0)), box(0, 85, 0, 80, 4, 48, CERAMIC), cyl(0, 89, -18, 1.5, 15, STEEL), box(0, 110, -23, 70, 70, 2, GLASS, 0.6)] });
add({ id: 'piatto70x70', name: 'Piatto doccia 70×70', category: 'Bagno', w: 70, d: 70, h: 3, parts: showerTray(70, 70) });
add({ id: 'piatto80x80', name: 'Piatto doccia 80×80', category: 'Bagno', w: 80, d: 80, h: 3, parts: showerTray(80, 80) });
add({ id: 'piatto90x90', name: 'Piatto doccia 90×90', category: 'Bagno', w: 90, d: 90, h: 3, parts: showerTray(90, 90) });
add({ id: 'piatto100x100', name: 'Piatto doccia 100×100', category: 'Bagno', w: 100, d: 100, h: 3, parts: showerTray(100, 100) });
add({ id: 'piatto90x70', name: 'Piatto doccia 90×70', category: 'Bagno', w: 90, d: 70, h: 3, parts: showerTray(90, 70) });
add({ id: 'piatto100x70', name: 'Piatto doccia 100×70', category: 'Bagno', w: 100, d: 70, h: 3, parts: showerTray(100, 70) });
add({ id: 'piatto100x80', name: 'Piatto doccia 100×80', category: 'Bagno', w: 100, d: 80, h: 3, parts: showerTray(100, 80) });
add({ id: 'piatto120x80', name: 'Piatto doccia 120×80', category: 'Bagno', w: 120, d: 80, h: 3, parts: showerTray(120, 80) });
add({ id: 'piatto140x80', name: 'Piatto doccia 140×80', category: 'Bagno', w: 140, d: 80, h: 3, parts: showerTray(140, 80) });
add({ id: 'piatto160x80', name: 'Piatto doccia 160×80', category: 'Bagno', w: 160, d: 80, h: 3, parts: showerTray(160, 80) });
add({ id: 'piatto120x90', name: 'Piatto doccia 120×90', category: 'Bagno', w: 120, d: 90, h: 3, parts: showerTray(120, 90) });
add({ id: 'piatto140x90', name: 'Piatto doccia 140×90', category: 'Bagno', w: 140, d: 90, h: 3, parts: showerTray(140, 90) });
add({ id: 'piatto160x90', name: 'Piatto doccia 160×90', category: 'Bagno', w: 160, d: 90, h: 3, parts: showerTray(160, 90) });
add({ id: 'piatto120x100', name: 'Piatto doccia 120×100', category: 'Bagno', w: 120, d: 100, h: 3, parts: showerTray(120, 100) });
add({ id: 'piatto140x100', name: 'Piatto doccia 140×100', category: 'Bagno', w: 140, d: 100, h: 3, parts: showerTray(140, 100) });
add({ id: 'piatto180x100', name: 'Piatto doccia 180×100', category: 'Bagno', w: 180, d: 100, h: 3, parts: showerTray(180, 100) });
add({ id: 'box80x80a', name: 'Box doccia 80×80 angolare', category: 'Bagno', w: 80, d: 80, h: 200, parts: showerBox(80, 80, true) });
add({ id: 'box90x90a', name: 'Box doccia 90×90 angolare', category: 'Bagno', w: 90, d: 90, h: 200, parts: showerBox(90, 90, true) });
add({ id: 'box100x80a', name: 'Box doccia 100×80 angolare', category: 'Bagno', w: 100, d: 80, h: 200, parts: showerBox(100, 80, true) });
add({ id: 'box120x80n', name: 'Box doccia 120×80 nicchia (solo fronte)', category: 'Bagno', w: 120, d: 80, h: 200, parts: showerBox(120, 80, false) });
add({ id: 'box140x80n', name: 'Box doccia 140×80 nicchia (solo fronte)', category: 'Bagno', w: 140, d: 80, h: 200, parts: showerBox(140, 80, false) });
add({ id: 'box160x80n', name: 'Box doccia 160×80 nicchia (solo fronte)', category: 'Bagno', w: 160, d: 80, h: 200, parts: showerBox(160, 80, false) });
add({ id: 'parete80', name: 'Parete doccia walk-in 80 (vetro)', category: 'Bagno', w: 80, d: 4, h: 200, parts: [box(0, 0, 0, 80, 200, 1, GLASS, 0.3), box(0, 0, 0, 80, 3, 4, STEEL)] });
add({ id: 'parete100', name: 'Parete doccia walk-in 100 (vetro)', category: 'Bagno', w: 100, d: 4, h: 200, parts: [box(0, 0, 0, 100, 200, 1, GLASS, 0.3), box(0, 0, 0, 100, 3, 4, STEEL)] });
add({ id: 'parete120', name: 'Parete doccia walk-in 120 (vetro)', category: 'Bagno', w: 120, d: 4, h: 200, parts: [box(0, 0, 0, 120, 200, 1, GLASS, 0.3), box(0, 0, 0, 120, 3, 4, STEEL)] });
add({ id: 'vasca150x70', name: 'Vasca 150×70', category: 'Bagno', w: 150, d: 70, h: 56, parts: bathtub(150, 70) });
add({ id: 'vasca160x70', name: 'Vasca 160×70', category: 'Bagno', w: 160, d: 70, h: 56, parts: bathtub(160, 70) });
add({ id: 'vasca170x70', name: 'Vasca 170×70', category: 'Bagno', w: 170, d: 70, h: 56, parts: bathtub(170, 70) });
add({ id: 'vasca170x75', name: 'Vasca 170×75', category: 'Bagno', w: 170, d: 75, h: 56, parts: bathtub(170, 75) });
add({ id: 'vasca170x80', name: 'Vasca 170×80', category: 'Bagno', w: 170, d: 80, h: 56, parts: bathtub(170, 80) });
add({ id: 'vasca180x80', name: 'Vasca 180×80', category: 'Bagno', w: 180, d: 80, h: 56, parts: bathtub(180, 80) });
add({ id: 'vasca190x90', name: 'Vasca 190×90', category: 'Bagno', w: 190, d: 90, h: 56, parts: bathtub(190, 90) });
add({ id: 'vascang120', name: 'Vasca angolare 120×120', category: 'Bagno', w: 120, d: 120, h: 56, parts: cornerTub(120) });
add({ id: 'vascang140', name: 'Vasca angolare 140×140', category: 'Bagno', w: 140, d: 140, h: 56, parts: cornerTub(140) });
add({ id: 'vascang150', name: 'Vasca angolare 150×150', category: 'Bagno', w: 150, d: 150, h: 56, parts: cornerTub(150) });
add({ id: 'vascafree160', name: 'Vasca freestanding 160×75', category: 'Bagno', w: 160, d: 75, h: 58, parts: freeTub(160, 75) });
add({ id: 'vascafree170', name: 'Vasca freestanding 170×80', category: 'Bagno', w: 170, d: 80, h: 58, parts: freeTub(170, 80) });
add({ id: 'vascadoccia', name: 'Vasca 170×70 con parete doccia', category: 'Bagno', w: 170, d: 70, h: 200, parts: [...bathtub(170, 70), box(-45, 56, 34.5, 80, 144, 1, GLASS, 0.3), cyl(-75, 180, -25, 9, 2, STEEL)] });
add({ id: 'washer', name: 'Lavatrice', category: 'Bagno', w: 60, d: 60, h: 85, parts: [box(0, 0, 0, 60, 85, 60, WHITE), cyl(0, 40, 30, 18, 2, GREY), box(0, 75, 30.5, 56, 8, 1, '#dcdcdc')].map((p) => (p.t === 'cyl' ? { ...p, p: [0, 40, 31] as [number, number, number] } : p)) });
add({ id: 'towel', name: 'Scaldasalviette', category: 'Bagno', w: 50, d: 8, h: 120, z: 20, parts: Array.from({ length: 10 }, (_, i) => box(0, i * 12, 0, 50, 3, 3, WHITE)).concat([box(-24, 0, 0, 3, 120, 4, WHITE), box(24, 0, 0, 3, 120, 4, WHITE)]) });

// Esterno
add({ id: 'outTable', name: 'Tavolo esterno', category: 'Esterno', w: 120, d: 70, h: 72, parts: table(120, 70, 72, '#9aa3a8', '#5d666b') });
add({ id: 'lounger', name: 'Sdraio', category: 'Esterno', w: 65, d: 190, h: 80, parts: [box(0, 20, 20, 60, 8, 140, '#e0d2b4'), box(0, 28, -60, 60, 50, 8, '#e0d2b4'), box(0, 0, 0, 55, 20, 170, '#8b8f93')] });
add({ id: 'planter', name: 'Fioriera', category: 'Esterno', w: 80, d: 30, h: 60, parts: [box(0, 0, 0, 80, 35, 30, '#7a5a44'), sph(-20, 45, 0, 18, '#4f8a3f'), sph(15, 48, 0, 20, '#5d9a48')] });

// mobili "su misura": forme generiche che l'utente porta alle misure che vuole
add({ id: 'su-box', name: 'Su misura: mobile generico', category: 'Su misura', w: 100, d: 50, h: 80, color: WHITE, parts: cabinet(100, 50, 80, WHITE, 2) });
add({ id: 'su-armadio', name: 'Su misura: armadio', category: 'Su misura', w: 100, d: 60, h: 220, color: WHITE, parts: cabinet(100, 60, 220, WHITE, 2) });
add({ id: 'su-libreria', name: 'Su misura: libreria', category: 'Su misura', w: 80, d: 30, h: 200, color: WHITE, parts: shelf(80, 30, 200, WHITE, 5) });
add({ id: 'su-cassettiera', name: 'Su misura: cassettiera', category: 'Su misura', w: 80, d: 48, h: 80, color: WHITE, parts: drawers(80, 48, 80, WHITE, 4) });
add({ id: 'su-tavolo', name: 'Su misura: tavolo', category: 'Su misura', w: 140, d: 80, h: 75, color: WOOD, parts: table(140, 80, 75, WOOD, WOOD_D) });
add({ id: 'su-divano', name: 'Su misura: divano', category: 'Su misura', w: 200, d: 90, h: 83, color: FABRIC, parts: sofa(200, 90, 3, FABRIC) });
add({ id: 'su-letto', name: 'Su misura: letto', category: 'Su misura', w: 160, d: 200, h: 100, color: '#5c6f86', parts: bed(160, 200, '#5c6f86') });

for (const it of IKEA) add(it);

export const CATALOG = C;
export const CATALOG_BY_ID: Record<string, CatalogItem> = Object.fromEntries(C.map((c) => [c.id, c]));
export const CATEGORIES = [...new Set(C.map((c) => c.category))];

/** Parti scalate alle misure dell'oggetto (w,d,h possono differire dal default). Il colore principale sostituisce `color`. */
export function scaledParts(cat: CatalogItem, w: number, d: number, h: number, color?: string): Part[] {
  const sx = w / cat.w;
  const sy = h / cat.h;
  const sz = d / cat.d;
  return cat.parts.map((pt) => {
    const c = color && cat.color && pt.c === cat.color ? color : pt.c;
    if (pt.t === 'box') return { ...pt, c, p: [pt.p[0] * sx, pt.p[1] * sy, pt.p[2] * sz], s: [pt.s[0] * sx, pt.s[1] * sy, pt.s[2] * sz] };
    if (pt.t === 'cyl') return { ...pt, c, p: [pt.p[0] * sx, pt.p[1] * sy, pt.p[2] * sz], r: pt.r * Math.min(sx, sz), h: pt.h * sy };
    return { ...pt, c, p: [pt.p[0] * sx, pt.p[1] * sy, pt.p[2] * sz], r: pt.r * Math.min(sx, sy, sz) };
  });
}
