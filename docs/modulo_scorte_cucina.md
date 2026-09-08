# Modulo Scorte & Frigoriferi — Cucina

> **Tipo:** 📄 pagina wiki · **Stato:** attuale — **backend + sotto-app mobile implementati 2026-09-07** · **Ultima verifica:** 2026-09-07
> **Mockup dei flussi:** [`mockups/cucina_mobile_scorte_frigo.html`](mockups/cucina_mobile_scorte_frigo.html) — 9 schermate iPhone, il giro del frigo è interattivo. **Si valida quello prima di scrivere il backend** (decisione Marco 2026-09-07).
> **Frontend:** `frontend/src/pages/cucina/CucinaMobile.jsx` — 4 tab su `/cucina/mobile`. Prefisso classi `km-` (NON `cm-`, che è di CantinaMobile: convivono nella stessa app).
> **Codice:** `app/models/cucina_scorte_db.py` (schema, single source of truth) · `app/services/cucina_scorte_service.py` (logica) · `app/routers/cucina_{scorte,ubicazioni}_router.py` (40 endpoint) · `app/services/{haccp_letture,prezzi_ingredienti}.py` (ponti platform) · `app/migrations/171_cucina_scorte_frigoriferi.py`.
> ⚠️ In `claude/scorte_cucina_parcheggio/` c'e' una prima stesura **pre-ripiani, superata**: non riusarla, e' li' solo perche' la cartella e' gitignorata.
> **Vedi anche:** [modulo_cucina.md](modulo_cucina.md) (task + HACCP + lista spesa), [modulo_ricette_foodcost.md](modulo_ricette_foodcost.md), [modulo_vini.md](modulo_vini.md) (Cantina mobile = precedente di riferimento), [architettura_mattoni.md](architettura_mattoni.md), [roadmap.md](roadmap.md) §C

**Modulo R8:** `cucina` (lo stesso di Lista Spesa). Prefissi tabelle: `cucina_*`. Undici tabelle: `ubicazioni`, `ripiani`, `articoli`, `giacenze`, `movimenti`, `conte`, `conte_ripiani`, `conte_righe`, `lotti`, `manutenzioni`, `scorte_config`.
**Classificazione:** `[core]` — logica di prodotto generica. I frigoriferi reali dell'osteria e gli articoli Tre Gobbi sono **seed** `[locale:tregobbi]`, non codice.
**Precedente di riferimento:** `CantinaMobile.jsx` (vini). Stessa filosofia — telefono in mano, in piedi, con le mani sporche — applicata alla cucina.

---

# 0. Indice

1. Perché questo modulo esiste
2. Le tre domande che il modulo deve saper rispondere
3. Il regime di gestione — come si evita il caos di "tutti i metodi insieme"
4. Entità (schema) — ubicazioni, **ripiani**, articoli, giacenze
5. Cosa NON duplichiamo: le temperature restano nel Task Manager
6. Endpoint — implementati
7. Permessi (M.G)
8. Integrazione con gli altri moduli
9. Fasi di rilascio
9-bis. **Come si prova** — seed di demo e checklist
10. Decisioni prese + la sotto-app mobile

---

# 1. Perché questo modulo esiste

Oggi, lato cucina, il gestionale sa fare due cose:

| Cosa | Dove vive | Stato |
|---|---|---|
| Checklist ricorrenti + task singoli + report HACCP | `tasks.sqlite3`, `tasks_router` + `haccp_router` | ✅ esiste, manca solo la UI mobile |
| Lista spesa testuale (titolo + quantità libera) | `lista_spesa_items` in `foodcost.db` | ✅ esiste, è una lista, non un magazzino |

E non sa fare **niente** di questo:

- che cosa c'è in casa, e quanto
- dove sta fisicamente (quale frigo, quale cella, quale scaffale)
- quando scade e cosa va consumato prima
- quanto vale il magazzino di cucina a fine mese
- che storia ha quel frigo (temperature, guasti, manutenzioni)

Le scorte e i frigoriferi sono **il pezzo mancante**. Tutto il resto della sotto-app mobile Cucina gira su endpoint che già esistono.

---

# 2. Le tre domande che il modulo deve saper rispondere

Il modulo è progettato attorno a tre domande operative, che sono diverse fra loro e non vanno confuse (stessa disciplina delle 3 dimensioni dello stato pagamento in `stato_pagamento_unificato.md` §15):

| # | Domanda | Chi la fa | Quando | Risposta del sistema |
|---|---|---|---|---|
| **D1** | **«Manca qualcosa?»** | cuoco, commis | ogni giorno, in servizio | semaforo per articolo → riga in Lista Spesa |
| **D2** | **«Quanto vale il magazzino?»** | Marco, il commercialista | fine mese / a data | conta periodica valorizzata |
| **D3** | **«Dov'è, quanto ne resta, quando scade?»** | chi cucina | al momento del prelievo | giacenza **per ripiano** + lotti |

**D1 non richiede numeri. D2 non richiede continuità. D3 richiede entrambe.**
È questa separazione che permette di avere tutti e tre i metodi senza che il dato menta.

---

# 3. Il regime di gestione — come si evita il caos

Marco ha chiesto tutti e quattro i metodi (semaforo, conta periodica, giacenza continua, e la coesistenza). Da soli sarebbero contraddittori: se un articolo ha sia un semaforo che una giacenza continua, quale dei due è la verità quando divergono?

La regola che li rende compatibili è una sola:

> **Ogni articolo dichiara UN regime. La conta periodica vale per tutti.**

Campo `cucina_articoli.regime`, tre valori:

| Regime | Cosa si registra | Per cosa | Esempio |
|---|---|---|---|
| **`SEMAFORO`** | solo lo stato: `OK` / `ESAURIMENTO` / `FINITO` | roba di poco valore ma indispensabile, dove contare è tempo buttato | sale, farina, carta forno, detersivo, olio di semi |
| **`CONTA`** | una quantità, aggiornata solo quando si conta | dispensa e scatolame: gira lento, nessuno ha voglia di scaricare ogni barattolo | conserve, pasta secca, legumi, vino da cucina |
| **`MOVIMENTI`** | ogni carico/scarico, giacenza sempre viva, timeline con undo | roba di valore o deperibile, dove sapere quanto resta cambia la spesa di domani | carne, pesce, formaggi importanti, tartufo |

E sopra a tutti e tre:

> **La conta periodica (D2) è ortogonale al regime.** Si può contare qualsiasi articolo, sempre.
> - Su un articolo `SEMAFORO` la conta scrive una quantità **solo per valorizzare** — il semaforo resta la verità operativa.
> - Su un articolo `CONTA` la conta **è** la verità: sostituisce la giacenza.
> - Su un articolo `MOVIMENTI` la conta genera un **movimento di RETTIFICA** col delta, così la timeline resta continua e leggibile (lezione dal bug RETTIFICA fantasma dei vini: la baseline va passata esplicitamente, mai dedotta).

Il regime è modificabile in qualsiasi momento: si parte con tutto a `SEMAFORO`, che costa zero disciplina, e si promuove a `MOVIMENTI` solo ciò che merita. **Niente big bang.**

## 3.1 Il dato che invecchia — e lo dice

Marco (2026-09-07), alla domanda «quanti articoli finiranno a regime `MOVIMENTI`?»: **«tanti, ma va fatto»**. Decisione presa, e non si torna indietro sopra. Ma allora il rischio va guardato in faccia, perché è certo: con molti articoli a movimenti, prima o poi qualcuno non scarica, e da quel momento il sistema mostra un numero preciso e **falso**. Un numero falso è peggio di nessun numero: ci prendi decisioni sopra.

La risposta non è la disciplina — la disciplina in cucina di sabato sera non esiste. È che **il sistema ammetta di non sapere più**.

`cucina_articoli.giorni_dato_fresco` (INTEGER NULL, per articolo): oltre quella finestra senza movimenti, la giacenza smette di essere un numero e diventa una stima.

**Come si risolve la finestra**, in tre gradini — mai una costante nel codice:

1. `cucina_articoli.giorni_dato_fresco` se valorizzato (l'eccezione: il pesce, il tartufo);
2. altrimenti il default della sua `famiglia_freschezza` (`FRESCO`/`SECCO`), da `cucina_scorte_config`;
3. se non è mai stato configurato niente, il dato non invecchia — meglio nessun avviso che avvisi a caso.

Default decisi da Marco (2026-09-07), seminati dalla mig 171 in `cucina_scorte_config` (stesso pattern chiave/valore di `macellaio_config` & co.), leggibili e modificabili da `GET`/`PUT /cucina/scorte/config/`:

| Chiave | Valore | Copre |
|---|---|---|
| `freschezza_fresco_gg` | **5** | `famiglia_freschezza = FRESCO`: carne, pesce, latticini, verdura |
| `freschezza_secco_gg` | **21** | `famiglia_freschezza = SECCO`: dispensa, scatolame, non-food |
| `blocca_incompatibilita_ripiano` | **0** | il crudo sul ripiano del cotto si segnala, non si blocca |

Tre settimane sul secco non sono generosità: sono il riconoscimento che un sacco di farina si muove davvero ogni tanto, e segnalarlo prima genererebbe rumore che insegna a ignorare gli avvisi.

| Dato | Come si mostra | Cosa comunica |
|---|---|---|
| movimentato di recente | **4,2 KG** | questo numero è vero |
| fermo da più di `giorni_dato_fresco` | **≈ 4,2** · <span>da verificare</span> | qui c'è scritto 4,2, ma non ci giurerei |
| mai contato, mai movimentato | **—** | non lo so, e non fingo |

Tre effetti concreti:

1. **Chi legge sa quanto fidarsi.** Un «≈» davanti a un numero cambia la decisione di chi ordina.
2. **Gli articoli fermi si autodenunciano.** Se un articolo resta «da verificare» per settimane, o non gira (e allora il regime `MOVIMENTI` è sbagliato, va retrocesso a `CONTA`), o nessuno lo scarica (e allora è un problema di processo). In entrambi i casi lo scopri guardando una lista, non a fine anno.
3. **La conta a ripiani diventa la rete di sicurezza,** non un evento contabile annuale: è il gesto che riporta a zero i «da verificare».

E in più, sul gesto: **lo scarico deve costare un tap**, con la quantità dell'ultima volta già proposta — lo stesso trucco del prezzo al calice precompilato in cantina (vini 3.87). Se scaricare costa un form, nessuno scarica, e tutto quanto sopra diventa accademia.

---

# 4. Entità (schema DB)

**DB:** `foodcost.db` (path tenant-aware `locali/<TRGB_LOCALE>/data/`), lo stesso di Lista Spesa.

*Perché non un DB dedicato:* l'anagrafica ibrida richiede una FK **reale** verso `ingredienti`, e la valorizzazione della conta richiede di leggere i prezzi d'acquisto dalle fatture. SQLite non fa foreign key cross-database. Un DB separato trasformerebbe entrambe in FK logiche non verificate.
*Nome mai da usare:* `cucina.sqlite3` — esisteva ed è stato rinominato `tasks.sqlite3` dalla mig 086. Riusarlo riaprirebbe C-DEBT2.

## 4.1 `cucina_ubicazioni` — i posti fisici (frigoriferi inclusi)

Il frigorifero smette di essere una riga di testo dentro un template di checklist e diventa un'**entità con un'identità**: ha soglie, ha una storia, si rompe.

| Campo | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK | |
| `nome` | TEXT NOT NULL | «Frigo carne», «Cella», «Abbattitore» |
| `tipo` | TEXT NOT NULL | `FRIGO` / `CELLA` / `FREEZER` / `ABBATTITORE` / `DISPENSA` / `SCAFFALE` / `BANCO` / `ALTRO` |
| `reparto` | TEXT NOT NULL DEFAULT 'cucina' | valori da `tasks_schema.REPARTI` — riuso, non nuovo enum |
| `temp_min`, `temp_max` | REAL NULL | soglie HACCP. NULL sui non refrigerati |
| `marca`, `modello`, `matricola`, `anno` | TEXT/INTEGER NULL | scheda manutenzione |
| `ordine` | INTEGER DEFAULT 0 | ordine del giro di controllo |
| `attivo` | INTEGER DEFAULT 1 | |
| `note` | TEXT NULL | |
| `created_at`, `created_by` | TEXT | |

## 4.1b `cucina_ripiani` — il livello dove sta davvero la roba

**Ogni ubicazione ha almeno un ripiano.** Anche la dispensa che «non ne ha»: ne ha uno, si chiama `1`, e nessuno se ne accorge. È la scelta che tiene lo schema onesto — senza di essa `cucina_giacenze` avrebbe un `ripiano_id` nullable, la UI avrebbe due modi di navigare e ogni query avrebbe un `COALESCE`. Alla creazione di un'ubicazione il ripiano `1` si crea da solo.

| Campo | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK | |
| `ubicazione_id` | INTEGER NOT NULL FK | |
| `codice` | TEXT NOT NULL | **locale all'ubicazione**: `1`, `2`, `3`. `UNIQUE(ubicazione_id, codice)` |
| `nome` | TEXT NULL | opzionale: «alto», «cassetto verdure» |
| `destinazione` | TEXT NULL | `CRUDO` / `COTTO` / `SEMILAVORATI` / `PRONTI` / `NON_FOOD` / `MISTO` |
| `ordine` | INTEGER DEFAULT 0 | dall'alto in basso, l'ordine in cui si legge lo sportello aperto |
| `attivo`, `note` | | |

### Il codice è locale, e ha una conseguenza

`FC-2` non esiste: esiste il ripiano `2` **del frigo carne**. Un codice locale è più naturale da dire a voce e non richiede di inventare sigle quando arriva un frigo nuovo, ma **non identifica niente da solo**: ovunque si mostri un ripiano bisogna mostrare anche il suo posto («Frigo carne · rip. 3»), e una ricerca per solo codice restituisce sei risultati. Vale per la UI e per i log.

### La destinazione d'uso non è decorazione

`destinazione` regge la separazione crudo/cotto, che è HACCP vera. Con `cucina_articoli.natura` valorizzata, il sistema riconosce il crudo finito sul ripiano del cotto e **lo segnala**. Segnala, non blocca: un blocco in servizio è un modo garantito per far smettere la gente di usare l'app. L'avviso resta finché il pezzo non si sposta.

## 4.2 `cucina_articoli` — anagrafica ibrida

| Campo | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK | |
| `nome` | TEXT NOT NULL | |
| `ingredient_id` | INTEGER **NULL** FK → `ingredienti(id)` | il ponte col food cost. Nullable per scelta: carta forno e detersivo non sono ingredienti |
| `categoria` | TEXT NULL | carne / pesce / latticini / secco / non-food / … |
| `um` | TEXT NOT NULL DEFAULT 'PZ' | lista chiusa: `KG` / `G` / `L` / `ML` / `PZ` / `CF` |
| `confezione` | TEXT NULL | libero: «cassetta», «secchiello», «forma» — come lo dici tu |
| `reparto` | TEXT NOT NULL DEFAULT 'cucina' | valori da `tasks_schema.REPARTI` |
| **`regime`** | TEXT NOT NULL DEFAULT `'SEMAFORO'` | `SEMAFORO` / `CONTA` / `MOVIMENTI` — vedi §3 |
| `ubicazione_default_id` | INTEGER NULL FK | dove sta di solito |
| `scorta_minima` | REAL NULL | **per articolo, non hardcoded** (regola soglie) |
| `giorni_copertura` | INTEGER NULL | alternativa alla soglia a pezzi, come sui vini (RD.1) |
| `fornitore_piva` | TEXT NULL | **tabellato**: FK logica a `fe_fornitore_categoria.fornitore_piva` (161 fornitori veri, arrivati dalle fatture) |
| `fornitore_freeform` | TEXT NULL | **libero**: il pescatore, il contadino, chi non fattura elettronicamente. Stesso pattern ibrido di `ingredient_id` |
| `giorni_dato_fresco` | INTEGER NULL | oltre questa finestra senza movimenti la giacenza si mostra come stima (§3.1) |
| `shelf_life_aperto_gg` | INTEGER NULL | «aperto da N giorni» → alert FIFO |
| `natura` | TEXT NULL | `CRUDO` / `COTTO` / `SEMILAVORATO` / `PRONTO` / `NON_FOOD` — si confronta con `cucina_ripiani.destinazione` |
| `ripiano_casa_id` | INTEGER NULL FK | il ripiano «giusto», quello del giro. Gli altri sono giacenze legittime ma di passaggio |
| `attivo`, `note`, `created_at`, `created_by` | | |

## 4.3 `cucina_giacenze` — la verità corrente per (articolo, **ripiano**), e la dotazione

Tabella comune ai tre regimi. `UNIQUE(articolo_id, ripiano_id)`.

**La chiave è il ripiano, non l'ubicazione.** Lo stesso articolo può stare su più ripiani, anche in posti diversi (costata sul rip. 3 del frigo carne e sul rip. 2 della cella): ognuno ha la sua riga, la sua quantità e il suo pallino. Conseguenza da tenere a mente ovunque: **la giacenza di un articolo è una somma**, mai un singolo valore letto da una riga.

| Campo | Tipo | Note |
|---|---|---|
| `articolo_id`, `ripiano_id` | INTEGER FK NOT NULL | |
| `ubicazione_id` | INTEGER NOT NULL | **denormalizzato** dal ripiano: quasi ogni query filtra per posto, e senza questo campo ogni «cosa c'è nel frigo carne» pagherebbe una join. Si scrive dal ripiano, non si modifica a mano |
| `qta` | REAL NULL | valorizzata da `CONTA` e `MOVIMENTI`. NULL su articoli `SEMAFORO` mai contati |
| `stato_semaforo` | TEXT NULL | `OK` / `ESAURIMENTO` / `FINITO` |
| **`in_dotazione`** | INTEGER NOT NULL DEFAULT 1 | **1 = «questa roba sta qui di norma»**, anche a zero |
| `ordine` | INTEGER DEFAULT 0 | ordine dentro il ripiano |
| `aggiornato_at`, `aggiornato_da`, `origine` | | `origine` = `SEMAFORO` / `CONTA` / `MOVIMENTO` / `IMPORT` |

### Perché la dotazione è la chiave di tutto il modulo

La UI scelta parte **dal posto, non dall'articolo**: apri «Frigo carne» e spunti cosa manca. Perché quella schermata funzioni, il frigo deve saper elencare le cose che *dovrebbero* esserci — comprese quelle finite. Una tabella di sole giacenze positive elencherebbe il frigo **al netto proprio di ciò che ti interessa**: il buco.

Da qui `in_dotazione`. La riga `(articolo, ubicazione)` nasce quando decidi che quell'articolo appartiene a quel posto e **non muore mai**, nemmeno a quantità zero: diventa una casella vuota nel giro di controllo. È lo stesso principio di `slotsOperabili()` in `CantinaMobile.jsx`, che tiene i posti definiti a giacenza 0 perché servono al carico.

Corollario: la prima configurazione del modulo non è «inserire le scorte», è **«dire cosa sta in ogni frigo»**. Il giro di controllo nasce da lì.

## 4.4 `cucina_movimenti` — la timeline (regime `MOVIMENTI` + rettifiche)

| Campo | Tipo | Note |
|---|---|---|
| `tipo` | TEXT | `CARICO` / `SCARICO` / `RETTIFICA` / `TRASFERIMENTO` / `SCARTO` |
| `qta_delta` | REAL | |
| **`qta_precedente`** | REAL NOT NULL | **esplicito, mai dedotto** — lezione dal bug RETTIFICA fantasma dei vini |
| `qta_risultante` | REAL NOT NULL | scritto, non ricalcolato a display |
| `ripiano_id` | INTEGER NULL FK | dove e' avvenuto. Un TRASFERIMENTO ha ripiano di partenza e di arrivo |
| `lotto_id` | INTEGER NULL FK | |
| `motivo`, `origine`, `ref_modulo`, `ref_id` | TEXT | `origine` = `CUCINA-MOBILE` / `CONTA` / `FATTURA` / … |
| `utente`, `created_at` | TEXT | |
| `annullato_at`, `annullato_da` | TEXT NULL | undo a 8s come CantinaMobile, poi soft-delete tracciato |

`SCARTO` è un tipo a sé e non un `SCARICO`: lo spreco è un numero che Marco vuole poter guardare da solo.

## 4.5 `cucina_conte` — l'inventario, **un ripiano alla volta**

L'unità della conta è il ripiano. Non è un dettaglio di UI: è la differenza fra 24 passi da due minuti, che si fanno davvero, e 6 sessioni da mezz'ora davanti a uno sportello aperto, che si abbandonano a metà. Tre tabelle invece di due, perché serve sapere **dove sei rimasto**.

**`cucina_conte`** — la sessione: `id`, `data`, `reparto`, `stato` (`APERTA`/`CHIUSA`), `note`, `valore_totale` REAL, `aperta_da/_at`, `chiusa_da/_at`.

**`cucina_conte_ripiani`** — l'avanzamento: `conta_id`, `ripiano_id`, `stato` (`DA_FARE`/`IN_CORSO`/`CONTATO`), `contato_da/_at`. `UNIQUE(conta_id, ripiano_id)`. È questa tabella che permette di fermarsi e riprendere senza perdere il punto, e di spalmare l'inventario su più giorni.

**`cucina_conte_righe`:** `conta_id`, `ripiano_id`, `articolo_id`, `qta_attesa`, `qta_contata`, `delta`, `prezzo_unitario`, `valore`, `note`.

Alla chiusura di **ogni ripiano** le sue righe si consolidano; alla chiusura della sessione:
- articoli `MOVIMENTI` → si genera un `cucina_movimenti` tipo `RETTIFICA` con `qta_precedente = qta_attesa`
- articoli `CONTA` e `SEMAFORO` → si aggiorna `cucina_giacenze.qta` con `origine='CONTA'`
- `valore_totale` = Σ righe → è il numero che serve al Controllo Gestione

Una conta chiusa **non si riapre**: si fa una conta nuova. (Stessa disciplina delle migrazioni.) Un singolo ripiano gia' contato, invece, si puo' ricontare finche' la sessione e' aperta: e' un errore di conta, non un atto contabile.

## 4.6 `cucina_lotti` — scadenze e rotazione FIFO

| Campo | Tipo | Note |
|---|---|---|
| `articolo_id`, `ripiano_id` | INTEGER FK | il lotto sta su un ripiano preciso: e' il pezzo fisico |
| `lotto_codice` | TEXT NULL | quello del fornitore, se c'è |
| `data_arrivo`, `data_scadenza`, `data_apertura` | TEXT NULL | |
| `qta_iniziale`, `qta_residua` | REAL | |
| `stato` | TEXT | `CHIUSO` / `APERTO` / `ESAURITO` / `SCARTATO` |
| `fornitore`, `ddt_ref`, `note` | TEXT NULL | |

**I lotti sono opzionali per articolo.** Se non ne crei, il modulo funziona lo stesso: la giacenza c'è, la scadenza no. Si attivano solo dove servono davvero (fresco, sottovuoto, semilavorati).
Due alert M.F ne discendono: *scade entro N giorni* e *aperto da più di `shelf_life_aperto_gg`*.

## 4.7 `cucina_manutenzioni` — la storia dei frigo

`id`, `ubicazione_id`, `tipo` (`ORDINARIA`/`GUASTO`/`RIPARAZIONE`/`SANIFICAZIONE`), `data`, `descrizione`, `ditta`, `costo` REAL NULL, `stato` (`APERTO`/`CHIUSO`), `task_id` INTEGER NULL, `created_by/_at`.

Un guasto aperto **crea un task singolo** nel Task Manager (non una to-do parallela) e ne conserva l'id. Un frigo con un guasto aperto si vede subito nel giro di controllo.

## 4.8 Il ponte con l'HACCP: `checklist_item.ubicazione_id`

Unica modifica a una tabella esistente: `ALTER TABLE checklist_item ADD COLUMN ubicazione_id INTEGER` (nullable, in `tasks.sqlite3`). Serve a legare l'item di tipo `TEMPERATURA` al frigo vero. Vedi §5.

---

# 5. Cosa NON duplichiamo: le temperature restano nel Task Manager

La tentazione ovvia sarebbe una tabella `cucina_letture_temperatura`. **È un errore e non la facciamo.**

Le temperature dei frigo si registrano già oggi, come `checklist_execution` di item tipo `TEMPERATURA`, e da lì esce il report HACCP mensile. Crearne una seconda sede significa avere due registri HACCP che prima o poi divergono — e quello sbagliato lo scopri davanti all'ASL.

Quindi:

- **la lettura** resta in `tasks.sqlite3`, dove è sempre stata;
- **il frigo** diventa entità in `cucina_ubicazioni` e porta le soglie `temp_min`/`temp_max`, che oggi non stanno da nessuna parte;
- **il ponte** è `checklist_item.ubicazione_id`;
- la scheda frigo (§6) legge le temperature via il Task Manager, non dal proprio DB. È cross-modulo read-only, coerente con la regola 4 di disciplina modulare.

Effetto collaterale utile: il *fuori soglia* smette di essere un giudizio a occhio nel report e diventa un confronto con una soglia dichiarata sul frigo.

---

# 6. Endpoint — implementati 2026-09-07 (mig 171)

40 endpoint, due router, entrambi `# Modulo: cucina`. Nessun prefisso `/api/`.

⚠️ **Trailing slash: la lista qui sotto e' letterale.** FastAPI fa 307 su
mismatch di slash e il browser perde l'header `Authorization` → 401 → crash.
Le collezioni principali finiscono con `/`, le sotto-collezioni e i singoli
elementi no. Il frontend copia da qui, non a memoria.

## `cucina_ubicazioni_router.py` — prefix `/cucina/ubicazioni`

| Metodo | Path | Cosa |
|---|---|---|
| GET | `/cucina/ubicazioni/` | il giro, in `ordine`. Con `con_stato=1` (default) ogni riga porta gia' temperatura di oggi, n. ripiani, quanti mancano, guasti aperti — il tab «Frigo» e' una chiamata sola |
| GET | `/cucina/ubicazioni/{id}` | **la scheda = IL GIRO**: i ripiani dall'alto in basso, ognuno con destinazione d'uso e dotazione (roba finita compresa), temperature, guasti |
| POST | `/cucina/ubicazioni/` | crea posto + N ripiani numerati 1..N (`n_ripiani`, default 1) |
| PATCH / DELETE | `/cucina/ubicazioni/{id}` | modifica / **disattiva** (mai cancella: c'e' dentro la storia) |
| GET | `/cucina/ubicazioni/{id}/ripiani` | elenco ripiani |
| GET | `/cucina/ubicazioni/{id}/ripiani/{rid}` | il ripiano e la sua dotazione — l'unita' del giro e della conta |
| POST | `/cucina/ubicazioni/{id}/ripiani` | aggiungi ripiano (409 se il codice esiste gia' **in questo posto**) |
| PATCH | `/cucina/ubicazioni/{id}/ripiani/{rid}` | codice, nome, destinazione, ordine |
| DELETE | `/cucina/ubicazioni/{id}/ripiani/{rid}` | disattiva. **409 se e' l'ultimo** o se c'e' ancora giacenza sopra |
| GET | `/cucina/ubicazioni/{id}/temperature` | serie storica dal Task Manager, fuori-soglia calcolato sulle soglie del frigo |
| GET/POST | `/cucina/ubicazioni/{id}/manutenzioni` | interventi; su `GUASTO` apre un task singolo e ne salva l'id |
| PATCH | `/cucina/ubicazioni/{id}/manutenzioni/{mid}` | chiudi/modifica |

## `cucina_scorte_router.py` — prefix `/cucina/scorte`

| Metodo | Path | Cosa |
|---|---|---|
| GET | `/cucina/scorte/articoli/` | elenco con `giacenza` (SOMMA sui ripiani), `posti`, `stato_dato`. Filtri: categoria, regime, ubicazione, ripiano, `solo_mancanti`, `q` |
| GET | `/cucina/scorte/articoli/{id}` | scheda: posti (con `e_casa`/`fuori_posto`), lotti, ultimi 20 movimenti, **`azioni_rapide`** con le quantita' dell'ultima volta |
| POST/PATCH/DELETE | `/cucina/scorte/articoli/{id}` | CRUD anagrafica (DELETE = disattiva) |
| **PATCH** | `/cucina/scorte/articoli/{id}/semaforo` | **il tap del cuoco** — `{ripiano_id, stato}`. Su `FINITO` crea la riga di spesa e ne ritorna `spesa_id` |
| DELETE | `/cucina/scorte/spesa/{id}` | seconda meta' dell'undo: toglie la riga di spesa appena nata |
| POST/DELETE | `/cucina/scorte/dotazione/` | metti / togli un articolo da un ripiano (409 se c'e' ancora giacenza) |
| POST | `/cucina/scorte/dotazione/testo` | **incolla-testo**. `conferma:false` (default) = solo anteprima con esito per riga: `ESISTE` / `NUOVO` / `SIMILE` |
| POST | `/cucina/scorte/movimenti/` | il segno lo decide il `tipo`, non il chiamante: `SCARICO`/`SCARTO` tolgono, `CARICO` aggiunge |
| DELETE | `/cucina/scorte/movimenti/{id}` | undo a 8s (soft-delete tracciato) |
| GET | `/cucina/scorte/movimenti/` | timeline filtrabile (articolo, posto, tipo, date) |
| GET/POST | `/cucina/scorte/conte/` | elenco con avanzamento / apri sessione (409 se una e' gia' aperta sul reparto) |
| GET | `/cucina/scorte/conte/{id}/ripiani` | **dove sei rimasto** |
| GET | `/cucina/scorte/conte/{id}/ripiani/{rid}` | foglio del ripiano, precompilato con `qta_attesa` |
| PATCH | `/cucina/scorte/conte/{id}/ripiani/{rid}` | scrivi la quantita' trovata (**non muove ancora la giacenza**) |
| POST | `/cucina/scorte/conte/{id}/ripiani/{rid}/chiudi` | consolida: RETTIFICA con baseline esplicita sui MOVIMENTI, scrittura diretta sugli altri |
| POST | `/cucina/scorte/conte/{id}/chiudi` | valorizza e sigilla. Ritorna `ripiani_non_contati` |
| GET/POST | `/cucina/scorte/lotti/` | lotti; PATCH `/{id}` apre (data a oggi se non data), sposta, scarta |
| GET | `/cucina/scorte/alert/` | mancanti + in scadenza + aperti da troppo + **da verificare** + fuori posto |
| GET/PUT | `/cucina/scorte/config/` | le soglie. Nessun valore operativo e' hardcodato nel codice |

# 7. Permessi (M.G)

Dichiarati a livello di router, mai con `if role ==` a mano.

| Ambito | Ruoli |
|---|---|
| Router `/scorte` e `/ubicazioni` (lettura + operatività quotidiana: semaforo, movimenti, righe di conta) | `admin`, `chef`, `sous_chef`, `commis` (+`superadmin` implicito) |
| Anagrafica articoli, anagrafica ubicazioni, **chiusura conta**, manutenzioni | `admin`, `chef` — via `verifica_ruoli(user, "admin", "chef", cosa="…")` nel corpo |
| `viewer` | sola lettura (già garantita dal `ReadOnlyViewerMiddleware`) |

La chiusura conta è ristretta perché è l'atto che scrive un numero nel Controllo Gestione.

---

# 8. Integrazione con gli altri moduli

| Modulo | Direzione | Come |
|---|---|---|
| **Lista Spesa** (`cucina`) | scorte → spesa | semaforo su `FINITO` crea `lista_spesa_items` con `ingredient_id` valorizzato dove c'è. Chiude finalmente C.L1 |
| **Task Manager** | bidirezionale | temperature lette da lì (§5); guasto frigo → `task_singolo` |
| **Ricette / FoodCost** | scorte → ricette | `ingredient_id` dà il prezzo per valorizzare la conta; in prospettiva, scarico automatico da ricetta |
| **Acquisti / Fatture** | acquisti → scorte | in prospettiva: riga di fattura → carico di magazzino. **Fase 3, non ora** |
| **Controllo Gestione** | scorte → CG | `valore_totale` della conta = rimanenza, voce che oggi manca al conto economico (G.3) |
| **M.F Alert engine** | | due checker nuovi: `cucina_scorte_mancanti`, `cucina_scadenze` |
| **M.A Notifiche** | | gli alert arrivano in Lavagna/notifiche, non solo aprendo la pagina |

---

# 9. Fasi di rilascio

| Fase | Contenuto | Deployabile da solo |
|---|---|---|
| **S1 — infrastruttura** | ✅ **FATTO 2026-09-07** — mig 171, 11 tabelle, service, 2 router (40 endpoint), doc, mockup. Nessuna UI | sì, invisibile all'osteria |
| **S2 — sotto-app mobile Cucina** | `CucinaMobile.jsx`: Oggi (task+checklist), Scorte (semaforo+ricerca), Frigo (giro di controllo), scheda articolo | sì |
| **S3 — conta e valore** | foglio di conta mobile, chiusura valorizzata, aggancio CG | sì |
| **S4 — lotti e FIFO** | scadenze, apertura, alert M.F | sì |
| **S5 — carico da fattura** | riga fattura → movimento di carico | sì |

Seed dei frigoriferi reali di Tre Gobbi: commit separato `[locale:tregobbi]`, dopo S1.

---

# 9-bis. Come si prova (2026-09-07)

A DB vuoto le schermate «Scorte» e «Frigo» non hanno niente da mostrare, quindi il modulo non è giudicabile. `scripts/seed_cucina_demo.py` crea un magazzino finto costruito apposta perché **ogni comportamento particolare si veda con gli occhi**, e lo cancella con un comando.

```bash
ssh trgb
cd /home/marco/trgb/trgb
python3 scripts/seed_cucina_demo.py            # dry-run: dice cosa farebbe
python3 scripts/seed_cucina_demo.py --crea     # 3 posti, 9 ripiani, 18 articoli
python3 scripts/seed_cucina_demo.py --rimuovi  # via tutto
```

Ogni riga creata porta `[DEMO]` nel nome e nelle note; `--rimuovi` cancella **solo** quelle. Dati veri inseriti nel frattempo restano.

## Cosa guardare, e cosa vuol dire se non torna

| # | Dove | Cosa deve succedere | Se non succede |
|---|---|---|---|
| 1 | **Frigo** → elenco | 3 posti in ordine; «Frigo carne» con chip rosso «3 finiti», la Dispensa con «niente sonda» | il giro non legge `dotazione`/`ultima_temperatura` |
| 2 | **Frigo carne** | 4 ripiani dall'alto, ognuno con la destinazione (pronti/cotto/crudo/semilavorati) | i ripiani non arrivano dalla scheda |
| 3 | stesso posto, ripiano 2 | **Ossobuco** ha il bordo giallo e «⚠ crudo qui»: è crudo su un ripiano dichiarato cotto | `natura`/`destinazione` non si confrontano |
| 4 | stesso posto, ripiano 3 | **Petto d'anatra** mostra `≈ 6` e il chip «fermo da 9 gg», non `6` secco | la soglia di freschezza (5 gg sul fresco) non si applica |
| 5 | ripiano 1 | **Coppa di testa** mostra `—`, non `0`: mai movimentata, e il sistema non finge | `stato_dato = IGNOTO` non arriva |
| 6 | **tocca un pallino verde** | diventa giallo, poi rosso; al rosso compare il toast con Annulla per 8 secondi | la PATCH semaforo non passa (guarda il ruolo) |
| 7 | dopo il rosso, tab **Spesa** | la riga è comparsa da sola, col fornitore giusto | `aggiungi_a_lista_spesa` non scatta |
| 8 | premi **Annulla** entro 8 s | il pallino torna com'era **e** la riga di spesa sparisce | l'undo fa solo metà lavoro |
| 9 | tocca due volte lo stesso rosso | in Spesa resta **una** riga sola | l'anti-doppione non funziona |
| 10 | **Scorte** → Costata di manzo | giacenza **6,4** su 2 ripiani in 2 posti diversi | qualcuno legge una riga invece della somma |
| 11 | scheda Costata → **Scarico** | propone la quantità dell'ultima volta; confermi e la timeline si allunga | `azioni_rapide` non arriva |
| 12 | **Oggi** | checklist e task del giorno; le voci TEMPERATURA dicono «da misurare» e **non** si spuntano | corretto: senza valore l'endpoint rifiuta |

## Cosa NON è ancora provabile

- **La conta.** Gli endpoint ci sono e sono testati sul DB, ma la schermata mobile no: si prova da `/docs` o si rimanda alla fase S3.
- **Le temperature vere.** Il ponte `checklist_item.ubicazione_id` esiste, ma nessun item di checklist è ancora agganciato a un frigo: finché non lo colleghi, la scheda mostra «—» ed è giusto così.
- **Il boot di FastAPI in locale.** Il venv nel repo è macOS: la prima esecuzione reale è sempre quella sul VPS dopo il push.

---

# 10. Decisioni prese (Marco, 2026-09-07)

| # | Decisione | Conseguenza sullo schema |
|---|---|---|
| 1 | **Endpoint `/cucina/scorte` e `/cucina/ubicazioni`** | prefissi espliciti, raggruppati sotto il modulo |
| 2 | **Schema multi-reparto, UI solo cucina** | campo `reparto` su ubicazioni e articoli (valori da `tasks_schema.REPARTI`), filtro fisso `cucina` nella UI di S2. Il bar domani costa un filtro, non una migrazione |
| 3 | **`SCARTO` è un tipo di movimento a sé** | lo spreco è un numero interrogabile da solo |
| 4 | **UM da lista chiusa + campo `confezione` libero** | `um` ∈ {KG,G,L,ML,PZ,CF} per valorizzare; `confezione` TEXT per «cassetta», «secchiello», «forma» |
| 5 | **UI a 4 tab: Oggi / Scorte / Frigo / Spesa** | barra fissa sotto il pollice, sezioni autonome |
| 6 | **Gesto principale = il giro del frigo** | → introduce `cucina_giacenze.in_dotazione` (§4.3) |
| 7 | **Frigoriferi gestiti a ripiani, con codice** | → nuova tabella `cucina_ripiani` (§4.1b). **La chiave della giacenza diventa il ripiano, non l'ubicazione**: e' la decisione con piu' peso sullo schema |
| 8 | **Codice ripiano locale** (`1`, `2`, `3` in ogni posto) | `UNIQUE(ubicazione_id, codice)`. Il codice da solo non identifica: la UI mostra sempre «posto · rip. N» |
| 9 | **Ripiani dappertutto, minimo uno** | dispensa e scaffali inclusi. Il ripiano `1` nasce con l'ubicazione: niente `ripiano_id` nullable, niente doppio modo di navigare |
| 10 | **Destinazione d'uso sul ripiano** (crudo/cotto/semilavorati/pronti) | + `cucina_articoli.natura`. Il crudo sul ripiano del cotto viene **segnalato, non bloccato** |
| 11 | **La conta si fa un ripiano alla volta** | → `cucina_conte_ripiani` (§4.5): ci si ferma e si riprende senza perdere il punto |
| 12 | **Un articolo puo' stare su piu' ripiani** | la giacenza di un articolo e' **una somma**, mai una riga. `ripiano_casa_id` dice qual e' quello del giro |
| 13 | **Il tap ciclico resta, bastano gli 8 secondi di annullo** | nessuna conferma sul rosso, nessuna pressione lunga. Il gesto costa un tap |
| 14 | **Dotazione popolata a incolla-testo** | modale tipo `ImportTestoModal` delle bevande, un ripiano alla volta. Niente form riga per riga |
| 15 | **Tanti articoli a regime `MOVIMENTI`** | scelta consapevole → obbliga il meccanismo del dato che invecchia (§3.1) e lo scarico a un tap |
| 16 | **La conta si fa dall'iPhone** | quindi a ripiani, in piedi, davanti allo sportello aperto. Niente tabellone da scrivania |
| 17 | **Fornitore: sia tabellato sia libero** | `fornitore_piva` (anagrafica fatture) + `fornitore_freeform`. Il raggruppamento della spesa preferisce il tabellato |
| 18 | **Freschezza del dato: 5 giorni sul fresco, 21 sul secco** | due chiavi in `cucina_scorte_config`, override per articolo. Oltre la finestra la giacenza si mostra come stima (§3.1) |
| 19 | **Crudo su ripiano cotto: si segnala, non si blocca** | default prudente preso in autonomia il 2026-09-07. Chiave `blocca_incompatibilita_ripiano = 0`: se l'ASL pretende il blocco si gira quella, senza toccare codice |

## 10.1 La sotto-app mobile (S2) — cosa discende da queste scelte

Route `/cucina/mobile`, prefisso classi `cm-` come `CantinaMobile.jsx`, stessa palette e stessa finestra di undo (8s).

| Tab | Cosa mostra | Fonte dati |
|---|---|---|
| **Oggi** | checklist del giorno con tap-to-complete, task singoli, cosa è in ritardo | `/tasks`, `/haccp` — **già esistenti, zero backend nuovo** |
| **Scorte** | ricerca + filtro categoria, articoli mancanti in cima | `/cucina/scorte/articoli/` |
| **Frigo** | **il giro**: elenco ubicazioni in `ordine`; ne apri una e vedi **i ripiani dall'alto in basso**, ognuno con la sua destinazione d'uso e la sua dotazione da spuntare. In testa: temperatura di oggi e guasti aperti | `/cucina/ubicazioni/` |
| **Spesa** | la Lista Spesa, che si riempie da sola da ciò che segni finito. Raggruppata per fornitore: prima i tabellati, in fondo i liberi e chi non ne ha | `/lista-spesa` — **già esistente** |

Due tab su quattro girano su endpoint che esistono già: il lavoro backend di S1 serve ai due centrali.

## 10.2 Restano aperte

- **Il confine col bar sui vini.** Se un giorno accendi il reparto `bar`, le bottiglie aperte al calice sono già gestite dal modulo Vini (`BOTTIGLIA_APERTA`, mescita). Non devono diventare anche articoli di scorta, o avrai due verità sulla stessa bottiglia. Da stabilire quando (e se) si accende il bar.
- **L'avviso crudo-su-cotto: segnale o blocco?** Nel disegno e' un segnale. Un blocco in servizio e' il modo piu' rapido per far smettere la gente di usare l'app — ma se per l'ASL serve il blocco, va deciso prima, non dopo.
- **Quanto dura una conta a 24 ripiani.** Fatta dall'iPhone e a ripiani, si puo' spalmare su piu' giorni; ma allora le quantita' attese dei ripiani contati per primi invecchiano mentre conti gli ultimi. Due strade: la sessione scade dopo N giorni, oppure si accetta e si dichiara la data di conta riga per riga.
- **`fe_fornitore_categoria` non e' un'anagrafica fornitori.** E' la mappa fornitore→categoria delle fatture elettroniche, usata di fatto come registro. Funziona (161 righe con partita IVA), ma il giorno che serve un'anagrafica vera — contatti, WhatsApp per l'ordine, giorni di consegna — va promossa a tabella sua. Attenzione al filtro: per le scorte il flag rilevante e' `escluso_acquisti`, **mai** `escluso` (che e' del modulo Ricette).
- **La soglia per articolo va tarata sull'uso vero.** I default 5/21 sono il punto di partenza; dopo qualche settimana di uso si vedra' quali articoli generano rumore (avviso troppo presto) e quali mentono in silenzio (avviso troppo tardi). E' un parametro da rivedere, non da mettere e dimenticare.
