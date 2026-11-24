# Modulo Comanda — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** attuale — nato il 2026-11-24 (comande 1.0, sistema 6.8), oggi comande 2.0, **in prova** · **Ultima verifica:** 2026-11-24
> **Vedi anche:** [modulo_vendite.md](modulo_vendite.md) (modulo `cassa`: conti iPratico, chiusure), [analisi_ipratico_cloud.md](analisi_ipratico_cloud.md), [modulo_prenotazioni.md](modulo_prenotazioni.md) (tavoli), [studio_ipratico_comanda.md](studio_ipratico_comanda.md) (come si lavora oggi in cassa e i concorrenti), [modulo_menu_carta.md](modulo_menu_carta.md), [operativo/rete.md](operativo/rete.md) (stampanti in osteria), [architettura_mattoni.md](architettura_mattoni.md)

**Classificazione:** `[core]`. Ogni ristorante prende comande; reparti, uscite, coperto e tasti rapidi sono impostazioni del locale. I valori dell'osteria (nome e prezzo del coperto, «Stuzzico», «Pane») stanno nel seme `locali/tregobbi/seeds/comande.json` `[locale:tregobbi]`, non nel codice.
**Modulo:** `comande`, nuovo e vendibile. Manifesto in `core/moduli/comande/module.json`.
**Origine:** studio di fattibilità «TRGB cassa: comande, scontrini e fatture» del 24/11/2026 (documento in claude.ai, Q #383). Marco ha diviso il progetto in tre moduli — **Comanda**, **Cassa**, **Fatture in uscita** — e si parte dalla Comanda (Q #385).

---

## 1. Decisioni di Marco (2026-11-24)

1. **Tre moduli:** Comanda (questo), Cassa (conto, scontrino sull'Epson RT, chiusura) e Fatture in uscita (fatture elettroniche ai clienti). Cassa e Fatture vengono dopo.
2. **Solo in prova finché non c'è la Cassa.** Si costruisce e si prova a locale chiuso o su un tavolo; in servizio restano iPratico e le sue comande, così non c'è doppio lavoro. Ogni conto nasce con `prova = 1`.
3. **Chi prende le comande:** admin (e superadmin), capo sala, sala, sommelier. Le impostazioni solo admin.
4. **Le stampanti sono un servizio condiviso.** Il «ponte» in osteria (Raspberry Pi in rete locale) che manda comande alle SOL801 e scontrini all'Epson servirà a Comanda e Cassa: è un mattone platform, non un pezzo del modulo.
5. **Sui moduli grossi prima si guarda, poi si scrive** (Q #389): la 1.0 è «molto molto basica». Come escono i piatti e le schermate si decidono con lo [studio](studio_ipratico_comanda.md) e gli screen di iPratico davanti; fino ad allora quel pezzo non si tocca.
6. **Calici = il calice aperto.** In iPratico si battono a prezzo («Calice 7 €») solo perché la cassa non è collegata alla cantina; in TRGB si sceglie fra le bottiglie in mescita.
7. **«Sistema quello che hai già capito»** → comande 1.1: coperto in conto da solo, tasti «Stuzzico» e «Pane», calici dalle bottiglie in mescita (§2, §3, §4).
8. **«Vai e attendi», copiato da come lavora l'osteria** → comande 2.0. Gli 83 screen e i 5 scontrini di iPratico (24/11) hanno mostrato che la sala manda la comanda intera divisa per uscite e poi chiama ogni uscita ([studio](studio_ipratico_comanda.md) §5 e §8).
9. **Conto a elenco, non a tessere.** Fra le due [schermate disegnate](https://claude.ai/artifact/BqLwPeqGhBusqkLEuxS3Y2) Marco ha scelto l'elenco: «la tessera ha senso quando ci sono le foto dei piatti (ma io non la uso)».
10. **La mappa dei tavoli serve.** «Su iPratico non c'è una mappa, è un limite»: in TRGB i tavoli si vedono anche sulla piantina, quella già disegnata in Prenotazioni.

## 2. Come gira un tavolo

1. **Tavoli** (`/comande`): i tavoli attivi di Prenotazioni, in **Elenco** (per sala) o in **Mappa** (2.0: la piantina dell'Editor Tavoli, una scheda per sala; la scelta resta sul dispositivo). Un tavolo aperto dice a che punto è: «Uscita 2 di 5 · 12 min» (l'ultima andata, la più alta inviata, da quanto è partita), da quanto è aperto, totale, righe da inviare, «sollecitata». Tre colori, gli stessi del conto: rosa = aperto e niente partito, blu = un'uscita attende, verde = tutto andato. «Miei» lascia in elenco solo i tavoli aperti da chi guarda, in mappa spegne quelli aperti da altri. Tavolo libero → coperti → «Apri». Un tavolo ha al massimo un conto aperto.
   - **Coperto** (1.1): all'apertura entra in conto da solo una riga col nome e il prezzo delle Impostazioni, quantità = coperti. Segue i coperti se cambiano (a 0 sparisce), non va a nessun reparto, non entra in «Invia» e non blocca la chiusura. Non si toglie né si storna: dal tasto dei coperti si mette **in omaggio** (prezzo 0, «- omaggio» nel nome, chi l'ha messo in nota) o si rimette a prezzo.
2. **Conto** (`/comande/conto/:id`), **a elenco** (2.0). A sinistra il catalogo: ricerca, gruppi in colonna, voci in lista (nome, dettaglio, prezzo); un tocco aggiunge 1 pezzo nell'uscita in cui si sta battendo («Si batte in Uscita 3»), lo stesso articolo nella stessa uscita alza la quantità. A destra la comanda divisa per uscite, sempre a vista. Su telefono le due metà si alternano («＋ Aggiungi» / «Fatto»). Articoli «a voce» chiedono il prezzo; «＋ Fuori carta» crea una riga libera con nome, prezzo e famiglia.
   - **Tasti rapidi** (1.1) in cima al catalogo — «Stuzzico ×4», «Pane e Grissini ×2» — righe a 0 € che dicono a un reparto di far partire qualcosa; la quantità la propone il tasto dai coperti, un secondo tocco ne aggiunge una. Dalla 2.0 ogni tasto può avere **la sua uscita** (stuzzico nella 1, pane nella 2): cade lì dovunque si stia battendo. Partono col prossimo «Invia comanda».
   - **Uscite libere** (2.0): numerate da 1, quante ne servono. «＋ Nuova uscita» apre la successiva e salta quelle tenute dai tasti rapidi (con stuzzico 1 e pane 2 i piatti cominciano dalla 3). «Batti qui» riporta su un'uscita il punto in cui si batte, anche su una già inviata. La pagina propone: a tavolo appena aperto la 1; poi l'ultima uscita nuova che ha già un piatto; a comanda partita, una nuova dopo le inviate.
3. **Invia comanda**: parte tutto verso i reparti, un invio per reparto con la fotografia delle righe divise per uscita e, per ognuna, «va» o «attende». Fra le uscite nuove **la prima va** (se prima di lei niente sta attendendo), **le altre attendono**. Una riga aggiunta a un'uscita già inviata ne segue lo stato (il pane in più va subito). Una riga partita non si modifica più.
4. **Vai con la preparazione** (2.0, al posto di «Via la Nª»): su un'uscita che attende. L'uscita diventa «andata» con l'ora e i reparti che hanno righe lì ricevono un invio che **ripete i piatti**, come lo scontrino «VAI CON LA PREPARAZIONE : USCITA N» di iPratico. Dietro «⋯» di un'uscita andata: **Invia sollecito** (avviso ai reparti, contato sull'uscita) e **Attendi** (torna ad attendere).
5. **Storno**: una riga già inviata si storna con un motivo; il reparto riceve un invio «storno». Le righe non inviate si tolgono e basta.
6. **Sposta** (2.0): il conto passa intero a un tavolo libero. **Chiudi tavolo**: libera il tavolo (conto «chiuso»), solo se non restano righe da inviare. «Annulla conto» lo chiude come «annullato». Il conto vero, per ora, si batte su iPratico.
7. **Invii** (`/comande/invii`): ciò che è partito verso ogni reparto, come uscirà sulle stampanti quando ci sarà il ponte (`stampato_at` vuoto fino ad allora): la comanda divisa per uscite con «va / attende», le chiamate («Vai con la preparazione», «Attendi», «Sollecito») con la loro uscita, gli storni.

## 3. Il catalogo — servizio platform `catalogo_vendita`

Tutto ciò che si batte in sala, riletto ogni volta da dove TRGB lo tiene: nessuna copia, un prezzo cambiato o un vino finito si vedono subito. Servizio platform perché le fonti sono in moduli diversi (regola 4).

| Gruppo | Fonte | Codice |
|---|---|---|
| Antipasti, Primi, Piatti del giorno, Secondi, Contorni, Dolci, Bambini, Servizio | edizione «in carta» del Menu Carta (`menu_dish_publications` visibili). Prezzo singolo; piccolo/grande = due articoli; range o etichetta = prezzo a voce | `C0031`, `C0031P`, `C0031G` |
| Degustazioni | percorsi della carta (`menu_tasting_paths`), a persona | `D0006` |
| Piatti del giorno | `piatti_giorno` attivi e non archiviati | `G0010` |
| Pranzo | Menù Business della settimana: 1/2/3 portate ai prezzi del menu (o dei default) + i piatti della settimana a 0 € | `L1`…`L3`, `LP0145` |
| Menu | menu template dei preventivi con «iPratico» acceso (stesso SKU dell'export) | `M0012`, `M0012V` |
| Bottiglie | `vini_bottiglie` con IPRATICO=1, in giacenza, `PREZZO_CARTA` | `0123` (come lo SKU iPratico) |
| Calici | le **bottiglie in mescita** (`BOTTIGLIA_APERTA = 1`, quelle del widget Calici), qualunque vino sia; prezzo `PREZZO_CALICE` o, se manca, la regola del widget (`calcola_prezzo_calice_default`); nel dettaglio il giorno di apertura. Un vino si mette e si toglie dalla mescita dove già si fa (widget Calici) | `0123C` |
| Birre, Tisane, Tè, Amari, Whisky, Grappe, Gin… | voci attive delle sezioni Carta Bevande sincronizzate con iPratico, gruppo = categoria iPratico | `B0045` (come lo SKU iPratico) |

Al 24/11/2026: 506 articoli (326 bottiglie, 99 bevande, 48 piatti di carta, 10 menu, 9 pranzo, 9 calici, 3 piatti del giorno, 2 degustazioni). Con la 1.0 i calici erano 3: solo i vini con `VENDITA_CALICE` e IPRATICO. Una fonte che non si legge finisce in `avvisi` e non ferma le altre.

## 4. Uscite e reparti (impostazioni, mai nel codice)

Ogni articolo ha una **famiglia**: `food` (piatti), `beverage` (da bere), `servizio` (sezione Servizio della carta: caffè, acqua, tè, coperto). Da qui le proposte:

| Impostazione (`comande_config`) | Valore iniziale | Cosa fa |
|---|---|---|
| `uscite_numero`, `uscita_food` / `uscita_beverage` / `uscita_servizio` | 4, 1 / 0 / 0 | **non più lette dalla 2.0** (erano le uscite fisse della 1.x); restano nel DB e l'API le accetta ancora |
| `reparto_food` / `reparto_beverage` / `reparto_servizio` | cucina / sala / sala | dove va ogni famiglia |
| `coperto_attivo` / `coperto_nome` / `coperto_prezzo` | 0 / «Coperto» / 0 nel codice; **1 / «Servizio, pane e stuzzico» / 5** dal seme dell'osteria | il coperto messo in conto all'apertura (1.1) |

Reparti iniziali: **cucina** e **sala**, come le due stampanti comande dell'osteria (SOL801 «CUCINA» e «SALA»). `comande_gruppi_reparto` fa le eccezioni per gruppo (es. «Servizio» → nessun reparto). Tutto da Comanda › Impostazioni.

**Uscite (2.0).** Non sono un'impostazione: si aprono dal conto, da 1 a 20. Lo stato di ogni uscita inviata sta in `comande_uscite` (`attende` / `andata`). «Subito» (uscita 0) esiste solo sui conti nati con la 1.x ed è sempre andata; per quei conti le uscite senza stato si deducono da `uscita_corrente`.

**Tasti rapidi** (`comande_tasti_rapidi`, 1.1): nome, reparto, quantità proposta (`ogni_coperti`: 0 = una, 1 = una a coperto, 2 = una ogni due coperti per difetto, almeno una), uscita (2.0: vuota = quella in cui si sta battendo), ordine, attivo. Un tasto non si cancella, si spegne: il suo codice (`T001`…) resta nelle righe già battute. Dal seme dell'osteria: Stuzzico (cucina, una a coperto, uscita 1), Pane e Grissini (cucina, una ogni due, uscita 2), Pane senza glutine e Rimpiazzo Pane (cucina, una, dove si batte). Le quantità vengono dai conti iPratico 1/9→23/11/2026: stuzzico = coperti in 1.102 conti su 1.134, pane = metà dei coperti in 766 su 1.130.

**Seme del locale:** `locali/<locale>/seeds/comande.json` (`config` + `tasti_rapidi`), letto da `init_comande_db()` prima dei valori neutri. Riempie solo ciò che manca (chiavi di config assenti, tabella dei tasti vuota): dopo la prima partenza comanda Impostazioni. Un locale senza seme parte col coperto spento e nessun tasto.

**Il prezzo del coperto sta in due posti.** La carta ha la voce «Coperto» nella sezione Servizio (5 € in Autunno 2026; nella bozza Inverno 2027 al 24/11 la voce non c'è), la Comanda ha `coperto_prezzo`. Non sono legati: la voce della carta cambia id a ogni edizione e può non esserci. Se il prezzo cambia va cambiato in tutti e due.

## 5. Dati — `comande.sqlite3` (schema al boot, `app/models/comande_db.py`)

| Tabella | Cosa tiene |
|---|---|
| `comande_conti` | tavolo (id + nome e sala al momento), coperti, stato `aperto/chiuso/annullato`, `prova`, `uscita_corrente`, nota, prenotazione/cliente (per dopo), chi e quando |
| `comande_righe` | codice e tipo articolo, nome, gruppo, famiglia, reparto, prezzo unitario (deciso dal server), quantità, uscita, varianti (JSON), nota, stato `da_inviare/inviata/stornata`, invio, storno con motivo |
| `comande_invii` | tipo `comanda/via/storno`, reparto, uscita, `azione` (2.0, per il tipo `via`: `vai/attendi/sollecito`), `righe_json` (fotografia per la stampa; nelle comande ogni riga ha `va` vero/falso), `stampato_at`/`stampa_esito` (li scriverà il ponte) |
| `comande_reparti` | chiave, nome, ordine, attivo |
| `comande_gruppi_reparto` | gruppo del catalogo → reparto (NULL = nessuno) |
| `comande_config` | le impostazioni del §4 |
| `comande_tasti_rapidi` | i tasti rapidi del §4 (1.1), con `uscita` dalla 2.0 |
| `comande_uscite` | (2.0) una riga per uscita inviata di un conto: stato `attende/andata`, quando e chi l'ha fatta andare, quanti solleciti e l'ultimo |

Il coperto e i tasti sono righe di `comande_righe` come le altre: `articolo_tipo = 'coperto'` (codice `COPERTO` o `COPERTO-OMAGGIO`, reparto NULL, stato `inviata` dalla nascita) e `articolo_tipo = 'tasto_rapido'` (codice `T001`…, gruppo «Tasti rapidi», prezzo 0).

Un indice unico parziale impedisce due conti aperti sullo stesso tavolo.

**Da 1.1 a 2.0** non c'è una migrazione numerata: `init_comande_db()` crea `comande_uscite` e aggiunge `comande_invii.azione` e `comande_tasti_rapidi.uscita` (solo ADD COLUMN, senza NOT NULL). L'uscita dei tasti già presenti si riempie una volta dal seme, per nome. Provato su una copia del DB di produzione.

## 6. Codice

| Pezzo | File |
|---|---|
| Router (solo HTTP ⇄ service) | `app/routers/comande_router.py`, montato in `main.py` (`_mount("comande_router")`) |
| Logica | `app/services/comande_service.py` |
| Catalogo (platform) | `app/services/catalogo_vendita.py` |
| Tavoli (platform) | `app/services/tavoli_sala_service.py` (1.1: anche posizione e forma dei tavoli, ed `elementi()` della piantina, per la mappa) |
| DB | `app/models/comande_db.py` |
| Seme dell'osteria `[locale:tregobbi]` | `locali/tregobbi/seeds/comande.json` |
| Permessi menu | `modules_router.DEFAULT_MODULES` + `MODULI_DA_AGGIUNGERE` (il seed `modules.json` non si tocca: cambiarlo riscrive i permessi scelti da UI) |
| Pagine | `frontend/src/pages/comande/` — `ComandeTavoli`, `ComandeConto`, `ComandeInvii`, `ComandeImpostazioni`, `ComandeNav` (con `BannerProva`), `comandeApi.js`. La mappa importa le forme da `pages/prenotazioni/components/Piantina.jsx` (`FormaTavolo`, `FormaElemento`, `SchedeSale`): è un componente condiviso che oggi vive sotto Prenotazioni, da portare in platform con R8 |

## 7. Capability

| Codice | Cosa fa | Riferimento | Audience | Stato docs |
|---|---|---|---|---|
| C-CO-001 | Tavoli per sala col conto aperto: a che uscita è e da quanto («Uscita 2 di 5 · 12 min»), coperti, minuti dall'apertura, totale, righe da inviare, sollecitata; filtro «Miei» | `comande_router.py:get_tavoli`, `comande_service.conti_aperti`, `ComandeTavoli.jsx` | sala, capo sala, sommelier, admin | ✅ |
| C-CO-002 | Apertura tavolo con coperti, un conto aperto per tavolo | `comande_router.py:post_conto`, `comande_service.apri_conto` | idem | ✅ |
| C-CO-003 | Catalogo vendibile da carta, piatti del giorno, pranzo, menu template, vini (bottiglie in giacenza, calici dalle bottiglie in mescita), bevande | `comande_router.py:get_catalogo`, `catalogo_vendita.catalogo` | idem | ✅ |
| C-CO-004 | Conto a elenco: catalogo a sinistra, comanda per uscite a destra (su telefono si alternano); uscite libere («Nuova uscita», «Batti qui»), prezzo dal catalogo, prezzo a voce, fuori carta, quantità, nota, cambio uscita | `post_righe`, `patch_riga`, `delete_riga`, `ComandeConto.jsx` | idem | ✅ |
| C-CO-005 | «Invia comanda»: tutto ai reparti con la fotografia delle righe; la prima uscita nuova va, le altre attendono | `post_invia`, `comande_service.invia` | idem | ✅ |
| C-CO-006 | «Vai con la preparazione» su un'uscita che attende (il reparto riceve di nuovo i piatti); «Attendi» e «Invia sollecito» su un'uscita andata | `post_uscita_vai`, `post_uscita_attendi`, `post_uscita_sollecita` (e `post_via` della 1.0), `comande_service._chiama` | idem | ✅ |
| C-CO-007 | Storno di una riga inviata con motivo, avviso al reparto | `post_storno`, `comande_service.storna_riga` | idem | ✅ |
| C-CO-008 | Coperti (il coperto in conto li segue), nota e «Sposta» su un tavolo libero di un conto aperto | `patch_conto`, `comande_service.aggiorna_conto`, `ComandeConto.jsx` | idem | ✅ |
| C-CO-009 | Chiusura e annullo del conto (prova) | `post_chiudi`, `comande_service.chiudi_conto` | idem | ✅ |
| C-CO-010 | Pagina Invii per reparto: comande divise per uscita con «va / attende», chiamate (vai, attendi, sollecito), storni | `get_invii`, `ComandeInvii.jsx` | idem | ✅ |
| C-CO-011 | Impostazioni: reparti, famiglia → reparto, gruppo → reparto, coperto (acceso, nome, prezzo), tasti rapidi (reparto, quantità, uscita) | `get/put_impostazioni`, `ComandeImpostazioni.jsx` | admin | ✅ |
| C-CO-012 | Coperto messo in conto da solo all'apertura, quantità = coperti; omaggio e ritorno a prezzo dal tasto dei coperti | `post_coperto`, `comande_service._sincronizza_coperto`, `coperto_omaggio`, `ComandeConto.jsx` | sala, capo sala, sommelier, admin | ✅ |
| C-CO-013 | Tasti rapidi a 0 € in cima al conto («Stuzzico», «Pane») che avvisano un reparto, quantità proposta dai coperti, ognuno nella sua uscita o in quella in cui si batte | `post_righe` (`tasto`), `comande_service.aggiungi_righe`, `ComandeConto.jsx` | idem | ✅ |
| C-CO-014 | Mappa della sala: i tavoli sulla piantina disegnata in Prenotazioni, una scheda per sala, colorati per stato; un tocco apre il tavolo o il suo conto | `ComandeTavoli.jsx` (`Mappa`), `tavoli_sala_service.elementi`, `prenotazioni/components/Piantina.jsx` | idem | ✅ |

## 8. Cosa manca (in ordine)

1. **Ponte locale e stampa** (mattone nuovo): programma sul Raspberry Pi che prende gli invii non stampati e li manda in ESC/POS alle SOL801 (porta 9100), scrivendo `stampato_at`. Lo stesso ponte, più avanti, parlerà con l'Epson RT per la Cassa.
2. **Prova sul campo** a locale chiuso, poi un tavolo: raccogliere le correzioni della sala. La 2.0 è stata guardata in un'anteprima coi dati veri, non ancora sul server né su un iPad.
3. **Dal «⋮» del tavolo di iPratico** (screen del 24/11, [studio](studio_ipratico_comanda.md) §8.4): «Sposta ordine su altro tavolo» e «Libera tavolo» ci sono (Sposta, Chiudi tavolo / Annulla conto). Mancano **Unisci ordine** e il cambio di **cameriere**; **preconto** e **acconti** arrivano con la Cassa. Da decidere con Marco quali servono.
4. Da confermare con Marco: le uscite di una **seconda comanda** (oggi la prima nuova va da sola solo se niente sta attendendo); come si batte il **pranzo** (oggi: Menù Business N portate + piatti a 0 €; in iPratico «Piatto pranzo» con variante) e l'omaggio del coperto col menù pranzo; chi può mettere il **coperto in omaggio** (oggi: chiunque prenda comande).
5. **Varianti a gruppi** (in iPratico: allergeni, cottura, divisa in piatti, formato pasta…; oggi solo nota libera, il campo `varianti` c'è già) e **nome corto per la cucina** ([studio](studio_ipratico_comanda.md) §6 e §8.8).
6. Schermo cucina, se serve.
7. Poi i moduli **Cassa** (conto, scontrino, collegamento al conto iPratico che oggi scarica `cassa_conti`) e **Fatture in uscita**.
