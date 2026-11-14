/** Istruzioni da incollare su claude.ai insieme alla pianta: la risposta si incolla nel wizard. */
export const CLAUDE_PROMPT = `Ti allego la pianta di un appartamento. Devi trasformarla in una MAPPA in formato JSON che userò in un programma di progettazione 3D.

REGOLE PER LE COORDINATE
- Unità: centimetri. Origine (0,0) nell'angolo in alto a sinistra dell'appartamento. x cresce verso destra, y verso il basso (come la pianta vista su carta).
- Ogni muro è un segmento sulla sua LINEA CENTRALE (a metà spessore), con il suo spessore in cm.
- Agli angoli gli estremi di due muri devono coincidere ESATTAMENTE (stesse coordinate).
- Dove un muro arriva contro un altro (giunzione a T) il suo estremo deve cadere sulla linea centrale dell'altro muro.
- Usa le misure scritte sulla pianta (quote) quando ci sono: le quote interne sono da filo muro a filo muro, quindi la distanza tra le linee centrali = quota + metà spessore di ciascuno dei due muri. Se la pianta ha la scala (es. 1:100, 1:200) usala per le misure mancanti.
- Muri esterni tipici 30 cm, tramezzi interni 8–12 cm (se la pianta non dice diversamente).
- Includi anche i muri o parapetti di balconi e verande; per i parapetti aggiungi "altezza": 100 al muro.

PORTE E FINESTRE
- Nelle piante catastali: una PORTA è indicata da una riga che attraversa il muro (perpendicolare); una FINESTRA da righe parallele al muro dentro il suo spessore.
- "pos" = punto sulla linea centrale del muro, al centro dell'apertura.
- Porte verso balcone/terrazzo: tipo "portafinestra". Passaggi senza porta: tipo "varco". Ante scorrevoli (es. cabina armadio): tipo "scorrevole".
- Non inventare aperture che non vedi.

STANZE
- Per ogni stanza un nome (come scritto sulla pianta, es. "Cucina", "Camera 1") e un punto "pos" al suo interno.

CONTROLLO PRIMA DI RISPONDERE
- Verifica che le stanze risultino chiuse (nessun buco tra i muri) e che le dimensioni totali tornino con le quote complessive.
- Se la pianta riporta le superfici delle stanze (m²), controlla che le tue dimensioni interne le rispettino.

FORMATO DELLA RISPOSTA: solo il JSON, in un unico blocco, così:
{
  "nome": "Casa",
  "altezza_muri": 280,
  "muri": [ { "da": [0, 0], "a": [1201, 0], "spessore": 30 } ],
  "porte": [ { "pos": [400, 600], "larghezza": 80, "tipo": "porta" } ],
  "finestre": [ { "pos": [200, 0], "larghezza": 120, "davanzale": 95, "altezza": 140 } ],
  "stanze": [ { "nome": "Cucina", "pos": [900, 300] } ]
}`;
