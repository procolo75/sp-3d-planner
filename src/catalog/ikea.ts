// Articoli IKEA comuni con le misure d'ingombro (L × P × H in cm) come riportate sul catalogo.
// Le forme sono semplificate (non i modelli 3D ufficiali IKEA). Misure da verificare sul sito per gli acquisti.
import type { CatalogItem } from './catalog';
import {
  armchair, bed, box, bunk, cabinet, chair, cornerSofa, cubeShelf, cyl, DARK, drawers, kitchenBase, lamp, lowCabinet, plant, shelf, shiftPart, slidingWardrobe, sofa, STEEL, table, vanity, wallCabinet,
} from './builders';

const BIANCO = '#f4f3ef';
const NEROMARRONE = '#3b2f2a';
const BETULLA = '#d9bf98';
const ROVERE = '#c9a67a';
const GRIGIO_SCURO = '#5b5f66';
const BEIGE = '#c8b89a';
const VERDE = '#6f8a74';

type Def = Omit<CatalogItem, 'category'> & { category: string };
const I: Def[] = [];
const add = (category: string, id: string, name: string, w: number, d: number, h: number, parts: CatalogItem['parts'], color?: string, z?: number) =>
  I.push({ id: 'ikea-' + id, name, category, w, d, h, parts, color, z });

// --- Soggiorno: divani e poltrone
add('Soggiorno', 'kivik3', 'KIVIK divano 3 posti', 228, 95, 83, sofa(228, 95, 3, GRIGIO_SCURO), GRIGIO_SCURO);
add('Soggiorno', 'kivik2', 'KIVIK divano 2 posti', 190, 95, 83, sofa(190, 95, 2, GRIGIO_SCURO), GRIGIO_SCURO);
add('Soggiorno', 'kivikL', 'KIVIK divano angolare con chaise-longue', 280, 163, 83, cornerSofa(280, 163, GRIGIO_SCURO), GRIGIO_SCURO);
add('Soggiorno', 'ektorp3', 'EKTORP divano 3 posti', 218, 88, 88, sofa(218, 88, 3, BEIGE), BEIGE);
add('Soggiorno', 'ektorp2', 'EKTORP divano 2 posti', 179, 88, 88, sofa(179, 88, 2, BEIGE), BEIGE);
add('Soggiorno', 'friheten', 'FRIHETEN divano letto angolare', 230, 151, 66, cornerSofa(230, 151, GRIGIO_SCURO), GRIGIO_SCURO);
add('Soggiorno', 'vimle3', 'VIMLE divano 3 posti', 241, 98, 83, sofa(241, 98, 3, BEIGE), BEIGE);
add('Soggiorno', 'soderhamn3', 'SÖDERHAMN divano 3 posti', 198, 99, 83, sofa(198, 99, 3, GRIGIO_SCURO), GRIGIO_SCURO);
add('Soggiorno', 'glostad', 'GLOSTAD divano 2 posti', 177, 81, 73, sofa(177, 81, 2, GRIGIO_SCURO), GRIGIO_SCURO);
add('Soggiorno', 'klippan', 'KLIPPAN divano 2 posti', 180, 88, 66, sofa(180, 88, 2, VERDE), VERDE);
add('Soggiorno', 'poang', 'POÄNG poltrona', 68, 82, 100, armchair(BEIGE), BEIGE);
add('Soggiorno', 'strandmon', 'STRANDMON poltrona', 82, 96, 101, armchair(VERDE), VERDE);
add('Soggiorno', 'ekenaset', 'EKENÄSET poltrona', 64, 76, 80, armchair(GRIGIO_SCURO), GRIGIO_SCURO);
// tavolini
add('Soggiorno', 'lack90', 'LACK tavolino 90×55', 90, 55, 45, table(90, 55, 45, NEROMARRONE, NEROMARRONE), NEROMARRONE);
add('Soggiorno', 'lack118', 'LACK tavolino 118×78', 118, 78, 45, table(118, 78, 45, BIANCO, BIANCO), BIANCO);
add('Soggiorno', 'lack55', 'LACK tavolino 55×55', 55, 55, 45, table(55, 55, 45, BIANCO, BIANCO), BIANCO);
add('Soggiorno', 'listerby', 'LISTERBY tavolino 140×60', 140, 60, 50, table(140, 60, 50, ROVERE, ROVERE), ROVERE);
add('Soggiorno', 'vittsjo', 'VITTSJÖ tavolino', 75, 75, 45, table(75, 75, 45, '#bfe0e8', DARK));
// mobili TV e contenitori
add('Soggiorno', 'besta180', 'BESTÅ mobile TV 180', 180, 42, 38, lowCabinet(180, 42, 38, BIANCO, 3, 0), BIANCO);
add('Soggiorno', 'besta120', 'BESTÅ mobile TV 120', 120, 42, 38, lowCabinet(120, 42, 38, BIANCO, 2, 0), BIANCO);
add('Soggiorno', 'lacktv', 'LACK mobile TV', 160, 35, 36, cubeShelf(160, 35, 36, 2, 1, NEROMARRONE), NEROMARRONE);
add('Soggiorno', 'hemnestv', 'HEMNES mobile TV', 148, 47, 57, lowCabinet(148, 47, 57, BIANCO, 2, 8), BIANCO);
add('Soggiorno', 'hemnesvet', 'HEMNES vetrina', 90, 37, 197, cabinet(90, 37, 197, BIANCO, 2), BIANCO);
add('Soggiorno', 'kallax22', 'KALLAX scaffale 2×2', 77, 39, 77, cubeShelf(77, 39, 77, 2, 2, BIANCO), BIANCO);
add('Soggiorno', 'kallax24', 'KALLAX scaffale 2×4', 77, 39, 147, cubeShelf(77, 39, 147, 2, 4, BIANCO), BIANCO);
add('Soggiorno', 'kallax42', 'KALLAX scaffale 4×2 (orizz.)', 147, 39, 77, cubeShelf(147, 39, 77, 4, 2, BIANCO), BIANCO);
add('Soggiorno', 'kallax44', 'KALLAX scaffale 4×4', 147, 39, 147, cubeShelf(147, 39, 147, 4, 4, BIANCO), BIANCO);
add('Soggiorno', 'kallax14', 'KALLAX scaffale 1×4', 42, 39, 147, cubeShelf(42, 39, 147, 1, 4, BIANCO), BIANCO);
add('Soggiorno', 'billy80', 'BILLY libreria 80', 80, 28, 202, shelf(80, 28, 202, BIANCO, 6), BIANCO);
add('Soggiorno', 'billy40', 'BILLY libreria 40', 40, 28, 202, shelf(40, 28, 202, BIANCO, 6), BIANCO);
add('Soggiorno', 'billy80b', 'BILLY libreria 80 bassa', 80, 28, 106, shelf(80, 28, 106, BIANCO, 3), BIANCO);
add('Soggiorno', 'hemneslib', 'HEMNES libreria', 90, 37, 197, shelf(90, 37, 197, NEROMARRONE, 5), NEROMARRONE);
add('Soggiorno', 'ivar', 'IVAR scaffale', 89, 30, 179, shelf(89, 30, 179, BETULLA, 5), BETULLA);
add('Soggiorno', 'hektar', 'HEKTAR lampada da terra', 30, 30, 181, lamp(181));
add('Soggiorno', 'fejka', 'FEJKA pianta artificiale', 40, 40, 120, plant(120));
add('Soggiorno', 'stoense', 'STOENSE tappeto 170×240', 240, 170, 1, [box(0, 0, 0, 240, 1, 170, '#d7cfc2')], '#d7cfc2');
add('Soggiorno', 'lohals', 'LOHALS tappeto 160×230', 230, 160, 1, [box(0, 0, 0, 230, 1, 160, '#c2ab84')], '#c2ab84');

// --- Camera da letto
add('Camera', 'malm160', 'MALM letto 160×200', 177, 209, 100, bed(177, 209, BIANCO), BIANCO);
add('Camera', 'malm140', 'MALM letto 140×200', 157, 209, 100, bed(157, 209, BIANCO), BIANCO);
add('Camera', 'malm90', 'MALM letto 90×200', 97, 209, 100, bed(97, 209, BIANCO), BIANCO);
add('Camera', 'hemnes160', 'HEMNES letto 160×200', 174, 211, 112, bed(174, 211, BIANCO), BIANCO);
add('Camera', 'brimnes160', 'BRIMNES letto con contenitori 160×200', 166, 206, 47, bed(166, 206, BIANCO), BIANCO);
add('Camera', 'neiden90', 'NEIDEN letto 90×200', 97, 207, 75, bed(97, 207, BETULLA), BETULLA);
add('Camera', 'slakt', 'SLÄKT letto/divano 90×200', 97, 206, 63, bed(97, 206, BIANCO), BIANCO);
add('Camera', 'tuffing', 'TUFFING letto a castello 90×200', 96, 207, 130, bunk(96, 207, 130, DARK), DARK);
add('Camera', 'malmcom', 'MALM comodino', 40, 48, 55, drawers(40, 48, 55, BIANCO, 2), BIANCO);
add('Camera', 'hemnescom', 'HEMNES comodino', 46, 35, 70, drawers(46, 35, 70, BIANCO, 2), BIANCO);
add('Camera', 'malm6', 'MALM cassettiera 6 cassetti', 160, 48, 78, drawers(160, 48, 78, BIANCO, 3), BIANCO);
add('Camera', 'malm4', 'MALM cassettiera 4 cassetti', 80, 48, 100, drawers(80, 48, 100, BIANCO, 4), BIANCO);
add('Camera', 'malm3', 'MALM cassettiera 3 cassetti', 80, 48, 78, drawers(80, 48, 78, BIANCO, 3), BIANCO);
add('Camera', 'hemnes8', 'HEMNES cassettiera 8 cassetti', 160, 50, 96, drawers(160, 50, 96, BIANCO, 4), BIANCO);
add('Camera', 'hemnes3', 'HEMNES cassettiera 3 cassetti', 108, 50, 96, drawers(108, 50, 96, BIANCO, 3), BIANCO);
add('Camera', 'kullen', 'KULLEN cassettiera 3 cassetti', 72, 35, 70, drawers(72, 35, 70, BIANCO, 3), BIANCO);
add('Camera', 'pax50', 'PAX armadio 50×58×236', 50, 58, 236, cabinet(50, 58, 236, BIANCO, 1), BIANCO);
add('Camera', 'pax100', 'PAX armadio 100×58×236', 100, 58, 236, cabinet(100, 58, 236, BIANCO, 2), BIANCO);
add('Camera', 'pax150', 'PAX armadio 150×58×236', 150, 58, 236, cabinet(150, 58, 236, BIANCO, 3), BIANCO);
add('Camera', 'pax200', 'PAX armadio 200×58×236', 200, 58, 236, cabinet(200, 58, 236, BIANCO, 4), BIANCO);
add('Camera', 'pax250', 'PAX armadio 250×58×236', 250, 58, 236, cabinet(250, 58, 236, BIANCO, 5), BIANCO);
add('Camera', 'pax100b', 'PAX armadio 100×58×201', 100, 58, 201, cabinet(100, 58, 201, BIANCO, 2), BIANCO);
add('Camera', 'paxang', 'PAX armadio angolare 110×88', 110, 88, 236, cabinet(110, 88, 236, BIANCO, 2), BIANCO);
add('Camera', 'brimnesarm', 'BRIMNES armadio 3 ante', 117, 50, 190, cabinet(117, 50, 190, BIANCO, 3), BIANCO);
add('Camera', 'kleppstad', 'KLEPPSTAD armadio 3 ante', 117, 55, 176, cabinet(117, 55, 176, BIANCO, 3), BIANCO);
add('Camera', 'hauga', 'HAUGA armadio 2 ante', 70, 55, 199, cabinet(70, 55, 199, '#c5c8c4', 2), '#c5c8c4');
add('Camera', 'sundvik', 'SUNDVIK lettino', 66, 126, 89, [box(0, 0, 0, 66, 35, 126, BIANCO), box(0, 35, 0, 62, 10, 120, '#cfe3f0'), box(0, 35, -61, 66, 54, 4, BIANCO), box(0, 35, 61, 66, 54, 4, BIANCO)], BIANCO);
add('Camera', 'trofast', 'TROFAST contenitore giochi', 99, 44, 56, cubeShelf(99, 44, 56, 3, 2, BETULLA), BETULLA);

// --- Studio
add('Studio', 'micke105', 'MICKE scrivania 105×50', 105, 50, 75, [...table(105, 50, 75, BIANCO, BIANCO), box(30, 0, 0, 40, 72, 46, BIANCO)], BIANCO);
add('Studio', 'micke142', 'MICKE scrivania 142×50', 142, 50, 75, [...table(142, 50, 75, BIANCO, BIANCO), box(48, 0, 0, 40, 72, 46, BIANCO)], BIANCO);
add('Studio', 'alexdesk', 'ALEX scrivania 100×48', 100, 48, 76, [...table(100, 48, 76, BIANCO, BIANCO), box(-30, 0, 0, 36, 72, 44, BIANCO)], BIANCO);
add('Studio', 'linnmon', 'LINNMON / ALEX tavolo 150×75', 150, 75, 74, [...table(150, 75, 74, BIANCO, BIANCO), box(-55, 0, 0, 36, 70, 58, BIANCO), box(55, 0, 0, 36, 70, 58, BIANCO)], BIANCO);
add('Studio', 'linnmon100', 'LINNMON / ADILS tavolo 100×60', 100, 60, 74, table(100, 60, 74, BIANCO, DARK), BIANCO);
add('Studio', 'bekant', 'BEKANT scrivania 160×80', 160, 80, 75, table(160, 80, 75, BIANCO, DARK), BIANCO);
add('Studio', 'markus', 'MARKUS sedia da ufficio', 62, 60, 129, [cyl(0, 0, 0, 28, 4, DARK), cyl(0, 4, 0, 3, 40, DARK), box(0, 44, 0, 52, 8, 50, DARK), box(0, 52, -24, 48, 75, 6, DARK)], DARK);
add('Studio', 'flintan', 'FLINTAN sedia da ufficio', 67, 67, 92, [cyl(0, 0, 0, 30, 4, DARK), cyl(0, 4, 0, 3, 40, DARK), box(0, 44, 0, 50, 8, 48, DARK), box(0, 52, -22, 46, 40, 6, DARK)], DARK);
add('Studio', 'alexcass', 'ALEX cassettiera', 36, 58, 70, drawers(36, 58, 70, BIANCO, 5), BIANCO);
add('Studio', 'helmer', 'HELMER cassettiera', 28, 43, 69, drawers(28, 43, 69, '#c7c9cc', 6), '#c7c9cc');

// --- Pranzo
add('Pranzo', 'melltorp', 'MELLTORP tavolo 125×75', 125, 75, 74, table(125, 75, 74, BIANCO, BIANCO), BIANCO);
add('Pranzo', 'ekedalen', 'EKEDALEN tavolo allungabile 120/180×80', 120, 80, 75, table(120, 80, 75, ROVERE, NEROMARRONE), ROVERE);
add('Pranzo', 'lisabo', 'LISABO tavolo 140×78', 140, 78, 74, table(140, 78, 74, ROVERE, ROVERE), ROVERE);
add('Pranzo', 'ingatorp', 'INGATORP tavolo tondo 110', 110, 110, 74, table(110, 110, 74, BIANCO, BIANCO, true), BIANCO);
add('Pranzo', 'norden', 'NORDEN tavolo pieghevole 152×80', 152, 80, 74, table(152, 80, 74, BETULLA, BETULLA), BETULLA);
add('Pranzo', 'tarendo', 'TÄRENDÖ tavolo 110×67', 110, 67, 74, table(110, 67, 74, '#2a2a2a', '#2a2a2a'));
add('Pranzo', 'adde', 'ADDE sedia', 39, 47, 77, chair(BIANCO, BIANCO), BIANCO);
add('Pranzo', 'teodores', 'TEODORES sedia', 42, 51, 80, chair(BIANCO, BIANCO), BIANCO);
add('Pranzo', 'lisabosedia', 'LISABO sedia', 45, 51, 76, chair(ROVERE, ROVERE), ROVERE);
add('Pranzo', 'ingolf', 'INGOLF sedia', 43, 52, 91, chair(BIANCO, BIANCO), BIANCO);
add('Pranzo', 'franklin', 'FRANKLIN sgabello bar', 44, 44, 98, [cyl(0, 74, 0, 20, 4, NEROMARRONE), box(0, 78, -18, 38, 20, 3, NEROMARRONE), cyl(0, 0, 0, 2, 74, DARK), cyl(0, 0, 0, 20, 2, DARK)], NEROMARRONE);

// --- Cucina (METOD / ENHET), elettrodomestici generici
add('Cucina', 'metod40', 'METOD base 40', 40, 60, 88, kitchenBase(40, BIANCO), BIANCO);
add('Cucina', 'metod60', 'METOD base 60', 60, 60, 88, kitchenBase(60, BIANCO), BIANCO);
add('Cucina', 'metod80', 'METOD base 80', 80, 60, 88, kitchenBase(80, BIANCO), BIANCO);
add('Cucina', 'metodlav', 'METOD base lavello 80', 80, 60, 88, kitchenBase(80, BIANCO, 'sink'), BIANCO);
add('Cucina', 'metodpc', 'METOD base piano cottura 60', 60, 60, 89, kitchenBase(60, BIANCO, 'hob'), BIANCO);
add('Cucina', 'metodforno', 'METOD base forno 60', 60, 60, 88, kitchenBase(60, BIANCO, 'oven'), BIANCO);
add('Cucina', 'metodlavast', 'METOD lavastoviglie 60', 60, 60, 88, kitchenBase(60, BIANCO, 'dw'), BIANCO);
add('Cucina', 'metodang', 'METOD base angolare 128×68', 128, 68, 88, [...cabinet(128, 68, 78, BIANCO, 2).map((p) => shiftPart(p, 0, 8, 0)), box(0, 86, 0, 128, 4, 68, '#d8d4cc')], BIANCO);
add('Cucina', 'metodcol', 'METOD colonna forno/frigo 60', 60, 60, 228, cabinet(60, 60, 228, BIANCO, 1), BIANCO);
add('Cucina', 'metodpens60', 'METOD pensile 60×80', 60, 37, 80, wallCabinet(60, BIANCO), BIANCO, 140);
add('Cucina', 'metodpens80', 'METOD pensile 80×80', 80, 37, 80, wallCabinet(80, BIANCO), BIANCO, 140);
add('Cucina', 'metodpens40', 'METOD pensile 40×80', 40, 37, 80, wallCabinet(40, BIANCO), BIANCO, 140);
add('Cucina', 'enhet', 'ENHET base 60 con ante', 60, 62, 75, kitchenBase(60, BIANCO), BIANCO);
add('Cucina', 'stenstorp', 'STENSTORP isola 126×79', 126, 79, 90, [...cabinet(126, 79, 86, BIANCO, 2), box(0, 86, 0, 126, 4, 79, ROVERE)], BIANCO);
add('Cucina', 'raskog', 'RÅSKOG carrello', 35, 45, 78, cubeShelf(35, 45, 78, 1, 3, '#7c8b8f'), '#7c8b8f');
add('Cucina', 'bekvam', 'BEKVÄM carrello', 58, 50, 85, cubeShelf(58, 50, 85, 1, 2, BETULLA), BETULLA);
add('Cucina', 'frigo', 'Frigorifero da libera installazione 60', 60, 65, 186, [box(0, 0, 0, 60, 186, 65, STEEL), box(25, 70, 33.5, 2, 40, 2, DARK)], STEEL);

// --- Bagno
add('Bagno', 'godmorgon80', 'GODMORGON mobile lavabo 80 (sospeso)', 80, 47, 58, vanity(80, 47, 58, BIANCO), BIANCO, 30);
add('Bagno', 'godmorgon60', 'GODMORGON mobile lavabo 60 (sospeso)', 60, 47, 58, vanity(60, 47, 58, BIANCO), BIANCO, 30);
add('Bagno', 'hemneslav', 'HEMNES mobile lavabo 83', 83, 49, 89, vanity(83, 49, 89, BIANCO), BIANCO);
add('Bagno', 'godmorgonalto', 'GODMORGON pensile alto', 40, 32, 192, cabinet(40, 32, 192, BIANCO, 1), BIANCO, 20);
add('Bagno', 'lillangen', 'LILLÅNGEN mobile lavabo 60', 60, 41, 92, vanity(60, 41, 92, BIANCO, 1), BIANCO);
add('Bagno', 'hemnesspecchio', 'HEMNES mobile specchio', 83, 16, 98, [box(0, 0, 0, 83, 98, 16, BIANCO), box(0, 6, 8.5, 75, 86, 1, '#cfe6ee')], BIANCO, 110);
add('Bagno', 'silveran', 'SILVERÅN mobile basso', 40, 25, 113, cabinet(40, 25, 113, BIANCO, 1), BIANCO);

// --- Ingresso
add('Ingresso', 'hemnesscarp', 'HEMNES scarpiera 2 scomparti', 89, 30, 127, cabinet(89, 30, 127, BIANCO, 2), BIANCO);
add('Ingresso', 'stall', 'STÄLL scarpiera', 79, 29, 148, cabinet(79, 29, 148, BIANCO, 2), BIANCO);
add('Ingresso', 'trones', 'TRONES scarpiera (2 pezzi)', 52, 18, 39, drawers(52, 18, 39, BIANCO, 1), BIANCO, 80);
add('Ingresso', 'bissa', 'BISSA scarpiera 2 scomparti', 49, 28, 93, drawers(49, 28, 93, BIANCO, 2), BIANCO);
add('Ingresso', 'hemnesapp', 'HEMNES attaccapanni con scarpiera', 85, 37, 197, [...cabinet(85, 37, 50, BIANCO, 2), box(0, 50, -16, 85, 147, 4, BIANCO), box(0, 150, -10, 80, 3, 12, BIANCO)], BIANCO);

// --- Esterno
add('Esterno', 'applaro', 'ÄPPLARÖ tavolo 140×78', 140, 78, 72, table(140, 78, 72, '#8a6a4f', '#8a6a4f'), '#8a6a4f');
add('Esterno', 'applarosedia', 'ÄPPLARÖ sedia', 54, 61, 87, chair('#8a6a4f', '#8a6a4f'), '#8a6a4f');
add('Esterno', 'tarno', 'TÄRNÖ tavolo', 55, 54, 70, table(55, 54, 70, '#8a6a4f', DARK), '#8a6a4f');
add('Esterno', 'tarnosedia', 'TÄRNÖ sedia pieghevole', 39, 46, 79, chair(DARK, '#8a6a4f'), DARK);
add('Esterno', 'falholmen', 'FALHOLMEN sdraio', 65, 190, 86, [box(0, 20, 20, 60, 8, 140, '#b9a37f'), box(0, 28, -60, 60, 50, 8, '#b9a37f'), box(0, 0, 0, 55, 20, 170, '#8f7656')], '#b9a37f');

// --- Armadi con ante scorrevoli
// SKYTTA non è un mobile: è un'apertura (strumento «Scorrevole» nella barra Disegna).
add('Camera', 'paxhasvik150', 'PAX/HASVIK armadio ante scorrevoli 150', 150, 66, 236, slidingWardrobe(150, 66, 236, BIANCO), BIANCO);
add('Camera', 'paxhasvik200', 'PAX/HASVIK armadio ante scorrevoli 200', 200, 66, 236, slidingWardrobe(200, 66, 236, BIANCO), BIANCO);
add('Camera', 'paxhasvik250', 'PAX/HASVIK armadio ante scorrevoli 250', 250, 66, 236, slidingWardrobe(250, 66, 236, BIANCO), BIANCO);

// --- Altri letti, camere e bambini
add('Camera', 'tarva160', 'TARVA letto 160×200', 168, 209, 92, bed(168, 209, BETULLA), BETULLA);
add('Camera', 'songesand160', 'SONGESAND letto 160×200', 167, 207, 95, bed(167, 207, BIANCO), BIANCO);
add('Camera', 'slattum160', 'SLATTUM letto imbottito 160×200', 168, 206, 85, bed(168, 206, GRIGIO_SCURO), GRIGIO_SCURO);
add('Camera', 'kura', 'KURA letto reversibile 90×200', 99, 209, 116, bunk(99, 209, 116, BETULLA), BETULLA);
add('Camera', 'mydal', 'MYDAL letto a castello 90×200', 97, 206, 157, bunk(97, 206, 157, BETULLA), BETULLA);
add('Camera', 'brimnes4', 'BRIMNES cassettiera 4 cassetti', 78, 41, 124, drawers(78, 41, 124, BIANCO, 4), BIANCO);
add('Camera', 'brimnescom', 'BRIMNES comodino', 39, 41, 53, drawers(39, 41, 53, BIANCO, 2), BIANCO);
add('Camera', 'malmtoel', 'MALM toeletta', 120, 41, 78, [...table(120, 41, 78, BIANCO, BIANCO), box(0, 60, 0, 116, 14, 38, BIANCO)], BIANCO);
add('Camera', 'hemnesarm', 'HEMNES armadio 2 ante', 120, 59, 197, cabinet(120, 59, 197, BIANCO, 2), BIANCO);

// --- Altri divani, poltrone e soggiorno
add('Soggiorno', 'landskrona3', 'LANDSKRONA divano 3 posti', 204, 89, 78, sofa(204, 89, 3, GRIGIO_SCURO), GRIGIO_SCURO);
add('Soggiorno', 'uppland3', 'UPPLAND divano 3 posti', 218, 89, 82, sofa(218, 89, 3, BEIGE), BEIGE);
add('Soggiorno', 'ektorppolt', 'EKTORP poltrona', 104, 88, 88, armchair(BEIGE), BEIGE);
add('Soggiorno', 'hemnestav', 'HEMNES tavolino', 118, 75, 46, table(118, 75, 46, NEROMARRONE, NEROMARRONE), NEROMARRONE);
add('Soggiorno', 'vittsjolib', 'VITTSJÖ libreria', 51, 36, 175, shelf(51, 36, 175, '#2a2a2a', 4), '#2a2a2a');
add('Soggiorno', 'eket1', 'EKET mobile 35×35×35', 35, 35, 35, cabinet(35, 35, 35, BIANCO, 1), BIANCO);
add('Soggiorno', 'eket4', 'EKET combinazione 70×35×70', 70, 35, 70, cubeShelf(70, 35, 70, 2, 2, BIANCO), BIANCO);

// --- Pranzo e studio
add('Pranzo', 'docksta', 'DOCKSTA tavolo tondo 103', 103, 103, 75, table(103, 103, 75, BIANCO, BIANCO, true), BIANCO);
add('Pranzo', 'strandtorp', 'STRANDTORP tavolo allungabile 150×95', 150, 95, 75, table(150, 95, 75, NEROMARRONE, NEROMARRONE), NEROMARRONE);
add('Pranzo', 'norraker', 'NORRÅKER tavolo 125×74', 125, 74, 74, table(125, 74, 74, BETULLA, BETULLA), BETULLA);
add('Pranzo', 'odger', 'ODGER sedia', 45, 51, 81, chair(BIANCO, BIANCO), BIANCO);
add('Studio', 'lagkapten140', 'LAGKAPTEN / ALEX scrivania 140×60', 140, 60, 73, [...table(140, 60, 73, BIANCO, BIANCO), box(50, 0, 0, 36, 70, 56, BIANCO)], BIANCO);
add('Studio', 'lagkapten120', 'LAGKAPTEN / ADILS scrivania 120×60', 120, 60, 74, table(120, 60, 74, BIANCO, DARK), BIANCO);

// --- Ingresso
add('Ingresso', 'mackapar', 'MACKAPÄR scarpiera/contenitore', 78, 32, 102, cubeShelf(78, 32, 102, 2, 3, BIANCO), BIANCO);

export const IKEA: CatalogItem[] = I.map((d) => ({ ...d, brand: 'IKEA' }));
