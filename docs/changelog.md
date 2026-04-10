# 📄 TRGB Gestionale — CHANGELOG
**Formato:** Keep a Changelog

---

## 2026-04-10 — Controllo Gestione v2.0b: Query /uscite come vista aggregatore su fe_fatture

#### New — Fase B.1 del refactoring v2.0 "CG come aggregatore"
- **`GET /controllo-gestione/uscite` riscritto** — la query non seleziona più solo da `cg_uscite`, ma fa LEFT JOIN con `fe_fatture` e legge da lì i campi di pianificazione finanziaria introdotti dalla mig 056 (`data_prevista_pagamento`, `data_effettiva_pagamento`, `modalita_pagamento_override`, `iban_beneficiario`). Per le righe FATTURA, la "verità" viene da `fe_fatture`; `cg_uscite` resta indice di workflow
- **Campi derivati COALESCE** — il backend calcola tre fallback chain direttamente in SQL:
  - `data_scadenza_effettiva` = effettiva → prevista → `u.data_scadenza` (modifiche pre-v2.0) → `f.data_scadenza` (XML analitico)
  - `modalita_pagamento_effettiva` = override utente → XML → default fornitore
  - `iban_beneficiario_effettivo` = IBAN fattura → IBAN spesa fissa → IBAN fornitore
- **Stato normalizzato nel SELECT** — un `CASE` rimappa lo stato in `RATEIZZATA`/`PAGATA` quando `fe_fatture.rateizzata_in_spesa_fissa_id` è valorizzato o `f.data_effettiva_pagamento` è settato, anche se `cg_uscite` non è ancora allineata
- **Filtro `includi_rateizzate` (default: False)** — nuovo query param che di default nasconde le 43 fatture backfilled dalla migrazione 057. Le rateizzate non appaiono più nello Scadenzario e non confluiscono nei totali di riepilogo, restituendo totali corretti al netto delle duplicazioni logiche
- **Binding nominale** — tutti i filtri dinamici ora passano parametri a nome (`:includi_rateizzate`, `:stato`, ecc.) — SQLite non permette alias del SELECT nella WHERE, quindi il COALESCE per le date nel range è duplicato (costo trascurabile)
- **Retrocompatibilità piena** — `row["data_scadenza"]` rimpiazza `data_scadenza_effettiva` via `pop()` lato Python, così la shape del payload JSON è identica a v1.7 e il frontend non richiede modifiche

#### UI — Fase B.1.1 (toggle sidebar rateizzate)
- **Nuovo blocco "Rateizzate" nella sidebar dello Scadenzario Uscite** — toggle viola "Mostra rateizzate" (default OFF). Quando attivo, la fetch passa `?includi_rateizzate=true` al backend e le 43 fatture backfilled tornano visibili in lista
- **Sfondo viola leggero** (`bg-purple-50/40`) sulle righe con stato `RATEIZZATA` + badge permanente "Rateizzata" nella colonna STATO (via `STATO_STYLE.RATEIZZATA`)
- **clearFilters + conteggio activeFilters** aggiornati per includere il nuovo toggle

#### New — Fase B.2 (smart dispatcher modifica scadenza)
- **`PUT /controllo-gestione/uscite/{id}/scadenza` riscritto come dispatcher v2.0** — in base al tipo di uscita la nuova scadenza viene scritta sulla fonte di verità corretta:
  - **FATTURA con `fattura_id`** → scrive su `fe_fatture.data_prevista_pagamento` (nuovo campo introdotto con mig 056). `cg_uscite.data_scadenza` NON viene toccata: la query di lettura la recupera via COALESCE chain preferendo il campo v2.0
  - **Spese fisse / manuali / bancarie** → comportamento legacy su `cg_uscite.data_scadenza` (+ tracciamento `data_scadenza_originale` via COALESCE idempotente)
- **Calcolo delta "originale"** — per le fatture v2.0 il delta giorni viene calcolato rispetto a `fe_fatture.data_scadenza` (XML analitico), non rispetto a `cg_uscite.data_scadenza_originale`: questo perché il primo override su una fattura v2.0 non sporca più cg_uscite, quindi l'XML è l'unica baseline semanticamente corretta
- **Stato workflow ricalcolato in entrambi i rami** — SCADUTA ↔ DA_PAGARE in base a nuova vs oggi, su `cg_uscite.stato` (resta indice di workflow anche per le fatture v2.0)
- **Risposta arricchita** — il payload include `fonte_modifica` (`fe_fatture.data_prevista_pagamento` o `cg_uscite.data_scadenza`) per tracciamento/debug del dispatcher
- **Frontend `apriModaleScadenza`** — inietta una `data_scadenza_originale` semanticamente corretta nel modale: per fatture v2.0 usa `u.data_scadenza_xml` (esposto dal GET /uscite), per le altre resta `u.data_scadenza_originale`
- **Nota `cg_piano_rate`** — non ha colonna `data_scadenza`; per le rate delle spese fisse la scadenza effettiva continua a vivere in `cg_uscite`, quindi il dispatcher resta a 2 rami (non 3 come inizialmente previsto in roadmap)

#### New — Fase B.3 (smart dispatcher IBAN + modalità pagamento)
- **`PUT /controllo-gestione/uscite/{id}/iban`** — nuovo endpoint dispatcher:
  - **FATTURA con `fattura_id`** → `fe_fatture.iban_beneficiario` (campo v2.0 della mig 056)
  - **SPESA_FISSA con `spesa_fissa_id`** → `cg_spese_fisse.iban` (campo nativo)
  - **STIPENDIO / ALTRO / SPESA_BANCARIA** → 422 non supportato (non esiste una fonte stabile dove persistere un override IBAN per questi tipi; vanno editati alla sorgente)
  - IBAN normalizzato (upper, strip, no spazi); `null` o stringa vuota puliscono l'override
- **`PUT /controllo-gestione/uscite/{id}/modalita-pagamento`** — nuovo endpoint dispatcher:
  - **FATTURA con `fattura_id`** → `fe_fatture.modalita_pagamento_override` (il campo XML originale `f.modalita_pagamento` resta intoccato; l'override vince nella COALESCE chain del GET /uscite)
  - **Altri tipi** → 422 non supportato (per le spese fisse la modalità è implicita; stipendi/altri non hanno concetto di codice SEPA MP)
  - Codice MP normalizzato (upper, strip); `null` pulisce l'override e la UI tornerà a mostrare XML/fornitore
  - Risposta include `modalita_pagamento_label` via `MP_LABELS` per consumo diretto da frontend
- **Pattern `fonte_modifica` in risposta** — entrambi gli endpoint ritornano `fonte_modifica` (es. `fe_fatture.iban_beneficiario`) per tracciamento/debug del dispatcher v2.0, stesso contratto di B.2
- **Niente UI in questa fase** — gli endpoint restano "dormienti" fino a Fase D, dove FattureDettaglio arricchito fornirà l'interfaccia utente per override IBAN/modalità. La frontend UX è intenzionalmente rimandata per non sovrapporsi con il modale attuale dello Scadenzario

#### Note architetturali v2.0
- Riferimento: `docs/v2.0-query-uscite.sql` (design SQL con benchmark) e `docs/v2.0-roadmap.md` (Fase A → F)
- Fatto: Fase A (mig 057 backfill 43/43) + B.1 (query aggregatore) + B.1.1 (toggle sidebar rateizzate) + B.2 (dispatcher scadenza) + B.3 (dispatcher IBAN/modalità). Pianificate: D (FattureDettaglio arricchito), E (Scadenzario badge+click-through), F (cleanup docs)

## 2026-04-10 — Controllo Gestione v1.7: Batch pagamenti + stampa intelligente

#### New — Batch di pagamento per stampa e workflow contabile
- **Selezione multipla + stampa** — nello Scadenzario Uscite seleziona più righe e clicca "Stampa / Metti in pagamento": crea un batch tracciato e apre una stampa A4 pulita con fornitore, descrizione, IBAN, importo, totale, caselle OK e firme
- **Migrazione 053** — nuova tabella `cg_pagamenti_batch` (titolo, note, n_uscite, totale, stato, timestamp) + colonne `cg_uscite.pagamento_batch_id` e `cg_uscite.in_pagamento_at` con indici
- **Stati batch** — `IN_PAGAMENTO` → `INVIATO_CONTABILE` → `CHIUSO` (predisposto per la futura dashboard contabile)
- **Backend endpoint** — `POST /uscite/batch-pagamento`, `GET /pagamenti-batch`, `GET /pagamenti-batch/{id}`, `PUT /pagamenti-batch/{id}` (cambio stato), `DELETE /pagamenti-batch/{id}` (scollega le uscite)
- **Badge "In pagamento"** — le righe flaggate mostrano il badge indigo con tooltip titolo batch; riga evidenziata con sfondo indigo leggero
- **Filtro sidebar "Solo in pagamento"** — quick filter per vedere solo le uscite appartenenti a un batch attivo, con contatore
- **Template stampa A4** — header Osteria Tre Gobbi, meta batch, tabella con righe alternate, totale evidenziato, area firme "preparato da / eseguito da". Auto-print dalla nuova finestra con bottoni Stampa/Chiudi

## 2026-04-10 — Controllo Gestione v1.6: Avanzamento piano + ricerca multi-fattura

#### Fix — Scadenzario Uscite: ordinamento per data coerente per stato
- **Reset automatico al cambio tab** — selezionando "Da pagare" o "Scadute" l'ordinamento torna su `data_scadenza ASC` (le più vecchie/urgenti prima); su "Pagate" va `DESC` (le più recenti prima). Prima un click accidentale sulla colonna lasciava lo sort invertito e aprile compariva prima di marzo nella tab Scadute

#### Fix — Rateizzazione: genera subito anche le uscite
- **POST `/spese-fisse` con piano_rate** — oltre a inserire `cg_piano_rate`, crea contestualmente le righe `cg_uscite` con stato `DA_PAGARE` (o `SCADUTA` se la data scadenza è già passata), usando il `giorno_scadenza` clampato al massimo del mese. Prima le uscite comparivano solo dopo aver cliccato "Import uscite", e l'aggregato pagato/residuo restava vuoto per le rateizzazioni appena create
- **Migrazione 052** — backfill: per le rateizzazioni/prestiti già esistenti con `cg_piano_rate` popolato ma senza `cg_uscite`, crea le uscite mancanti così il riepilogo pagato/residuo diventa disponibile anche retroattivamente
- **UI colonna Importo** — la condizione che mostra "Pagato/Residuo" ora si basa su `n_rate_totali > 0` oltre che sui totali, così il blocco appare anche per rateizzazioni con totale pagato ancora a zero

#### New — Avanzamento pagato / residuo in tabella Spese Fisse
- **GET `/spese-fisse` arricchito** — ritorna `totale_pagato`, `totale_residuo`, `n_rate_totali`, `n_rate_pagate`, `n_rate_da_pagare`, `n_rate_scadute` aggregati da `cg_uscite` per ogni spesa fissa
- **UI colonna Importo** — per PRESTITO e RATEIZZAZIONE mostra sotto l'importo di riferimento le righe "Pagato € X · (n/tot)" e "Residuo € Y · scadute" con mini progress bar verde

#### New — Ricerca fatture + multi-selezione nel wizard Rateizzazione
- **Campo ricerca** — ricerca solida multi-token (accenti/spazi ignorati) su fornitore, numero fattura, data, anno, importo
- **Multi-select** — checkbox per selezionare più fatture e rateizzarle insieme (sum dei totali, titolo auto-generato in base al numero di fornitori unici)
- **Seleziona tutte visibili** — azione rapida per togglare tutte le fatture filtrate
- **Riepilogo selezione** — contatore fatture selezionate e totale cumulativo sempre visibile

---

## 2026-04-10 — Controllo Gestione v1.5: Piano rate prestiti

#### New — Piano di ammortamento visualizzabile per prestiti e rateizzazioni
- **Modale Piano rate** — pulsante "Piano" sulle righe di tipo PRESTITO / RATEIZZAZIONE apre una tabella con tutte le rate (numero, periodo, scadenza, importo pianificato, importo pagato, stato)
- **Riepilogo KPI** — rate totali / pagate / da pagare / scadute, totale pagato, totale residuo
- **Edit inline** — importi editabili per le rate non ancora pagate (rate PAGATA / PARZIALE sono in sola lettura)
- **Sync automatico** — il salvataggio aggiorna anche `cg_uscite.totale` per le righe non pagate, così il tabellone uscite riflette i nuovi importi
- **"Adegua" nascosto per prestiti** — sostituito da "Piano": per AFFITTO / ASSICURAZIONE resta l'adeguamento ISTAT classico

#### Backend — endpoint piano-rate arricchito
- **GET `/spese-fisse/{id}/piano-rate`** — ora ritorna `spesa` (meta), `rate` (con LEFT JOIN `cg_uscite` per stato, scadenza, importo pagato), e `riepilogo` aggregato
- **POST `/spese-fisse/{id}/piano-rate`** — nuovo parametro `sync_uscite` (default `true`): propaga l'importo modificato sulle uscite non ancora pagate

---

## 2026-04-06 — Gestione Clienti v2.0: CRM completo con marketing, coppie, impostazioni

#### New — Segmenti marketing configurabili
- **Soglie dinamiche** — abituale/occasionale/nuovo/perso configurabili da UI (tabella `clienti_impostazioni`)
- **Pagina Impostazioni** — nuova sezione con sidebar: Segmenti, Import/Export, Duplicati, Mailchimp
- **Preview regole** — visualizzazione in tempo reale delle regole segmento con le soglie impostate

#### New — Coppie (nome2/cognome2)
- **Campi coppia** — `nome2`, `cognome2` in DB, modello Pydantic, PUT endpoint, tab Anagrafica
- **Header coppia** — mostra "Marco & Laura Rossi" o "Marco & Laura Rossi / Bianchi" in scheda e lista
- **Merge come coppia** — checkbox "Salva come coppia" sia nella scheda (merge manuale) che nella pagina duplicati
- **Ricerca** — nome2/cognome2 inclusi nella ricerca fulltext clienti e prenotazioni
- **Template WA** — supporto variabile `{nome2}` nei messaggi WhatsApp personalizzati

#### New — WhatsApp Opzione A
- **Broadcast personalizzato** — pannello WA nella lista con template `{nome}/{cognome}/{nome2}`, link wa.me individuali
- **Filtro destinatari** — solo clienti filtrati con telefono valido

#### New — Integrazione Mailchimp (Fase 1+2)
- **Backend** — `mailchimp_service.py` con stdlib urllib, merge fields custom (PHONE, BIRTHDAY, CITTA, RANK, SEGMENTO, ALLERGIE, PREFCIBO)
- **Sync contatti** — upsert con tags CRM + segmento + VIP + rank
- **Pagina Mailchimp** — stato connessione, pulsante sync, KPI risultati, guida configurazione

#### New — Pulizia dati
- **Filtro telefoni placeholder** — numeri finti TheFork (`+39000...`) esclusi automaticamente da duplicati e import
- **Endpoint pulizia telefoni** — `POST /pulizia/telefoni-placeholder` svuota numeri finti dal DB
- **Normalizzazione testi** — `POST /pulizia/normalizza-testi` converte CAPS/minuscolo in Title Case (nomi, cognomi, città)
- **Pulsanti UI** — "Pulisci tel. finti" e "Normalizza testi" nella pagina Duplicati

#### New — Auto-merge duplicati ovvi
- **Preview** — analisi automatica gruppi con stesso telefono+cognome o email+cognome
- **Batch merge** — conferma unica per tutti i gruppi ovvi, scelta principale automatica (più prenotazioni > protetto > ID basso)

#### New — Marketing toolbar
- **Copia email/telefoni** — bulk copy negli appunti dalla lista filtrata
- **Export CSV** — esportazione con BOM UTF-8, separatore `;` per Excel italiano
- **Note rapide** — aggiunta nota dal list view senza aprire la scheda

#### New — Compleanni
- **Azioni rapide** — pulsanti WhatsApp e email per auguri direttamente dalla dashboard

#### Changed — Riorganizzazione UI
- **Sidebar impostazioni** — Import, Duplicati, Mailchimp spostati dentro Impostazioni con sidebar laterale
- **ClientiNav** — semplificata a 4 tab: Anagrafica, Prenotazioni, Dashboard, Impostazioni
- **Scheda inline** — apertura cliente nella lista senza navigazione (pattern embedded come SchedaVino)
- **Fix duplicati** — aggiunto filtro `attivo = 1` su tutte le query duplicati (clienti mergiati non riappaiono)

#### Changed — push.sh
- **Output pulito** — colori, sezioni con icone, rumore git nascosto
- **Verbose di default** — dettaglio per ogni DB e log deploy, `-q` per silenzioso
- **Fix macOS** — rimosso `grep -P` (non disponibile su Mac)

---

## 2026-04-06 — Gestione Clienti v1.1: Protezione dati, merge duplicati, export

#### New — Merge e Deduplicazione
- **Merge duplicati** — UI 3 step (seleziona principale → spunta secondari → conferma), merge batch, trasferimento prenotazioni/note/tag/alias
- **Filtri duplicati** — 3 modalità ricerca: telefono, email, nome e cognome
- **"Non sono duplicati"** — esclusione coppie da suggerimenti (es. marito/moglie stesso telefono), tabella `clienti_no_duplicato`
- **Export Google Contacts** — CSV compatibile Gmail/Google Contacts con nome, email, telefoni, compleanno, allergie, tag come gruppi

#### New — Protezione dati CRM vs TheFork
- **Campo `protetto`** — clienti modificati manualmente o mergati vengono protetti dall'import TheFork
- **Import intelligente** — clienti protetti: solo riempimento campi vuoti + aggiornamento rank/spending/date; clienti non protetti: sovrascrittura completa
- **Tag auto/manual** — `auto=1` per tag da import (es. VIP), `auto=0` per tag CRM manuali (intoccabili dall'import)
- **Alias merge** — tabella `clienti_alias` per mappare thefork_id secondari al principale, riconoscimento automatico in import clienti e prenotazioni

#### New — Revisione Diff Import
- **Coda revisione** — tabella `clienti_import_diff` salva le differenze tra CRM e TheFork per clienti protetti
- **UI revisione** — sezione nella pagina Import con diff campo per campo (valore CRM → valore TheFork)
- **Azioni per diff** — Applica singolo, Ignora singolo, Applica/Ignora tutto per cliente, Applica/Ignora globale
- **Badge notifica** — tab Import nella Nav mostra badge amber con conteggio diff pending
- **Risultato import** — dopo l'import mostra quante differenze sono state trovate

#### Changed
- DB schema: 8 tabelle (aggiunte `clienti_alias`, `clienti_no_duplicato`, `clienti_import_diff`, colonne `protetto` e `auto`)
- `clienti_router.py` ~1350 righe (+merge, duplicati, export, diff/risolvi)
- `ClientiDuplicati.jsx` — riscritta completamente con flow 3-step
- `ClientiImport.jsx` — sezioni Export + DiffReview con azioni batch
- `ClientiNav.jsx` — badge diff count su tab Import
- `push.sh` — refactoring flag (-f, -m, -d), aggiunto `clienti.sqlite3` a sync DB

---

## 2026-04-06 — Gestione Clienti v1.0: Nuovo modulo CRM completo

#### New — Modulo Gestione Clienti CRM
- **Anagrafica clienti** — lista con filtri (ricerca, VIP, rank, tag, attivi/inattivi), paginazione, ordinamento colonne
- **Scheda cliente** — layout 3 colonne: anagrafica + preferenze + diario note + storico prenotazioni, edit inline, gestione tag
- **Import TheFork clienti** — import XLSX con upsert su thefork_id (27k+ clienti), pulizia numeri telefono, auto-tag VIP
- **Import TheFork prenotazioni** — import XLSX con upsert su booking_id (31k+ prenotazioni), collegamento automatico a clienti via Customer ID
- **Storico Prenotazioni** — vista globale con filtri (stato, canale, date), badge colorati per stato, paginazione
- **Dashboard CRM** — KPI clienti + prenotazioni, compleanni 7gg, top 20 clienti per visite, distribuzione rank/tag/canale, andamento mensile 12 mesi, copertura contatti
- **Diario note** — note tipizzate (nota/telefonata/evento/reclamo/preferenza) per ogni cliente
- **Tag system** — 7 tag predefiniti + CRUD, toggle rapido nella scheda cliente
- **DB dedicato** `clienti.sqlite3` con 5 tabelle: clienti, clienti_tag, clienti_tag_assoc, clienti_note, clienti_prenotazioni

#### Files
- `app/models/clienti_db.py` — init DB + schema + trigger + indici
- `app/routers/clienti_router.py` — ~900 righe, tutti gli endpoint CRM + import
- `frontend/src/pages/clienti/` — 7 componenti (Menu, Nav, Lista, Scheda, Dashboard, Import, Prenotazioni)
- Modificati: main.py, modules.json, versions.jsx, modulesMenu.js, Home.jsx, App.jsx

---

## 2026-04-05 — Vendite v4.2 + Sistema v5.3: Turni chiusi parziali, refactoring logging/DB

#### New — Turni chiusi parziali
- Nuovo campo `turni_chiusi` in closures_config.json per chiusure di singoli turni (es. Pasqua solo pranzo)
- Modello Pydantic `TurnoChiuso` (data, turno, motivo) con validazione nel PUT
- Sezione "Turni singoli chiusi" in CalendarioChiusure.jsx (form + tabella + indicatore calendario)
- Badge grigio "cena chiusa — motivo" nella lista chiusure turno (ChiusureTurnoLista.jsx)
- Badge ambra "solo pranzo/cena" nella dashboard corrispettivi (tabella dettaglio + calendario heatmap)
- Form ChiusuraTurno.jsx: campi disabilitati + banner avviso se turno chiuso

#### Fixed — DELETE chiusura turno
- Nomi tabelle errati nel DELETE: checklist_responses → shift_checklist_responses, shift_closure_preconti → shift_preconti, shift_closure_spese → shift_spese

#### Refactor — Logging strutturato (Sistema v5.3)
- logging.basicConfig in main.py, print() → logger.info/warning/error in 20 file
- logger.exception() in 25+ except silenti (admin_finance, banca, ipratico, carta_vini, ecc.)
- Rimossi console.log debug dal frontend

#### Refactor — Centralizzazione connessioni DB
- Nuova funzione get_db(name) in app/core/database.py con context manager (WAL + FK + busy_timeout)
- Migrati 11 router/service da sqlite3.connect() inline a get_db()

#### Refactor — Error handler globale
- @app.exception_handler(Exception) in main.py: log + risposta JSON uniforme 500

---

## 2026-04-02 — Vendite v4.1: Colonne Fatture/Totale, DELETE chiusura, Incassi, Export corretto

#### New — Chiusure Turno Lista: colonne Fatture e Totale
- Colonna Fatture sempre visibile (anche se 0) per allineamento tabella
- Colonna Totale (RT + Fatture) nella riga riepilogo giorno, KPI mobile, e totali periodo
- In modalità TEST: Pre-conti, Incassi, Differenza visibili
- RT cena calcolato correttamente: cena.preconto - pranzo.preconto (era: usava il totale giornaliero)
- Riepilogo periodo convertito da griglia a `<table>` HTML per allineamento consistente

#### New — Elimina chiusura (admin)
- Endpoint DELETE `/admin/finance/shift-closures/{id}` con cascata su checklist, preconti, spese
- Pulsante Elimina con doppia conferma nella lista chiusure (solo admin)

#### New — Blocco date future
- Backend: rifiuta POST chiusura con data futura (HTTP 400)
- Frontend: attributo `max={today}` su input data + validazione in handleSave

#### Changed — Dashboard: Corrispettivi → Incassi
- Rinominato "Totale Corrispettivi" → "Totale Incassi" in tutta la CorrispettiviDashboard
- Label grafici, tooltip, header tabelle aggiornati

#### Fixed — Export corrispettivi legge shift_closures
- Nuova funzione `_merge_shift_and_daily()` in corrispettivi_export.py
- Merge: shift_closures (primario) + daily_closures (fallback per date mancanti)
- Prima leggeva solo daily_closures (dati stantii da import Excel)

#### Fixed — closures_config.json protetto al deploy
- Aggiunto a push.sh nella lista files runtime (backup pre-push + restore post-push)

---

## 2026-04-01 — Controllo Gestione v1.4: Rate Variabili, Prestiti, Segna Pagata

#### New — Segna pagata da Acquisti
- Bottone "Segna pagata" su fatture non pagate nell'elenco fatture e nel dettaglio fornitore
- Endpoint `POST /fattura/{id}/segna-pagata-manuale`: crea/aggiorna cg_uscite con stato PAGATA_MANUALE
- Se metodo_pagamento = CONTANTI marca direttamente PAGATA
- Aggiorna anche `fe_fatture.pagato = 1`

#### New — Piano rate variabili (prestiti alla francese)
- Tabella `cg_piano_rate` (migrazione 048): spesa_fissa_id, numero_rata, periodo, importo, note
- Generazione uscite usa piano_rate se esiste, altrimenti importo fisso dalla spesa
- CRUD endpoints: GET/POST/DELETE `/spese-fisse/{id}/piano-rate`
- Supporto `importo_originale` e `spese_legali` su cg_spese_fisse (migrazione 049)

#### New — Wizard rateizzazione migliorato
- Step 2: campo spese legali, preview totale (fattura + spese), griglia 3 colonne
- Step 3: tabella rate editabili con importo modificabile per singola rata
- Validazione totale (somma rate = importo fattura + spese legali)
- Bottone "Ricalcola uguali" per ridistribuire equamente
- Feedback campi mancanti con avviso ambra
- Salvataggio invia piano_rate + importo_originale + spese_legali al backend

#### New — Prestiti BPM (migrazione 047)
- BPM 1: 72 rate mensili (mar 2021 - feb 2027), giorno 26
- BPM 2: 120 rate mensili (apr 2021 - mar 2031), giorno 19
- Rate pre-2026 marcate PAGATA, dal 2026 DA_PAGARE
- Ogni rata con importo esatto dal piano di ammortamento

#### Fixed — Pulizia duplicati banca (migrazione 046)
- 398 movimenti duplicati da reimport CSV con formato diverso
- Dedup basato su hash normalizzato (lowercase, spazi, primi 50 char)
- Preservati tutti i link CG/banca esistenti (remapping su record keeper)
- Da 921 a 523 movimenti

#### Fixed — Persistenza privilegi utenti
- users.json e modules.json rimossi dal tracking git (.gitignore)
- push.sh: backup in /tmp prima del push, ripristino dopo checkout

---

## 2026-03-31 — Flussi di Cassa v1.4: Categorie Registrazione Dinamiche

#### New — Categorie registrazione configurabili
- Tabella `banca_categorie_registrazione` con codice, label, tipo, pattern auto-detect, colore, ordine
- Migrazione 045 con seed delle 12 categorie iniziali (8 uscita + 4 entrata)
- Nuovo tab "Categorie Registrazione" nelle Impostazioni Flussi di Cassa
- CRUD completo: crea, modifica, attiva/disattiva categorie
- Pattern auto-detect configurabili (con supporto soglie importo)
- Colore personalizzabile per ogni categoria
- Frontend Riconciliazione carica categorie dinamicamente dall'API
- Endpoint: GET/POST `/banca/categorie-registrazione`, PUT/PATCH per update/toggle

---

## 2026-03-31 — Flussi di Cassa v1.3: Riconciliazione Completa

#### New — Registrazione diretta movimenti bancari
- Bottone "Registra" nel tab Senza match per categorizzare movimenti senza fattura/spesa fissa
- Supporto entrate (POS, contanti, bonifici) e uscite (commissioni, bollo, carta, RIBA, SDD)
- Auto-detect categoria dalla descrizione bancaria
- Tabella `cg_entrate` per tracciare entrate nel CG
- Endpoint `POST /banca/cross-ref/registra` e `DELETE /banca/cross-ref/registra/{id}`
- Badge colorati per tutte le categorie registrazione

#### Fixed — Dedup aggressivo movimenti bancari (migrazione 042)
- I due CSV importavano lo stesso movimento con descrizioni leggermente diverse (spazi, troncature)
- Normalizzazione: lowercase + collasso spazi multipli + primi 50 char
- Rimossi ~16 duplicati residui non catturati dalla migrazione 041
- `_dedup_hash()` allineato alla nuova normalizzazione per prevenire futuri duplicati

#### New — Selezione multipla e registrazione bulk
- Checkbox su ogni movimento nel tab "Senza match" per selezione multipla
- "Seleziona tutti" nell'header tabella (solo pagina visibile)
- Barra azioni bulk: conteggio selezionati, totale importo, scelta categoria
- Endpoint `POST /banca/cross-ref/registra-bulk` — registra N movimenti in una transazione
- Reset selezione al cambio tab

#### New — Data pagamento contanti personalizzabile
- Date picker nel form di registrazione pagamento contanti (GestioneContanti)
- Permette di retrodatare pagamenti storici (prima era sempre la data odierna)

#### Fixed — Pulizia link orfani (migrazione 043)
- Rimossi link in `banca_fatture_link` che puntavano a fatture cancellate
- Eliminati link duplicati (stessa fattura collegata a più movimenti)
- Discrepanza 46 collegati vs 43 scadenzario risolta

#### Changed — Display stipendi nel cross-ref
- Stipendi mostrano "Paga di [mese]" invece della data scadenza
- Nome dipendente senza prefisso "Stipendio - "
- Backend passa `periodo_riferimento` nelle query CG

---

## 2026-03-31 — Flussi di Cassa v1.2: Riconciliazione Spese

#### New — Riconciliazione Spese (ex Cross-Ref Fatture)
- Rinominato "Cross-Ref Fatture" → "Riconciliazione Spese"
- Match movimenti bancari non solo con fatture ma anche con spese fisse, affitti, tasse, rate, assicurazioni
- Tabella con colonne ordinabili (Data, Importo) al posto delle card
- 3 tab: Suggerimenti (match automatici), Senza match (ricerca manuale), Collegati (riconciliati)
- Filtro testo globale per descrizione/fornitore/importo
- Ricerca manuale: cerca sia in fatture che in cg_uscite non collegate
- Badge tipo spesa colorato (Fattura, Affitto, Tassa, Stipendio, Rata, Assicurazione…)
- Nuovo endpoint `GET /banca/cross-ref/search` (unificato fatture + uscite)
- `POST /banca/cross-ref/link` accetta sia `fattura_id` che `uscita_id`
- `DELETE /banca/cross-ref/link/{id}` gestisce sia link fattura che uscita diretta (prefisso "u")

#### Fixed — CG v1.3: Import uscite riconcilia con cross-ref bancario
- L'import uscite ora fa LEFT JOIN con `banca_fatture_link` + `banca_movimenti`
- Fatture già collegate a movimenti bancari via cross-ref vengono importate come PAGATA
- Fatture esistenti DA_PAGARE/SCADUTA con cross-ref vengono aggiornate a PAGATA
- Fatture PAGATA_MANUALE senza `banca_movimento_id` vengono arricchite se esiste cross-ref

---

## 2026-03-30 — Cantina v3.8: unificazione Carta Vini PDF/DOCX

#### Changed — Carta Vini endpoint unificati
- Tutti i bottoni "Carta PDF" e "Scarica Word" ora puntano a `/vini/carta/pdf` e `/vini/carta/docx`
- Rimossi endpoint duplicati `/vini/cantina-tools/carta-cantina/pdf` e `/docx`
- Nome file download unificato: `carta-vini.pdf` / `carta-vini.docx` (senza date nel nome)
- Endpoint pubblici — non richiedono più token in query string

---

## 2026-03-30 — Sistema v5.0: Header flyout, Impostazioni standalone

#### Changed — Header v4.1: menu navigazione flyout
- Click sul nome modulo in alto a sinistra → dropdown con lista moduli
- Hover su un modulo → pannello flyout laterale con sotto-menu, allineato alla riga
- Click su modulo → navigazione alla homepage; click su sotto-voce → navigazione diretta
- Safe-zone invisibile + intent detection (stile Amazon) per evitare flicker diagonale
- Configurazione moduli centralizzata in `modulesMenu.js` (usata da Home e Header)

#### Changed — Impostazioni modulo standalone
- Rimosso hub "Amministrazione" (AdminMenu.jsx non più referenziato)
- `/admin` → redirect automatico a `/impostazioni`
- Impostazioni con 3 tab: Utenti & Ruoli, Moduli & Permessi, Backup
- Query param `?tab=utenti|moduli|backup` per link diretto ai tab
- Accesso consentito a ruoli admin e superadmin
- Pulsante "Torna" → Home (non più /admin)
- `/admin/dipendenti/*` → redirect a `/dipendenti` (modulo top-level)

#### Fixed — Controllo Gestione v1.2: sync import e stato contanti
- Import uscite: sync completo di totale, numero_fattura, data_fattura, fornitore per righe non pagate
- Pulizia fatture azzerate: se totale fattura scende a 0, uscita marcata PAGATA con nota
- Pagamenti CONTANTI → stato PAGATA (non PAGATA_MANUALE), migrazione 040 retroattiva
- `cleanFatt()` helper per &mdash; e stringhe vuote nel numero fattura
- Ricerca uscite-da-pagare: COALESCE per ordinamento scadenze NULL, caricamento automatico

#### Changed — Flussi di Cassa v1.1
- Movimenti Contanti: sub-tab "Pagamenti spese" e "Versamenti in banca"
- Pagamenti spese: ricerca uscite, selezione multipla, segna-pagate-bulk con CONTANTI
- Backend: endpoint movimenti-contanti e uscite-da-pagare con alias `totale AS importo`
- Frontend: fallback `importo_pagato || importo` per display corretto

---

## 2026-03-30 — Movimenti Contanti: pagamento spese in contanti

#### Changed — Sezione "Contanti da versare" → "Movimenti Contanti"
- Sidebar Gestione Contanti: voce rinominata con icona 💶
- Due sub-tab interni: **Pagamenti spese** e **Versamenti in banca**

#### Added — Sub-tab "Pagamenti spese" (SubPagamentiContanti)
- Lista pagamenti contanti del mese (da CG uscite con metodo_pagamento=CONTANTI)
- Form di registrazione: ricerca uscite da pagare (fornitore/n° fattura), selezione multipla con checkbox
- Chiamata a `segna-pagate-bulk` con `metodo_pagamento: "CONTANTI"`
- KPI: totale pagamenti contanti del mese, n. operazioni
- Badge tipo: Fattura (blue), Spesa fissa (amber), Stipendio (violet)

#### Added — Backend endpoints per movimenti contanti
- `GET /controllo-gestione/movimenti-contanti?anno=X&mese=Y` — lista uscite pagate in contanti
- `GET /controllo-gestione/uscite-da-pagare?search=X` — uscite con stato DA_PAGARE/SCADUTA/PARZIALE (max 50)

#### Unchanged — Sub-tab "Versamenti in banca"
- Funzionalità identica alla vecchia "Contanti da versare" (tracking contanti fiscali + versamenti)

---

## 2026-03-30 — Flussi di Cassa v1.0: Riorganizzazione modulo Banca

#### Changed — Banca rinominato in "Flussi di Cassa"
- **Home tile**: "Banca" → "Flussi di Cassa" con nuova descrizione
- **Tab navigation**: FlussiCassaNav sostituisce BancaNav su tutte le pagine
- **Routes**: `/flussi-cassa/*` con redirect automatici da `/banca/*`
- **Moduli visibilità**: ruolo SALA può accedere a Flussi di Cassa (per vedere Mance)

#### Added — Nuova struttura tab
- **Dashboard**: panoramica unificata (invariato, ex Banca Dashboard)
- **Conti Correnti**: movimenti + cross-ref fatture (ex Banca Movimenti)
- **Carta di Credito**: scheletro pronto (import estratto conto, riconciliazione CG) — prossimamente
- **Contanti**: spostato da Vendite → include contanti da versare, pre-conti, spese turno, spese varie
- **Mance**: spostato da Vendite → tab dedicata visibile a tutti i ruoli
- **Impostazioni**: import CSV + categorie bancarie

#### Changed — VenditeNav semplificato
- Rimossi tab "Contanti" e "Mance" (ora in Flussi di Cassa)
- Redirect automatici: `/vendite/contanti` → `/flussi-cassa/contanti`, `/vendite/mance` → `/flussi-cassa/mance`

---

## 2026-03-30 — Sessione 18b: Fix Stipendi CG + Mance

#### Fixed — Scadenzario CG: display stipendi
- Le righe stipendio nello scadenzario mostravano "Fattura" come categoria e "—" come descrizione
- Aggiunto branch `isStipendio` nel rendering tabella: badge viola "Stipendio", descrizione con mese di riferimento, riga sfondo viola chiaro

#### Added — Gestione Contanti: pagina Mance
- Nuova sezione "Mance" nella sidebar Gestione Contanti (5a voce con icona 🎁)
- Lista mance registrate dalle chiusure turno, filtrabili per mese/anno
- KPI: totale mance mese, turni con mance, giorni con mance
- Tabella con data, turno (pranzo/cena), importo, coperti, €/coperto, note
- Footer con totali mensili — utile per distribuzione mance al personale

---

## 2026-03-30 — Buste Paga v2.0: Import PDF LUL automatico

#### Added — Parser PDF LUL (Libro Unico Lavoro)
- **Upload PDF**: pulsante "Import PDF LUL" nella pagina Buste Paga
- **Parser automatico**: estrae cedolini dal PDF del consulente (formato TeamSystem)
- Dati estratti per dipendente: netto, lordo, INPS, IRPEF, addizionali, TFR, ore lavorate, IBAN, codice fiscale
- **Abbinamento automatico**: match dipendente per codice fiscale o cognome+nome
- **Report risultati**: mostra importati, non abbinati (da aggiungere in anagrafica), errori
- **Auto-aggiornamento anagrafica**: aggiorna IBAN e codice fiscale se mancanti
- Genera automaticamente scadenze stipendio nello Scadenzario CG
- Nuovi campi anagrafica dipendenti: codice_fiscale, data_nascita, tipo_rapporto, livello, qualifica
- Badge "PDF" sui cedolini importati da file (vs inseriti manualmente)
- `pdfplumber` aggiunto a requirements.txt

---

## 2026-03-30 — Dipendenti v2.0: Modulo Top-Level + Buste Paga + Scadenze Documenti

### Dipendenti promosso a modulo top-level

#### Changed
- **Dipendenti** non è più sotto Amministrazione: ha la sua tile nella Home
- **Amministrazione** sostituita da due tile separate: "Dipendenti" e "Impostazioni"
- Routes migrate da `/admin/dipendenti/*` a `/dipendenti/*` (redirect automatici)
- File frontend spostati in `pages/dipendenti/` (directory dedicata)

#### Added — Buste Paga (v1.0)
- **Inserimento cedolini**: form completo con netto, lordo, INPS, IRPEF, addizionali, TFR, ore
- **Integrazione Scadenzario**: ogni cedolino genera automaticamente una scadenza in Controllo Gestione (tipo STIPENDIO)
- **Vista per mese**: cedolini raggruppati per mese con totali netto/lordo
- **Endpoint backend**: `GET/POST/DELETE /dipendenti/buste-paga`
- Import PDF dal consulente: predisposto (v1.1 dopo analisi del formato)

#### Added — Scadenze Documenti (v1.0)
- **Semaforo**: indicatori verde (valido), giallo (in scadenza), rosso (scaduto)
- **Tipi predefiniti**: HACCP, Sicurezza generale/specifica, Antincendio, Primo soccorso, Visita medica, Permesso soggiorno
- **Alert configurabile**: giorni di preavviso personalizzabili per tipo (default 30-90gg)
- **CRUD completo**: crea, modifica, elimina scadenze con filtri per stato/tipo/dipendente
- **Endpoint backend**: `GET/POST/PUT/DELETE /dipendenti/scadenze`

#### Added — Database
- Tabelle: `buste_paga`, `dipendenti_scadenze`, `dipendenti_presenze`, `dipendenti_contratti`
- Colonne su `dipendenti`: `costo_orario`, `giorno_paga`
- Tipo uscita STIPENDIO nel frontend Scadenzario (badge viola)

#### Added — Scadenzario miglioramenti
- **Filtri rapidi periodo**: mese corrente, prossimo, 7gg, 30gg, trimestre, anno
- **Modifica scadenza su click**: modale con indicatore arretrato (>10gg)
- **Selezione multipla + pagamento bulk**: checkbox, barra azioni, metodo pagamento
- **Fix frecce ordinamento**: risolto testo "updownarrow" con carattere Unicode
- **Ricerca ampliata**: note, periodo, tipo, importo, data

---

## 2026-03-30 — Controllo Gestione v1.1: Riconciliazione Banca + Spese Fisse v2.0 + Rimozione Finanza

### Rimozione Modulo Finanza

#### Removed
- **Modulo Finanza v1.0**: completamente rimosso da codebase (router, frontend, config)
- **Router**: `finanza_router.py` e `finanza_scadenzario_router.py` eliminati
- **Frontend**: componenti Finanza eliminate da `src/pages/`
- **Database**: tabelle finanza_movimenti, finanza_categorie, finanza_scadenzario (legacy, non più popola)
- **Menu**: tile Finanza rimosso da home page
- **Routing**: rotte `/finanza/*` eliminate

#### Note
- Le funzionalità di Finanza (scadenzario, categorie pagamenti) sono state integrate in Controllo Gestione
- Le migrazioni 015-019 rimangono nel database per tracciabilità, ma non sono più utilizzate
- Documentazione aggiornata (architettura.md, database.md, readme.md, roadmap.md)

### Spese Fisse (ControlloGestioneSpeseFisse.jsx v2.0)

#### Added
- **Pannello scelta creazione**: 6 modalita (Affitto, Prestito, Assicurazione, Tasse, Rateizzazione, Manuale)
- **Wizard Affitto**: guidato con campi locale/indirizzo, proprietario, canone, giorno pagamento, periodo
- **Wizard Prestito/Mutuo**: guidato con banca, rata, giorno addebito, prima/ultima rata
- **Wizard Assicurazione**: nuova categoria con compagnia, polizza, premio, frequenza pagamento
- **Template Tasse**: selezione multipla da 8 template (F24 IVA, IRPEF, INPS, TARI, IMU, ecc.) con importi personalizzabili
- **Rateizzazione**: da fattura esistente o importo libero, calcolo automatico rata, preview, data fine
- **Categoria ASSICURAZIONE**: aggiunta a backend (TIPO_SPESA, sf_tipo_labels) e frontend

### Scadenzario Uscite (ControlloGestioneUscite.jsx v3.0)

#### Added
- **Riconciliazione banca**: nuova colonna "Banca" con icone per collegare uscite a movimenti bancari
- **Modale candidati**: click sull'icona viola mostra movimenti bancari compatibili (importo +-10%, data +-15gg)
- **Match scoring**: indica % di corrispondenza importo, evidenzia "Match esatto" quando >= 99%
- **Flusso stati**: PAGATA_MANUALE + match banca → PAGATA (confermata). Scollega riporta a PAGATA_MANUALE
- **KPI riconciliazione**: contatore nella sidebar e nella barra KPI
- **Filtro automatico**: esclude movimenti gia collegati ad altre uscite

### Backend (controllo_gestione_router.py)

#### Added
- `GET /uscite/{id}/candidati-banca` — trova movimenti bancari candidati al match
- `POST /uscite/{id}/riconcilia` — collega uscita a movimento, stato → PAGATA
- `DELETE /uscite/{id}/riconcilia` — scollega, stato → PAGATA_MANUALE
- Riepilogo: num_riconciliate e num_da_riconciliare nel GET /uscite

---

## 2026-03-23 — Gestione Vendite v4.0: Dashboard unificata 3 modalita', chiusure configurabili, cleanup fiscale

### Dashboard unificata (CorrispettiviDashboard.jsx — rewrite completo)

#### Added
- **Mode switcher**: 3 modalita' (Mensile / Trimestrale / Annuale) con pillole in alto a destra
- **Modalita' Trimestrale**: aggrega 3 mesi, KPI, grafico, composizione pagamenti, tabella giornaliera, confronto pari trimestre anno precedente
- **Modalita' Annuale**: grafico a barre mensili anno vs anno-1, tabella mensile dettagliata con variazioni, integrata nella dashboard (era pagina separata)
- **Confronto YoY smart**: quando il periodo e' in corso, confronta solo fino allo stesso giorno del calendario
- **Navigazione adattiva**: prev/next si adattano al periodo (mese/trimestre/anno)
- **Confronto anno precedente** in tutte le modalita' con linea tratteggiata/barre grigie

#### Changed
- **Contanti come residuo** (v3.0-fiscale): corrispettivi - pagamenti elettronici = contanti (quadra sempre)
- **Rimossi**: Totale Incassi, colonna differenze, alert discrepanze dalla dashboard
- **Top/bottom days**: esclusi giorni con corrispettivi = 0 (chiusure)

#### Removed
- **Pagina annuale separata** (`CorrispettiviAnnual.jsx` / `/vendite/annual`) — integrata nella dashboard
- **Tab "Annuale"** dalla barra di navigazione VenditeNav
- **Tile "Confronto Annuale"** dal menu Vendite

### Chiusure configurabili

#### Added
- **`closures_config.json`**: giorno chiusura settimanale (0-6) + array giorni chiusi (ferie/festivita')
- **`closures_config_router.py`**: GET/PUT `/settings/closures-config/` con validazione
- **`CalendarioChiusure.jsx`**: UI calendario per toggle chiusure — pulsanti giorno settimanale, griglia mensile, lista date chiuse
- **Logica priorita' chiusura**: DB flag > dati reali > config festivita' > giorno settimanale

### Impostazioni Vendite (sidebar layout)

#### Changed
- **`CorrispettiviImport.jsx`** riscritto con sidebar layout (pattern ViniImpostazioni): menu a sinistra con "Calendario Chiusure" e "Import Corrispettivi"

### Pre-conti e accesso

#### Changed
- **Pre-conti nascosti**: rimossi dalla nav e dalla sezione Chiusure Turno, spostati dentro Impostazioni (solo superadmin)
- **Default mese corrente** per filtro pre-conti (era "ultimi 30 giorni")
- **Home page superadmin**: fix moduli vuoti — aggiunto "superadmin" a tutti i moduli in modules.json + fallback frontend

### Chiusure Turno Lista

#### Changed
- **Espansione diretta**: rimosso doppio click (expandedTurno/renderTurnoDetail), ora mostra tutti i dati al primo expand

### Versioni
- `corrispettivi` (Gestione Vendite): v2.0 → v4.0
- `sistema`: v4.3 → v4.5

---

## 2026-03-22 — Gestione Acquisti & FattureInCloud v2.1: FIC API v2 enrichment, SyncResult tracking, fix UI escluso

### Backend: fe_import.py (fatture list/import)

#### Changed
- **Rimosso `escluso` field dalla query `/fatture`** — il flag `fe_fornitore_categoria.escluso` è solo per il modulo product matching, non per acquisti
- **Rimosso LEFT JOIN con `fe_fornitore_categoria`** dalla list endpoint `/fatture` e stats endpoints (fornitori, mensili)
- **`_EXCL_JOIN` ora contiene solo category JOIN** (per drill-down dashboard), `_EXCL_WHERE` filtra solo autofatture
- **Import XML arricchisce fatture FIC**: quando un import XML matcha una fattura FIC esistente (piva+numero+data), aggiunge le righe XML (righe) se la fattura FIC ha `is_detailed: false` (ritorna zero righe da FIC API)
- **Import XML aggiorna importi** da XML SdI (imponibile, IVA, totale) quando arricchisce fatture FIC

### Backend: fattureincloud_router.py (FIC sync)

#### Added
- **SyncResult ora include `items` list** — ogni fattura sincronizzata è tracciata con fornitore, numero, data, totale, stato (nuova/aggiornata/merged_xml)
- **SyncResult ora include `senza_dettaglio` list** — fatture dove FIC API ritorna `items_list: []` (is_detailed: false) e nessun righe esistente da XML
- **Debug endpoint** `GET /fic/debug-detail/{fic_id}` ritorna raw FIC API response per uno specifico documento (is_detailed, e_invoice, items_list, etc.)
- **`force_detail` parameter** aggiunto a sync endpoint

#### Changed
- **Phase 2 preserva XML righe** — se FIC `items_list` è vuoto, le righe esistenti (da XML) non vengono cancellate

### Frontend: FattureElenco.jsx

#### Removed
- **Rimosso "Escluse" badge e filtro** — niente più badge "Escluse", "Normali" o filtro tipo "escluso"

#### Changed
- **Only "Autofatture" badge rimane** (mostrato quando count > 0)
- **Anno default è anno corrente** (`new Date().getFullYear()`)

### Frontend: FattureImpostazioni.jsx

#### Added
- **Sync result mostra lista completa di fatture processate** in una tabella (NUOVA/AGG./MERGE badges, data, numero, fornitore, totale)
- **Orange warning box** per fatture senza product detail (senza_dettaglio) — suggerisce upload file XML
- **10-minute timeout** su sync fetch (AbortController) per prevenire network errors su sync grandi

### Frontend: FattureDashboard.jsx

#### Changed
- **Anno default è anno corrente** invece di "all"

### Infrastructure

#### Changed
- **nginx proxy_read_timeout** set a 600s su VPS per trgb.tregobbi.it

### Database

#### Notes
- 58 fornitori marcati `escluso=1` in `fe_fornitore_categoria` — è per il modulo product matching ONLY, non acquisti
- `fe_fatture` e `fe_righe` cleared per fresh FIC-only import
- Cross-fonte dedup working (0 duplicates dopo fix)

### Key Discovery
- **FIC API v2 `received_documents` con `fieldset=detailed`** ritorna `items_list: []` quando `is_detailed: false`, anche se la fattura ha `e_invoice: true` (XML SdI attached). FIC frontend legge items dall'XML attached direttamente, ma REST API non li espone. Workaround: importare XML files per ottenere le righe.

---

## 2026-03-21 — Modulo iPratico Sync v2.0

### Added
- **Sincronizzazione prodotti iPratico** — nuovo modulo per import/export bidirezionale tra iPratico e magazzino vini TRGB
- **`app/routers/ipratico_products_router.py`** v2.0 — 10 endpoint sotto `/vini/ipratico/`: upload, mappings, ignore, export, missing, export-defaults, sync-log, stats, trgb-wines
- **`frontend/src/pages/vini/iPraticoSync.jsx`** v2.0 — pagina workflow lineare (no tab): import → verifica → esporta
- **Migrazioni 020–022** in `foodcost.db`:
  - `ipratico_product_map` — mapping prodotti iPratico ↔ vini TRGB
  - `ipratico_sync_log` — storico sincronizzazioni
  - `ipratico_export_defaults` — valori default configurabili per nuovi vini (Family, reparti, listini)
- **Match diretto per ID** — il codice 4 cifre nel Name iPratico corrisponde a `vini_magazzino.id` (~99.7% match rate)
- **TRGB ha priorita'** — l'export ricostruisce il Name da dati TRGB se cambiati
- **Vini mancanti** — l'export aggiunge automaticamente righe per vini TRGB non presenti su iPratico con tutti i campi default compilati (12 campi prezzo, reparti, family, hidden, listini)
- **Default configurabili** — pannello collassabile nella sezione Export per modificare i valori default senza toccare il codice
- **Ignore/Ripristina** — toggle per prodotti iPratico senza corrispondenza TRGB
- **Tile "Import/Export iPratico"** nella home modulo Vini (`ViniMenu.jsx`)
- **`push.sh`** — aggiunto download automatico database dal VPS prima di ogni push

---

## 2026-03-16 — Cantina & Vini v4.0: Filtro locazioni unificato, Stampa selezionati PDF, SchedaVino sidebar+main

### Added
- **Stampa selezionati diretta PDF** — il pulsante "Stampa selezionati" in MagazzinoVini ora genera direttamente un PDF dei vini selezionati senza aprire il dialog StampaFiltrata
- **Endpoint `POST /vini/cantina-tools/inventario/selezione/pdf`** — accetta lista ID via Body, genera PDF con WeasyPrint e ritorna `Response` con bytes (autenticazione Bearer token, no query token)
- **Mappa colori `TIPOLOGIA_SIDEBAR`** in SchedaVino.jsx — gradiente sidebar dinamico per ciascuna tipologia (ROSSI=rosso, BIANCHI=ambra, BOLLICINE=giallo, ROSATI=rosa, PASSITI=arancio, GRANDI FORMATI=viola, ANALCOLICI=teal)

### Changed
- **SchedaVino.jsx** v5.0 — layout completamente riscritto da scroll verticale a **sidebar+main** con CSS grid `grid-cols-[260px_1fr]`:
  - Sidebar (260px): nome vino, badge #id, griglia 4 stat box, lista info, pulsanti azione (Modifica anagrafica/giacenze, Duplica, Chiudi)
  - Main: area scrollabile con sezioni Anagrafica, Giacenze, Movimenti, Note
  - Colore sidebar determinato dinamicamente dalla TIPOLOGIA del vino (stesso schema colori usato nella tabella MagazzinoVini)
- **MagazzinoVini.jsx** v4.0 — **filtro locazioni unificato**: sostituiti 8 state vars e 6 select cascading con 2 soli dropdown:
  - "Locazione": tutti i nomi da tutte le 4 sezioni config, deduplicati e ordinati
  - "Spazio": spazi unificati per la locazione selezionata (inclusi spazi matrice generati)
  - Logica di filtro cerca contemporaneamente su tutte e 4 le colonne DB (FRIGORIFERO, LOCAZIONE_1, LOCAZIONE_2, LOCAZIONE_3)
- **`handlePrintSelection()`** in MagazzinoVini — entrambi i pulsanti "Stampa selezionati" ora chiamano direttamente il nuovo endpoint POST (fetch+blob+createObjectURL), il pulsante "Con filtri..." nel dropdown mantiene apertura StampaFiltrata

### Notes
- StampaFiltrata mantiene i propri filtri per-locazione separati (server-side) — è intenzionale
- Le modifiche non sono ancora state testate nel browser

---

## 2026-03-15c — Modulo Statistiche v1.0

### Added
- **Modulo Statistiche** — nuovo modulo per import e analisi dati vendite da iPratico
- **`app/migrations/018_ipratico_vendite.py`** — 3 tabelle: `ipratico_imports`, `ipratico_categorie`, `ipratico_prodotti` con indici su (anno, mese)
- **`app/services/ipratico_parser.py`** — parser export iPratico (.xls HTML) con `pd.read_html()`, gestisce encoding variabile
- **`app/routers/statistiche_router.py`** v1.0 — 7 endpoint sotto `/statistiche`: import-ipratico, mesi, categorie, prodotti, top-prodotti, trend, elimina mese
- **Frontend Statistiche** — 5 componenti React:
  - `StatisticheMenu.jsx` — menu principale modulo
  - `StatisticheNav.jsx` — tab navigation
  - `StatisticheDashboard.jsx` — KPI, categorie per fatturato, top 15 prodotti, trend mensile (bar chart CSS)
  - `StatisticheProdotti.jsx` — dettaglio prodotti con filtri, ricerca e paginazione
  - `StatisticheImport.jsx` — upload .xls con selettore anno/mese, storico import, eliminazione mese
- **Route** `/statistiche`, `/statistiche/dashboard`, `/statistiche/prodotti`, `/statistiche/import` in `App.jsx`
- **Home tile** Statistiche con badge versione
- **`modules.json`** — aggiunto modulo `statistiche` (ruoli: admin, viewer)
- **`versions.jsx`** — aggiunto `statistiche: v1.0 beta`

---

## 2026-03-15b — Unificazione loader carta + DOCX tabelle + fix cancellazione movimenti

### Fixed
- **`vini_magazzino_db.py`** `delete_movimento()` — cancellare un movimento VENDITA/SCARICO azzerava la giacenza perché il replay partiva da zero perdendo lo stock iniziale importato da Excel. Ora usa **inversione del delta** (per RETTIFICA mantiene il replay conservativo)

### Changed
- **`carta_vini_service.py`** v1.1 — aggiunta `build_carta_docx()` condivisa: genera DOCX con **tabelle senza bordi a 3 colonne** (descrizione 67% | annata 15% | prezzo 18%) invece di tab stops che sfondavano con descrizioni lunghe
- **`vini_router.py`** — endpoint `/carta/docx` semplificato: usa `build_carta_docx()` condiviso, rimossi import `Document`, `Inches`, `groupby`
- **`vini_cantina_tools_router.py`** v3.1 — eliminata `_load_vini_cantina_ordinati()` (~70 righe duplicate), tutti gli endpoint carta (HTML/PDF/DOCX) usano `load_vini_ordinati()` dal repository; endpoint DOCX semplificato

### Removed
- **`_load_vini_cantina_ordinati()`** — funzione duplicata nel cantina tools router, sostituita da import condiviso

---

## 2026-03-15 — Eliminazione vecchio DB vini.sqlite3 + fix carta v3.1

### Removed
- **`vini.sqlite3`** — vecchio DB Carta Vini (generato da import Excel) eliminato; tutto ora su `vini_magazzino.sqlite3`
- **Endpoint `POST /vini/upload`** — import Excel vecchio rimosso da `vini_router.py`
- **Endpoint `POST /vini/cantina-tools/sync-from-excel`** — sincronizzazione vecchio DB → cantina rimossa
- **Tasto "Importa file Excel"** da pagina Carta Vini (`ViniCarta.jsx`)
- **UI sincronizzazione** da `CantinaTools.jsx` e `ViniImpostazioni.jsx`
- **Codice migrazione vecchio DB** da `vini_settings.py`
- **`mockup_nazione.html`** — file mockup temporaneo

### Changed
- **`vini_router.py`** v3.0 — movimenti ora su `vini_magazzino_db` (era `vini_db`), rimossi import da `vini_db`/`vini_model`
- **`vini_cantina_tools_router.py`** v3.0 — rimosso sync-from-excel, mantenuto import-excel (diretto → magazzino)
- **`ViniCarta.jsx`** v3.3 — rimosso import Excel, griglia 4 colonne, sottotitolo aggiornato
- **`ViniDatabase.jsx`** — upload ora punta a `/cantina-tools/import-excel` con `apiFetch`
- **`carta_html.css`** v3.1 — allineato a PDF: stili nazione con filetti decorativi, Google Fonts import, spaziature coerenti
- **`carta_pdf.css`** v3.1 — `page-break-after: avoid` su `.tipologia`, `.nazione`, `.regione`, `.produttore` per evitare intestazioni orfane in fondo pagina

### Notes
- `vini_db.py` e `vini_model.py` restano nel codice (deprecated) — `normalize_dataframe` ancora usata da import-excel
- `core/database.py` mantenuto per dipendenza pre-esistente da `fe_import.py`

---

## 2026-03-14c — Cambio PIN self-service + reset admin

### Added
- **Pagina CambioPIN** (`/cambio-pin`) — accessibile a tutti gli utenti loggati
  - Cambio PIN proprio: verifica PIN attuale (obbligatorio per non-admin) + nuovo PIN + conferma
  - Sezione admin: lista utenti con pulsante "Reset → 0000" per ciascuno
  - PinInput component: type=password, inputMode=numeric, filtra non-digit
- **Icona 🔑 nel Header** — accanto al logout, per accesso rapido alla pagina Cambio PIN
- **Route `/cambio-pin`** in App.jsx + import CambioPIN

---

## 2026-03-14b — Chiusure Turno: modulo completo fine servizio

### Added
- **Modulo Chiusure Turno** — sistema completo per chiusura fine servizio (pranzo/cena)
  - **`chiusure_turno.py`** — backend con tabelle: `shift_closures` (con fondo_cassa_inizio/fine), `shift_checklist_config`, `shift_checklist_responses`, `shift_preconti`, `shift_spese`
  - **`ChiusuraTurno.jsx`** v2.0 — form completo con:
    - Preconto rinominato "Chiusura Parziale" (pranzo) / "Chiusura" (cena) dinamicamente
    - Sezione Pre-conti: righe dinamiche (tavolo + importo) per tavoli non battuti
    - Sezione Spese: righe dinamiche (tipo: scontrino/fattura/personale/altro + descrizione + importo)
    - Fondo Cassa: inizio e fine servizio
    - **Logica cena cumulativa**: staff inserisce totali giornalieri, il sistema sottrae pranzo per calcolare parziali cena
    - Hint "pranzo €X → parz. cena €Y" sotto ogni campo in modalita' cena
    - Banner esplicativo in modalita' cena
    - Riepilogo differenziato: pranzo mostra totali semplici, cena mostra giorno→pranzo→parziale
    - Quadratura: `(incassi + preconti) - chiusura_parziale`
  - **`ChiusureTurnoLista.jsx`** — pagina admin con lista completa chiusure
    - Filtri: range date (default ultimi 30 giorni), turno (tutti/pranzo/cena)
    - Totali periodo: n. chiusure, totale incassi, totale coperti, totale spese
    - Ogni riga: data, turno badge, inserita da (created_by), chiusura, incassi, coperti, spese, quadratura (dot verde/rosso)
    - Espandi per dettaglio: incassi breakdown, fondo cassa, pre-conti, spese con badge tipo, note
    - Pulsante "Modifica" per riaprire il form
- **VenditeNav aggiornato** — tab "Fine Turno" visibile a tutti, altri tab admin-only
- **Route** `/vendite/fine-turno` → ChiusuraTurno, `/vendite/chiusure` → ChiusureTurnoLista (sostituisce vecchio CorrispettiviGestione)

### Changed
- **VenditeNav.jsx** v2.0 — visibilita' tab per ruolo (`roles: null` = tutti, `roles: ["admin"]` = solo admin)
- **App.jsx** — nuove route + vecchio `/vendite/chiusure-old` preservato come fallback
- **admin_finance.sqlite3** — nuove tabelle shift_closures, shift_preconti, shift_spese con auto-migrazione colonne

---

## 2026-03-14 — Cantina & Vini v3.7: Filtri locazione gerarchici, Dashboard KPI valore, Modifica massiva migliorata

### Added
- **Filtri locazione gerarchici (cascading)** — in Cantina e Stampa Filtrata, il singolo dropdown locazione è stato sostituito con 3 gruppi indipendenti (Frigorifero, Locazione 1, Locazione 2), ciascuno con selettore nome (contenitore) e spazio (sotto-contenitore) cascading
- **Backend filtri gerarchici** — 6 nuovi parametri (`frigo_nome`, `frigo_spazio`, `loc1_nome`, `loc1_spazio`, `loc2_nome`, `loc2_spazio`) nell'endpoint PDF filtrato, con logica di match gerarchica (nome solo → LIKE, nome+spazio → match esatto)
- **Dashboard KPI valore** — 2 nuove tile: Valore acquisto (somma QTA × listino) e Valore carta (somma QTA × prezzo carta) con formattazione euro
- **Dashboard liste espandibili** — vini in carta senza giacenza e vini fermi ora mostrano tutti i risultati (rimosso LIMIT) con pulsante "Mostra tutti / Comprimi"
- **Modifica massiva ordinabile** — click sugli header delle colonne per ordinare ASC/DESC con indicatori ▲/▼/⇅
- **Dropdown locazioni configurate ovunque** — LOCAZIONE_1 e LOCAZIONE_2 ora usano select con valori configurati (come FRIGORIFERO) in dettaglio, nuovo vino e modifica massiva
- **Filtro locazione in Cantina** — aggiunto nella barra filtri principale
- **Filtro locazione in PDF inventario filtrato** — backend + frontend

### Changed
- **MagazzinoVini.jsx** v3.0 — filtri locazione gerarchici con 6 select cascading
- **MagazzinoAdmin.jsx** v2.0 — colonne ordinabili, loc_select per FRIGORIFERO/LOCAZIONE_1/LOCAZIONE_2
- **MagazzinoViniDettaglio.jsx** v4.1 — dropdown configurati per locazioni 1 e 2
- **MagazzinoViniNuovo.jsx** v1.2 — dropdown configurati per locazioni 1 e 2
- **DashboardVini.jsx** v3.0 — liste espandibili, KPI valore, vini fermi senza LIMIT
- **vini_cantina_tools_router.py** v2.0 — filtri gerarchici, opzioni loc1/loc2 nell'endpoint locazioni-config
- **vini_magazzino_db.py** v1.3 — dashboard: valore_acquisto, valore_carta, total_alert_carta, total_vini_fermi, rimosso LIMIT
- **versions.jsx** — Cantina & Vini v3.6→v3.7, Sistema v4.2→v4.3

### Fixed
- **Vini fermi** — il calcolo ora include correttamente anche i vini senza alcun movimento (mai movimentati)

---

## 2026-03-13b — Modulo Banca v1.0 + Conversioni unità ingredienti + Smart Create UX

### Added
- **Modulo Banca v1.0** — nuovo modulo completo per monitoraggio movimenti bancari
  - **Migration 014** — 4 tabelle: `banca_movimenti`, `banca_categorie_map`, `banca_fatture_link`, `banca_import_log`
  - **banca_router.py** — 11 endpoint: import CSV Banco BPM con dedup (hash data+importo+descrizione), lista movimenti con filtri (data/categoria/tipo/search + paginazione), dashboard aggregati (KPI + breakdown per categoria + ultimi movimenti), categorie mapping banca→custom (CRUD), cross-ref fatture XML (match automatico ±5% importo ±10 giorni, link/unlink manuale), andamento temporale (giorno/settimana/mese), storico import
  - **6 pagine frontend**: BancaNav (tabs emerald), BancaMenu (5 card), BancaDashboard (4 KPI + grafico barre CSS + breakdown entrate/uscite per categoria + ultimi movimenti + filtri periodo con preset), BancaMovimenti (tabella filtrata + paginazione), BancaImport (upload CSV + storico), BancaCategorie (mapping custom con colori), BancaCrossRef (collega pagamenti a fatture con suggerimenti automatici)
  - **Integrazione**: main.py, App.jsx (6 route `/banca/*`), Home.jsx (card Banca), versions.jsx (Banca v1.0 beta), modules.json
- **Conversioni unità per ingrediente** — sistema conversioni custom + chain resolution
  - **Migration 013** — tabella `ingredient_unit_conversions` (per-ingredient custom conversions)
  - **`convert_qty` potenziato** — cerca prima conversioni custom (diretta, inversa, chain), poi fallback a standard
  - **`_save_price_from_riga`** — auto-normalizza prezzi fattura usando `convert_qty`
  - **Endpoint CRUD** in ingredients router: GET/POST/DELETE conversioni per ingrediente
  - **UI** in RicetteIngredientiPrezzi.jsx v2.0 — sezione espandibile "Conversioni unità personalizzate"
- **Smart Create: Seleziona/Deseleziona tutti** — pulsanti nel tab Smart Create + default tutti deselezionati (l'utente sceglie manualmente)

### Changed
- **RicetteMatching.jsx** v5.1 — aggiunta select all/deselect all + default deselected
- **foodcost_recipes_router.py** — `convert_qty` accetta `ingredient_id` e `cur` opzionali per custom conversions
- **foodcost_matching_router.py** — `_save_price_from_riga` con auto-normalizzazione prezzo
- **foodcost_ingredients_router.py** v1.4 — endpoint conversioni unità
- **RicetteIngredientiPrezzi.jsx** v2.0 — sezione conversioni
- **versions.jsx** — aggiunta Banca v1.0 beta
- **App.jsx** v3.7 — 6 route banca
- **Home.jsx** v3.1 — card Banca in homepage
- **modules.json** — aggiunto modulo banca (admin only)

---

## 2026-03-13a — Ricette & Food Cost v3.0: Matching avanzato + Smart Create + Esclusioni

### Added
- **Smart Create** — tab nel Matching che analizza le righe fattura pending, raggruppa per descrizione normalizzata, pulisce i nomi con pipeline regex, suggerisce unita/categoria, fuzzy-match contro ingredienti esistenti, e crea ingredienti in blocco con auto-mapping
- **Esclusione fornitori** — tab "Fornitori" nel Matching: lista tutti i fornitori con righe pending, toggle per escludere quelli che non vendono ingredienti (servizi, attrezzature, ecc.). Endpoint `GET/POST /matching/suppliers`, toggle-exclusion
- **Ignora descrizioni non-ingrediente** — pulsante "Ignora" su ogni suggerimento Smart Create per escludere voci come trasporto, spedizione, consulenze. Tabelle `matching_description_exclusions` + `matching_ignored_righe`. Endpoint CRUD `/matching/ignore-description`, `/matching/ignored-descriptions`
- **Sezione "Descrizioni ignorate"** — espandibile in fondo al tab Smart Create, con ripristino one-click
- **RicetteDashboard.jsx** — pagina dashboard con 5 KPI + tabelle top5 FC e margini
- **RicetteSettings.jsx** — pagina strumenti con export JSON, export PDF per ricetta, import JSON
- **Migration 012** — `matching_description_exclusions` + `matching_ignored_righe`

### Changed
- **foodcost_matching_router.py** v3.0 — pipeline pulizia nomi (_NOISE_PATTERNS, _UNIT_MAP, _CATEGORY_HINTS), smart-suggest con grouping, bulk-create, esclusione fornitori e descrizioni nei query pending/smart-suggest
- **RicetteMatching.jsx** v5.0 — 4 tab: Da associare, Smart Create (con Ignora), Mappings, Fornitori
- **foodcost_recipes_router.py** — fix endpoint ordering (static paths prima di `{recipe_id}`)
- **App.jsx** — route `/ricette/dashboard`, `/ricette/settings`, redirect `/ricette/import` → `/ricette/settings`
- **Rimosso LIMIT 100** dalla query pending matching (mostrava solo 100 ingredienti su migliaia)
- **versions.jsx** — Ricette v2.0→v3.0, Sistema v4.1→v4.2

---

## 2026-03-11a — Riepilogo Chiusure + bugfix Dashboard e Import

### Added
- **CorrispettiviRiepilogo.jsx** — nuova pagina `/vendite/riepilogo` con riepilogo chiusure mese per mese, accordion per anno, KPI complessivi, click-through a dashboard mensile
- **Tab "Riepilogo"** in VenditeNav (ora 5 tab)
- **Tile "Riepilogo Mensile"** nel hub Gestione Vendite
- **scripts/report_chiusure_mensili.py** — report CLI chiusure da lanciare sul server

### Fixed
- **CorrispettiviDashboard 401** — usava `fetch()` senza JWT; sostituito con `apiFetch()`
- **Dashboard ignora query params** — click da Riepilogo a `/vendite/dashboard?year=2025&month=1` ora apre il mese corretto (legge `year`/`month` da URL con `useSearchParams`)
- **ImportResult senza conteggi** — endpoint non restituiva `inserted`/`updated`; aggiunti al modello Pydantic e alla risposta

---

## 2026-03-10g — Gestione Vendite v2.0: promozione a modulo top-level

### Added
- **Modulo "Gestione Vendite"** promosso a sezione top-level nella Home (ex Corrispettivi)
- **Route migrate** da `/admin/corrispettivi/*` a `/vendite/*` (5 route)
- **VenditeNav.jsx** — barra navigazione persistente per sezione vendite (4 tab: Chiusure, Dashboard, Annuale, Import)
- **VenditeMenu hub** — pagina menu rinnovata con mini-KPI, VersionBadge, tile Confronto Annuale
- **Tile "Gestione Vendite"** nella Home con badge versione

### Changed
- **CorrispettiviMenu.jsx** → hub "Gestione Vendite" con VenditeNav + KPI
- **CorrispettiviGestione.jsx** — VenditeNav, route `/vendite/chiusure`
- **CorrispettiviDashboard.jsx** — VenditeNav, route `/vendite/dashboard`
- **CorrispettiviAnnual.jsx** — VenditeNav, route `/vendite/annual`
- **CorrispettiviImport.jsx** — VenditeNav, route `/vendite/import`
- **AdminMenu.jsx** — rimossa tile Corrispettivi
- **Home.jsx** — aggiunta entry `vendite`, subtitle admin aggiornato
- **modules.json** — aggiunto modulo `vendite`, aggiornato admin
- **versions.jsx** — Corrispettivi v2.0 "Gestione Vendite", Sistema v4.1

---

## 2026-03-10f — Gestione Acquisti v2.0 + ViniNav + Versioning v4.0

### Added
- **Modulo "Gestione Acquisti"** promosso a sezione top-level nella Home
- **Route migrate** da `/admin/fatture/*` a `/acquisti/*` (8 route)
- **FattureFornitoriElenco.jsx** — elenco fornitori con ricerca, ordinamento, KPI
- **ViniNav.jsx** — barra navigazione persistente per modulo Vini (5 tab)
- **ViniNav applicata** a 11 pagine vini (rimosso MagazzinoSubMenu)
- **Tile "Gestione Acquisti"** nella Home
- **Docs/Modulo_Acquisti.md** — documentazione completa

### Changed
- **Home.jsx** — aggiunta entry `acquisti`, subtitle admin aggiornato
- **AdminMenu.jsx** — rimossa tile Fatture
- **FattureMenu.jsx** — rinominato "Gestione Acquisti", 3 colonne, link Home
- **FattureNav.jsx** — brand "Acquisti", link Home
- **modules.json** — aggiunto modulo `acquisti`
- **versions.jsx** — Vini v3.6, Fatture v2.0, Sistema v4.0

---

## 2026-03-10e — Sistema versioning moduli

### Added
- **`frontend/src/config/versions.js`** — config centralizzata versioni moduli + componente `VersionBadge` riutilizzabile
- **Badge versione su Home** — ogni tile modulo mostra la versione corrente con colore (verde=stabile, blu=beta)
- **Badge versione su menu moduli** — ViniMenu (v3.5), RicetteMenu (v2.0), AdminMenu (v3.5)
- **Footer sistema** — versione globale in fondo alla Home
- **Mappa versioni in SESSIONE.md** — tabella riepilogativa + reminder aggiornamento

---

## 2026-03-10d — Modulo Ricette & Food Cost v2 (rebuild completo)

### Added
- **Login tile-based con PIN** — selezione utente via tile colorate + PIN pad numerico, shake animation su errore, supporto tastiera
- **Ruolo "sala"** — nuovo ruolo equivalente a sommelier, propagato su 13+ file (router, modules.json, frontend)
- **Endpoint `GET /auth/tiles`** — lista utenti per UI login (pubblico)
- **Migrazione 007** — drop tabelle ricette vecchie, crea: `recipe_categories` (8 default), `recipes` v2 (is_base, selling_price, prep_time, category_id), `recipe_items` v2 (sub_recipe_id), `ingredient_supplier_map`
- **`foodcost_recipes_router.py`** (~500 righe) — CRUD ricette con:
  - Calcolo food cost ricorsivo con cycle detection
  - Sistema conversione unita' (kg/g, L/ml/cl, pz)
  - Sub-ricette (ingredient_id OR sub_recipe_id, mutuamente esclusivi)
  - Response: total_cost, cost_per_unit, food_cost_pct
  - Endpoint: GET/POST/PUT/DELETE ricette, GET/POST categorie, GET basi
- **`foodcost_matching_router.py`** (~400 righe) — matching fatture XML a ingredienti:
  - GET /matching/pending, GET /matching/suggest (fuzzy SequenceMatcher)
  - POST /matching/confirm, POST /matching/auto (batch)
  - GET/DELETE /matching/mappings
- **`foodcost_ingredients_router.py`** esteso — PUT ingredient, GET suppliers, GET/POST/DELETE prezzi
- **`RicetteDettaglio.jsx`** — visualizzazione ricetta con 4 card riepilogo (costo totale, costo/porzione, vendita, FC%), tabella ingredienti con costo riga, totale footer
- **`RicetteModifica.jsx`** — form modifica precaricato, salva con PUT
- **`RicetteMatching.jsx`** — UI matching fatture a 2 tab (pending + mappings), suggerimenti fuzzy, auto-match
- **Route**: `/ricette/:id`, `/ricette/modifica/:id`, `/ricette/matching`
- **`docs/design_ricette_foodcost_v2.md`** — design document completo del modulo
- **Task #25 roadmap** — sistema permessi centralizzato (TODO)

### Changed
- **`RicetteArchivio.jsx`** — riscritto: tabella con food cost %, badge colorati (verde/giallo/rosso), filtri nome/tipo/categoria, azioni modifica/disattiva
- **`RicetteNuova.jsx`** — riscritto v2: categorie da DB, checkbox "ricetta base", pulsanti separati +Ingrediente/+Sub-ricetta, riordino righe, prezzo vendita, tempo preparazione
- **`RicetteMenu.jsx`** — aggiunta tile "Matching fatture"
- **`foodcost_db.py`** — semplificato, solo tabelle base (migrazioni fanno il resto)
- **`App.jsx`** — registrate 3 nuove route ricette + 1 matching
- **`app/data/users.json`** — 3 utenti reali (marco admin, iryna/paolo sala) con PIN hash
- **`auth_service.py`** — display_name, list_tiles(), ruolo "sala" in VALID_ROLES

### Fixed
- **`delete_movimento()`** — ora riconcilia TUTTE le colonne quantita' (QTA_FRIGO, QTA_LOC1/2/3), non solo QTA_TOTALE
- **Ricerca vendite** — `search_vini_autocomplete()` con parametro `solo_disponibili=true` per nascondere vini a giacenza zero

### Removed
- **`app/routers/ricette.py`** — router orfano mai montato (sostituito da foodcost_recipes_router)
- **`app/models/ricette_db.py`** — DB parallelo mai usato (sostituito da foodcost_db con migrazioni)

---

## 2026-03-10c — Riorganizzazione menu Cantina + fix PDF + Impostazioni Carta

### Added
- **"📄 Genera Carta PDF"** nel submenu Cantina — bottone diretto che scarica il PDF senza pagine intermedie (visibile a tutti)
- **Impostazioni Ordinamento Carta** in Strumenti — UI completa per:
  - Ordine Tipologie (lista riordinabile con frecce ▲▼ + salva)
  - Ordine Nazioni (lista riordinabile + salva)
  - Ordine Regioni per nazione (select nazione → lista riordinabile + salva)
  - Filtri Carta (quantità minima, mostra negativi, mostra senza prezzo)
- **Registro Movimenti** e **Modifica Massiva** accessibili da Strumenti (pulsanti rapidi in cima)

### Changed
- **MagazzinoSubMenu.jsx**: rimossi "Registro movimenti" e "Modifica massiva" dal menu (spostati in Strumenti); aggiunto bottone "Genera Carta PDF"
- **CantinaTools.jsx** (v2.0): riscritto con 4 sezioni: Sync, Import/Export, Genera Carta (HTML+PDF+Word), Impostazioni Ordinamento
- **vini_cantina_tools_router.py**: fix PDF frontespizio — corrette classi CSS (`front-logo`, `front-title`, `front-subtitle`), aggiunto wrapper `carta-body`, corretto `base_url` e caricamento CSS per match esatto con vecchio sistema

### Fixed
- **PDF cantina**: logo non visibile, titolo sbagliato, frontespizio su 2 pagine, subtitle diverso — ora identico al PDF generato dal vecchio sistema

---

## 2026-03-10b — Strumenti Cantina: ponte Excel ↔ Cantina + Genera Carta

### Added
- **vini_cantina_tools_router.py**: nuovo router backend con 6 endpoint:
  - `POST /vini/cantina-tools/sync-from-excel` — sincronizza vini.sqlite3 → cantina (upsert: anagrafica aggiornata, giacenze intatte per vini esistenti)
  - `POST /vini/cantina-tools/import-excel` — import diretto Excel → cantina (senza passare dal vecchio DB)
  - `GET /vini/cantina-tools/export-excel` — esporta cantina in .xlsx compatibile con Excel storico
  - `GET /vini/cantina-tools/carta-cantina` — genera carta HTML dal DB cantina
  - `GET /vini/cantina-tools/carta-cantina/pdf` — genera PDF carta dal DB cantina
  - `GET /vini/cantina-tools/carta-cantina/docx` — genera DOCX carta dal DB cantina
- **CantinaTools.jsx**: pagina frontend admin-only con UI per sync, import, export e genera carta
- **Colonna ORIGINE** in `vini_magazzino`: flag 'EXCEL' o 'MANUALE' per tracciare provenienza vini
- Route `/vini/magazzino/tools` in App.jsx
- Link "🔧 Strumenti" in MagazzinoSubMenu.jsx (admin only)
- Autenticazione via query token per endpoint di download (window.open)

### Changed
- **vini_magazzino_db.py**: `create_vino()` ora setta ORIGINE='MANUALE' di default; `upsert_vino_from_carta()` setta ORIGINE='EXCEL'
- **main.py**: registrato nuovo router `vini_cantina_tools_router`

---

## 2026-03-10 — Reforming Modulo Vini (v2026.03.10a)

### Added
- **RegistroMovimenti.jsx**: pagina admin-only con log globale di tutti i movimenti cantina
  - Filtri: tipo, testo (vino/produttore), range date, con paginazione server-side (50/pagina)
  - Click su vino → scheda dettaglio
  - Bottone "Pulisci filtri" + "Aggiorna"
- `MagazzinoSubMenu.jsx`: aggiunto link "📜 Registro movimenti" (admin only)
- `App.jsx`: route `/vini/magazzino/registro`

### Changed
- **ViniMenu.jsx**: da 6 a 5 voci — rimossa "Movimenti Cantina", "Magazzino Vini" rinominato in "Cantina"
- **MagazzinoSubMenu.jsx**: semplificato da 6 a 5 pulsanti (Cantina, Nuovo vino + admin: Registro movimenti, Modifica massiva)
- **App.jsx**: rimosse route orfane `/vini/movimenti` e `/vini/magazzino/:id/movimenti`
- **MagazzinoVini.jsx**: titolo → "Cantina", aggiunto bottone "Pulisci filtri"
- **MagazzinoViniDettaglio.jsx**: fix layout form movimenti (grid 5→4 col), emoji nei tipi, bottone "← Cantina"
- **DashboardVini.jsx**: aggiornati pulsanti accesso rapido (+ Vendite, fix link Impostazioni, rinominato Cantina)

### Removed
- Route `/vini/movimenti` e `/vini/magazzino/:id/movimenti` (movimenti ora solo da scheda vino)

---

## 2026-03-09 — Admin Magazzino + Vendite Bottiglia/Calici (v2026.03.09e)

### Added
- `MagazzinoAdmin.jsx`: pagina admin-only per modifica massiva vini
  - Tabella spreadsheet-like con 21 colonne editabili (descrizione, produttore, tipologia, prezzi, giacenze, stati operativi, flag)
  - Filtri client-side: ricerca testo, tipologia, nazione, solo giacenza, solo in carta
  - Salvataggio bulk: raccolta modifiche lato client, invio singolo al backend
  - Eliminazione per riga con doppia conferma
  - Celle modificate evidenziate in ambra
  - Accesso negato per non-admin con schermata dedicata
- `vini_magazzino_db.py`: nuove funzioni `bulk_update_vini()` e `delete_vino()`
- `vini_magazzino_router.py`: nuovi endpoint `PATCH /bulk-update` e `DELETE /delete-vino/{id}` (admin only)
- `App.jsx`: route `/vini/magazzino/admin` + route `/vini/magazzino/:id/movimenti`
- `MagazzinoSubMenu.jsx`: link "⚙️ Admin" visibile solo per role=admin

### Changed
- `ViniVendite.jsx` (v2.0): semplificata a sole vendite con toggle Bottiglia/Calici
  - Rimossi scarichi/carichi/rettifiche (restano in sezione Magazzino)
  - Tag `[BOTTIGLIA]`/`[CALICI]` nel campo note per distinguere modalità vendita
  - Storico filtrato di default solo su movimenti VENDITA

---

## 2026-03-09 — Hub Vendite & Scarichi + Locazione obbligatoria (v2026.03.09d)

### Added
- `ViniVendite.jsx` (v1.0): riscritta da placeholder a hub operativo completo:
  - **Registrazione rapida**: ricerca vino con autocomplete, selezione tipo (VENDITA/SCARICO/CARICO/RETTIFICA), **locazione obbligatoria** per vendita/scarico, quantità, note, registrazione in un click
  - **Storico movimenti globale**: tabella paginata di tutti i movimenti della cantina con filtri per tipo, testo, range date
  - **KPI rapidi**: vendite oggi, 7gg, 30gg, bottiglie totali in cantina
  - Click su vino nello storico → navigazione a scheda dettaglio
  - Badge `#id` e stile coerente con il resto del modulo
- `vini_magazzino_db.py`: nuove funzioni:
  - `list_movimenti_globali()`: query cross-vino con filtri tipo/testo/date e paginazione (LIMIT/OFFSET + COUNT)
  - `search_vini_autocomplete()`: ricerca rapida per form registrazione (id, descrizione, produttore, QTA, prezzi)
- `vini_magazzino_router.py`: nuovi endpoint:
  - `GET /vini/magazzino/movimenti-globali` — movimenti globali con filtri e paginazione
  - `GET /vini/magazzino/autocomplete?q=...` — autocomplete vini per registrazione rapida
  - Entrambi dichiarati prima di `/{vino_id}` per evitare conflitti path FastAPI
- `MagazzinoSubMenu.jsx`: aggiunto link "🛒 Vendite & Scarichi" → `/vini/vendite`

### Changed
- **`registra_movimento()` — locazione reale**: ora aggiorna anche la colonna `QTA_<LOC>` corrispondente. Per VENDITA e SCARICO la locazione è **obbligatoria** (validazione backend + frontend)
- **`MovimentiCantina.jsx`**: campo locazione da testo libero a dropdown (frigo/loc1/loc2/loc3), obbligatorio per VENDITA/SCARICO, disabilitato per RETTIFICA
- **`MagazzinoViniDettaglio.jsx`**: stessa modifica al form movimenti nella scheda dettaglio

---

## 2026-03-09 — Dashboard Vini operativa, analytics vendite, UX miglioramenti (v2026.03.09c)

### Added
- `DashboardVini.jsx` (v2.0 → v2.1): riscritta completamente da placeholder a dashboard operativa:
  - **Riga KPI Stock** (4 tile): bottiglie in cantina, vini in carta, senza prezzo listino, vini fermi 30gg
  - **Riga KPI Vendite** (2 tile): bottiglie vendute ultimi 7gg / 30gg
  - **Drill-down interattivo**: click su tile "senza listino" → tabella inline con tutti i vini da completare; click su tile "vini fermi" → lista con giacenza e data ultimo movimento; click di nuovo chiude il pannello
  - **Vendite recenti** (viola): ultimi 8 movimenti di tipo VENDITA, con vino e data
  - **Movimenti operativi** (neutro): ultimi 6 tra CARICO / SCARICO / RETTIFICA con badge tipo colorato
  - **Top venduti 30gg**: ranking a barre dei vini più venduti nell'ultimo mese, a larghezza piena
  - **Distribuzione tipologie**: barre proporzionali per tipologia con contatore referenze
  - **Accesso rapido**: link a Magazzino, Nuovo vino, Carta vini, Impostazioni
  - Badge `#id` in stile `bg-slate-700` su alert e drill-down
- `vini_magazzino_db.py`: aggiunte query per `get_dashboard_stats()`:
  - `kpi_vendite`: vendute_7gg, vendute_30gg (WHERE tipo='VENDITA')
  - `vendite_recenti`: ultimi 8 movimenti VENDITA con join su descrizione vino
  - `movimenti_operativi`: ultimi 6 CARICO/SCARICO/RETTIFICA
  - `top_venduti_30gg`: top 8 per SUM(qta) su VENDITA ultimi 30gg
  - `vini_fermi`: vini con QTA_TOTALE > 0 e nessun movimento negli ultimi 30 giorni (LEFT JOIN + HAVING)
- `vini_magazzino_router.py`: aggiunto endpoint `GET /dashboard` (dichiarato prima di `/{vino_id}` per evitare conflitti di routing FastAPI)
- Dashboard raggiungibile da: NavLink `MagazzinoSubMenu.jsx`, card `ViniMenu.jsx`, route `/vini/dashboard` in `App.jsx`

### Changed
- `MagazzinoVini.jsx`: pannello destro semplificato — rimosso bottone "📦 Movimenti" separato; rinominato unico bottone in "🍷 Apri scheda completa" (movimenti ora integrati nella scheda dettaglio)
- Badge `#id` standardizzato a `bg-slate-700 text-white` su tutte le pagine (era `bg-amber-900` — conflitto visivo con i bottoni ambra)

### Fixed
- `vini_magazzino_router.py`: rimossi 12 caratteri smart quote (U+201C/U+201D) nelle stringhe — causavano `SyntaxError: invalid character` al boot del backend
- `scripts/deploy.sh`: corretto mode bit git a `100755` (era `100644`) — risolto `Permission denied` ad ogni deploy
- `push.sh`: riscritto per usare comandi SSH diretti invece di `./scripts/deploy.sh` — più robusto e non dipende dal mode bit
- Sudoers configurato sul VPS per `systemctl restart` senza password — deploy non-interattivo da SSH

### Docs
- `modulo_magazzino_vini.md`: aggiornato con sezioni Movimenti, Dashboard, Scheda dettaglio v3.0
- `Roadmap.md`: aggiunti task #23 (dashboard vini), #24 (badge ID); marcati come chiusi

---

## 2026-03-09 — Magazzino vini: edit, note, movimenti, role check (v2026.03.09b)

### Security
- `vini_magazzino_router.py`: aggiunto role check su `DELETE /movimenti/{id}` — solo admin o sommelier possono eliminare movimenti (#12 chiuso)
- Rimosso endpoint `/vini/magazzino/duplicate-check` ridondante (#10 chiuso) — mantenuto solo `POST /check-duplicati` (più pulito, usa `find_potential_duplicates` DB-side)

### Added
- `vini_magazzino_db.py`: aggiunta funzione `delete_nota(nota_id)` per eliminare note operative
- `vini_magazzino_router.py`: aggiunto `DELETE /{vino_id}/note/{nota_id}` — elimina nota e ritorna lista aggiornata
- `MagazzinoViniDettaglio.jsx` (v2.0): riscritta con tre sezioni:
  - **Anagrafica** — view + edit mode inline (PATCH `/vini/magazzino/{id}`) con tutti i campi
  - **Giacenze per locazione** — view + edit separato; salvataggio registra automaticamente RETTIFICA nello storico movimenti se QTA_TOTALE cambia
  - **Note operative** — add + delete note (usa `GET/POST/DELETE /note`)
- `MovimentiCantina.jsx` (v2.0): migrato da `fetch` grezzo ad `apiFetch` (redirect 401 automatico); aggiunto bottone elimina movimento (visibile solo ad admin/sommelier)

### Changed
- `MagazzinoVini.jsx`: rimosso bottone logout locale (gestito globalmente da `Header.jsx`)
- `MagazzinoViniDettaglio.jsx`: rimosso bottone logout locale

### Docs
- `roadmap.md`: aggiornati task #10, #12 come chiusi; aggiornate feature #17 (Magazzino Vini)

---

## 2026-03-09 — Gestione utenti, permessi moduli, sicurezza auth (v2026.03.09)

### Security
- `auth_service.py`: sostituito USERS dict con password in chiaro con hash `sha256_crypt` via `passlib.CryptContext`
- `authenticate_user()` usa `security.verify_password()` — nessuna password in chiaro nel codice
- `SECRET_KEY` caricata da `.env` via `python-dotenv` (fallback al valore hardcoded)
- `scripts/gen_passwords.py`: utility CLI per rigenerare hash al cambio password

### Added
- `app/data/users.json`: store persistente utenti (caricato a boot, aggiornato ad ogni modifica)
- `app/routers/users_router.py`: CRUD utenti — `GET/POST /auth/users`, `DELETE /{username}`, `PUT /{username}/password`, `PUT /{username}/role`. Admin: accesso totale; non-admin: solo propria password con verifica
- `app/data/modules.json`: permessi moduli per ruolo (`roles[]` per modulo)
- `app/routers/modules_router.py`: `GET /settings/modules` (tutti autenticati), `PUT /settings/modules` (admin only). Admin sempre incluso, modulo admin non disabilitabile
- `frontend/src/pages/admin/ImpostazioniSistema.jsx`: pagina unica con due tab — **Utenti** (crea/modifica/elimina/cambio password/cambio ruolo) e **Moduli & Permessi** (griglia checkbox ruolo × modulo)
- Logout button cablato in `Header.jsx` — visibile su tutte le pagine post-login
- `Home.jsx` dinamica: mostra solo i moduli accessibili al ruolo dell'utente corrente

### Changed
- `AdminMenu.jsx`: due card separate (Impostazioni + Gestione Utenti) → una sola card **Impostazioni** → `/admin/impostazioni`
- `LoginForm.jsx`: salva `username` in localStorage (necessario per UI "Tu" in gestione utenti)
- `App.jsx`: `Header` montato globalmente con `onLogout`; route `/admin/impostazioni` aggiunta

### Docs
- `roadmap.md`: aggiornato con task #1, #3, #7 chiusi
- `sessione.md`: aggiornato con lavoro della sessione 2026-03-09

---

## 2026-03-08 — Fix sicurezza, bug e refactor frontend (v2026.03.08)

### Security
- `Depends(get_current_user)` aggiunto a livello router su 5 endpoint pubblici: `admin_finance`, `fe_import`, `foodcost_ingredients`, `foodcost_recipes`, `vini_settings`

### Fixed
- Bug pie chart pagamenti in `CorrispettiviDashboard.jsx`: `pag.pos` → `pag.pos_bpm`, `pag.sella` → `pag.pos_sella`
- `carta_vini_service.py`: `if prezzo:` → `if prezzo not in (None, "")` — fix prezzo=0 in preview HTML
- `vini_router.py`: rimossa funzione `slugify` duplicata, importata da `carta_vini_service`
- Rimosso `console.log("API_BASE:", API_BASE)` da `LoginForm.jsx`

### Added
- `pyxlsb` aggiunto a `requirements.txt` (necessario per import Excel .xlsb)
- `frontend/src/config/api.js`: `apiFetch()` — wrapper centralizzato di `fetch` con auto-inject token Authorization e redirect automatico al login su 401
- `frontend/src/pages/admin/CorrispettiviAnnual.jsx`: nuova pagina confronto annuale con grafico e tabella mensile
- Route `/admin/corrispettivi/annual` in `App.jsx`
- Setup git bare repo VPS (`/home/marco/trgb/trgb.git`) con post-receive hook per auto-deploy su `git push`
- `scripts/setup_git_server.sh`: script one-time setup VPS

### Changed
- Gestione 401 rimossa da 6 pagine (ViniCarta, MagazzinoVini, MagazzinoViniDettaglio, MagazzinoViniNuovo, DipendentiAnagrafica, CorrispettiviAnnual) — ora centralizzata in `apiFetch()`

### Docs
- Docs consolidati da 18 a 13 file, tutti in minuscolo
- `database.md`: unificato da `Database_Vini.md` + `Database_FoodCost.md`
- `architettura.md`: merge di `VersionMap.md`
- `deploy.md`: merge di `troubleshooting.md`
- Eliminati: `sistema-vini.md`, `to-do.md`, `version.json`, `Index.md`

---

## 2025-12-05 — Modulo FE XML esteso (v2025.12.05-1)
### Added
- Sezione documentazione completa nel README  
- Descrizione architetturale + routing + frontend  
- Dettaglio endpoints e flusso operativo  

### Updated
- Modulo FE XML porta versione → `v2025.12.05-1`
- Documentazione `/docs/Modulo_FattureXML.md` integrata  

### Notes
- Il modulo è ora ufficialmente considerato "prima release operativa"


# 🗓️ 2025-12-05 — Versione 2025.12.05 (Master Integrato)

## ✨ Aggiunto

### Modulo Fatture Elettroniche (FE XML)
- Nuovo router `fe_import.py`
- Funzioni:
  - parsing XML (FatturaPA)
  - hashing SHA-256 anti-duplicati
  - estrazione fornitori, numeri fattura, date, imponibili, IVA, totale
  - estrazione righe (descrizione, quantità, prezzo, IVA)
- Endpoint:
  - `POST /contabilita/fe/import`  
  - `GET /contabilita/fe/fatture`
  - `GET /contabilita/fe/fatture/{id}`
  - `GET /contabilita/fe/stats/fornitori`
  - `GET /contabilita/fe/stats/mensili`
- Creazione tabelle nel DB:
  - `fe_fatture`  
  - `fe_righe`
- Dashboard acquisti frontend:
  - top fornitori
  - andamento mensile
  - filtro anno dinamico
- UI:
  - pagina `FattureElettroniche.jsx`
  - uploading multiplo
  - gestione duplicati
  - dettaglio righe completo
  - formattazione prezzi, valute e date

---

## 🛠️ Modulo Magazzino Vini — Refactor completo

### Nuove funzionalità frontend
- Filtri dinamici dipendenti (tipologia/nazione/regione/produttore)
- Filtri testuali multi-campo:
  - descrizione
  - denominazione
  - produttore
  - codice
  - regione
  - nazione
- Filtri numerici avanzati:
  - giacenza totale (>, <, tra)
  - checkbox "solo positivi"
  - prezzo carta
- Ordinamenti migliorati
- Prestazioni ottimizzate con `useMemo`

### Backend — Struttura magazzino
- Aggiunto campo `id_excel`
- Reintroduzione struttura coerente di locazioni:
  - frigo
  - loc1
  - loc2
  - loc3 (future use)
- Calcolo automatico `qta_totale`
- Refactor funzioni:
  - `create_vino()`
  - `update_vino()`
- Migliorata coerenza dati dopo aggiornamenti multipli

### Import Excel
- Modalità SAFE introdotta:
  - evita sovrascrittura ID
  - aggiorna solo campi consentiti
  - mantiene allineamento storico
- Modalità FORCE (solo admin) — predisposta

---

## 🧹 Miglioramenti UI/UX

- Nuova sezione **/admin**
- Interfaccia vini backend migliorata
- Stile grafico omogeneo con TRGB design
- Pannelli più leggibili e uniformati

---

## 🗄️ Documentazione (grande aggiornamento)

- Riscritto completamente il README principale
- Creato sistema documentazione modulare:
  - `Modulo_Vini.md`
  - `Modulo_MagazzinoVini.md`
  - `Modulo_FoodCost.md`
  - `Modulo_FattureXML.md`
- Creati file DB dedicati:
  - `DATABASE_Vini.md`
  - `DATABASE_FoodCost.md`
- Creato `INDEX.md`
- Creato `ROADMAP.md`
- Creato `CHANGELOG.md` (esteso)
- Creato `PROMPT_CANVAS.md`

---

## 🔧 Backend & DevOps

- Aggiornata configurazione systemd:
  - `trgb-backend.service`
  - `trgb-frontend.service`
- Migliorato `deploy.sh`:
  - quick deploy
  - full deploy
  - safe deploy
  - rollback
- Aggiornati file `.env` + separazione produzione/sviluppo
- Rifinito reverse proxy Nginx:
  - `trgb.tregobbi.it` (backend)
  - `app.tregobbi.it` (frontend)
- UFW:
  - bloccate porte 8000 e 5173 dall'esterno
  - aggiunta apertura loopback per Vite

---

## 🐞 Bugfix importanti

### Magazzino vini
- Rimossi duplicati storici
- Ripristinati **1186 record reali**
- Eliminati ID corrotti
- Ripuliti import precedenti non coerenti

### Backend generale
- Fix encoding PDF
- Fix salvare prezzi carta vs listino
- Fix ordinamento produttori con apostrofi
- Fix annate stringa/numero

---

# 🗓️ 2025-12-03 — Versione 2025.12.03

## ✨ Aggiunto
- Prima versione documentation system  
- Prima versione modulo Magazzino Vini rifattorizzato

## 🐞 Risolto
- Duplicati magazzino storici  
- QTA negative generate da import errati

---

# 🗓️ 2025-11 — Versioni preliminari

## ✨ Aggiunto
- Carta Vini stabile (HTML/PDF/DOCX)
- Template PDF unificato
- Generatore PDF staff/cliente
- Funzioni base foodcost (ricette + ingredienti)
- Deploy su VPS + servizi systemd

## 🔧 Migliorato
- Vite configurato per VPS
- Backend ottimizzato per caricamenti Excel
- Repository vini riscritto per prestazioni

## 🐞 Risolti
- Problemi CORS
- Loop infinito Vite reload
- Reset porta 8000 al deploy
