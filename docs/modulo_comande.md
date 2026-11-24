# Modulo Comanda — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** attuale — nato il 2026-11-24 (comande 1.0, sistema 6.8), **in prova** · **Ultima verifica:** 2026-11-24
> **Vedi anche:** [modulo_vendite.md](modulo_vendite.md) (modulo `cassa`: conti iPratico, chiusure), [analisi_ipratico_cloud.md](analisi_ipratico_cloud.md), [modulo_prenotazioni.md](modulo_prenotazioni.md) (tavoli), [modulo_menu_carta.md](modulo_menu_carta.md), [operativo/rete.md](operativo/rete.md) (stampanti in osteria), [architettura_mattoni.md](architettura_mattoni.md)

**Classificazione:** `[core]`. Ogni ristorante prende comande; i reparti e le uscite sono impostazioni del locale.
**Modulo:** `comande`, nuovo e vendibile. Manifesto in `core/moduli/comande/module.json`.
**Origine:** studio di fattibilità «TRGB cassa: comande, scontrini e fatture» del 24/11/2026 (documento in claude.ai, Q #383). Marco ha diviso il progetto in tre moduli — **Comanda**, **Cassa**, **Fatture in uscita** — e si parte dalla Comanda (Q #385).

---

## 1. Decisioni di Marco (2026-11-24)

1. **Tre moduli:** Comanda (questo), Cassa (conto, scontrino sull'Epson RT, chiusura) e Fatture in uscita (fatture elettroniche ai clienti). Cassa e Fatture vengono dopo.
2. **Solo in prova finché non c'è la Cassa.** Si costruisce e si prova a locale chiuso o su un tavolo; in servizio restano iPratico e le sue comande, così non c'è doppio lavoro. Ogni conto nasce con `prova = 1`.
3. **Chi prende le comande:** admin (e superadmin), capo sala, sala, sommelier. Le impostazioni solo admin.
4. **Le stampanti sono un servizio condiviso.** Il «ponte» in osteria (Raspberry Pi in rete locale) che manda comande alle SOL801 e scontrini all'Epson servirà a Comanda e Cassa: è un mattone platform, non un pezzo del modulo. Arriva nella prossima sessione.

## 2. Come gira un tavolo

1. **Tavoli** (`/comande`): i tavoli attivi di Prenotazioni, per sala. Tavolo libero → coperti → «Apri». Un tavolo ha al massimo un conto aperto.
2. **Conto** (`/comande/conto/:id`): righe raggruppate per uscita (Subito, 1ª, 2ª…). «＋ Aggiungi» apre il catalogo: si sceglie l'uscita (o «Automatica»), si cerca o si sfoglia per gruppo, un tocco aggiunge 1 pezzo (lo stesso articolo nella stessa uscita alza la quantità). Articoli «a voce» chiedono il prezzo; «＋ Fuori carta» crea una riga libera con nome, prezzo e famiglia.
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
| Calici | stessi vini con `VENDITA_CALICE` e `PREZZO_CALICE`, in giacenza o bottiglia aperta | `0123C` |
| Birre, Tisane, Tè, Amari, Whisky, Grappe, Gin… | voci attive delle sezioni Carta Bevande sincronizzate con iPratico, gruppo = categoria iPratico | `B0045` (come lo SKU iPratico) |

Al 24/11/2026: 500 articoli (326 bottiglie, 99 bevande, 48 piatti di carta, 10 menu, 9 pranzo, 3 piatti del giorno, 3 calici, 2 degustazioni). Una fonte che non si legge finisce in `avvisi` e non ferma le altre.

## 4. Uscite e reparti (impostazioni, mai nel codice)

Ogni articolo ha una **famiglia**: `food` (piatti), `beverage` (da bere), `servizio` (sezione Servizio della carta: caffè, acqua, tè, coperto). Da qui le proposte:

| Impostazione (`comande_config`) | Valore iniziale | Cosa fa |
|---|---|---|
| `uscite_numero` | 4 | uscite proposte in sala oltre a «Subito» |
| `uscita_food` / `uscita_beverage` / `uscita_servizio` | 1 / 0 / 0 | uscita di partenza di ogni famiglia (0 = Subito) |
| `reparto_food` / `reparto_beverage` / `reparto_servizio` | cucina / sala / sala | dove va ogni famiglia |

Reparti iniziali: **cucina** e **sala**, come le due stampanti comande dell'osteria (SOL801 «CUCINA» e «SALA»). `comande_gruppi_reparto` fa le eccezioni per gruppo (es. «Servizio» → nessun reparto). Tutto da Comanda › Impostazioni.

## 5. Dati — `comande.sqlite3` (schema al boot, `app/models/comande_db.py`)

| Tabella | Cosa tiene |
|---|---|
| `comande_conti` | tavolo (id + nome e sala al momento), coperti, stato `aperto/chiuso/annullato`, `prova`, `uscita_corrente`, nota, prenotazione/cliente (per dopo), chi e quando |
| `comande_righe` | codice e tipo articolo, nome, gruppo, famiglia, reparto, prezzo unitario (deciso dal server), quantità, uscita, varianti (JSON), nota, stato `da_inviare/inviata/stornata`, invio, storno con motivo |
| `comande_invii` | tipo `comanda/via/storno`, reparto, uscita, `righe_json` (fotografia per la stampa), `stampato_at`/`stampa_esito` (li scriverà il ponte) |
| `comande_reparti` | chiave, nome, ordine, attivo |
| `comande_gruppi_reparto` | gruppo del catalogo → reparto (NULL = nessuno) |
| `comande_config` | le impostazioni del §4 |

Un indice unico parziale impedisce due conti aperti sullo stesso tavolo.

## 6. Codice

| Pezzo | File |
|---|---|
| Router (solo HTTP ⇄ service) | `app/routers/comande_router.py`, montato in `main.py` (`_mount("comande_router")`) |
| Logica | `app/services/comande_service.py` |
| Catalogo (platform) | `app/services/catalogo_vendita.py` |
| Tavoli (platform) | `app/services/tavoli_sala_service.py` |
| DB | `app/models/comande_db.py` |
| Permessi menu | `modules_router.DEFAULT_MODULES` + `MODULI_DA_AGGIUNGERE` (il seed `modules.json` non si tocca: cambiarlo riscrive i permessi scelti da UI) |
| Pagine | `frontend/src/pages/comande/` — `ComandeTavoli`, `ComandeConto`, `ComandeInvii`, `ComandeImpostazioni`, `ComandeNav` (con `BannerProva`), `comandeApi.js` |

## 7. Capability

| Codice | Cosa fa | Riferimento | Audience | Stato docs |
|---|---|---|---|---|
| C-CO-001 | Tavoli per sala col conto aperto (coperti, ora, totale, righe da inviare) | `comande_router.py:get_tavoli`, `ComandeTavoli.jsx` | sala, capo sala, sommelier, admin | ✅ |
| C-CO-002 | Apertura tavolo con coperti, un conto aperto per tavolo | `comande_router.py:post_conto`, `comande_service.apri_conto` | idem | ✅ |
| C-CO-003 | Catalogo vendibile da carta, piatti del giorno, pranzo, menu template, vini, bevande | `comande_router.py:get_catalogo`, `catalogo_vendita.catalogo` | idem | ✅ |
| C-CO-004 | Righe per uscita, prezzo dal catalogo, prezzo a voce, fuori carta, quantità, nota, cambio uscita | `post_righe`, `patch_riga`, `delete_riga`, `ComandeConto.jsx` | idem | ✅ |
| C-CO-005 | Invio ai reparti con la fotografia delle righe | `post_invia`, `comande_service.invia` | idem | ✅ |
| C-CO-006 | «Via la Nª» | `post_via`, `comande_service.via` | idem | ✅ |
| C-CO-007 | Storno di una riga inviata con motivo, avviso al reparto | `post_storno`, `comande_service.storna_riga` | idem | ✅ |
| C-CO-008 | Coperti, nota e cambio tavolo di un conto aperto | `patch_conto`, `comande_service.aggiorna_conto` | idem | ✅ (cambio tavolo solo API) |
| C-CO-009 | Chiusura e annullo del conto (prova) | `post_chiudi`, `comande_service.chiudi_conto` | idem | ✅ |
| C-CO-010 | Pagina Invii per reparto | `get_invii`, `ComandeInvii.jsx` | idem | ✅ |
| C-CO-011 | Impostazioni: uscite, reparti, famiglia → reparto, gruppo → reparto | `get/put_impostazioni`, `ComandeImpostazioni.jsx` | admin | ✅ |

## 8. Cosa manca (in ordine)

1. **Ponte locale e stampa** (mattone nuovo): programma sul Raspberry Pi che prende gli invii non stampati e li manda in ESC/POS alle SOL801 (porta 9100), scrivendo `stampato_at`. Lo stesso ponte, più avanti, parlerà con l'Epson RT per la Cassa.
2. **Prova sul campo** a locale chiuso, poi un tavolo: raccogliere le correzioni della sala.
3. Da confermare con Marco: come si batte il **pranzo** (oggi: Menù Business N portate + piatti a 0 €; in iPratico «Piatto pranzo» con variante); i **calici** (solo 3 vini hanno VENDITA_CALICE, in iPratico la categoria Calici è molto usata).
4. Varianti predefinite (oggi solo nota libera; il campo `varianti` c'è già).
5. Piantina della sala (`prenotazioni/components/Piantina.jsx`) al posto della griglia, se serve; schermo cucina se serve.
6. Poi i moduli **Cassa** (conto, scontrino, collegamento al conto iPratico che oggi scarica `cassa_conti`) e **Fatture in uscita**.
