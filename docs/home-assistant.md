# Mappa per Home Assistant: installazione e prove

Guida per mettere in Home Assistant la mappa creata con SP 3D Planner (card **ha-floorplan**), più una lista di prove da fare e cosa annotare se qualcosa non va.

---

## 0. Prima di iniziare: prepara la mappa nel planner

1. Metti le **luci** con lo strumento 💡 Luce (tasto L). Per ognuna scrivi a destra l'**Entità HA**, per esempio `light.cucina` (va bene anche `switch.luce_bagno`).
2. Metti i **sensori** con lo strumento 🌡 Sensore e scegli il **Tipo**:
   - *Temperatura*, *Umidità*, *Altro*: per esempio `sensor.temperatura_salotto`.
   - *Qualità aria (eCO2 / CO2)*: per esempio `sensor.salotto_eco2`.
   - *Porta* / *Finestra aperta/chiusa*: per esempio `binary_sensor.finestra_cucina`.
3. **Porte e finestre** (facoltativo): selezionale e scrivi il sensore di apertura in «Entità HA». Sulla mappa si colora l'apertura stessa.
4. **Telecamere** (facoltativo): selezionale e scrivi l'entità, per esempio `camera.ingresso`.
5. **Al tocco** (facoltativo): per ogni luce, sensore, porta/finestra o telecamera collegata scegli dal menu a tendina cosa succede quando la tocchi sulla mappa:
   - *Mostra info e storico*: predefinito per sensori, porte/finestre e telecamere;
   - *Accendi / spegni*: predefinito per le luci. Toccare la stanza fa la stessa cosa della sua luce;
   - *Esegui servizio o script*: per esempio `script.buonanotte` oppure `cover.toggle`;
   - *Apri pagina della dashboard*: per esempio `/lovelace/clima`;
   - *Apri un link*: un indirizzo `https://…`;
   - *Niente*: l'elemento resta solo da guardare.

   Con «Su entità» puoi agire su un'altra entità, per esempio aprire `climate.salotto` toccando il sensore di temperatura. Se un'azione resta incompleta, l'export ti avvisa e usa quella predefinita.
6. Gli entity_id esatti li trovi in HA in **Impostazioni → Dispositivi e servizi → Entità**. Devono essere **identici**: minuscole e `_`.
7. Apri il menu **File → Mappa per Home Assistant…**:
   - scegli la vista e **trascina la casa** nel riquadro di anteprima per decidere da dove guardarla (nella vista dall'alto giri la pianta);
   - scegli l'**Aspetto**: **☀ Sempre chiara** (consigliato: casa chiara e senza ombre, le luci accese la illuminano) oppure **🌙 Giorno/notte** (chiara di giorno, buia dopo il tramonto, segue `sun.sun`);
   - scegli lo **Stile**: *Normale*, *Plastico* (modellino chiaro con gli angoli ombreggiati), *Disegno* (contorni neri) o *Blueprint* (progetto tecnico blu). Con Disegno e Blueprint la qualità è sempre «Veloce»;
   - scegli la **Qualità**: **⚡ Veloce** (pochi secondi, bordi lisci e angoli ombreggiati) oppure **✨ Alta** (path tracing: la luce rimbalza davvero, con ombre morbide e lampade realistiche; circa 15-25 secondi per immagine, quindi qualche minuto per casa, stanze e luci);
   - **Una pagina per ogni stanza** (attiva di default): sulla mappa della casa toccando una stanza si apre la sua mappa, ingrandita e con solo i suoi muri. Tenendola premuta si accende/spegne la sua luce.;
   - **Vista stanza** (viste 3D): scegli una stanza dal menu e trascinala nel riquadro per decidere da dove guardarla, con o senza **muri bassi**. Le stanze già sistemate hanno il segno ✓. Le altre usano la rotazione della casa con i muri bassi. Le scelte restano salvate nel browser per quella cartella;
   - premi **✨ Crea mappa**: con le pagine per stanza ci vuole un po' di più, perché ogni stanza ha i suoi render;
   - prova l'anteprima: i bottoni in alto (🏠 Casa, Cucina…) mostrano le pagine. Sulla casa il clic su una stanza la apre e il tasto destro accende la sua luce. Il clic sui sensori ne cambia lo stato;
   - premi **⬇ Scarica ZIP**.
8. Annota il nome della **Cartella** che compare nella finestra, per esempio `casa_sub_39`. Più sotto la chiamo `<nome>`.

---

## 1. Installa la card ha-floorplan

### Con HACS (consigliato)
1. Apri **HACS** nella barra laterale.
2. Cerca **floorplan** (nelle versioni vecchie di HACS sta in **Frontend**).
3. Apri **ha-floorplan**, premi **Download** e conferma.
4. Ricarica il browser con **Ctrl/Cmd + Shift + R** (o chiudi e riapri l'app).

Controlla che la risorsa ci sia:
1. Vai in **Impostazioni → Dashboard → ⋮ (in alto a destra) → Risorse**.
   - Se non vedi «Risorse», attiva la **Modalità avanzata** nel tuo profilo utente (clic sul tuo nome in basso a sinistra).
2. Deve esserci `/hacsfiles/ha-floorplan/floorplan.js`, tipo **Modulo JavaScript**.
3. Se manca, aggiungila con **+ Aggiungi risorsa**.

### Senza HACS
1. Scarica `floorplan.js` dalla pagina Releases di GitHub: `ExperienceLovelace/ha-floorplan`.
2. Mettilo in `/config/www/floorplan.js`.
3. Aggiungi la risorsa `/local/floorplan.js`, tipo **Modulo JavaScript**.

---

## 2. Copia i file nella cartella `www`

Lo ZIP contiene una cartella `floorplan/<nome>/`. Alla fine deve risultare così:

```
/config/www/floorplan/<nome>/<nome>.svg
/config/www/floorplan/<nome>/<nome>.css
/config/www/floorplan/<nome>/<nome>.yaml
/config/www/floorplan/<nome>/base.png
/config/www/floorplan/<nome>/day.png          (solo con l'aspetto «Giorno/notte»)
/config/www/floorplan/<nome>/lights/....png   (una per luce, nelle viste 3D)
```

> È normale che `www/floorplan` non ci sia: la crei tu copiando la cartella. HACS mette la card in `www/community/`, che è un'altra cosa.

### Con Samba dal Mac (procedura che funziona)

⚠️ **Non trascinare la cartella dal Finder.** Il Mac si blocca con l'**errore -8062** e copia solo una parte dei file (per esempio solo `day.png`). Il motivo: macOS prova a copiare anche degli attributi nascosti dei file scaricati, e il Samba di HA li rifiuta.

1. **Scompatta lo ZIP** in Download (doppio clic). Ottieni `~/Downloads/floorplan/<nome>/`.
2. **Collega la condivisione**: nel Finder vai su Vai → Connessione al server → `smb://<indirizzo-HA>` e apri `config`. Il disco compare come `/Volumes/config`. Se non sei sicuro del nome, controllalo con `ls /Volumes`.
3. **Apri il Terminale** e togli gli attributi nascosti:
   ```
   xattr -cr ~/Downloads/floorplan
   ```
4. **Copia dal Terminale**. L'opzione `-X` salta gli attributi:
   ```
   cp -R -X ~/Downloads/floorplan /Volumes/config/www/
   ```
   Possono comparire errori `Permission denied` sui file `.DS_Store`. Sono normali: sono file nascosti del Mac, Samba li rifiuta apposta e non servono.
5. **Controlla** che ci siano tutti i file:
   ```
   ls -R /Volumes/config/www/floorplan
   ```
   Devono esserci `.svg`, `.css`, `.yaml`, `base.png` (più `day.png` con «Giorno/notte») e la cartella `lights/` con un PNG per ogni luce.

Quando riesporti la mappa: cancella la cartella `floorplan` vecchia in Download, scompatta il nuovo ZIP e ripeti i passi 3 e 4. I file su HA vengono sovrascritti. Poi ricarica la dashboard con Cmd + Shift + R.

### Altri modi
- **Studio Code Server** o **File editor** (add-on): crea a mano le cartelle `floorplan/<nome>/lights` e carica i file con il tasto upload.
- **SSH / scp**: `scp -r ~/Downloads/floorplan root@<indirizzo-HA>:/config/www/`

> ⚠️ Se la cartella `/config/www` **non esisteva**, creala e poi **riavvia Home Assistant** (Impostazioni → Sistema → Riavvia). `/local/` funziona solo se `www` esisteva all'avvio.

---

## 3. Controlla che HA veda i file

Apri nel browser:

```
http://<indirizzo-HA>:8123/local/floorplan/<nome>/<nome>.svg
```

- **Vedi la pianta (anche senza immagini)?** I file sono al posto giusto.
- **Errore 404?** Il percorso è sbagliato oppure serve il riavvio del passo 2.

Puoi provare anche `.../<nome>/base.png`, che deve mostrare la casa al buio.

---

## 4. Aggiungi la mappa alla dashboard

### Con una pagina per ogni stanza

Lo YAML è la configurazione **di tutta la dashboard**: una pagina «Casa» più una sottopagina per ogni stanza, con la freccia ← per tornare indietro.

1. **Impostazioni → Dashboard → + Aggiungi dashboard → Nuova dashboard da zero**. Il nome è libero, per esempio «Casa»: i link tra le pagine funzionano con qualsiasi nome.
2. Aprila, premi **✏️ Modifica**, poi **⋮** in alto a destra → **Editor di configurazione raw**.
3. Cancella tutto e incolla il contenuto di `<nome>.yaml` (oppure il tasto **📋 Copia YAML**). **Salva** e chiudi.

> ⚠️ Questo YAML **non** va in una card Manuale (Aggiungi card → Manuale): lì HA risponde «No card type configured». Va nell'**Editor di configurazione raw** della dashboard.

### Una sola card (senza pagine per stanza)

1. Apri la dashboard e premi **✏️ Modifica**.
2. Consigliato: crea una **nuova vista** (il **+** accanto alle schede) con tipo **Pannello (1 card)**, così la mappa occupa tutta la larghezza.
3. Premi **+ Aggiungi card**, scorri in fondo e scegli **Manuale**.
4. Cancella il testo di esempio e incolla tutto il contenuto di `<nome>.yaml`. Va bene anche il tasto **📋 Copia YAML** del planner.
5. **Salva**, poi **Fine**.

---

## 5. Prove da fare (checklist)

Segna cosa funziona e cosa no.

- [ ] La mappa compare: immagine della casa più i pallini gialli delle luci.
- [ ] **Accendi una luce da HA** (dalla sua card o dall'app): la stanza si illumina sulla mappa?
- [ ] **Tocca il pallino giallo** sulla mappa: la luce si accende e si spegne davvero?
- [ ] **Tocca la stanza** (non il pallino): la sua luce si accende e si spegne? *Con le pagine per stanza*: si apre la pagina della stanza?
- [ ] *Pagine per stanza*: **tieni premuta la stanza** sulla mappa della casa → la sua luce si accende e si spegne?
- [ ] *Pagine per stanza*: nella pagina della stanza si vedono solo i suoi muri, ingranditi, con luci e sensori che funzionano? La **freccia ←** torna alla casa?
- [ ] La luce **resta dentro la stanza**, senza uscire nelle stanze vicine?
- [ ] **Sensore temperatura/umidità**: mostra il valore con l'unità (es. `21.5 °C`)?
- [ ] **Sensore eCO2**: mostra i ppm e lo sfondo è verde, giallo o rosso secondo il valore?
- [ ] **Sensore porta/finestra**: scrive «Aperta» su rosso e «Chiusa» su verde?
- [ ] **Porta/finestra collegata direttamente** (Entità HA sull'apertura): diventa rossa lampeggiante quando è aperta?
- [ ] **Telecamera**: toccandola si apre la finestra con le immagini?
- [ ] **Azioni al tocco personalizzate** (se ne hai scelte): pagina, link, script, «Niente» e «Su entità» fanno quello che ti aspetti?
- [ ] **Passando sopra** a un elemento (dal PC) compare il riquadro con le informazioni?
- [ ] **Giorno/notte** (solo se hai scelto quell'aspetto): dopo il tramonto la mappa diventa scura?
- [ ] Funziona anche dall'**app sul telefono**?

---

## 6. Se qualcosa non va

| Problema | Cosa fare |
|---|---|
| Errore -8062 copiando dal Finder, oppure su HA arrivano solo alcuni file | Usa la copia dal Terminale del passo 2 (`xattr -cr` e poi `cp -R -X`). |
| La casa è scura o nera | Hai esportato con «Giorno/notte» ed è sera. Riesporta con **☀ Sempre chiara**. |
| «Custom element doesn't exist: floorplan-card» | Manca la risorsa (passo 1) oppure il browser non è stato ricaricato: Ctrl/Cmd + Shift + R. |
| La card è vuota o dà errore sull'immagine | Rifai il passo 3: il file `.svg` deve aprirsi a quell'indirizzo. |
| La pianta si vede ma senza immagini | Prova ad aprire `/local/floorplan/<nome>/base.png`. Se dà 404, mancano i PNG nella cartella. |
| Una luce o un sensore non reagisce | L'entity_id nel planner è diverso da quello di HA. Correggilo nel planner, riesporta e ricopia i file. |
| Dopo un nuovo export non cambia nulla | Svuota la cache: Ctrl/Cmd + Shift + R. Sull'app: Impostazioni app → Debug (o Companion app) → **Svuota cache del frontend**. |
| Non capisco cosa non va | Nello YAML della card togli il `#` davanti a `# log_level: info` e salva. Sotto la mappa compare un **pannello di log** con gli errori. |

---

## 7. Cosa mandarmi se qualcosa non funziona

1. Quale **vista** hai esportato (dall'alto, isometrica, prospettica, 2D).
2. Le voci della **checklist** che non funzionano.
3. Il testo del **pannello di log** (con `log_level: info` attivo) oppure uno screenshot.
4. Se possibile, eventuali errori nella console del browser (F12 → Console).

> Nota: alcune opzioni dello YAML le ho scritte seguendo la documentazione di ha-floorplan ma non le ho potute provare su un Home Assistant vero:
> - `element:` insieme a `entity:` nella stessa regola;
> - `tap_action: false`;
> - `entity:` dentro `tap_action` con `more-info` (info di un'altra entità);
> - `hold_action` (tieni premuto sulla stanza) e `navigate` verso le pagine delle stanze;
> - le regole con solo `element:` senza `entity:` (stanze senza luce, che però devono aprirsi lo stesso);
> - il comportamento di `floorplan.class_set` sulle classi.
>
> Se il log segnala errori su queste, mandameli e le correggo.
