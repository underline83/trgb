# Modulo Comanda — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** attuale — nato il 2026-11-24 (comande 1.0, sistema 6.8), oggi comande 1.1, **in prova** · **Ultima verifica:** 2026-11-24
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

## 2. Come gira un tavolo

1. **Tavoli** (`/comande`): i tavoli attivi di Prenotazioni, per sala. Tavolo libero → coperti → «Apri». Un tavolo ha al massimo un conto aperto.
   - **Coperto** (1.1): all'apertura entra in conto da solo una riga col nome e il prezzo delle Impostazioni, quantità = coperti. Segue i coperti se cambiano (a 0 sparisce), non va a nessun reparto, non entra in «Invia» e non blocca la chiusura. Non si toglie né si storna: dal tasto dei coperti si mette **in omaggio** (prezzo 0, «- omaggio» nel nome, chi l'ha messo in nota) o si rimette a prezzo.
2. **Conto** (`/comande/conto/:id`): in cima i **tasti rapidi** (1.1) — «Stuzzico ×4», «Pane e Grissini ×2» — righe a 0 € che dicono a un reparto di far partire qualcosa; la quantità la propone il tasto dai coperti (una, una a coperto, una ogni N), un secondo tocco ne aggiunge una, partono «Subito» col prossimo «Invia». Sotto, le righe raggruppate per uscita (Subito, 1ª, 2ª…). «＋ Aggiungi» apre il catalogo: si sceglie l'uscita (o «Automatica»), si cerca o si sfoglia per gruppo, un tocco aggiunge 1 pezzo (lo stesso articolo nella stessa uscita alza la quantità). Articoli «a voce» chiedono il prezzo; «＋ Fuori carta» crea una riga libera con nome, prezzo e famiglia.
3. **Invia**: le righe «da inviare» partono, un invio per reparto con la fotografia delle righe. Una riga partita non si modifica più.
4. **Via la Nª**: quando la cucina deve far partire l'uscita successiva. Crea un invio di tipo «via» ai reparti che hanno righe di quell'uscita.
5. **Storno**: una riga già inviata si storna con un motivo; il reparto riceve un invio «storno». Le righe non inviate si tolgono e basta.
6. **Chiudi tavolo**: libera il tavolo (conto «chiuso»), solo se non restano righe da inviare. «Annulla conto» lo chiude come «annullato». Il conto vero, per ora, si batte su iPratico.
7. **Invii** (`/comande/invii`): ciò che è partito verso ogni reparto, come uscirà sulle stampanti quando ci sarà il ponte (`stampato_at` vuoto fino ad allora).

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
| `uscite_numero` | 4 | uscite proposte in sala oltre a «Subito» |
| `uscita_food` / `uscita_beverage` / `uscita_servizio` | 1 / 0 / 0 | uscita di partenza di ogni famiglia (0 = Subito) |
| `reparto_food` / `reparto_beverage` / `reparto_servizio` | cucina / sala / sala | dove va ogni famiglia |
| `coperto_attivo` / `coperto_nome` / `coperto_prezzo` | 0 / «Coperto» / 0 nel codice; **1 / «Servizio, pane e stuzzico» / 5** dal seme dell'osteria | il coperto messo in conto all'apertura (1.1) |

Reparti iniziali: **cucina** e **sala**, come le due stampanti comande dell'osteria (SOL801 «CUCINA» e «SALA»). `comande_gruppi_reparto` fa le eccezioni per gruppo (es. «Servizio» → nessun reparto). Tutto da Comanda › Impostazioni.

**Tasti rapidi** (`comande_tasti_rapidi`, 1.1): nome, reparto, quantità proposta (`ogni_coperti`: 0 = una, 1 = una a coperto, 2 = una ogni due coperti per difetto, almeno una), ordine, attivo. Un tasto non si cancella, si spegne: il suo codice (`T001`…) resta nelle righe già battute. Dal seme dell'osteria: Stuzzico (cucina, una a coperto), Pane e Grissini (cucina, una ogni due), Pane senza glutine e Rimpiazzo Pane (cucina, una). Le quantità vengono dai conti iPratico 1/9→23/11/2026: stuzzico = coperti in 1.102 conti su 1.134, pane = metà dei coperti in 766 su 1.130.

**Seme del locale:** `locali/<locale>/seeds/comande.json` (`config` + `tasti_rapidi`), letto da `init_comande_db()` prima dei valori neutri. Riempie solo ciò che manca (chiavi di config assenti, tabella dei tasti vuota): dopo la prima partenza comanda Impostazioni. Un locale senza seme parte col coperto spento e nessun tasto.

**Il prezzo del coperto sta in due posti.** La carta ha la voce «Coperto» nella sezione Servizio (5 € in Autunno 2026; nella bozza Inverno 2027 al 24/11 la voce non c'è), la Comanda ha `coperto_prezzo`. Non sono legati: la voce della carta cambia id a ogni edizione e può non esserci. Se il prezzo cambia va cambiato in tutti e due.

## 5. Dati — `comande.sqlite3` (schema al boot, `app/models/comande_db.py`)

| Tabella | Cosa tiene |
|---|---|
| `comande_conti` | tavolo (id + nome e sala al momento), coperti, stato `aperto/chiuso/annullato`, `prova`, `uscita_corrente`, nota, prenotazione/cliente (per dopo), chi e quando |
| `comande_righe` | codice e tipo articolo, nome, gruppo, famiglia, reparto, prezzo unitario (deciso dal server), quantità, uscita, varianti (JSON), nota, stato `da_inviare/inviata/stornata`, invio, storno con motivo |
| `comande_invii` | tipo `comanda/via/storno`, reparto, uscita, `righe_json` (fotografia per la stampa), `stampato_at`/`stampa_esito` (li scriverà il ponte) |
| `comande_reparti` | chiave, nome, ordine, attivo |
| `comande_gruppi_reparto` | gruppo del catalogo → reparto (NULL = nessuno) |
| `comande_config` | le impostazioni del §4 |
| `comande_tasti_rapidi` | i tasti rapidi del §4 (1.1) |

Il coperto e i tasti sono righe di `comande_righe` come le altre: `articolo_tipo = 'coperto'` (codice `COPERTO` o `COPERTO-OMAGGIO`, reparto NULL, stato `inviata` dalla nascita) e `articolo_tipo = 'tasto_rapido'` (codice `T001`…, gruppo «Tasti rapidi», prezzo 0).

Un indice unico parziale impedisce due conti aperti sullo stesso tavolo.

## 6. Codice

| Pezzo | File |
|---|---|
| Router (solo HTTP ⇄ service) | `app/routers/comande_router.py`, montato in `main.py` (`_mount("comande_router")`) |
| Logica | `app/services/comande_service.py` |
| Catalogo (platform) | `app/services/catalogo_vendita.py` |
| Tavoli (platform) | `app/services/tavoli_sala_service.py` |
| DB | `app/models/comande_db.py` |
| Seme dell'osteria `[locale:tregobbi]` | `locali/tregobbi/seeds/comande.json` |
| Permessi menu | `modules_router.DEFAULT_MODULES` + `MODULI_DA_AGGIUNGERE` (il seed `modules.json` non si tocca: cambiarlo riscrive i permessi scelti da UI) |
| Pagine | `frontend/src/pages/comande/` — `ComandeTavoli`, `ComandeConto`, `ComandeInvii`, `ComandeImpostazioni`, `ComandeNav` (con `BannerProva`), `comandeApi.js` |

## 7. Capability

| Codice | Cosa fa | Riferimento | Audience | Stato docs |
|---|---|---|---|---|
| C-CO-001 | Tavoli per sala col conto aperto (coperti, ora, totale, righe da inviare) | `comande_router.py:get_tavoli`, `ComandeTavoli.jsx` | sala, capo sala, sommelier, admin | ✅ |
| C-CO-002 | Apertura tavolo con coperti, un conto aperto per tavolo | `comande_router.py:post_conto`, `comande_service.apri_conto` | idem | ✅ |
| C-CO-003 | Catalogo vendibile da carta, piatti del giorno, pranzo, menu template, vini (bottiglie in giacenza, calici dalle bottiglie in mescita), bevande | `comande_router.py:get_catalogo`, `catalogo_vendita.catalogo` | idem | ✅ |
| C-CO-004 | Righe per uscita, prezzo dal catalogo, prezzo a voce, fuori carta, quantità, nota, cambio uscita | `post_righe`, `patch_riga`, `delete_riga`, `ComandeConto.jsx` | idem | ✅ |
| C-CO-005 | Invio ai reparti con la fotografia delle righe | `post_invia`, `comande_service.invia` | idem | ✅ |
| C-CO-006 | «Via la Nª» | `post_via`, `comande_service.via` | idem | ✅ |
| C-CO-007 | Storno di una riga inviata con motivo, avviso al reparto | `post_storno`, `comande_service.storna_riga` | idem | ✅ |
| C-CO-008 | Coperti (il coperto in conto li segue), nota e cambio tavolo di un conto aperto | `patch_conto`, `comande_service.aggiorna_conto` | idem | ✅ (cambio tavolo solo API) |
| C-CO-009 | Chiusura e annullo del conto (prova) | `post_chiudi`, `comande_service.chiudi_conto` | idem | ✅ |
| C-CO-010 | Pagina Invii per reparto | `get_invii`, `ComandeInvii.jsx` | idem | ✅ |
| C-CO-011 | Impostazioni: uscite, reparti, famiglia → reparto, gruppo → reparto, coperto (acceso, nome, prezzo), tasti rapidi | `get/put_impostazioni`, `ComandeImpostazioni.jsx` | admin | ✅ |
| C-CO-012 | Coperto messo in conto da solo all'apertura, quantità = coperti; omaggio e ritorno a prezzo dal tasto dei coperti | `post_coperto`, `comande_service._sincronizza_coperto`, `coperto_omaggio`, `ComandeConto.jsx` | sala, capo sala, sommelier, admin | ✅ |
| C-CO-013 | Tasti rapidi a 0 € in cima al conto («Stuzzico», «Pane») che avvisano un reparto, quantità proposta dai coperti | `post_righe` (`tasto`), `comande_service.aggiungi_righe`, `ComandeConto.jsx` | idem | ✅ |

## 8. Cosa manca (in ordine)

1. **Ponte locale e stampa** (mattone nuovo): programma sul Raspberry Pi che prende gli invii non stampati e li manda in ESC/POS alle SOL801 (porta 9100), scrivendo `stampato_at`. Lo stesso ponte, più avanti, parlerà con l'Epson RT per la Cassa.
2. **Prova sul campo** a locale chiuso, poi un tavolo: raccogliere le correzioni della sala.
3. **Come escono i piatti e le schermate**: da scegliere con lo [studio](studio_ipratico_comanda.md) (§5 A/B/C, §6) e gli screen di iPratico; poi schermate disegnate in 2-3 varianti, poi codice.
3b. Da confermare con Marco: come si batte il **pranzo** (oggi: Menù Business N portate + piatti a 0 €; in iPratico «Piatto pranzo» con variante). Chi può mettere il **coperto in omaggio** (oggi: chiunque prenda comande). I tasti rapidi partono col prossimo «Invia»: vedere se devono partire da soli al tocco.
4. Varianti predefinite (oggi solo nota libera; il campo `varianti` c'è già).
5. Piantina della sala (`prenotazioni/components/Piantina.jsx`) al posto della griglia, se serve; schermo cucina se serve.
6. Poi i moduli **Cassa** (conto, scontrino, collegamento al conto iPratico che oggi scarica `cassa_conti`) e **Fatture in uscita**.
